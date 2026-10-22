// Opções da extensão (blueprint §2.6) e o aceite dos termos (D22). Tudo puro: o armazenamento
// fica em src/ext/armazenamento.ts.

export const POSICOES_FAB = [
  'topo-esquerda',
  'topo-centro',
  'topo-direita',
  'centro-esquerda',
  'centro-direita',
  'abaixo-esquerda',
  'abaixo-centro',
  'abaixo-direita',
] as const;

export type PosicaoFab = (typeof POSICOES_FAB)[number];

export const ROTULO_POSICAO: Record<PosicaoFab, string> = {
  'topo-esquerda': 'Topo, à esquerda',
  'topo-centro': 'Topo, ao centro (padrão)',
  'topo-direita': 'Topo, à direita',
  'centro-esquerda': 'Centro, à esquerda',
  'centro-direita': 'Centro, à direita',
  'abaixo-esquerda': 'Abaixo, à esquerda',
  'abaixo-centro': 'Abaixo, ao centro',
  'abaixo-direita': 'Abaixo, à direita (cuidado com o botão do PJe+)',
};

export interface EstiloFab {
  corIcone: string;
  /** Tamanho do ícone, em pixels. */
  tamanho: number;
  fundo: { ativo: boolean; cor: string };
  borda: { ativo: boolean; cor: string; espessura: number };
}

export interface SugestaoGigs {
  texto: string;
  /** Dias úteis; 0 = atividade sem prazo (D11, D29b). */
  prazo: number;
}

export interface Opcoes {
  fab: { posicao: PosicaoFab; estilo: EstiloFab };
  /** Sugestões editáveis. A opção vazia (não lançar) e "Outro" são fixas e não ficam aqui. */
  gigs: { sugestoes: SugestaoGigs[] };
  /** Modo simulação (D39): mostra as requisições de escrita sem enviar. */
  simulacao: boolean;
}

export const LIMITES = {
  tamanho: { min: 16, max: 64 },
  espessura: { min: 1, max: 6 },
  prazo: { min: 0, max: 240 },
} as const;

/** Variáveis aceitas no texto do GIGS, resolvidas com os dados da audiência designada (D29b). */
export const VARIAVEIS_GIGS = ['{data}', '{hora}', '{data e hora}', '{tipo}', '{sala}'] as const;

export function opcoesPadrao(desenvolvimento: boolean): Opcoes {
  return {
    fab: {
      posicao: 'topo-centro',
      // Fundo branco e desenho preto (D41): só o ícone sumia na barra escura do PJe.
      estilo: {
        corIcone: '#1a1a1a',
        tamanho: 28,
        fundo: { ativo: true, cor: '#ffffff' },
        borda: { ativo: false, cor: '#00838f', espessura: 2 },
      },
    },
    gigs: {
      sugestoes: [
        { texto: '@RJ1', prazo: 2 },
        { texto: 'Analisar', prazo: 2 },
        { texto: 'Audiência gerada pelo AudAid', prazo: 2 },
        { texto: 'Audiência gerada pelo AudAid em {data e hora}', prazo: 2 },
      ],
    },
    simulacao: desenvolvimento,
  };
}

const COR = /^#[0-9a-f]{6}$/i;

function inteiro(v: unknown, padrao: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : padrao;
}
function cor(v: unknown, padrao: string): string {
  return typeof v === 'string' && COR.test(v) ? v.toLowerCase() : padrao;
}
function booleano(v: unknown, padrao: boolean): boolean {
  return typeof v === 'boolean' ? v : padrao;
}
function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Lê opções vindas do armazenamento, sem confiar no formato: o que faltar ou vier inválido volta
 * ao padrão. Assim uma versão nova nunca quebra com opções salvas por uma versão antiga.
 */
export function normalizarOpcoes(bruto: unknown, desenvolvimento: boolean): Opcoes {
  const p = opcoesPadrao(desenvolvimento);
  const o = objeto(bruto);
  const fab = objeto(o['fab']);
  const est = objeto(fab['estilo']);
  const fundo = objeto(est['fundo']);
  const borda = objeto(est['borda']);
  const gigs = objeto(o['gigs']);

  const posicao = POSICOES_FAB.includes(fab['posicao'] as PosicaoFab) ? (fab['posicao'] as PosicaoFab) : p.fab.posicao;

  const sugestoes = Array.isArray(gigs['sugestoes'])
    ? (gigs['sugestoes'] as unknown[])
        .map(objeto)
        .filter((s) => typeof s['texto'] === 'string' && (s['texto'] as string).trim() !== '')
        .map((s) => ({
          texto: (s['texto'] as string).trim(),
          prazo: inteiro(s['prazo'], 2, LIMITES.prazo.min, LIMITES.prazo.max),
        }))
    : p.gigs.sugestoes;

  return {
    fab: {
      posicao,
      estilo: {
        corIcone: cor(est['corIcone'], p.fab.estilo.corIcone),
        tamanho: inteiro(est['tamanho'], p.fab.estilo.tamanho, LIMITES.tamanho.min, LIMITES.tamanho.max),
        fundo: { ativo: booleano(fundo['ativo'], p.fab.estilo.fundo.ativo), cor: cor(fundo['cor'], p.fab.estilo.fundo.cor) },
        borda: {
          ativo: booleano(borda['ativo'], p.fab.estilo.borda.ativo),
          cor: cor(borda['cor'], p.fab.estilo.borda.cor),
          espessura: inteiro(borda['espessura'], p.fab.estilo.borda.espessura, LIMITES.espessura.min, LIMITES.espessura.max),
        },
      },
    },
    gigs: { sugestoes },
    simulacao: booleano(o['simulacao'], p.simulacao),
  };
}

// ── Termos (D22) ────────────────────────────────────────────────────────────────────────────

/** Sobe quando o texto dos termos muda de forma relevante: o aceite anterior deixa de valer. */
export const VERSAO_TERMOS = 1;

export interface Aceite {
  versao: number;
  /** ISO 8601 */
  aceitoEm: string;
}

export function aceiteValido(bruto: unknown): bruto is Aceite {
  const a = objeto(bruto);
  return a['versao'] === VERSAO_TERMOS && typeof a['aceitoEm'] === 'string';
}

export function novoAceite(agora: Date = new Date()): Aceite {
  return { versao: VERSAO_TERMOS, aceitoEm: agora.toISOString() };
}
