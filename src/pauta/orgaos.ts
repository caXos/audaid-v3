// Órgãos e período da Pauta (3.2, §2.7), puros e testados: o rótulo, a ordem por cidade (D87b) e
// os meses do horizonte da lista contínua (D91).

import { diaDaSemana } from '../regras/calendario';

export interface SalaPauta {
  id: number;
  nome: string;
}

export interface OrgaoPauta {
  id: number;
  /** O nome completo do PJe ("01ª VARA DO TRABALHO DE CASCAVEL"), para a lista aberta. */
  nome: string;
  sigla?: string;
  /** O código de 4 dígitos ("0071"), do `codigoOrigem`. */
  codigo?: string;
  cidade?: string;
  logado: boolean;
  salas: SalaPauta[];
}

/** `codigoOrigem` → "0071". Zero ou vazio não viram código: "0000" é a Presidência (D89). */
export function codigoDoOrgao(codigoOrigem: unknown): string | undefined {
  const texto = typeof codigoOrigem === 'number' ? String(codigoOrigem) : typeof codigoOrigem === 'string' ? codigoOrigem.trim() : '';
  if (!/^\d{1,4}$/.test(texto) || Number(texto) === 0) return undefined;
  return texto.padStart(4, '0');
}

/** D87b: a sigla do PJe e o código, para todos ("CEJUSC-CSC · 3603"). Sem sigla, o nome. */
export function rotuloDoOrgao(o: Pick<OrgaoPauta, 'nome' | 'sigla' | 'codigo'>): string {
  const base = o.sigla ?? o.nome;
  return o.codigo ? `${base} · ${o.codigo}` : base;
}

/** A cidade pelo fim do nome, quando o AUD4 não a der: "… DE CASCAVEL", "CEJUSC - JT - CASCAVEL". */
export function cidadeDoNome(nome: string): string | undefined {
  const m = /(?:\sDE\s|\s-\s)([A-ZÀ-Ü][A-ZÀ-Ü ]*[A-ZÀ-Ü])\s*$/i.exec(nome.trim());
  return m?.[1]?.toUpperCase();
}

/** O número do órgão na cidade: "01ª VARA…" → 1. Sem número (CEJUSC, posto), `Infinity`. */
function numeroNaCidade(nome: string): number {
  const m = /^0*(\d+)\s*[ªº]/.exec(nome.trim());
  return m ? Number(m[1]) : Infinity;
}

const comparar = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true }).compare;

/**
 * D87b: o logado primeiro; os outros agrupados por cidade e, dentro dela, pelo número (1ª, 2ª…),
 * com os sem número (CEJUSC, posto avançado) depois, pelo nome.
 */
export function ordenarOrgaos(orgaos: OrgaoPauta[]): OrgaoPauta[] {
  return [...orgaos].sort((a, b) => {
    if (a.logado !== b.logado) return a.logado ? -1 : 1;
    // Os sem cidade vão para o fim. Até a 3.2.0 isso era um U+FFFF no lugar da cidade, e o Chrome
    // recusa um content script com esse caractere ("não possui a codificação UTF-8").
    if ((a.cidade === undefined) !== (b.cidade === undefined)) return a.cidade === undefined ? 1 : -1;
    const cidade = comparar(a.cidade ?? '', b.cidade ?? '');
    if (cidade) return cidade;
    const na = numeroNaCidade(a.nome);
    const nb = numeroNaCidade(b.nome);
    if (na !== nb) return na < nb ? -1 : 1;
    return comparar(a.nome, b.nome);
  });
}

// ── Período ──────────────────────────────────────────────────────────────────────────────────

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export interface MesPauta {
  /** "2026-11" */
  chave: string;
  /** "Novembro 2026" */
  rotulo: string;
  /**
   * Todos os dias do mês, a partir de hoje no mês atual (D91: nada antes de hoje). O fim de semana
   * só aparece na lista quando o mês da sala diz que ele tem algo (D90, `temConteudo`).
   */
  dias: string[];
}

/** Sábado ou domingo. */
export const ehFimDeSemana = (dia: string) => [0, 6].includes(diaDaSemana(dia));

/**
 * Os códigos do mês da sala (`classificacoes?idSala=&ano=&mes=`), pela prova técnica de 06/11/2026:
 * - "S": sem pauta (nem audiência, nem vaga): o dia não é consultado (D92);
 * - "C": só audiências; "V": só vagas; "Z": audiências numa sala sem vagas configuradas;
 * - "F" e "R": dias sem expediente (a v1 lia "F" como dia não útil; "R" ainda sem confirmação).
 * Código desconhecido conta como "tem algo": na dúvida, consulta.
 */
export const SEM_PAUTA = 'S';
const SEM_EXPEDIENTE = new Set(['F', 'R']);

/** O dia tem audiência ou vaga, pelo código do mês? (Sem código, `false`.) */
export function temConteudo(codigo: string | undefined): boolean {
  return codigo !== undefined && codigo !== SEM_PAUTA && !SEM_EXPEDIENTE.has(codigo);
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** O mês `k` meses depois de "AAAA-MM". */
export function mesSeguinte(chave: string, k = 1): string {
  const [a, m] = chave.split('-').map(Number);
  const total = (a ?? 0) * 12 + ((m ?? 1) - 1) + k;
  return `${Math.floor(total / 12)}-${doisDigitos((total % 12) + 1)}`;
}

/** Um mês da Pauta: os dias a partir de `desde` (inclusive). */
export function mesDaPauta(chave: string, desde?: string): MesPauta {
  const [a, m] = chave.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a ?? 0, m ?? 1, 0)).getUTCDate();
  const dias: string[] = [];
  for (let d = 1; d <= ultimo; d++) {
    const dia = `${chave}-${doisDigitos(d)}`;
    if (!desde || dia >= desde) dias.push(dia);
  }
  return { chave, rotulo: `${MESES[(m ?? 1) - 1]} ${a}`, dias };
}

/** Os `quantidade` meses da lista contínua, a partir do mês de hoje (D91). */
export function mesesDoHorizonte(hojeIso: string, quantidade: number): MesPauta[] {
  const atual = hojeIso.slice(0, 7);
  return Array.from({ length: Math.max(1, quantidade) }, (_, k) => mesDaPauta(mesSeguinte(atual, k), k === 0 ? hojeIso : undefined));
}

/** "2026-11-12" → "qui, 12/11". */
export function rotuloDoDia(dia: string): string {
  return `${SEMANA[diaDaSemana(dia)]}, ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}
