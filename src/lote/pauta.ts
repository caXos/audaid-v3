// Tela 2 do Lote (§2.3): a pauta montada a partir dos campos do topo e dos ajustes de cada item.
// Tudo puro e testado (tests/lote-pauta.test.ts): horários, âncoras (D55), intervalos (D14),
// topo × ajuste (D13), tipo de cada processo (D6, D42, D57), mover e o rascunho (D18). Com a pauta
// do PJe (rodada 15): os horários pelas vagas (D73) e as audiências que já estavam no dia (D74).

import { LIMITES } from '../config/opcoes';
import type { Processo, TipoAudiencia } from '../pje/api';
import type { EntradaPauta } from '../regras/pauta';
import { descricaoTipo, ehSumarissimo, estadoVideo, faseDoProcesso, TIPOS_BASE, type Semana, type TipoBase } from '../regras/tipoComposto';
import { resolverTipo } from '../regras/tipos';

// ── Modelo ────────────────────────────────────────────────────────────────────────────────

/** GIGS do topo ou de um item. `opcao`: `''` = não lançar; `s0`, `s1`… = sugestão; `outro`. */
export interface GigsLote {
  opcao: string;
  texto: string;
  prazo: number;
}

export interface Topo {
  idSala: number | null;
  /** AAAA-MM-DD, ou `''` enquanto não escolhido. Nunca é lembrado (D56). */
  data: string;
  tipoBase: TipoBase | '';
  video: boolean;
  semana: Semana;
  /** HH:MM da primeira audiência. */
  inicio: string;
  /** Duração base, em minutos (D58). */
  duracao: number;
  /** Intervalo automático (D14): `aCada` 0 = desligado. */
  intervalo: { duracao: number; aCada: number };
  gigs: GigsLote;
}

/** O que um item tem de diferente do topo (D13). Ausente = segue o topo. */
export interface AjustesItem {
  tipoBase?: TipoBase;
  video?: boolean;
  duracao?: number;
  /** Início fixo, HH:MM: vira âncora (D55). */
  inicio?: string;
  gigs?: GigsLote;
}

/** Os campos do topo que têm "Aplicar a todos". */
export type CampoAjustavel = 'tipoBase' | 'video' | 'duracao' | 'gigs';

export type ItemLote =
  | { tipo: 'processo'; chave: string; ajustes: AjustesItem }
  | { tipo: 'intervalo'; chave: string; duracao: number; inicio?: string }
  /**
   * Audiência que já estava no dia, de um processo que o usuário não listou (D74): fica no horário
   * dela e nunca se mexe por tabela. A duração só muda o desenho da pauta; nada vai ao PJe. Vem da
   * pauta do dia e não vai para o rascunho.
   */
  | { tipo: 'fora'; chave: string; idProcesso: number; inicio: string; duracao?: number };

/** Os horários da pauta (D73): pelas vagas da sala ou em sequência a partir do início do topo. */
export type ModoHorarios = 'vagas' | 'sequencia';

/** Uma vaga que o lote pode ocupar (D73). */
export interface VagaDoLote {
  /** Minutos desde 00:00. */
  minuto: number;
  /** O tipo configurado na vaga: só informação, vale o tipo do processo. */
  descricaoTipo?: string;
  /** O processo do lote que hoje está neste horário: a vaga é do lote, porque ele vai sair ou ficar. */
  doLote?: string;
}

/** A pauta do PJe como a tela 2 a usa (D73, D74). Puro: montado por `montarPautaPje`. */
export interface PautaPje {
  /** O modo que vale: "pelas vagas" só quando o dia tem vaga livre. */
  modo: ModoHorarios;
  /** As vagas do lote, em ordem de horário: as livres e as dos processos do próprio lote. */
  vagas: VagaDoLote[];
  /** Minutos das vagas deixadas livres. */
  livres: number[];
  /** O último horário da pauta do PJe (vaga ou audiência), ou `null` num dia vazio. */
  ultimo: number | null;
}

export const LIMITES_LOTE = {
  /** Minutos, para audiências e intervalos. */
  duracao: { min: 1, max: 600 },
  aCada: { min: 0, max: 50 },
} as const;

/** D56: na primeira vez, sem valores lembrados. */
export const TOPO_PADRAO: Topo = {
  idSala: null,
  data: '',
  tipoBase: '',
  video: false,
  semana: 'nenhuma',
  inicio: '09:00',
  duracao: 10,
  intervalo: { duracao: 10, aCada: 0 },
  gigs: { opcao: '', texto: '', prazo: 2 },
};

// ── Horas ─────────────────────────────────────────────────────────────────────────────────

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
export const MINUTOS_DO_DIA = 24 * 60;

export const horaValida = (h: unknown): h is string => typeof h === 'string' && HORA.test(h);
export const paraMinutos = (h: string): number => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
/** 570 → "09:30". Passado da meia-noite, continua contando ("24:05"), para o aviso mostrar. */
export const paraHora = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function duracaoValida(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= LIMITES_LOTE.duracao.min && n <= LIMITES_LOTE.duracao.max;
}

// ── Topo × ajuste (D13) ───────────────────────────────────────────────────────────────────

export const duracaoDoItem = (a: AjustesItem, topo: Topo): number => a.duracao ?? topo.duracao;
export const gigsDoItem = (a: AjustesItem, topo: Topo): GigsLote => a.gigs ?? topo.gigs;

const mesmoGigs = (x: GigsLote, y: GigsLote) => x.opcao === y.opcao && x.texto === y.texto && x.prazo === y.prazo;

/**
 * Grava um ajuste. Valor igual ao do topo não conta como ajuste: "ajustado" quer dizer "diferente
 * do topo", e assim um item igual ao topo continua acompanhando o topo.
 */
export function definirAjuste<K extends CampoAjustavel>(ajustes: AjustesItem, campo: K, valor: Topo[K] & AjustesItem[K], topo: Topo): AjustesItem {
  const novo: AjustesItem = { ...ajustes };
  const igual = campo === 'gigs' ? mesmoGigs(valor as GigsLote, topo.gigs) : valor === topo[campo];
  if (igual) delete novo[campo];
  else novo[campo] = valor;
  return novo;
}

/** "Aplicar a todos": o campo do topo passa a valer para todos os itens (D13). */
export function aplicarATodos(itens: ItemLote[], campo: CampoAjustavel): ItemLote[] {
  return itens.map((i) => {
    if (i.tipo !== 'processo' || !(campo in i.ajustes)) return i;
    const ajustes = { ...i.ajustes };
    delete ajustes[campo];
    return { ...i, ajustes };
  });
}

export const ajustado = (a: AjustesItem): boolean => Object.keys(a).length > 0;

// ── Tipo de cada processo (D6, D42, D57) ──────────────────────────────────────────────────

export interface TipoDoItem {
  base: TipoBase | '';
  video: boolean;
  /** 100% Digital ou Julgamento: o vídeo não se escolhe (D42). */
  videoTravado: boolean;
  descricao: string;
  tipo?: TipoAudiencia;
  pendencia: string | null;
}

export function tipoDoItem(processo: Processo, topo: Topo, a: AjustesItem, tipos: TipoAudiencia[]): TipoDoItem {
  const base = a.tipoBase ?? topo.tipoBase;
  if (!base) return { base: '', video: false, videoTravado: true, descricao: '', pendencia: 'Escolha o tipo de audiência.' };
  const ev = estadoVideo(base, Boolean(processo.juizoDigital));
  const video = ev.marcada ?? a.video ?? topo.video;
  // Fase e rito são de cada processo; a Semana Nacional, do topo (só vale em Conciliação).
  const descricao = descricaoTipo({
    base,
    video,
    fase: faseDoProcesso(processo.faseProcessual),
    semana: topo.semana,
    sumarissimo: ehSumarissimo(processo.classeJudicial?.sigla),
  });
  const tipo = resolverTipo(descricao, tipos);
  return { base, video, videoTravado: !ev.habilitada, descricao, tipo, pendencia: tipo ? null : `"${descricao}" não existe neste tribunal.` };
}

// ── Horários (D14, D55) ───────────────────────────────────────────────────────────────────

/** `sobreposto` = amarelo, só aviso; `mesmo-minuto` e `apos-meia-noite` = vermelho, bloqueiam. */
export type SinalHorario = 'ok' | 'sobreposto' | 'mesmo-minuto' | 'apos-meia-noite';

export interface LinhaPauta {
  tipo: 'processo' | 'intervalo' | 'intervalo-auto' | 'fora' | 'vaga';
  chave: string;
  /** Posição em `itens`; -1 nos intervalos automáticos e nas vagas, que não estão lá. */
  indice: number;
  /** Número da audiência na pauta (1, 2…); 0 nos intervalos, nas vagas e nas de fora. */
  ordem: number;
  /** Minutos desde 00:00. */
  inicio: number;
  duracao: number;
  ancorado: boolean;
  sinal: SinalHorario;
  /** Processo do lote que ocupa uma vaga (D73). */
  naVaga?: boolean;
  /** Processo que passou do número de vagas: segue depois da última, com a duração base (D73). */
  alemDasVagas?: boolean;
  /** Só nas vagas: a vaga, e se foi deixada livre. */
  vaga?: VagaDoLote & { deixadaLivre: boolean };
}

const minutos = (n: number) => (duracaoValida(n) ? n : 0);

/** Conflitos entre as audiências do próprio lote (os de fora são da conferência, D78). */
function marcarSinais(linhas: LinhaPauta[]): void {
  const audiencias = linhas.filter((l) => l.tipo === 'processo');
  const peso: Record<SinalHorario, number> = { ok: 0, sobreposto: 1, 'mesmo-minuto': 2, 'apos-meia-noite': 3 };
  const marcar = (l: LinhaPauta, s: SinalHorario) => {
    if (peso[s] > peso[l.sinal]) l.sinal = s;
  };
  for (const [i, a] of audiencias.entries()) {
    if (a.inicio >= MINUTOS_DO_DIA) marcar(a, 'apos-meia-noite');
    for (const b of audiencias.slice(i + 1)) {
      if (a.inicio === b.inicio) {
        marcar(a, 'mesmo-minuto');
        marcar(b, 'mesmo-minuto');
      } else if (a.inicio < b.inicio + minutos(b.duracao) && b.inicio < a.inicio + minutos(a.duracao)) {
        marcar(a, 'sobreposto');
        marcar(b, 'sobreposto');
      }
    }
  }
}

/**
 * Horários em sequência a partir do início do topo. Um início editado vira âncora: dele em diante
 * a conta recomeça (D55). O intervalo "a cada N" entra antes da audiência N+1 contada desde o
 * último intervalo, manual ou automático, e nunca depois da última (D14).
 *
 * Com a pauta do PJe (`pje`): no modo "pelas vagas", os horários vêm das vagas (D73). Em
 * sequência, cada audiência de fora fica no horário dela, e os seguintes contam a partir do fim
 * dela, mas ela nunca puxa a conta para trás (D74).
 */
export function calcularPauta(itens: ItemLote[], topo: Topo, pje?: PautaPje): LinhaPauta[] {
  if (pje?.modo === 'vagas') return calcularPelasVagas(itens, topo, pje);
  const linhas: LinhaPauta[] = [];
  let cursor = horaValida(topo.inicio) ? paraMinutos(topo.inicio) : 0;
  let desdeIntervalo = 0;
  let ordem = 0;
  let automaticos = 0;

  itens.forEach((item, indice) => {
    if (item.tipo === 'fora') {
      const inicio = paraMinutos(item.inicio);
      const duracao = item.duracao ?? topo.duracao;
      linhas.push({ tipo: 'fora', chave: item.chave, indice, ordem: 0, inicio, duracao, ancorado: true, sinal: 'ok' });
      cursor = Math.max(cursor, inicio + minutos(duracao));
      return;
    }
    if (item.tipo === 'intervalo') {
      const inicio = horaValida(item.inicio) ? paraMinutos(item.inicio) : cursor;
      linhas.push({ tipo: 'intervalo', chave: item.chave, indice, ordem: 0, inicio, duracao: item.duracao, ancorado: horaValida(item.inicio), sinal: 'ok' });
      cursor = inicio + minutos(item.duracao);
      desdeIntervalo = 0;
      return;
    }
    if (topo.intervalo.aCada > 0 && desdeIntervalo >= topo.intervalo.aCada) {
      automaticos++;
      linhas.push({ tipo: 'intervalo-auto', chave: `auto-${automaticos}`, indice: -1, ordem: 0, inicio: cursor, duracao: topo.intervalo.duracao, ancorado: false, sinal: 'ok' });
      cursor += minutos(topo.intervalo.duracao);
      desdeIntervalo = 0;
    }
    const fixo = item.ajustes.inicio;
    const inicio = horaValida(fixo) ? paraMinutos(fixo) : cursor;
    const duracao = duracaoDoItem(item.ajustes, topo);
    linhas.push({ tipo: 'processo', chave: item.chave, indice, ordem: ++ordem, inicio, duracao, ancorado: horaValida(fixo), sinal: 'ok' });
    cursor = inicio + minutos(duracao);
    desdeIntervalo++;
  });

  marcarSinais(linhas);
  return linhas;
}

/**
 * Pelas vagas (D73): primeiro, quem foi levado a uma vaga (ou fixado num horário, D55) fica nela;
 * depois, os outros ocupam as vagas que sobraram, na ordem da lista, pulando as deixadas livres.
 * Quem passa do número de vagas segue depois do último horário do dia, com a duração base. Os
 * intervalos manuais não valem neste modo. A lista sai em ordem de horário, com as vagas que
 * ficaram sem processo e as audiências de fora.
 */
function calcularPelasVagas(itens: ItemLote[], topo: Topo, pje: PautaPje): LinhaPauta[] {
  const livres = new Set(pje.livres);
  const minutosDeVaga = new Set(pje.vagas.map((v) => v.minuto));
  const processos = itens.flatMap((item, indice) => (item.tipo === 'processo' ? [{ item, indice }] : []));
  const inicio = new Map<number, number>();
  const ocupadas = new Set<number>();
  for (const { item, indice } of processos) {
    if (!horaValida(item.ajustes.inicio)) continue;
    const m = paraMinutos(item.ajustes.inicio);
    inicio.set(indice, m);
    ocupadas.add(m);
  }
  const disponiveis = pje.vagas.map((v) => v.minuto).filter((m) => !livres.has(m) && !ocupadas.has(m));
  const alem: typeof processos = [];
  for (const p of processos) {
    if (inicio.has(p.indice)) continue;
    const m = disponiveis.shift();
    if (m === undefined) alem.push(p);
    else {
      inicio.set(p.indice, m);
      ocupadas.add(m);
    }
  }
  const fora = itens.flatMap((item, indice) => (item.tipo === 'fora' ? [{ item, indice, minuto: paraMinutos(item.inicio) }] : []));
  // Quem passa das vagas: depois do último horário do dia (do PJe ou do lote), com a duração base.
  let cursor = Math.max(pje.ultimo ?? 0, ...inicio.values(), ...fora.map((f) => f.minuto)) + minutos(topo.duracao);
  for (const p of alem) {
    inicio.set(p.indice, cursor);
    cursor += minutos(duracaoDoItem(p.item.ajustes, topo));
  }

  // Duração de quem está numa vaga: até o próximo horário do dia (vaga, audiência ou item do lote).
  const marcos = [...new Set([...minutosDeVaga, ...fora.map((f) => f.minuto), ...inicio.values()])].sort((a, b) => a - b);
  const ateOProximo = (m: number) => {
    const proximo = marcos.find((x) => x > m);
    return proximo === undefined ? undefined : proximo - m;
  };
  const alemSet = new Set(alem.map((p) => p.indice));
  const linhas: LinhaPauta[] = [];
  for (const { item, indice } of processos) {
    const m = inicio.get(indice)!;
    const duracao = alemSet.has(indice) ? duracaoDoItem(item.ajustes, topo) : (ateOProximo(m) ?? duracaoDoItem(item.ajustes, topo));
    const linha: LinhaPauta = { tipo: 'processo', chave: item.chave, indice, ordem: 0, inicio: m, duracao, ancorado: horaValida(item.ajustes.inicio), sinal: 'ok' };
    if (alemSet.has(indice)) linha.alemDasVagas = true;
    else if (minutosDeVaga.has(m)) linha.naVaga = true;
    linhas.push(linha);
  }
  for (const { item, indice, minuto } of fora) {
    linhas.push({ tipo: 'fora', chave: item.chave, indice, ordem: 0, inicio: minuto, duracao: item.duracao ?? topo.duracao, ancorado: true, sinal: 'ok' });
  }
  for (const v of pje.vagas) {
    if (ocupadas.has(v.minuto)) continue;
    linhas.push({ tipo: 'vaga', chave: `vaga-${paraHora(v.minuto)}`, indice: -1, ordem: 0, inicio: v.minuto, duracao: 0, ancorado: true, sinal: 'ok', vaga: { ...v, deixadaLivre: livres.has(v.minuto) } });
  }
  // No mesmo minuto, a vaga e a de fora vêm antes do processo, para o conflito aparecer embaixo.
  const rank = { vaga: 0, fora: 1, processo: 2, intervalo: 3, 'intervalo-auto': 3 } as const;
  linhas.sort((a, b) => a.inicio - b.inicio || rank[a.tipo] - rank[b.tipo]);
  let ordem = 0;
  for (const l of linhas) if (l.tipo === 'processo') l.ordem = ++ordem;
  marcarSinais(linhas);
  return linhas;
}

/**
 * A pauta do PJe para a tela 2 (D73, D74). "Pelas vagas" só vale quando o dia tem vaga livre; as
 * vagas do lote são as livres e os horários dos processos do próprio lote (`doLote`: idProcesso →
 * número), que vão sair dali ou ficar.
 */
export function montarPautaPje(entradas: EntradaPauta[], doLote: Map<number, string>, escolhido: ModoHorarios, livres: string[]): PautaPje {
  const modo: ModoHorarios = escolhido === 'vagas' && entradas.some((e) => e.tipo === 'vaga') ? 'vagas' : 'sequencia';
  const porMinuto = new Map<number, VagaDoLote>();
  for (const e of entradas) {
    const minuto = paraMinutos(e.hora);
    const vaga: VagaDoLote = { minuto };
    if (e.descricaoTipo) vaga.descricaoTipo = e.descricaoTipo;
    if (e.tipo === 'vaga') {
      if (!porMinuto.has(minuto)) porMinuto.set(minuto, vaga);
    } else if (e.idProcesso !== undefined && doLote.has(e.idProcesso)) {
      porMinuto.set(minuto, { ...vaga, doLote: doLote.get(e.idProcesso)! });
    }
  }
  return {
    modo,
    vagas: [...porMinuto.values()].sort((a, b) => a.minuto - b.minuto),
    livres: livres.filter(horaValida).map(paraMinutos),
    ultimo: entradas.length ? Math.max(...entradas.map((e) => paraMinutos(e.hora))) : null,
  };
}

/**
 * Põe na lista as audiências de fora (D74) e tira as que não estão mais no dia. As que continuam
 * no mesmo horário ficam onde estão (o usuário pode ter arrumado os novos em volta delas). Uma nova
 * entra antes do primeiro item que chegaria ao horário dela, para os novos se encaixarem em volta.
 * Sem mudança, devolve a mesma lista.
 */
export function sincronizarFora(itens: ItemLote[], fora: { idProcesso: number; hora: string }[], topo: Topo): ItemLote[] {
  const novas = new Map(fora.map((f) => [`fora-${f.idProcesso}`, f]));
  let lista = itens.filter((i) => i.tipo !== 'fora' || novas.get(i.chave)?.hora === i.inicio);
  const ja = new Set(lista.filter((i) => i.tipo === 'fora').map((i) => i.chave));
  let mudou = lista.length !== itens.length;
  for (const f of [...fora].sort((a, b) => a.hora.localeCompare(b.hora))) {
    const chave = `fora-${f.idProcesso}`;
    if (ja.has(chave)) continue;
    const m = paraMinutos(f.hora);
    const alvo = calcularPauta(lista, topo).find((l) => l.indice >= 0 && l.tipo !== 'fora' && l.inicio + minutos(l.duracao) > m);
    const pos = alvo ? alvo.indice : lista.length;
    lista = [...lista.slice(0, pos), { tipo: 'fora', chave, idProcesso: f.idProcesso, inicio: f.hora }, ...lista.slice(pos)];
    ja.add(chave);
    mudou = true;
  }
  return mudou ? lista : itens;
}

// ── Mover (D16) e mesclar ─────────────────────────────────────────────────────────────────

/** Tira o item de `de` e o põe na posição final `para`. */
export function moverItem<T>(lista: T[], de: number, para: number): T[] {
  if (de === para || de < 0 || de >= lista.length || para < 0 || para >= lista.length) return lista;
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item!);
  return nova;
}

/** Posição final de um arraste solto antes ou depois do item `alvo`. */
export function destinoDoArraste(de: number, alvo: number, posicao: 'antes' | 'depois'): number {
  const insercao = posicao === 'antes' ? alvo : alvo + 1;
  return insercao > de ? insercao - 1 : insercao;
}

/**
 * Depois de "Voltar ao texto" e Continuar de novo: quem já estava mantém posição e ajustes, os
 * novos entram no fim, na ordem do texto, e quem saiu do texto sai da lista. Os intervalos e as
 * audiências de fora ficam.
 */
export function mesclarItens(atuais: ItemLote[], numeros: string[]): ItemLote[] {
  const presentes = new Set(numeros);
  const mantidos = atuais.filter((i) => i.tipo !== 'processo' || presentes.has(i.chave));
  const ja = new Set(mantidos.map((i) => i.chave));
  const novos: ItemLote[] = numeros.filter((n) => !ja.has(n)).map((n) => ({ tipo: 'processo', chave: n, ajustes: {} }));
  return [...mantidos, ...novos];
}

/**
 * Auto organizar (D48): os processos passam a seguir `ordem` (as chaves já ordenadas), e cada
 * intervalo manual fica com o mesmo número de audiências antes dele (D48i). Os "a cada N" e os
 * horários são recalculados pela pauta. Cada processo leva os próprios ajustes (D48d).
 */
export function reordenarItens(itens: ItemLote[], ordem: string[]): ItemLote[] {
  const processos = new Map(itens.filter((i) => i.tipo === 'processo').map((i) => [i.chave, i]));
  const ordenados: ItemLote[] = ordem.map((c) => processos.get(c)).filter((i) => i !== undefined);
  // Quem não veio em `ordem` (não deveria acontecer) fica no fim, na posição relativa de antes.
  for (const i of processos.values()) if (!ordem.includes(i.chave)) ordenados.push(i);
  const intervalos: { antes: number; item: ItemLote }[] = [];
  let contados = 0;
  for (const i of itens) {
    if (i.tipo === 'processo') contados++;
    else intervalos.push({ antes: contados, item: i });
  }
  const resultado: ItemLote[] = [];
  const pendentes = [...intervalos];
  const soltarAte = (n: number) => {
    while (pendentes.length && pendentes[0]!.antes <= n) resultado.push(pendentes.shift()!.item);
  };
  soltarAte(0);
  ordenados.forEach((item, i) => {
    resultado.push(item);
    soltarAte(i + 1);
  });
  for (const r of pendentes) resultado.push(r.item);
  return resultado;
}

/** Tira o início fixo (âncora) de um item, processo ou intervalo. A de fora não tem âncora para tirar. */
function semAncora(item: ItemLote): ItemLote {
  if (item.tipo === 'fora') return item;
  if (item.tipo === 'intervalo') {
    const { inicio: _, ...resto } = item;
    return resto;
  }
  const { inicio: _, ...ajustes } = item.ajustes;
  return { ...item, ajustes };
}

/**
 * "Empurrar" (tela 3, D28, D65): antes do item entra um intervalo manual que começa no horário do
 * processo de fora (âncora) e dura `duracao` (a duração base do topo); o item perde a âncora e
 * passa a começar depois dele, e os seguintes vêm atrás.
 */
export function empurrarItens(itens: ItemLote[], chave: string, inicioDoOutro: string, duracao: number): ItemLote[] {
  const i = itens.findIndex((x) => x.chave === chave);
  if (i < 0) return itens;
  const intervalo: ItemLote = { ...(novoIntervalo(itens, duracao) as Extract<ItemLote, { tipo: 'intervalo' }>), inicio: inicioDoOutro };
  return [...itens.slice(0, i), intervalo, semAncora(itens[i]!), ...itens.slice(i + 1)];
}

/**
 * "Remover sem recalcular" (tela 3, D32): o item sai, e o seguinte fica no horário em que estava
 * (vira âncora), para nada depois dele mudar.
 */
export function removerSemRecalcularItens(itens: ItemLote[], chave: string, inicioDoSeguinte: string | null): ItemLote[] {
  const i = itens.findIndex((x) => x.chave === chave);
  if (i < 0) return itens;
  const resto = [...itens.slice(0, i), ...itens.slice(i + 1)];
  const seguinte = resto[i];
  // A audiência de fora já está presa ao horário dela.
  if (!seguinte || seguinte.tipo === 'fora' || !horaValida(inicioDoSeguinte)) return resto;
  resto[i] = seguinte.tipo === 'intervalo' ? { ...seguinte, inicio: inicioDoSeguinte } : { ...seguinte, ajustes: { ...seguinte.ajustes, inicio: inicioDoSeguinte } };
  return resto;
}

export function novoIntervalo(itens: ItemLote[], duracao: number): ItemLote {
  const usados = new Set(itens.map((i) => i.chave));
  let n = 1;
  while (usados.has(`intervalo-${n}`)) n++;
  return { tipo: 'intervalo', chave: `intervalo-${n}`, duracao };
}

// ── Rascunho (D18) e topo lembrado (D56) ──────────────────────────────────────────────────

/**
 * O que fica no navegador: números de processo, ajustes, intervalos, topo e `{hash}`. **Sem nomes
 * de partes e sem o texto colado.** Ao retomar, os processos são consultados de novo.
 */
export interface Rascunho {
  versao: 1;
  idOrgao: number;
  /** ISO */
  salvoEm: string;
  hash: string;
  topo: Topo;
  itens: ItemLote[];
  /** Nome do conjunto do Auto organizar aplicado por último, se a lista não foi arrastada depois (D48e). */
  ordenacao?: string;
  /** O modo de horários escolhido (D73). Ausente nos rascunhos de antes da entrega 5: "pelas vagas". */
  horarios?: ModoHorarios;
  /** As vagas deixadas livres, pelo horário (D73). */
  vagasLivres?: string[];
}

const NUMERO_CNJ = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;
const HASH = /^AUD-[0-9A-Z]{8}$/;

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
const inteiroEntre = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const ehTipoBase = (v: unknown): v is TipoBase => TIPOS_BASE.includes(v as TipoBase);
const ehSemana = (v: unknown): v is Semana => v === 'nenhuma' || v === 'conciliacao' || v === 'execucao';

function lerGigs(v: unknown): GigsLote | undefined {
  const g = objeto(v);
  if (typeof g['opcao'] !== 'string' || typeof g['texto'] !== 'string' || !inteiroEntre(g['prazo'], LIMITES.prazo.min, LIMITES.prazo.max)) return undefined;
  return { opcao: g['opcao'], texto: g['texto'].slice(0, LIMITES.textoGigs), prazo: g['prazo'] };
}

/** Topo vindo do armazenamento, sem confiar no formato: o que vier inválido volta ao padrão. */
export function normalizarTopo(bruto: unknown, padrao: Topo = TOPO_PADRAO): Topo {
  const t = objeto(bruto);
  const iv = objeto(t['intervalo']);
  return {
    idSala: typeof t['idSala'] === 'number' && Number.isInteger(t['idSala']) ? t['idSala'] : padrao.idSala,
    data: typeof t['data'] === 'string' && DATA.test(t['data']) ? t['data'] : padrao.data,
    tipoBase: ehTipoBase(t['tipoBase']) ? t['tipoBase'] : padrao.tipoBase,
    video: typeof t['video'] === 'boolean' ? t['video'] : padrao.video,
    semana: ehSemana(t['semana']) ? t['semana'] : padrao.semana,
    inicio: horaValida(t['inicio']) ? t['inicio'] : padrao.inicio,
    duracao: duracaoValida(t['duracao']) ? t['duracao'] : padrao.duracao,
    intervalo: {
      duracao: duracaoValida(iv['duracao']) ? iv['duracao'] : padrao.intervalo.duracao,
      aCada: inteiroEntre(iv['aCada'], LIMITES_LOTE.aCada.min, LIMITES_LOTE.aCada.max) ? iv['aCada'] : padrao.intervalo.aCada,
    },
    gigs: lerGigs(t['gigs']) ?? padrao.gigs,
  };
}

function lerAjustes(v: unknown): AjustesItem {
  const a = objeto(v);
  const ajustes: AjustesItem = {};
  if (ehTipoBase(a['tipoBase'])) ajustes.tipoBase = a['tipoBase'];
  if (typeof a['video'] === 'boolean') ajustes.video = a['video'];
  if (duracaoValida(a['duracao'])) ajustes.duracao = a['duracao'];
  if (horaValida(a['inicio'])) ajustes.inicio = a['inicio'];
  const gigs = lerGigs(a['gigs']);
  if (gigs) ajustes.gigs = gigs;
  return ajustes;
}

function lerItem(v: unknown): ItemLote | null {
  const i = objeto(v);
  if (i['tipo'] === 'processo' && typeof i['chave'] === 'string' && NUMERO_CNJ.test(i['chave'])) {
    return { tipo: 'processo', chave: i['chave'], ajustes: lerAjustes(i['ajustes']) };
  }
  if (i['tipo'] === 'intervalo' && typeof i['chave'] === 'string' && duracaoValida(i['duracao'])) {
    const item: Extract<ItemLote, { tipo: 'intervalo' }> = { tipo: 'intervalo', chave: i['chave'], duracao: i['duracao'] };
    if (horaValida(i['inicio'])) item.inicio = i['inicio'];
    return item;
  }
  return null;
}

/** O rascunho do órgão, ou `null` se não houver um válido (outro órgão, versão ou formato). */
export function lerRascunho(bruto: unknown, idOrgao: number): Rascunho | null {
  const r = objeto(bruto);
  if (r['versao'] !== 1 || r['idOrgao'] !== idOrgao || typeof r['salvoEm'] !== 'string' || typeof r['hash'] !== 'string' || !HASH.test(r['hash'])) {
    return null;
  }
  const itens = (Array.isArray(r['itens']) ? r['itens'] : []).map(lerItem).filter((i): i is ItemLote => i !== null);
  const chaves = new Set<string>();
  const unicos = itens.filter((i) => !chaves.has(i.chave) && chaves.add(i.chave));
  if (!unicos.some((i) => i.tipo === 'processo')) return null;
  const rascunho: Rascunho = { versao: 1, idOrgao, salvoEm: r['salvoEm'], hash: r['hash'], topo: normalizarTopo(r['topo']), itens: unicos };
  if (typeof r['ordenacao'] === 'string' && r['ordenacao']) rascunho.ordenacao = r['ordenacao'];
  if (r['horarios'] === 'vagas' || r['horarios'] === 'sequencia') rascunho.horarios = r['horarios'];
  if (Array.isArray(r['vagasLivres'])) {
    const livres = [...new Set(r['vagasLivres'].filter(horaValida))];
    if (livres.length) rascunho.vagasLivres = livres;
  }
  return rascunho;
}

export const chaveRascunho = (idOrgao: number) => `lote.rascunho.${idOrgao}`;
export const chaveTopo = (idOrgao: number) => `lote.topo.${idOrgao}`;
