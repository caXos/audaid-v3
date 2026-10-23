// Texto e prazo do GIGS (D11, D29, D29b, D43, D44). O GIGS só aceita texto pronto: as variáveis
// são resolvidas aqui, com os dados da audiência designada e da sessão.

import { LIMITES } from '../config/opcoes';

/** Dados disponíveis para as variáveis. O que ainda não existe deixa a variável intacta. */
export interface DadosVariaveisGigs {
  /** AAAA-MM-DD */
  data?: string;
  /** HH:MM */
  hora?: string;
  tipo?: string;
  sala?: string;
  acao?: 'designada' | 'redesignada';
  usuario?: string;
  orgao?: string;
  hash?: string;
}

interface DefinicaoVariavel {
  /** Como aparece para o usuário (e o que é inserido no texto). */
  variavel: string;
  descricao: string;
  padrao: RegExp;
  valor: (d: DadosVariaveisGigs) => string | undefined;
}

/** As variáveis do GIGS (D43), na ordem em que aparecem no diálogo "Exibir variáveis". */
export const VARIAVEIS_GIGS: readonly DefinicaoVariavel[] = [
  { variavel: '{data}', descricao: 'data da audiência', padrao: /\{\s*data\s*\}/gi, valor: (d) => (d.data ? dataBr(d.data) : undefined) },
  { variavel: '{hora}', descricao: 'horário da audiência', padrao: /\{\s*hora\s*\}/gi, valor: (d) => d.hora },
  {
    variavel: '{data e hora}',
    descricao: 'data e horário por extenso',
    padrao: /\{\s*data\s+e\s+hora\s*\}/gi,
    valor: (d) => (d.data && d.hora ? dataHoraPorExtenso(d.data, d.hora) : undefined),
  },
  { variavel: '{tipo}', descricao: 'tipo da audiência', padrao: /\{\s*tipo\s*\}/gi, valor: (d) => d.tipo },
  { variavel: '{sala}', descricao: 'sala da audiência', padrao: /\{\s*sala\s*\}/gi, valor: (d) => d.sala },
  { variavel: '{acao}', descricao: '"designada" ou "redesignada"', padrao: /\{\s*a[cç][aã]o\s*\}/gi, valor: (d) => d.acao },
  {
    variavel: '{eu}',
    descricao: 'seu nome, como está no PJe (também vale {usuario})',
    padrao: /\{\s*(eu|usu[aá]rio)\s*\}/gi,
    valor: (d) => d.usuario,
  },
  { variavel: '{orgao}', descricao: 'órgão julgador em que você está logado', padrao: /\{\s*[oó]rg[aã]o\s*\}/gi, valor: (d) => d.orgao },
  {
    variavel: '{hash}',
    descricao: 'código desta execução, para achar depois na busca do GIGS (no lote, o mesmo para todas)',
    padrao: /\{\s*hash\s*\}/gi,
    valor: (d) => d.hash,
  },
];

/** "2026-10-20" → "20/10/2026". */
export function dataBr(data: string): string {
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a}`;
}

/** Formato padrão da D21: "20/10/2026, às 10h11". */
export function dataHoraPorExtenso(data: string, hora: string): string {
  return `${dataBr(data)}, às ${hora.replace(':', 'h')}`;
}

/**
 * Troca as variáveis conhecidas pelos valores. Variável desconhecida, ou cujo dado ainda não
 * existe, fica como está: não bloqueia nada (D43).
 */
export function resolverVariaveis(texto: string, d: DadosVariaveisGigs): string {
  // "{data e hora}" antes de "{data}", para a mais curta não comer o começo da mais longa.
  const ordem = [...VARIAVEIS_GIGS].sort((a, b) => b.variavel.length - a.variavel.length);
  let resultado = texto;
  for (const v of ordem) {
    const valor = v.valor(d);
    if (valor !== undefined) resultado = resultado.replace(v.padrao, () => valor);
  }
  return resultado;
}

/** Alfabeto do `{hash}` (D44): sem 0/O, 1/I/L, que se confundem ao ler ou digitar. */
export const ALFABETO_HASH = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

type FonteAleatoria = (quantidade: number) => Uint8Array;
const aleatorioSeguro: FonteAleatoria = (n) => crypto.getRandomValues(new Uint8Array(n));

/** `AUD-` + 8 caracteres aleatórios (D44). Sem viés: bytes acima do múltiplo do alfabeto são descartados. */
export function gerarHash(aleatorio: FonteAleatoria = aleatorioSeguro): string {
  const tamanho = ALFABETO_HASH.length;
  const limite = 256 - (256 % tamanho);
  let codigo = '';
  for (let rodada = 0; codigo.length < 8; rodada++) {
    if (rodada > 100) throw new Error('Fonte aleatória não produz valores utilizáveis.');
    for (const byte of aleatorio(16)) {
      if (byte < limite && codigo.length < 8) codigo += ALFABETO_HASH[byte % tamanho];
    }
  }
  return `AUD-${codigo}`;
}

export interface EscolhaGigs {
  /** `nenhum` = a opção vazia: não lança GIGS. */
  lancar: boolean;
  texto: string;
  prazo: number;
}

/**
 * Pendência que impede o envio, ou `null` se está tudo certo. `texto` deve ser o texto JÁ com as
 * variáveis resolvidas: são elas que podem fazê-lo passar do limite de 4000 caracteres do GIGS.
 */
export function pendenciaGigs(e: EscolhaGigs): string | null {
  if (!e.lancar) return null;
  if (!e.texto.trim()) return 'Escreva o texto do GIGS (ou escolha a opção vazia para não lançar).';
  if (e.texto.length > LIMITES.textoGigs) {
    return `O texto do GIGS tem ${e.texto.length} caracteres (com as variáveis preenchidas); o limite do PJe é ${LIMITES.textoGigs}.`;
  }
  if (!Number.isInteger(e.prazo) || e.prazo < LIMITES.prazo.min || e.prazo > LIMITES.prazo.max) {
    return `O prazo do GIGS deve ser um número inteiro de ${LIMITES.prazo.min} a ${LIMITES.prazo.max} dias úteis.`;
  }
  return null;
}
