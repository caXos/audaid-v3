// Modelo composto do tipo de audiência (D6): o usuário escolhe tipo base + vídeo (+ fase e
// Semana Nacional, na conciliação); o rito sai da classe. A descrição resultante é procurada em
// `dominio/tiposaudiencias` pelo nome (ver tipos.ts); o ID nunca é fixo.

import { normalizarDescricao } from './tipos';

export const TIPOS_BASE = [
  'Conciliação',
  'Inicial',
  'Instrução',
  'Encerramento',
  'Julgamento',
  'Una',
  'Inquirição de testemunha',
] as const;

export type TipoBase = (typeof TIPOS_BASE)[number];
export type Fase = 'Conhecimento' | 'Execução';
export type Semana = 'nenhuma' | 'conciliacao' | 'execucao';

export interface EscolhaTipo {
  base: TipoBase;
  video: boolean;
  fase: Fase;
  semana: Semana;
  /** Classe ATSum: "(rito sumaríssimo)" em Inicial, Instrução e Una. */
  sumarissimo: boolean;
}

/** Quais controles do formulário se aplicam a cada tipo base (os outros ficam desabilitados). */
export interface Aplicabilidade {
  video: boolean;
  fase: boolean;
  semana: boolean;
  /** "Semana Nacional de Execução" só existe na fase de execução. */
  semanaExecucao: boolean;
  rito: boolean;
}

export function aplicabilidade(base: TipoBase, fase: Fase): Aplicabilidade {
  switch (base) {
    case 'Conciliação':
      return { video: true, fase: true, semana: true, semanaExecucao: fase === 'Execução', rito: false };
    case 'Inicial':
    case 'Instrução':
    case 'Una':
      return { video: true, fase: false, semana: false, semanaExecucao: false, rito: true };
    case 'Julgamento':
      return { video: false, fase: false, semana: false, semanaExecucao: false, rito: false };
    case 'Encerramento':
    case 'Inquirição de testemunha':
      return { video: true, fase: false, semana: false, semanaExecucao: false, rito: false };
  }
}

/** Zera o que não se aplica, para a descrição nunca depender de um controle desabilitado. */
export function normalizarEscolha(e: EscolhaTipo): EscolhaTipo {
  const ap = aplicabilidade(e.base, e.fase);
  let semana: Semana = ap.semana ? e.semana : 'nenhuma';
  if (semana === 'execucao' && !ap.semanaExecucao) semana = 'nenhuma';
  return {
    base: e.base,
    video: ap.video ? e.video : false,
    fase: ap.fase ? e.fase : 'Conhecimento',
    semana,
    sumarissimo: ap.rito ? e.sumarissimo : false,
  };
}

const VIDEO = ' por videoconferência';

export function descricaoTipo(escolha: EscolhaTipo): string {
  const e = normalizarEscolha(escolha);
  const video = e.video ? VIDEO : '';
  switch (e.base) {
    case 'Conciliação': {
      const semana =
        e.semana === 'conciliacao'
          ? ' - Semana Nacional de Conciliação'
          : e.semana === 'execucao'
            ? ' - Semana Nacional de Execução'
            : '';
      return `Conciliação em ${e.fase}${video}${semana}`;
    }
    case 'Inicial':
    case 'Instrução':
    case 'Una':
      return `${e.base}${video}${e.sumarissimo ? ' (rito sumaríssimo)' : ''}`;
    case 'Encerramento':
      return `Encerramento de instrução${video}`;
    case 'Julgamento':
      return 'Julgamento';
    case 'Inquirição de testemunha':
      return `Inquirição de testemunha${video} (juízo deprecado)`;
  }
}

/** Todas as escolhas válidas (as 27 combinações que o PJe tem). */
export function todasEscolhas(): EscolhaTipo[] {
  const lista: EscolhaTipo[] = [];
  const vistas = new Set<string>();
  for (const base of TIPOS_BASE)
    for (const fase of ['Conhecimento', 'Execução'] as Fase[])
      for (const video of [false, true])
        for (const semana of ['nenhuma', 'conciliacao', 'execucao'] as Semana[])
          for (const sumarissimo of [false, true]) {
            const e = normalizarEscolha({ base, fase, video, semana, sumarissimo });
            const chave = descricaoTipo(e);
            if (!vistas.has(chave)) {
              vistas.add(chave);
              lista.push(e);
            }
          }
  return lista;
}

/** Reconstrói a escolha a partir de uma descrição (ex.: para pré-preencher com a audiência antiga). */
export function escolhaDaDescricao(descricao: string): EscolhaTipo | undefined {
  const alvo = normalizarDescricao(descricao);
  return todasEscolhas().find((e) => normalizarDescricao(descricaoTipo(e)) === alvo);
}

export interface EstadoVideo {
  habilitada: boolean;
  /** Valor imposto; `undefined` = o usuário escolhe. */
  marcada?: boolean;
}

/**
 * Checkbox "por videoconferência" (D42):
 * - tipo sem versão por vídeo (Julgamento): desabilitada e desmarcada;
 * - processo 100% Digital: desabilitada e marcada (não pode haver audiência presencial);
 * - processo comum: habilitada, à escolha do usuário (começa desmarcada).
 */
export function estadoVideo(base: TipoBase, juizoDigital: boolean): EstadoVideo {
  if (!aplicabilidade(base, 'Conhecimento').video) return { habilitada: false, marcada: false };
  if (juizoDigital) return { habilitada: false, marcada: true };
  return { habilitada: true };
}

export function ehSumarissimo(siglaClasse: string | undefined): boolean {
  return siglaClasse?.toUpperCase() === 'ATSUM';
}

/** `faseProcessual` do PJe → fase da conciliação. Liquidação e execução contam como Execução. */
export function faseDoProcesso(faseProcessual: string | undefined): Fase {
  return !faseProcessual || faseProcessual.toUpperCase() === 'CONHECIMENTO' ? 'Conhecimento' : 'Execução';
}
