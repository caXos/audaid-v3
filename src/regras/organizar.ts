// Auto organizar o Lote (D48, rodadas 7 e 8, §2.6): conjuntos de 1 a 5 critérios em cascata. Puro
// e testado (tests/organizar.test.ts). Usado pela tela 2 do Lote e pelo editor nas Opções.
//
// Regras técnicas da D48:
// - empate em tudo mantém a ordem atual (ordenação estável);
// - nomes de A a Z sem diferenciar maiúsculas nem acentos (`Intl.Collator('pt-BR')`);
// - partes na ordem do polo, nunca em ordem alfabética; advogados, e só eles, em ordem
//   alfabética antes de comparar (D48b), na forma global ou parte a parte (D48g);
// - processo sem advogado vai para o fim, nos dois sentidos (D48c).

import type { Parte, PartesDoProcesso } from './partes';

// ── Catálogo ──────────────────────────────────────────────────────────────────────────────

export type CampoOrdem =
  | 'ano'
  | 'sequencial'
  | 'vara'
  | 'ultimoDigito'
  | 'nomeAutor'
  | 'advAutorGlobal'
  | 'advAutorPorParte'
  | 'autorComAdvogado'
  | 'nomeReclamada'
  | 'advReclamadaGlobal'
  | 'advReclamadaPorParte'
  | 'reclamadaComAdvogado'
  | 'juizoDigital';

const DIGITOS = ['final0', 'final1', 'final2', 'final3', 'final4', 'final5', 'final6', 'final7', 'final8', 'final9'] as const;
export type Ordem =
  | 'cresc'
  | 'decresc'
  | 'sim'
  | 'nao'
  | 'parCresc'
  | 'parDecresc'
  | 'imparCresc'
  | 'imparDecresc'
  | 'paresPrimeiro'
  | 'imparesPrimeiro'
  | (typeof DIGITOS)[number];

export interface Criterio {
  campo: CampoOrdem;
  ordem: Ordem;
}

/** Um conjunto de regras (§2.6). O nome é automático (`nomeDoConjunto`). */
export interface ConjuntoRegras {
  criterios: Criterio[];
}

export const MAX_CRITERIOS = 5;

type Familia = 'nome' | 'numero' | 'simNao' | 'digito';

interface DefinicaoCampo {
  /** Como aparece na dropdown do campo. */
  rotulo: string;
  /** Como aparece no nome automático do conjunto. */
  curto: string;
  familia: Familia;
}

/** Os campos, na ordem da dropdown (§2.6). */
export const CAMPOS: Record<CampoOrdem, DefinicaoCampo> = {
  ano: { rotulo: 'Ano do processo', curto: 'Ano', familia: 'numero' },
  sequencial: { rotulo: 'Sequencial do processo', curto: 'Sequencial', familia: 'numero' },
  vara: { rotulo: 'Vara de origem (4 dígitos finais)', curto: 'Vara', familia: 'numero' },
  ultimoDigito: { rotulo: 'Último dígito do sequencial', curto: 'Último dígito', familia: 'digito' },
  nomeAutor: { rotulo: 'Nome do autor', curto: 'Nome do autor', familia: 'nome' },
  advAutorGlobal: { rotulo: 'Advogado do autor (global)', curto: 'Advogado do autor, global', familia: 'nome' },
  advAutorPorParte: { rotulo: 'Advogado do autor (por autor)', curto: 'Advogado do autor, por autor', familia: 'nome' },
  autorComAdvogado: { rotulo: 'Autor com advogado', curto: 'Autor com advogado', familia: 'simNao' },
  nomeReclamada: { rotulo: 'Nome da reclamada', curto: 'Nome da reclamada', familia: 'nome' },
  advReclamadaGlobal: { rotulo: 'Advogado da reclamada (global)', curto: 'Advogado da reclamada, global', familia: 'nome' },
  advReclamadaPorParte: { rotulo: 'Advogado da reclamada (por reclamada)', curto: 'Advogado da reclamada, por reclamada', familia: 'nome' },
  reclamadaComAdvogado: { rotulo: 'Reclamada com advogado', curto: 'Reclamada com advogado', familia: 'simNao' },
  juizoDigital: { rotulo: 'Juízo 100% Digital', curto: 'Juízo 100% Digital', familia: 'simNao' },
};

export const CAMPOS_EM_ORDEM = Object.keys(CAMPOS) as CampoOrdem[];

const ORDENS_DA_FAMILIA: Record<Familia, Ordem[]> = {
  nome: ['cresc', 'decresc'],
  numero: ['cresc', 'decresc'],
  simNao: ['sim', 'nao'],
  digito: ['parCresc', 'parDecresc', 'imparCresc', 'imparDecresc', 'paresPrimeiro', 'imparesPrimeiro', ...DIGITOS],
};

export const ordensDoCampo = (campo: CampoOrdem): Ordem[] => ORDENS_DA_FAMILIA[CAMPOS[campo].familia];

/** "A→Z", "crescente", "Sim primeiro", "par crescente", "final 4"… */
export function rotuloOrdem(campo: CampoOrdem, ordem: Ordem): string {
  const familia = CAMPOS[campo].familia;
  if (ordem === 'cresc') return familia === 'nome' ? 'A→Z' : 'crescente';
  if (ordem === 'decresc') return familia === 'nome' ? 'Z→A' : 'decrescente';
  const fixos: Partial<Record<Ordem, string>> = {
    sim: 'Sim primeiro',
    nao: 'Não primeiro',
    parCresc: 'par crescente',
    parDecresc: 'par decrescente',
    imparCresc: 'ímpar crescente',
    imparDecresc: 'ímpar decrescente',
    paresPrimeiro: 'pares primeiro',
    imparesPrimeiro: 'ímpares primeiro',
  };
  return fixos[ordem] ?? `final ${ordem.slice(5)}`;
}

/** "1. Nome da reclamada (A→Z) · 2. Advogado do autor, global (A→Z)" (D48e: nome automático). */
export function nomeDoConjunto(c: ConjuntoRegras): string {
  return c.criterios.map((k, i) => `${i + 1}. ${CAMPOS[k.campo].curto} (${rotuloOrdem(k.campo, k.ordem)})`).join(' · ');
}

/** Pré-cadastro (D48e, D64). "Restaurar padrão" volta a estes. */
export const CONJUNTOS_PADRAO: ConjuntoRegras[] = [
  { criterios: [{ campo: 'nomeReclamada', ordem: 'cresc' }] },
  { criterios: [{ campo: 'nomeReclamada', ordem: 'cresc' }, { campo: 'advAutorGlobal', ordem: 'cresc' }] },
  { criterios: [{ campo: 'ano', ordem: 'cresc' }, { campo: 'sequencial', ordem: 'cresc' }, { campo: 'vara', ordem: 'cresc' }] },
  { criterios: [{ campo: 'juizoDigital', ordem: 'sim' }, { campo: 'nomeReclamada', ordem: 'cresc' }] },
  { criterios: [{ campo: 'advReclamadaGlobal', ordem: 'cresc' }, { campo: 'nomeReclamada', ordem: 'cresc' }] },
];

// ── O que fica desabilitado (§2.6) ────────────────────────────────────────────────────────

const ORDENA_TODOS_OS_DIGITOS: Ordem[] = ['parCresc', 'parDecresc', 'imparCresc', 'imparDecresc'];
const SO_SEPARA: Ordem[] = ['paresPrimeiro', 'imparesPrimeiro'];

export interface Disponibilidade {
  campoDesabilitado(campo: CampoOrdem): boolean;
  ordemDesabilitada(campo: CampoOrdem, ordem: Ordem): boolean;
}

/**
 * O que ainda tem efeito depois dos critérios anteriores. Um campo usado não se repete. A exceção
 * é o último dígito: "final X" pode vir de novo com outro dígito; depois de "pares/ímpares primeiro",
 * só essas duas ficam desabilitadas; depois de par/ímpar crescente/decrescente, o campo inteiro.
 */
export function disponibilidade(anteriores: Criterio[]): Disponibilidade {
  const usados = new Set(anteriores.filter((c) => c.campo !== 'ultimoDigito').map((c) => c.campo));
  const digitos = anteriores.filter((c) => c.campo === 'ultimoDigito').map((c) => c.ordem);
  const digitoEsgotado = digitos.some((o) => ORDENA_TODOS_OS_DIGITOS.includes(o));
  const separou = digitos.some((o) => SO_SEPARA.includes(o));
  return {
    campoDesabilitado: (campo) => (campo === 'ultimoDigito' ? digitoEsgotado : usados.has(campo)),
    ordemDesabilitada: (campo, ordem) => {
      if (campo !== 'ultimoDigito') return usados.has(campo);
      if (digitoEsgotado) return true;
      if (SO_SEPARA.includes(ordem)) return separou;
      return digitos.includes(ordem);
    },
  };
}

/** Critérios válidos, em ordem, sem os que não teriam efeito, até o máximo (para as Opções salvas). */
export function normalizarCriterios(bruto: unknown): Criterio[] {
  const lista = Array.isArray(bruto) ? bruto : [];
  const criterios: Criterio[] = [];
  for (const item of lista) {
    if (criterios.length >= MAX_CRITERIOS) break;
    const c = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const campo = c['campo'] as CampoOrdem;
    const ordem = c['ordem'] as Ordem;
    if (!(campo in CAMPOS) || !ordensDoCampo(campo).includes(ordem)) continue;
    if (disponibilidade(criterios).ordemDesabilitada(campo, ordem)) continue;
    criterios.push({ campo, ordem });
  }
  return criterios;
}

/**
 * Todos os critérios têm efeito, na ordem em que estão, sem passar do máximo. O editor das Opções
 * só oferece trocas (de campo, de ordem, de posição) que mantêm a lista válida.
 */
export function criteriosValidos(criterios: Criterio[]): boolean {
  return criterios.length <= MAX_CRITERIOS && normalizarCriterios(criterios).length === criterios.length;
}

/** O primeiro critério que ainda cabe no fim da lista (para "Adicionar critério"), ou `null`. */
export function primeiroCriterioLivre(criterios: Criterio[]): Criterio | null {
  if (criterios.length >= MAX_CRITERIOS) return null;
  for (const campo of CAMPOS_EM_ORDEM) {
    for (const ordem of ordensDoCampo(campo)) {
      if (criteriosValidos([...criterios, { campo, ordem }])) return { campo, ordem };
    }
  }
  return null;
}

// ── Ordenar ───────────────────────────────────────────────────────────────────────────────

/** O que cada processo precisa para ser ordenado (vem da tela 1 do Lote). */
export interface DadosOrdenacao {
  numero: string;
  partes: PartesDoProcesso;
  juizoDigital: boolean;
}

const colador = new Intl.Collator('pt-BR', { sensitivity: 'base' });
const comparaNome = (a: string, b: string) => colador.compare(a, b);

/** Lista contra lista, item a item; quem acaba antes (é prefixo) vem antes. */
function comparaListas<T>(a: T[], b: T[], cmp: (x: T, y: T) => number): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const r = cmp(a[i]!, b[i]!);
    if (r !== 0) return r;
  }
  return a.length - b.length;
}

/** Advogados de uma parte (ou do polo), sem repetir, em ordem alfabética (D48b). */
function advogadosOrdenados(partes: Parte[]): string[] {
  const nomes: string[] = [];
  for (const p of partes) for (const a of p.advogados) if (!nomes.some((n) => comparaNome(n, a.nome) === 0)) nomes.push(a.nome);
  return nomes.sort(comparaNome);
}

const temAdvogado = (partes: Parte[]) => partes.some((p) => p.advogados.length > 0);
/** D48h: "Não" quando pelo menos uma parte do polo está sem advogado. */
const todasComAdvogado = (partes: Parte[]) => partes.length > 0 && partes.every((p) => p.advogados.length > 0);

/** NNNNNNN-DD.AAAA.J.TR.OOOO */
function pecasDoNumero(numero: string): { sequencial: number; ano: number; vara: number } {
  const d = numero.replace(/\D/g, '');
  return { sequencial: Number(d.slice(0, 7)), ano: Number(d.slice(9, 13)), vara: Number(d.slice(16, 20)) };
}

/**
 * Comparador de um critério. `vazio` diz quem não tem o dado (sem parte, sem advogado): vai para o
 * fim nos dois sentidos (D48c), por isso fica fora da inversão do decrescente.
 */
function comparador(c: Criterio): (a: DadosOrdenacao, b: DadosOrdenacao) => number {
  const sentido = c.ordem === 'decresc' ? -1 : 1;
  const comVazio = <K>(chave: (x: DadosOrdenacao) => K | null, cmp: (x: K, y: K) => number) => (a: DadosOrdenacao, b: DadosOrdenacao) => {
    const ka = chave(a);
    const kb = chave(b);
    if (ka === null || kb === null) return ka === null ? (kb === null ? 0 : 1) : -1;
    return sentido * cmp(ka, kb);
  };
  const polo = (autor: boolean) => (x: DadosOrdenacao) => (autor ? x.partes.autores : x.partes.reus);

  switch (c.campo) {
    case 'ano':
    case 'sequencial':
    case 'vara': {
      const campo = c.campo;
      return (a, b) => sentido * (pecasDoNumero(a.numero)[campo] - pecasDoNumero(b.numero)[campo]);
    }
    case 'ultimoDigito': {
      // Chave em duas partes: o grupo (par/ímpar ou final escolhido) e, se for o caso, o dígito.
      const chave = (x: DadosOrdenacao): [number, number] => {
        const d = pecasDoNumero(x.numero).sequencial % 10;
        const impar = d % 2;
        switch (c.ordem) {
          case 'parCresc':
            return [impar, d];
          case 'parDecresc':
            return [impar, -d];
          case 'imparCresc':
            return [1 - impar, d];
          case 'imparDecresc':
            return [1 - impar, -d];
          case 'paresPrimeiro':
            return [impar, 0];
          case 'imparesPrimeiro':
            return [1 - impar, 0];
          default:
            return [d === Number(c.ordem.slice(5)) ? 0 : 1, 0];
        }
      };
      return (a, b) => {
        const [ga, da] = chave(a);
        const [gb, db] = chave(b);
        return ga - gb || da - db;
      };
    }
    case 'nomeAutor':
    case 'nomeReclamada': {
      const p = polo(c.campo === 'nomeAutor');
      return comVazio((x) => (p(x).length ? p(x).map((q) => q.nome) : null), (x, y) => comparaListas(x, y, comparaNome));
    }
    case 'advAutorGlobal':
    case 'advReclamadaGlobal': {
      const p = polo(c.campo === 'advAutorGlobal');
      return comVazio((x) => (temAdvogado(p(x)) ? advogadosOrdenados(p(x)) : null), (x, y) => comparaListas(x, y, comparaNome));
    }
    case 'advAutorPorParte':
    case 'advReclamadaPorParte': {
      // D48g: parte a parte, na ordem do polo: nome da 1ª, advogados dela, nome da 2ª…
      const p = polo(c.campo === 'advAutorPorParte');
      const porParte = (x: Parte, y: Parte) =>
        comparaNome(x.nome, y.nome) || comparaListas(advogadosOrdenados([x]), advogadosOrdenados([y]), comparaNome);
      return comVazio((x) => (temAdvogado(p(x)) ? p(x) : null), (x, y) => comparaListas(x, y, porParte));
    }
    case 'autorComAdvogado':
    case 'reclamadaComAdvogado': {
      const p = polo(c.campo === 'autorComAdvogado');
      const primeiro = c.ordem === 'sim';
      return (a, b) => Number(todasComAdvogado(p(b)) === primeiro) - Number(todasComAdvogado(p(a)) === primeiro);
    }
    case 'juizoDigital': {
      const primeiro = c.ordem === 'sim';
      return (a, b) => Number(b.juizoDigital === primeiro) - Number(a.juizoDigital === primeiro);
    }
  }
}

/** Os processos em cascata pelos critérios do conjunto. Empate em tudo mantém a ordem recebida. */
export function ordenarProcessos<T extends DadosOrdenacao>(processos: T[], conjunto: ConjuntoRegras): T[] {
  const cmps = conjunto.criterios.map(comparador);
  // `Array.prototype.sort` é estável desde o ES2019.
  return [...processos].sort((a, b) => {
    for (const cmp of cmps) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  });
}
