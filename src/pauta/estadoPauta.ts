// O estado da Pauta (3.2, §2.7): órgãos, sala, horizonte de meses e a pauta de cada dia, lida só
// quando o dia chega perto da tela (D92). Nada aqui grava no PJe.

import { reactive } from 'vue';
import type { Opcoes, OrgaoConhecido } from '../config/opcoes';
import type { Armazenamento } from '../ext/api';
import type { Ambiente } from '../pje/ambiente';
import type { Audiencia, EventoCalendario } from '../pje/api';
import { pjeGet } from '../pje/http';
import { lerCookie, lerSessao } from '../pje/sessao';
import { classificarData, hoje } from '../regras/calendario';
import type { EntradaPauta } from '../regras/pauta';
import {
  carregarAdvogados,
  carregarAudienciasDoOrgao,
  carregarCalendario,
  carregarDia,
  carregarMes,
  carregarOrgaos,
  type LeitorPauta,
} from './dados';
import { FilaDeLeitura } from './fila';
import {
  ehFimDeSemana,
  mesDaPauta,
  mesesDoHorizonte,
  mesSeguinte,
  rotuloDoOrgao,
  SEM_PAUTA,
  temConteudo,
  type MesPauta,
  type OrgaoPauta,
} from './orgaos';

/** Onde abrir a Pauta pelo "Abrir a pauta" do Individual (D90): a próxima audiência do processo. */
export interface FocoPauta {
  idSala: number;
  dia: string;
  idProcesso?: number;
}

/**
 * D90: pelo "Abrir a pauta" do Individual, a Pauta abre na sala e no dia da próxima audiência
 * designada do processo no órgão logado. Sem ela, abre como pelo FAB.
 */
export function focoDoProcesso(audiencias: Audiencia[], idOrgaoLogado: number, idProcesso: number, hojeIso = hoje()): FocoPauta | undefined {
  const proxima = [...audiencias]
    .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))
    .find((a) => a.status === 'Designada' && a.salaFisica?.orgaoJulgador?.id === idOrgaoLogado && a.dataInicio.slice(0, 10) >= hojeIso);
  return proxima?.salaFisica ? { idSala: proxima.salaFisica.id, dia: proxima.dataInicio.slice(0, 10), idProcesso } : undefined;
}

export type ChaveSala = number | 'todas';

/** Uma linha da lista: a entrada da pauta e, em "Todas as salas", a sala. */
export interface LinhaPauta extends EntradaPauta {
  sala?: string;
}

export interface EstadoDia {
  estado: 'espera' | 'carregando' | 'ok' | 'erro';
  linhas: LinhaPauta[];
  erro?: string;
}

/** Onde fica a última sala usada em cada órgão (D90). */
export const CHAVE_SALAS = 'audaid-pauta-salas';
/** Limite de meses que "Carregar mais um mês" e o foco podem acrescentar (dois anos). */
const MESES_MAXIMOS = 24;

export function leitorDoPje(ambiente: Ambiente): LeitorPauta {
  return (caminho, opcoes) => {
    // O token e o xsrf são lidos na hora: o PJe os renova sozinho.
    const bearer = opcoes?.bearer ? lerCookie(document.cookie, 'access_token') : undefined;
    return pjeGet(ambiente.origem + caminho, { xsrfToken: lerSessao(document.cookie).xsrfToken, ...(bearer ? { bearer } : {}) });
  };
}

export interface DependenciasPauta {
  ambiente: Ambiente;
  opcoes: Opcoes;
  armazenamento: Armazenamento;
  foco?: FocoPauta;
  /** Guarda os órgãos mostrados, para a lista do "Ocultar da Pauta" nas Opções (D87b). */
  aoConhecerOrgaos?: (orgaos: OrgaoConhecido[]) => void;
  /** Só nos testes: um PJe falso e o dia de hoje. */
  ler?: LeitorPauta;
  hoje?: string;
}

export function usePauta(deps: DependenciasPauta) {
  const ler = deps.ler ?? leitorDoPje(deps.ambiente);
  const hojeIso = deps.hoje ?? hoje();
  const fila = new FilaDeLeitura();
  const logado = lerSessao(document.cookie).orgaoLogado;

  const estado = reactive({
    carregando: true,
    /** Erro que impede a Pauta de abrir (sem órgão logado). */
    erro: '',
    avisos: [] as string[],
    orgaos: [] as OrgaoPauta[],
    idOrgao: null as number | null,
    sala: null as ChaveSala | null,
    meses: mesesDoHorizonte(hojeIso, deps.opcoes.pauta.mesesAFrente) as MesPauta[],
    /** O mês no alto da lista: a combobox do mês o acompanha (D91). */
    mesVisivel: hojeIso.slice(0, 7),
    destaque: deps.foco ?? null as FocoPauta | null,
    /** `${idSala}|${dia}` → a pauta daquela sala naquele dia. */
    dias: new Map<string, EstadoDia>(),
    /** `${idSala}|${AAAA-MM}` → dia do mês → código (D92); `null` se o mês não veio. */
    codigos: new Map<string, Map<number, string> | null>(),
    /** "Todas as salas" (D92b): `${idOrgao}|${AAAA-MM}` → as audiências do órgão no mês, por dia. */
    consolidado: new Map<string, { estado: 'carregando' | 'ok' | 'erro'; porDia: Map<string, LinhaPauta[]>; erro?: string }>(),
    calendarios: new Map<number, EventoCalendario[]>(),
    /** idProcesso → texto do "(?)", ou `null` enquanto carrega. */
    advogados: new Map<number, string | null>(),
  });
  /** Os dias perto da tela agora: "Atualizar" e as trocas de órgão ou sala os leem de novo. */
  const visiveis = new Set<string>();
  /** Muda a cada "Atualizar": resposta de antes não sobrescreve a nova. */
  let geracao = 0;

  const orgao = () => estado.orgaos.find((o) => o.id === estado.idOrgao);

  /** A sala escolhida, quando não é "Todas as salas". */
  function salaEscolhida(): { id: number; nome: string } | undefined {
    const o = orgao();
    return o && typeof estado.sala === 'number' ? o.salas.find((s) => s.id === estado.sala) : undefined;
  }

  const chaveConsolidado = (dia: string) => (estado.idOrgao === null ? undefined : `${estado.idOrgao}|${dia.slice(0, 7)}`);

  /** "Todas as salas" (D92b): o órgão inteiro, um mês numa consulta só, pelo AUD4. */
  function pedirConsolidado(idOrgao: number, chaveMes: string) {
    const chave = `${idOrgao}|${chaveMes}`;
    if (estado.consolidado.has(chave)) return;
    estado.consolidado.set(chave, { estado: 'carregando', porDia: new Map() });
    const minha = geracao;
    const inicio = chaveMes === hojeIso.slice(0, 7) ? hojeIso : `${chaveMes}-01`;
    const fim = mesDaPauta(chaveMes).dias.at(-1)!;
    void fila.executar(() => carregarAudienciasDoOrgao(ler, idOrgao, inicio, fim)).then(
      (porDia) => {
        if (minha === geracao) estado.consolidado.set(chave, { estado: 'ok', porDia });
      },
      (e: unknown) => {
        if (minha === geracao) estado.consolidado.set(chave, { estado: 'erro', porDia: new Map(), erro: e instanceof Error ? e.message : String(e) });
      },
    );
  }

  /** O mês da sala, lido uma vez (D92). Se ele não vier, os dias são consultados um a um. */
  const promessasMes = new Map<string, Promise<Map<number, string> | null>>();
  function mesDaSala(idSala: number, chaveMes: string): Promise<Map<number, string> | null> {
    const chave = `${idSala}|${chaveMes}`;
    let p = promessasMes.get(chave);
    if (!p) {
      p = fila.executar(() => carregarMes(ler, idSala, chaveMes)).then(
        (codigos) => codigos,
        () => null,
      );
      void p.then((codigos) => estado.codigos.set(chave, codigos));
      promessasMes.set(chave, p);
    }
    return p;
  }

  async function pedirSalaDia(idSala: number, dia: string) {
    const chave = `${idSala}|${dia}`;
    if (estado.dias.has(chave)) return;
    estado.dias.set(chave, { estado: 'carregando', linhas: [] });
    const minha = geracao;
    const codigos = await mesDaSala(idSala, dia.slice(0, 7));
    if (minha !== geracao) return;
    // D92: o dia que o mês diz estar sem pauta nem é consultado.
    if (codigos?.get(Number(dia.slice(8, 10))) === SEM_PAUTA) {
      estado.dias.set(chave, { estado: 'ok', linhas: [] });
      return;
    }
    try {
      const linhas = await fila.executar(() => carregarDia(ler, idSala, dia));
      if (minha === geracao) estado.dias.set(chave, { estado: 'ok', linhas });
    } catch (e) {
      if (minha === geracao) estado.dias.set(chave, { estado: 'erro', linhas: [], erro: e instanceof Error ? e.message : String(e) });
    }
  }

  /**
   * D90: dia útil sempre aparece; fim de semana, só se tiver algo: pelo mês da sala ou, em "Todas
   * as salas", pelas audiências do órgão. Isso chega com a primeira consulta do mês.
   */
  function diaVisivel(dia: string): boolean {
    if (!ehFimDeSemana(dia)) return true;
    if (estado.sala === 'todas') {
      const chave = chaveConsolidado(dia);
      return Boolean(chave && estado.consolidado.get(chave)?.porDia.get(dia)?.length);
    }
    const s = salaEscolhida();
    return Boolean(s && temConteudo(estado.codigos.get(`${s.id}|${dia.slice(0, 7)}`)?.get(Number(dia.slice(8, 10)))));
  }

  function pedirCalendario(idOrgao: number) {
    if (estado.calendarios.has(idOrgao)) return;
    estado.calendarios.set(idOrgao, []);
    void fila.executar(() => carregarCalendario(ler, idOrgao)).then((eventos) => estado.calendarios.set(idOrgao, eventos));
  }

  /** Um dia chegou perto da tela: lê a pauta dele na sala ou, em "Todas as salas", o mês do órgão (D92, D92b). */
  function pedirDia(dia: string) {
    const o = orgao();
    if (!o) return;
    pedirCalendario(o.id);
    if (estado.sala === 'todas') pedirConsolidado(o.id, dia.slice(0, 7));
    else {
      const s = salaEscolhida();
      if (s) void pedirSalaDia(s.id, dia);
    }
  }

  function marcarVisivel(dia: string, visivel: boolean) {
    if (visivel) visiveis.add(dia);
    else visiveis.delete(dia);
  }

  const pedirVisiveis = () => [...visiveis].sort().forEach(pedirDia);

  /** A pauta do dia na seleção atual; em "Todas as salas", as audiências do órgão naquele dia (D92b). */
  function diaDaSelecao(dia: string): EstadoDia {
    if (estado.sala === 'todas') {
      const chave = chaveConsolidado(dia);
      const c = chave === undefined ? undefined : estado.consolidado.get(chave);
      if (!c) return { estado: 'espera', linhas: [] };
      if (c.estado !== 'ok') return { estado: c.estado, linhas: [], ...(c.erro ? { erro: c.erro } : {}) };
      return { estado: 'ok', linhas: c.porDia.get(dia) ?? [] };
    }
    const s = salaEscolhida();
    return (s && estado.dias.get(`${s.id}|${dia}`)) || { estado: 'espera', linhas: [] };
  }

  /** O aviso do calendário do órgão para o dia (D34): feriado ou suspensão bloqueia; só prazo, avisa. */
  function avisoDoDia(dia: string): { nivel: 'bloqueia' | 'avisa'; texto: string } | null {
    const eventos = estado.idOrgao === null ? undefined : estado.calendarios.get(estado.idOrgao);
    if (!eventos?.length) return null;
    const c = classificarData(dia, eventos);
    if (c.nivel === 'bloqueia') return { nivel: 'bloqueia', texto: c.bloqueios.join('; ') };
    if (c.nivel === 'avisa') return { nivel: 'avisa', texto: c.avisos.join('; ') };
    return null;
  }

  async function lerSalasLembradas(): Promise<Record<string, ChaveSala>> {
    try {
      const v = await deps.armazenamento.ler(CHAVE_SALAS);
      return v && typeof v === 'object' ? (v as Record<string, ChaveSala>) : {};
    } catch {
      return {};
    }
  }

  async function escolherOrgao(id: number, sala?: ChaveSala) {
    const o = estado.orgaos.find((x) => x.id === id);
    if (!o) return;
    estado.idOrgao = id;
    const lembrada = sala ?? (await lerSalasLembradas())[String(id)];
    const valida = lembrada === 'todas' || o.salas.some((s) => s.id === lembrada);
    estado.sala = valida && lembrada !== undefined ? lembrada : (o.salas[0]?.id ?? null);
    pedirVisiveis();
  }

  async function escolherSala(sala: ChaveSala) {
    estado.sala = sala;
    pedirVisiveis();
    if (estado.idOrgao === null) return;
    const lembradas = await lerSalasLembradas();
    try {
      await deps.armazenamento.gravar(CHAVE_SALAS, { ...lembradas, [String(estado.idOrgao)]: sala });
    } catch {
      // Não lembrar a sala não impede nada.
    }
  }

  /** "Atualizar" (D92): esquece o que foi lido do órgão e relê os dias perto da tela. */
  function atualizar() {
    const o = orgao();
    if (!o) return;
    geracao++;
    const salas = new Set(o.salas.map((s) => s.id));
    const daSala = (chave: string) => salas.has(Number(chave.split('|')[0]));
    for (const chave of [...estado.dias.keys()]) if (daSala(chave)) estado.dias.delete(chave);
    for (const chave of [...promessasMes.keys()]) if (daSala(chave)) promessasMes.delete(chave);
    for (const chave of [...estado.codigos.keys()]) if (daSala(chave)) estado.codigos.delete(chave);
    for (const chave of [...estado.consolidado.keys()]) if (chave.startsWith(`${o.id}|`)) estado.consolidado.delete(chave);
    estado.calendarios.delete(o.id);
    pedirVisiveis();
  }

  function carregarMaisUmMes() {
    if (estado.meses.length >= MESES_MAXIMOS) return;
    const ultimo = estado.meses[estado.meses.length - 1]!;
    estado.meses.push(mesDaPauta(mesSeguinte(ultimo.chave)));
  }

  function pedirAdvogados(idProcesso: number) {
    if (estado.advogados.has(idProcesso)) return;
    estado.advogados.set(idProcesso, null);
    void fila.executar(() => carregarAdvogados(ler, idProcesso)).then((texto) => estado.advogados.set(idProcesso, texto));
  }

  async function iniciar() {
    if (!logado) {
      estado.erro = 'Não foi possível identificar o órgão em que você está logado (o token do PJe não está legível). Recarregue o PJe e tente de novo.';
      estado.carregando = false;
      return;
    }
    try {
      const r = await carregarOrgaos(ler, logado, deps.opcoes.pauta.ocultos, fila);
      estado.orgaos = r.orgaos;
      estado.avisos = r.avisos;
      deps.aoConhecerOrgaos?.(r.orgaos.map((o) => ({ id: o.id, rotulo: rotuloDoOrgao(o), nome: o.nome })));
      const foco = deps.foco;
      if (foco) {
        // O horizonte cresce até o mês da audiência, se ela estiver além dele.
        while (estado.meses[estado.meses.length - 1]!.chave < foco.dia.slice(0, 7) && estado.meses.length < MESES_MAXIMOS) carregarMaisUmMes();
        estado.mesVisivel = foco.dia.slice(0, 7);
      }
      await escolherOrgao(logado.id, foco?.idSala);
    } catch (e) {
      estado.erro = `Erro ao abrir a Pauta: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      estado.carregando = false;
    }
  }

  return {
    estado,
    logado,
    hojeIso,
    orgao,
    diaDaSelecao,
    diaVisivel,
    avisoDoDia,
    pedirDia,
    marcarVisivel,
    escolherOrgao,
    escolherSala,
    atualizar,
    carregarMaisUmMes,
    pedirAdvogados,
    iniciar,
    /** Lê de novo um dia que deu erro. */
    tentarDeNovo(dia: string) {
      if (estado.sala === 'todas') {
        const chave = chaveConsolidado(dia);
        if (chave && estado.consolidado.get(chave)?.estado === 'erro') estado.consolidado.delete(chave);
      } else {
        const s = salaEscolhida();
        if (s && estado.dias.get(`${s.id}|${dia}`)?.estado === 'erro') estado.dias.delete(`${s.id}|${dia}`);
      }
      pedirDia(dia);
    },
  };
}

export type Pauta = ReturnType<typeof usePauta>;
