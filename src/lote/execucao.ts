// Tela 4 do Lote (§2.3): a execução. Regras puras e o motor, com o transporte injetado (o real, o
// simulado ou o falso dos testes, como no executor da 3.0).
//
// - Fase 1, as audiências, na ordem das dependências (D67, D75): quem sai de um horário vai antes de
//   quem entra nele. Na troca circular, um processo vai antes para um minuto livre ("estacionar") e
//   volta no fim. Só redesignação: nunca cancelar para mover (D32b, D75).
// - Cada movimento relê antes as audiências do processo e decide pelo estado real: já está no
//   horário planejado, redesigna a do órgão ou designa. Isso serve à primeira execução, ao processo
//   estacionado e ao "Reprocessar falhas".
// - Fase 1b, o Juízo 100% Digital que ficou sem recolocar (D26). Fase 2, os GIGS de todos (D75).
// - "Parar depois do processo atual" (D68): para entre um processo e outro; uma troca circular conta
//   como um processo só, e "Parar" também segura os GIGS. A sessão expirada (401) para tudo.
// - O processo "sem mudança" fica "mantido", sem nada (D79).

import {
  audienciaDoOrgao,
  executarDesignacao,
  lancarGigs,
  paraAntiga,
  PENDENCIA_SEM_DIGITAL,
  recolocarJuizoDigital,
  type AcaoSugerida,
  type PedidoDesignacao,
  type RegistroPasso,
  type Transporte,
} from '../fluxo/executor';
import { caminhos, type Audiencia, type EventoCalendario, type PautaDia } from '../pje/api';
import { lerPauta, type EntradaPauta } from '../regras/pauta';
import type { LinhaVista } from './estadoPauta';
import { MINUTOS_DO_DIA, paraHora, paraMinutos } from './pauta';

// ── O que vai ser executado ───────────────────────────────────────────────────────────────

/** Um processo do lote na execução (ou uma audiência de fora alterada, entrega 7). */
export interface ItemExecucao {
  /** Número CNJ (na audiência de fora, `fora-<id>`). */
  chave: string;
  /** Número CNJ, para mostrar. */
  numero: string;
  /** Número da audiência na pauta. */
  ordem: number;
  idProcesso: number;
  /** HH:MM planejado. */
  hora: string;
  descricaoTipo: string;
  /** D79: mesmo horário e mesmo tipo que já tinha; nada a fazer. */
  mantida: boolean;
  /** Tinha audiência no órgão na tela 1 (só para o resumo; a antiga é relida na hora). */
  redesignacao: boolean;
  /** 100% Digital com Julgamento: retira e recoloca o Juízo 100% Digital (D26). */
  alternaDigital: boolean;
  /** O pedido da 3.0, sem a antiga (relida na hora) e sem o GIGS (que vai na fase 2). */
  pedido: Omit<PedidoDesignacao, 'antiga' | 'gigs' | 'ignorarNaPauta'>;
  gigs?: { texto: string; prazo: number };
  /** Audiência que já estava na pauta, de um processo que não está na lista (D76, D81). */
  deFora?: { horaOriginal: string; tipoOriginal?: string };
  /** Audiência de fora que não muda e só ganha GIGS (D82). */
  soGigs?: boolean;
}

export interface ContextoPedidos {
  idOrgao: number;
  idSala: number;
  /** AAAA-MM-DD */
  data: string;
  eventos: EventoCalendario[];
  /** AAAA-MM-DD: início do prazo do GIGS. */
  hoje: string;
}

/**
 * Os itens da execução, a partir das linhas da tela 2, na ordem da pauta: os processos do lote e as
 * audiências de fora alteradas ou com GIGS (entrega 7).
 */
export function montarPedidos(linhas: LinhaVista[], ctx: ContextoPedidos): ItemExecucao[] {
  return linhas.flatMap((v) => {
    if (v.linha.tipo === 'fora') return itemDaFora(v, ctx);
    const p = v.processo;
    const tipo = v.tipo?.tipo;
    if (v.linha.tipo !== 'processo' || !p || !tipo) return [];
    const hora = paraHora(v.linha.inicio);
    const juizoDigital = Boolean(p.processo.juizoDigital);
    const ehJulgamento = v.tipo?.base === 'Julgamento';
    const item: ItemExecucao = {
      chave: v.linha.chave,
      numero: v.linha.chave,
      ordem: v.linha.ordem,
      idProcesso: p.id,
      hora,
      descricaoTipo: tipo.descricao,
      mantida: v.semMudanca,
      redesignacao: Boolean(p.antiga),
      alternaDigital: juizoDigital && ehJulgamento,
      pedido: {
        idProcesso: p.id,
        idOrgaoLogado: ctx.idOrgao,
        processoBruto: p.processoBruto,
        juizoDigital,
        idSala: ctx.idSala,
        data: ctx.data,
        hora,
        idTipoAudiencia: tipo.id,
        ehJulgamento,
        eventos: ctx.eventos,
        hoje: ctx.hoje,
      },
    };
    if (v.gigs?.lancar) item.gigs = { texto: v.gigs.texto, prazo: v.gigs.valores.prazo };
    return [item];
  });
}

/**
 * Uma audiência de fora na execução: a alterada vira redesignação (D75, D81); a que só ganhou GIGS
 * não muda (D82). O processo vem da pauta do dia; o 100% Digital é relido na hora (D26). Sem a
 * leitura do processo na tela 1, não há reserva para recolocar o 100% Digital: o `processoBruto`
 * vazio faz o recolocar exigir a releitura (`recolocarJuizoDigital`).
 */
function itemDaFora(v: LinhaVista, ctx: ContextoPedidos): ItemExecucao[] {
  const e = v.fora;
  const tipo = v.tipo?.tipo;
  if (!e || e.idProcesso === undefined || !v.editavel || !tipo || (!v.alterada && !v.gigs?.lancar)) return [];
  const hora = paraHora(v.linha.inicio);
  const juizoDigital = Boolean(e.processo?.juizoDigital);
  const ehJulgamento = v.tipo?.base === 'Julgamento';
  const item: ItemExecucao = {
    chave: v.linha.chave,
    numero: e.nrProcesso ?? String(e.idProcesso),
    ordem: 0,
    idProcesso: e.idProcesso,
    hora,
    descricaoTipo: tipo.descricao,
    mantida: false,
    redesignacao: true,
    alternaDigital: juizoDigital && ehJulgamento,
    deFora: { horaOriginal: e.hora, ...(e.descricaoTipo ? { tipoOriginal: e.descricaoTipo } : {}) },
    pedido: {
      idProcesso: e.idProcesso,
      idOrgaoLogado: ctx.idOrgao,
      processoBruto: {},
      juizoDigital,
      idSala: ctx.idSala,
      data: ctx.data,
      hora,
      idTipoAudiencia: tipo.id,
      ehJulgamento,
      eventos: ctx.eventos,
      hoje: ctx.hoje,
    },
  };
  if (!v.alterada) item.soGigs = true;
  if (v.gigs?.lancar) item.gigs = { texto: v.gigs.texto, prazo: v.gigs.valores.prazo };
  return [item];
}

// ── A ordem (D67, D75) ────────────────────────────────────────────────────────────────────

export interface Movimento {
  chave: string;
  /** Minuto planejado. */
  destino: number;
  /** Minuto em que o processo está hoje nesta sala e dia, se estiver. */
  origem?: number;
}

export type Etapa = { tipo: 'mover'; chave: string } | { tipo: 'estacionar'; chave: string; minuto: number };

/** O primeiro minuto livre depois de `m` (ou, se não houver, antes dele). */
function primeiroLivre(m: number, usados: Set<number>): number | null {
  for (let x = m + 1; x < MINUTOS_DO_DIA; x++) if (!usados.has(x)) return x;
  for (let x = m - 1; x >= 0; x--) if (!usados.has(x)) return x;
  return null;
}

/**
 * A ordem das audiências. X espera Y quando o destino de X é o horário em que Y está hoje: Y vai
 * antes. Na troca circular, ninguém anda; então um processo do ciclo vai antes para o primeiro
 * minuto livre depois do destino dele (livre da pauta, dos destinos e dos horários atuais) e volta
 * quando o destino dele vagar. Fora isso, vale a ordem da lista. `ocupados`: os minutos das
 * audiências de fora.
 */
export function ordenarMovimentos(movs: Movimento[], ocupados: Iterable<number> = []): Etapa[] {
  const pendentes = movs.map((m) => ({ ...m }));
  const feitos = new Set<string>();
  const usados = new Set<number>([...ocupados, ...movs.map((m) => m.destino), ...movs.flatMap((m) => (m.origem === undefined ? [] : [m.origem]))]);
  const quemEspera = (x: (typeof pendentes)[number]) => pendentes.find((y) => y !== x && !feitos.has(y.chave) && y.origem === x.destino);
  const etapas: Etapa[] = [];
  while (feitos.size < pendentes.length) {
    const livre = pendentes.find((x) => !feitos.has(x.chave) && !quemEspera(x));
    if (livre) {
      etapas.push({ tipo: 'mover', chave: livre.chave });
      feitos.add(livre.chave);
      continue;
    }
    // Ninguém anda: há um ciclo. Segue as esperas a partir do primeiro pendente até repetir.
    let x = pendentes.find((p) => !feitos.has(p.chave))!;
    const vistos = new Set<string>();
    while (!vistos.has(x.chave)) {
      vistos.add(x.chave);
      x = quemEspera(x)!;
    }
    const minuto = primeiroLivre(x.destino, usados);
    if (minuto === null) {
      // Sem minuto livre no dia (nunca visto): segue, e o PJe recusa; a falha aparece no relatório.
      etapas.push({ tipo: 'mover', chave: x.chave });
      feitos.add(x.chave);
      continue;
    }
    usados.add(minuto);
    etapas.push({ tipo: 'estacionar', chave: x.chave, minuto });
    x.origem = minuto;
  }
  return etapas;
}

/** Os movimentos dos itens, com os horários atuais tirados da pauta da sala. */
export function movimentosDe(itens: ItemExecucao[], entradas: EntradaPauta[]): { movs: Movimento[]; ocupados: number[] } {
  const doLote = new Set(itens.map((i) => i.idProcesso));
  const origem = new Map(entradas.filter((e) => e.tipo === 'audiencia' && e.idProcesso !== undefined).map((e) => [e.idProcesso!, paraMinutos(e.hora)]));
  const movs = itens.map((i) => {
    const m: Movimento = { chave: i.chave, destino: paraMinutos(i.hora) };
    const o = origem.get(i.idProcesso);
    if (o !== undefined) m.origem = o;
    return m;
  });
  const ocupados = entradas.filter((e) => e.tipo === 'audiencia' && e.idProcesso !== undefined && !doLote.has(e.idProcesso)).map((e) => paraMinutos(e.hora));
  return { movs, ocupados };
}

// ── A confirmação (D71) ───────────────────────────────────────────────────────────────────

export interface ResumoDoLote {
  /** Audiências que vão ao PJe: designações + redesignações. */
  gravar: number;
  designacoes: number;
  redesignacoes: number;
  mantidas: number;
  alternaDigital: number;
  gigs: number;
  trocasCirculares: number;
  /** Audiências de fora que mudam (D76) e as que só ganham GIGS (D82). */
  alteradas: number;
  soGigs: number;
}

export function resumoDoLote(itens: ItemExecucao[], entradas: EntradaPauta[] = []): ResumoDoLote {
  const vao = itens.filter((i) => !i.mantida && !i.soGigs);
  const { movs, ocupados } = movimentosDe(vao, entradas);
  return {
    gravar: vao.length,
    designacoes: vao.filter((i) => !i.redesignacao).length,
    redesignacoes: vao.filter((i) => i.redesignacao).length,
    mantidas: itens.filter((i) => i.mantida).length,
    alternaDigital: vao.filter((i) => i.alternaDigital).length,
    gigs: itens.filter((i) => !i.mantida && i.gigs).length,
    trocasCirculares: ordenarMovimentos(movs, ocupados).filter((e) => e.tipo === 'estacionar').length,
    alteradas: vao.filter((i) => i.deFora).length,
    soGigs: itens.filter((i) => i.soGigs).length,
  };
}

// ── O estado de cada item ─────────────────────────────────────────────────────────────────

export interface EstadoItem {
  chave: string;
  mantida: boolean;
  /** Audiência de fora que só ganha GIGS (D82): não há audiência a gravar. */
  soGigs: boolean;
  /** O que falta: a audiência, recolocar o 100% Digital, o GIGS. */
  pendente: { audiencia: boolean; recolocar: boolean; gigs: boolean };
  /** A audiência já foi tentada ao menos uma vez. */
  rodou: boolean;
  executando: boolean;
  /** Uma execução parou antes de chegar a ele ("Parar" ou sessão expirada). */
  interrompido: boolean;
  sessaoExpirou: boolean;
  gigsTentado: boolean;
  gigsLancado: boolean;
  acao?: 'designada' | 'redesignada' | 'ja-estava';
  /** HH:MM em que o processo ficou estacionado (troca circular, D75). */
  estacionado?: string;
  /** O resumo da última tentativa da audiência (falha, D32b). */
  resumoAudiencia?: string;
  passos: RegistroPasso[];
  acoes: AcaoSugerida[];
}

export function estadoInicial(item: ItemExecucao): EstadoItem {
  return {
    chave: item.chave,
    mantida: item.mantida,
    soGigs: Boolean(item.soGigs),
    pendente: { audiencia: !item.mantida && !item.soGigs, recolocar: false, gigs: Boolean(item.gigs) && !item.mantida },
    rodou: false,
    executando: false,
    interrompido: false,
    sessaoExpirou: false,
    gigsTentado: false,
    gigsLancado: false,
    passos: [],
    acoes: [],
  };
}

export type Situacao = 'aguardando' | 'executando' | 'ok' | 'simulado' | 'atencao' | 'falha' | 'mantida' | 'nao-executado';

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  aguardando: 'AGUARDANDO',
  executando: 'EXECUTANDO',
  ok: 'OK',
  simulado: 'SIMULADO',
  atencao: 'ATENÇÃO',
  falha: 'FALHA',
  mantida: 'MANTIDA',
  'nao-executado': 'NÃO EXECUTADO',
};

export const temPendencia = (e: EstadoItem) => !e.mantida && (e.pendente.audiencia || e.pendente.recolocar || e.pendente.gigs);

export function situacaoDoItem(e: EstadoItem, simulando: boolean): { situacao: Situacao; resumo: string } {
  if (e.mantida) return { situacao: 'mantida', resumo: 'Mantida: mesmo horário e tipo que já tinha; nada a fazer.' };
  if (e.executando) return { situacao: 'executando', resumo: 'Executando…' };
  if (e.soGigs) {
    if (!e.gigsTentado) {
      if (!e.interrompido) return { situacao: 'aguardando', resumo: 'Aguardando: a audiência não muda; só o GIGS.' };
      return { situacao: 'nao-executado', resumo: e.sessaoExpirou ? 'Não executado: a sessão do PJe expirou.' : 'Não executado: a execução parou antes do GIGS.' };
    }
    if (e.pendente.gigs) return { situacao: 'atencao', resumo: 'A audiência não muda, e o GIGS não foi lançado.' };
    return simulando ? { situacao: 'simulado', resumo: 'Simulado: a audiência não muda; o GIGS não foi gravado.' } : { situacao: 'ok', resumo: 'A audiência não muda. GIGS lançado.' };
  }
  if (!e.rodou) {
    if (!e.interrompido) return { situacao: 'aguardando', resumo: 'Aguardando.' };
    return { situacao: 'nao-executado', resumo: e.sessaoExpirou ? 'Não executado: a sessão do PJe expirou.' : 'Não executado: a execução parou antes dele.' };
  }
  if (e.pendente.audiencia) return { situacao: 'falha', resumo: e.resumoAudiencia ?? 'A audiência não foi gravada.' };
  if (e.pendente.recolocar) return { situacao: 'falha', resumo: PENDENCIA_SEM_DIGITAL };
  if (e.pendente.gigs) {
    return { situacao: 'atencao', resumo: e.gigsTentado ? 'Audiência gravada, mas o GIGS não foi lançado.' : 'Audiência gravada; o GIGS ficou para depois (a execução parou).' };
  }
  const estacionou = e.estacionado ? ` Passou antes pelas ${e.estacionado} (troca circular).` : '';
  const gigs = e.gigsLancado ? ' GIGS lançado.' : '';
  if (simulando) return { situacao: 'simulado', resumo: `Simulado: nada foi gravado no PJe.${estacionou}` };
  const acao = e.acao === 'ja-estava' ? 'Já estava no horário planejado.' : e.acao === 'redesignada' ? 'Audiência redesignada.' : 'Audiência designada.';
  return { situacao: 'ok', resumo: `${acao}${estacionou}${gigs}` };
}

// ── O motor ───────────────────────────────────────────────────────────────────────────────

export interface ControleExecucao {
  /** "Parar depois do processo atual" foi pedido (D68). */
  pararPedido(): boolean;
  /** A cada mudança, para a tela acompanhar. */
  aoMudar?(): void;
}

export interface FimDaExecucao {
  parada: boolean;
  sessaoExpirada: boolean;
  /** Não deu para começar (a pauta da sala não foi lida); nada foi alterado. */
  erro?: string;
}

const comecaEm = (a: Audiencia, data: string, hora: string) => typeof a.dataInicio === 'string' && a.dataInicio.startsWith(`${data}T${hora}`);
const tipoEhJulgamento = (descricao: string | undefined) => /^julgamento/i.test(descricao ?? '');

/**
 * Executa o que está pendente nos `estados` (que são alterados no lugar). A mesma função serve à
 * execução, a "Executar os restantes" e a "Reprocessar falhas". `quais` limita a alguns itens (o
 * "Encaixar 1 min depois e reprocessar", D70).
 */
export async function executarPendencias(
  itens: ItemExecucao[],
  estados: Record<string, EstadoItem>,
  transporte: Transporte,
  controle: ControleExecucao,
  quais?: Set<string>,
): Promise<FimDaExecucao> {
  const aoMudar = () => controle.aoMudar?.();
  let sessaoExpirada = false;
  // A sessão expirada aparece como 401 em qualquer requisição: para tudo.
  const t: Transporte = {
    simulando: transporte.simulando,
    async enviar(r) {
      const x = await transporte.enviar(r);
      if (!x.ok && x.status === 401) sessaoExpirada = true;
      return x;
    },
  };
  const alvo = itens.filter((i) => (!quais || quais.has(i.chave)) && temPendencia(estados[i.chave]!));
  if (!alvo.length) return { parada: false, sessaoExpirada: false };
  const base = alvo[0]!.pedido;

  const rPauta = await t.enviar({ metodo: 'GET', caminho: caminhos.pautaDia(base.idSala, base.data) });
  if (!rPauta.ok) {
    if (sessaoExpirada) interromper(alvo, estados, true);
    aoMudar();
    return { parada: false, sessaoExpirada, erro: `Não foi possível ler a pauta da sala: ${rPauta.erro.mensagem}. Nada foi alterado.` };
  }
  const entradas = lerPauta(rPauta.dados as PautaDia);

  // Quem já saiu do horário (nesta execução ou numa anterior) não conta na conferência da pauta.
  const liberados = new Set(itens.filter((i) => !i.mantida && !i.soGigs && estados[i.chave]!.rodou && !estados[i.chave]!.pendente.audiencia).map((i) => i.idProcesso));
  const porChave = new Map(alvo.map((i) => [i.chave, i]));
  const deveParar = () => sessaoExpirada || controle.pararPedido();

  /** Os passos de cada item se acumulam entre as tentativas, com um marcador no começo de cada nova. */
  const tinhaPassos = new Set(alvo.filter((i) => estados[i.chave]!.passos.length).map((i) => i.chave));
  function registrador(e: EstadoItem) {
    if (tinhaPassos.delete(e.chave)) e.passos.push({ titulo: 'Nova tentativa', estado: 'aviso' });
    const inicio = e.passos.length;
    return {
      um: (r: RegistroPasso) => {
        e.passos.push(r);
        aoMudar();
      },
      /** O executor da 3.0 manda a lista inteira dos passos desta tentativa. */
      daExecucao: (ps: RegistroPasso[]) => {
        e.passos.splice(inicio, Infinity, ...ps);
        aoMudar();
      },
    };
  }

  // ── Fase 1: as audiências ──
  const comAudiencia = alvo.filter((i) => estados[i.chave]!.pendente.audiencia);
  const { movs, ocupados } = movimentosDe(comAudiencia, entradas);
  const etapas = ordenarMovimentos(movs, ocupados);
  const estacionados = new Set<string>();
  const tocados = new Set<string>();
  let parou = false;
  for (const etapa of etapas) {
    // D68: só para entre um processo e outro, e nunca com um processo estacionado.
    if (!estacionados.size && deveParar()) {
      parou = true;
      break;
    }
    if (sessaoExpirada) {
      parou = true;
      break;
    }
    const item = porChave.get(etapa.chave)!;
    const e = estados[item.chave]!;
    e.executando = true;
    e.interrompido = false;
    tocados.add(item.chave);
    aoMudar();
    const reg = registrador(e);
    try {
      // Relê as audiências do processo e decide pelo estado real.
      const rLista = await t.enviar({ metodo: 'GET', caminho: caminhos.audiencias(item.idProcesso) });
      if (!rLista.ok) {
        reg.um({ titulo: 'Reler as audiências do processo', estado: 'erro', erro: rLista.erro, detalhe: 'Nada foi alterado.' });
        e.rodou = true;
        e.resumoAudiencia = sessaoExpirada ? 'A sessão do PJe expirou: faça login de novo e clique em Executar os restantes.' : 'Não foi possível reler as audiências do processo. Nada foi alterado.';
        if (sessaoExpirada) e.sessaoExpirou = true;
        continue;
      }
      const audiencias = (rLista.dados as Audiencia[] | null) ?? [];
      const doOrgao = audienciaDoOrgao(audiencias, item.pedido.idOrgaoLogado);

      if (etapa.tipo === 'estacionar') {
        const hora = paraHora(etapa.minuto);
        if (!doOrgao) {
          reg.um({ titulo: `Estacionar às ${hora}`, estado: 'aviso', detalhe: 'O processo não tem audiência no órgão: não foi preciso estacionar.' });
          continue;
        }
        reg.um({ titulo: `Estacionar às ${hora} (troca circular)`, estado: 'ok', detalhe: 'Vai antes para um minuto livre e volta depois para o horário planejado.' });
        const reg2 = registrador(e);
        const r = await executarDesignacao(
          {
            ...item.pedido,
            hora,
            // O tipo atual: assim, o 100% Digital não alterna à toa.
            idTipoAudiencia: doOrgao.tipo?.id ?? item.pedido.idTipoAudiencia,
            ehJulgamento: doOrgao.tipo ? tipoEhJulgamento(doOrgao.tipo.descricao) : item.pedido.ehJulgamento,
            antiga: paraAntiga(doOrgao),
            ignorarNaPauta: [...liberados],
          },
          t,
          reg2.daExecucao,
        );
        if (r.recolocarFalhou) e.pendente.recolocar = true;
        if (r.designou) {
          e.estacionado = hora;
          estacionados.add(item.chave);
          liberados.add(item.idProcesso);
        } else {
          e.rodou = true;
          e.resumoAudiencia = `Não foi possível estacionar às ${hora}: ${r.resumo}`;
          e.acoes = r.acoes;
        }
        continue;
      }

      // Mover para o horário planejado.
      estacionados.delete(item.chave);
      e.rodou = true;
      const jaEsta = audiencias.find(
        (a) =>
          a.status === 'Designada' &&
          a.salaFisica?.orgaoJulgador?.id === item.pedido.idOrgaoLogado &&
          a.salaFisica?.id === item.pedido.idSala &&
          comecaEm(a, item.pedido.data, item.hora) &&
          a.tipo?.id === item.pedido.idTipoAudiencia,
      );
      if (jaEsta) {
        reg.um({ titulo: 'Conferir as audiências do processo', estado: 'ok', detalhe: `Já está no horário planejado (audiência ${jaEsta.id}).` });
        e.pendente.audiencia = false;
        e.acao = 'ja-estava';
        e.acoes = [];
        liberados.add(item.idProcesso);
        continue;
      }
      const pedido: PedidoDesignacao = { ...item.pedido, ignorarNaPauta: [...liberados] };
      if (doOrgao) pedido.antiga = paraAntiga(doOrgao);
      const r = await executarDesignacao(pedido, t, reg.daExecucao);
      e.acoes = r.acoes;
      e.pendente.recolocar = r.recolocarFalhou;
      if (r.designou) {
        e.pendente.audiencia = false;
        e.acao = doOrgao ? 'redesignada' : 'designada';
        e.resumoAudiencia = undefined;
        liberados.add(item.idProcesso);
      } else {
        e.resumoAudiencia = sessaoExpirada ? `A sessão do PJe expirou: faça login de novo e clique em Executar os restantes. ${r.resumo}` : r.resumo;
        if (sessaoExpirada) e.sessaoExpirou = true;
      }
    } finally {
      e.executando = false;
      aoMudar();
    }
  }

  // ── Fase 1b: o 100% Digital que ficou sem recolocar numa tentativa anterior ──
  if (!parou) {
    for (const item of alvo) {
      const e = estados[item.chave]!;
      if (!e.pendente.recolocar || tocados.has(item.chave)) continue;
      if (deveParar()) {
        parou = true;
        break;
      }
      e.executando = true;
      const reg = registrador(e);
      e.pendente.recolocar = !(await recolocarJuizoDigital(item.idProcesso, item.pedido.processoBruto, t, reg.um));
      e.executando = false;
      aoMudar();
    }
  }

  // ── Fase 2: os GIGS (D75) ──
  if (!parou) {
    for (const item of alvo) {
      const e = estados[item.chave]!;
      if (!item.gigs || !e.pendente.gigs || e.pendente.audiencia) continue;
      if (deveParar()) {
        parou = true;
        break;
      }
      e.executando = true;
      aoMudar();
      const reg = registrador(e);
      const ok = await lancarGigs({ idProcesso: item.idProcesso, idOrgaoLogado: item.pedido.idOrgaoLogado, hoje: item.pedido.hoje, gigs: item.gigs }, t, reg.um);
      e.gigsTentado = true;
      e.gigsLancado = ok;
      e.pendente.gigs = !ok;
      e.executando = false;
      aoMudar();
    }
  }

  if (parou) interromper(alvo.filter((i) => !tocados.has(i.chave) || estados[i.chave]!.pendente.gigs), estados, sessaoExpirada);
  aoMudar();
  return { parada: parou && !sessaoExpirada, sessaoExpirada };
}

function interromper(itens: ItemExecucao[], estados: Record<string, EstadoItem>, sessao: boolean) {
  for (const i of itens) {
    const e = estados[i.chave]!;
    if (!temPendencia(e)) continue;
    e.interrompido = true;
    if (sessao) e.sessaoExpirou = true;
  }
}

// ── "Encaixar 1 min depois e reprocessar" (D70) ───────────────────────────────────────────

/**
 * O primeiro minuto depois do planejado em que nenhuma audiência da pauta da sala nem outro item
 * do lote começa. `null` se passar da meia-noite.
 */
export function minutoParaEncaixar(item: ItemExecucao, itens: ItemExecucao[], entradas: EntradaPauta[]): number | null {
  const ocupados = new Set([
    ...entradas.filter((e) => e.tipo === 'audiencia' && e.idProcesso !== item.idProcesso).map((e) => paraMinutos(e.hora)),
    ...itens.filter((i) => i.chave !== item.chave).map((i) => paraMinutos(i.hora)),
  ]);
  for (let m = paraMinutos(item.hora) + 1; m < MINUTOS_DO_DIA; m++) if (!ocupados.has(m)) return m;
  return null;
}
