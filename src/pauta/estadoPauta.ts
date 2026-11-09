// O estado da Pauta (3.2, §2.7): órgãos, sala, horizonte de meses e a pauta de cada dia, lida só
// quando o dia chega perto da tela (D92). Aqui só se lê; quem grava são os diálogos do "+" e do "×".

import { reactive } from 'vue';
import type { Opcoes, OrgaoConhecido } from '../config/opcoes';
import type { Armazenamento } from '../ext/api';
import type { Ambiente } from '../pje/ambiente';
import type { Audiencia, EventoCalendario } from '../pje/api';
import { pjeGet } from '../pje/http';
import { lerCookie, lerSessao } from '../pje/sessao';
import { classificarData, hoje } from '../regras/calendario';
import type { EntradaPauta } from '../regras/pauta';
import { carregarAdvogados, carregarCalendario, carregarDia, carregarMes, carregarOrgaos, type LeitorPauta } from './dados';
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

/** Uma linha da lista: a entrada da pauta e, em "Todas as salas", a sala dela (D95, D98). */
export interface LinhaPauta extends EntradaPauta {
  sala?: string;
  idSala?: number;
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

  /** As salas da seleção: a escolhida ou, em "Todas as salas", todas, pela pauta de cada uma (D95). */
  function salasDaSelecao(): { id: number; nome: string }[] {
    const o = orgao();
    if (!o || estado.sala === null) return [];
    return estado.sala === 'todas' ? o.salas : o.salas.filter((s) => s.id === estado.sala);
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
   * D90: dia útil sempre aparece; fim de semana, só se o mês de alguma sala da seleção disser que
   * ele tem algo. Os códigos chegam com a primeira consulta do mês.
   */
  function diaVisivel(dia: string): boolean {
    if (!ehFimDeSemana(dia)) return true;
    const n = Number(dia.slice(8, 10));
    return salasDaSelecao().some((s) => temConteudo(estado.codigos.get(`${s.id}|${dia.slice(0, 7)}`)?.get(n)));
  }

  function pedirCalendario(idOrgao: number) {
    if (estado.calendarios.has(idOrgao)) return;
    estado.calendarios.set(idOrgao, []);
    void fila.executar(() => carregarCalendario(ler, idOrgao)).then((eventos) => estado.calendarios.set(idOrgao, eventos));
  }

  /** Um dia chegou perto da tela: lê a pauta dele em cada sala da seleção (D92, D95). */
  function pedirDia(dia: string) {
    const o = orgao();
    if (!o) return;
    pedirCalendario(o.id);
    for (const s of salasDaSelecao()) void pedirSalaDia(s.id, dia);
  }

  function marcarVisivel(dia: string, visivel: boolean) {
    if (visivel) visiveis.add(dia);
    else visiveis.delete(dia);
  }

  const pedirVisiveis = () => [...visiveis].sort().forEach(pedirDia);

  /**
   * A pauta do dia na seleção atual. Em "Todas as salas" (D95), a pauta de cada sala, junta pela
   * hora, com a sala em cada linha; uma sala com erro não esconde as outras, mas avisa.
   */
  function diaDaSelecao(dia: string): EstadoDia {
    const salas = salasDaSelecao();
    const estados = salas.map((s) => ({ s, e: estado.dias.get(`${s.id}|${dia}`) }));
    if (!salas.length || estados.some(({ e }) => !e || e.estado === 'espera')) return { estado: 'espera', linhas: [] };
    if (estados.some(({ e }) => e!.estado === 'carregando')) return { estado: 'carregando', linhas: [] };
    const erros = estados.filter(({ e }) => e!.estado === 'erro');
    if (erros.length === estados.length) return { estado: 'erro', linhas: [], erro: erros[0]!.e!.erro };
    if (estado.sala !== 'todas') return estados[0]!.e!;
    const linhas = estados
      .flatMap(({ s, e }) => e!.linhas.map((l): LinhaPauta => ({ ...l, sala: s.nome, idSala: s.id })))
      .sort((a, b) => a.hora.localeCompare(b.hora) || (a.sala ?? '').localeCompare(b.sala ?? ''));
    return erros.length ? { estado: 'ok', linhas, erro: `Não foi possível ler: ${erros.map(({ s }) => s.nome).join(', ')}` } : { estado: 'ok', linhas };
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
    estado.calendarios.delete(o.id);
    pedirVisiveis();
  }

  function carregarMaisUmMes() {
    if (estado.meses.length >= MESES_MAXIMOS) return;
    const ultimo = estado.meses[estado.meses.length - 1]!;
    estado.meses.push(mesDaPauta(mesSeguinte(ultimo.chave)));
  }

  // ── O "+" e o "×" (D89b–D89e, D98) ──────────────────────────────────────────────────────

  /** Só no órgão logado (D5, D89): numa sala ou em "Todas as salas" (D98). */
  const podeGravar = () => orgao()?.logado === true && estado.sala !== null;

  /** D34: o dia bloqueado não tem "+" (fim de semana, suspensão de audiência ou de expediente). */
  function diaBloqueado(dia: string): string | null {
    if (ehFimDeSemana(dia)) return 'Fim de semana';
    const aviso = avisoDoDia(dia);
    return aviso?.nivel === 'bloqueia' ? aviso.texto : null;
  }

  /** Depois de gravar: esquece a pauta e o mês daquela sala e relê o dia, se estiver na tela. */
  function relerDia(idSala: number, dia: string) {
    estado.dias.delete(`${idSala}|${dia}`);
    const mes = `${idSala}|${dia.slice(0, 7)}`;
    promessasMes.delete(mes);
    estado.codigos.delete(mes);
    if (visiveis.has(dia)) pedirDia(dia);
  }

  /** D98: o "+ Designar" do dia em "Todas as salas" não sabe a sala: relê o dia em todas. */
  function relerDiaEmTodas(dia: string) {
    for (const s of orgao()?.salas ?? []) relerDia(s.id, dia);
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
    podeGravar,
    diaBloqueado,
    relerDia,
    relerDiaEmTodas,
    salaEscolhida,
    iniciar,
    /** Lê de novo um dia que deu erro. */
    tentarDeNovo(dia: string) {
      for (const s of salasDaSelecao()) {
        const chave = `${s.id}|${dia}`;
        if (estado.dias.get(chave)?.estado === 'erro') estado.dias.delete(chave);
      }
      pedirDia(dia);
    },
  };
}

export type Pauta = ReturnType<typeof usePauta>;
