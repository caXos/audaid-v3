// Auto organizar (D48, rodadas 7 e 8, §2.6): cada campo e ordem, cascata, empates, sem advogado,
// "com advogado", último dígito, o que fica desabilitado, nome automático e intervalos manuais.
// Nomes e números fictícios.

import { describe, expect, it } from 'vitest';
import { normalizarOpcoes, opcoesPadrao } from '../src/config/opcoes';
import { reordenarItens, type ItemLote } from '../src/lote/pauta';
import {
  CONJUNTOS_PADRAO,
  disponibilidade,
  nomeDoConjunto,
  normalizarCriterios,
  ordenarProcessos,
  type Criterio,
  type DadosOrdenacao,
} from '../src/regras/organizar';
import type { Parte } from '../src/regras/partes';

const parte = (nome: string, ...advogados: string[]): Parte => ({ nome, advogados: advogados.map((a) => ({ nome: a })) });
/** Processo fictício: `seq` vira o sequencial (com o ano e a vara dados). */
function proc(id: string, o: { seq?: number; ano?: number; vara?: number; autores?: Parte[]; reus?: Parte[]; digital?: boolean } = {}): DadosOrdenacao & { id: string } {
  const seq = String(o.seq ?? 1).padStart(7, '0');
  const numero = `${seq}-00.${o.ano ?? 2026}.5.09.${String(o.vara ?? 1).padStart(4, '0')}`;
  return { id, numero, partes: { autores: o.autores ?? [parte('AUTOR')], reus: o.reus ?? [parte('RÉU')] }, juizoDigital: o.digital ?? false };
}
const ordenar = (lista: ReturnType<typeof proc>[], ...criterios: Criterio[]) => ordenarProcessos(lista, { criterios }).map((p) => p.id);

describe('número do processo: ano, sequencial e vara (D48a)', () => {
  const lista = [proc('a', { seq: 5, ano: 2025, vara: 69 }), proc('b', { seq: 3, ano: 2026, vara: 1 }), proc('c', { seq: 5, ano: 2024, vara: 71 })];
  it('cada um nos dois sentidos, e a cascata desempata', () => {
    expect(ordenar(lista, { campo: 'ano', ordem: 'cresc' })).toEqual(['c', 'a', 'b']);
    expect(ordenar(lista, { campo: 'ano', ordem: 'decresc' })).toEqual(['b', 'a', 'c']);
    expect(ordenar(lista, { campo: 'vara', ordem: 'cresc' })).toEqual(['b', 'a', 'c']);
    // Sequencial → ano: "a" e "c" empatam no 5; o ano desempata.
    expect(ordenar(lista, { campo: 'sequencial', ordem: 'cresc' }, { campo: 'ano', ordem: 'cresc' })).toEqual(['b', 'c', 'a']);
    expect(ordenar(lista, { campo: 'sequencial', ordem: 'decresc' }, { campo: 'ano', ordem: 'decresc' })).toEqual(['a', 'c', 'b']);
  });
});

describe('último dígito do sequencial (D48f)', () => {
  // Finais embaralhados: 7, 2, 0, 9, 4, 1, 8, 3, 6, 5.
  const finais = [7, 2, 0, 9, 4, 1, 8, 3, 6, 5];
  const lista = finais.map((d) => proc(String(d), { seq: 10 + d }));
  const finaisEm = (...c: Criterio[]) => ordenar(lista, ...c).map(Number);

  it('par/ímpar crescente/decrescente separam e ordenam', () => {
    expect(finaisEm({ campo: 'ultimoDigito', ordem: 'parCresc' })).toEqual([0, 2, 4, 6, 8, 1, 3, 5, 7, 9]);
    expect(finaisEm({ campo: 'ultimoDigito', ordem: 'parDecresc' })).toEqual([8, 6, 4, 2, 0, 9, 7, 5, 3, 1]);
    expect(finaisEm({ campo: 'ultimoDigito', ordem: 'imparCresc' })).toEqual([1, 3, 5, 7, 9, 0, 2, 4, 6, 8]);
    expect(finaisEm({ campo: 'ultimoDigito', ordem: 'imparDecresc' })).toEqual([9, 7, 5, 3, 1, 8, 6, 4, 2, 0]);
  });

  it('"pares primeiro" só separa (o resto fica como estava); "final X" põe o X na frente', () => {
    expect(finaisEm({ campo: 'ultimoDigito', ordem: 'paresPrimeiro' })).toEqual([2, 0, 4, 8, 6, 7, 9, 1, 3, 5]);
    expect(finaisEm({ campo: 'ultimoDigito', ordem: 'imparesPrimeiro' })).toEqual([7, 9, 1, 3, 5, 2, 0, 4, 8, 6]);
    expect(finaisEm({ campo: 'ultimoDigito', ordem: 'final4' })).toEqual([4, 7, 2, 0, 9, 1, 8, 3, 6, 5]);
    expect(finaisEm({ campo: 'ultimoDigito', ordem: 'final0' }, { campo: 'ultimoDigito', ordem: 'final4' })).toEqual([0, 4, 7, 2, 9, 1, 8, 3, 6, 5]);
  });
});

describe('nomes das partes, na ordem do polo', () => {
  it('compara a 1ª reclamada; empatou, a 2ª (o exemplo do §2.3); sem diferença de acento ou maiúscula', () => {
    const lista = [
      proc('coopavel', { reus: [parte('BETANIA ALIMENTOS'), parte('COOPAVEL')] }),
      proc('aurora', { reus: [parte('Betânia Alimentos'), parte('AURORA')] }),
      proc('abc', { reus: [parte('ABC LTDA')] }),
    ];
    expect(ordenar(lista, { campo: 'nomeReclamada', ordem: 'cresc' })).toEqual(['abc', 'aurora', 'coopavel']);
    expect(ordenar(lista, { campo: 'nomeReclamada', ordem: 'decresc' })).toEqual(['coopavel', 'aurora', 'abc']);
  });

  it('quem tem só a 1ª parte (prefixo) vem antes; polo vazio vai para o fim nos dois sentidos', () => {
    const lista = [proc('vazio', { autores: [] }), proc('duas', { autores: [parte('ANA'), parte('BIA')] }), proc('uma', { autores: [parte('ANA')] })];
    expect(ordenar(lista, { campo: 'nomeAutor', ordem: 'cresc' })).toEqual(['uma', 'duas', 'vazio']);
    expect(ordenar(lista, { campo: 'nomeAutor', ordem: 'decresc' })).toEqual(['duas', 'uma', 'vazio']);
  });
});

describe('advogados (D48b, D48c, D48g, D48h)', () => {
  const lista = [
    proc('semAdv', { reus: [parte('EMPRESA X')] }),
    // A ordem de habilitação é acaso: os advogados são ordenados antes de comparar.
    proc('beto', { reus: [parte('EMPRESA Z', 'Dr. Carlos', 'Dr. Adão')] }),
    proc('adao', { reus: [parte('EMPRESA A', 'Dr. Adão', 'Dr. Beto')] }),
  ];

  it('global: lista ordenada, comparada nome a nome; sem advogado no fim, nos dois sentidos', () => {
    expect(ordenar(lista, { campo: 'advReclamadaGlobal', ordem: 'cresc' })).toEqual(['adao', 'beto', 'semAdv']);
    expect(ordenar(lista, { campo: 'advReclamadaGlobal', ordem: 'decresc' })).toEqual(['beto', 'adao', 'semAdv']);
  });

  it('por reclamada: nome da 1ª, advogados dela, nome da 2ª…', () => {
    const porParte = [
      proc('b', { reus: [parte('ALFA', 'Dr. Zeca'), parte('BETA', 'Dr. Ana')] }),
      proc('a', { reus: [parte('ALFA', 'Dr. Mário'), parte('GAMA', 'Dr. Ana')] }),
      proc('c', { reus: [parte('ALFA', 'Dr. Zeca'), parte('ALFA2')] }),
    ];
    // Todos começam por ALFA; desempata o advogado da 1ª (Mário < Zeca); entre "b" e "c", o nome da 2ª.
    expect(ordenar(porParte, { campo: 'advReclamadaPorParte', ordem: 'cresc' })).toEqual(['a', 'c', 'b']);
  });

  it('"com advogado": "Não" quando pelo menos uma reclamada está sem advogado', () => {
    const lista2 = [
      proc('meia', { reus: [parte('A', 'Dr. X'), parte('B')] }),
      proc('todas', { reus: [parte('A', 'Dr. X'), parte('B', 'Dr. Y')] }),
      proc('nenhuma', { reus: [parte('A')] }),
    ];
    expect(ordenar(lista2, { campo: 'reclamadaComAdvogado', ordem: 'sim' })).toEqual(['todas', 'meia', 'nenhuma']);
    expect(ordenar(lista2, { campo: 'reclamadaComAdvogado', ordem: 'nao' })).toEqual(['meia', 'nenhuma', 'todas']);
  });
});

describe('100% Digital, cascata e empates', () => {
  it('Sim/Não primeiro; o 2º critério desempata; empate em tudo mantém a ordem', () => {
    const lista = [
      proc('p1', { reus: [parte('ZETA')] }),
      proc('d1', { reus: [parte('BETA')], digital: true }),
      proc('p2', { reus: [parte('ALFA')] }),
      proc('d2', { reus: [parte('ALFA')], digital: true }),
    ];
    expect(ordenar(lista, { campo: 'juizoDigital', ordem: 'sim' })).toEqual(['d1', 'd2', 'p1', 'p2']);
    expect(ordenar(lista, { campo: 'juizoDigital', ordem: 'nao' })).toEqual(['p1', 'p2', 'd1', 'd2']);
    expect(ordenar(lista, { campo: 'juizoDigital', ordem: 'sim' }, { campo: 'nomeReclamada', ordem: 'cresc' })).toEqual(['d2', 'd1', 'p2', 'p1']);
    const iguais = [proc('x'), proc('y'), proc('z')];
    expect(ordenar(iguais, { campo: 'nomeReclamada', ordem: 'cresc' }, { campo: 'juizoDigital', ordem: 'sim' })).toEqual(['x', 'y', 'z']);
  });
});

describe('o que fica desabilitado e o nome automático (§2.6)', () => {
  it('campo usado não se repete; último dígito tem as suas exceções', () => {
    const d = disponibilidade([{ campo: 'nomeReclamada', ordem: 'cresc' }, { campo: 'juizoDigital', ordem: 'sim' }]);
    expect([d.campoDesabilitado('nomeReclamada'), d.campoDesabilitado('juizoDigital'), d.campoDesabilitado('ano')]).toEqual([true, true, false]);

    const final0 = disponibilidade([{ campo: 'ultimoDigito', ordem: 'final0' }]);
    expect([final0.ordemDesabilitada('ultimoDigito', 'final0'), final0.ordemDesabilitada('ultimoDigito', 'final4'), final0.campoDesabilitado('ultimoDigito')]).toEqual([true, false, false]);

    const separou = disponibilidade([{ campo: 'ultimoDigito', ordem: 'paresPrimeiro' }]);
    expect([separou.ordemDesabilitada('ultimoDigito', 'imparesPrimeiro'), separou.ordemDesabilitada('ultimoDigito', 'parCresc')]).toEqual([true, false]);

    const esgotou = disponibilidade([{ campo: 'ultimoDigito', ordem: 'parCresc' }]);
    expect([esgotou.campoDesabilitado('ultimoDigito'), esgotou.ordemDesabilitada('ultimoDigito', 'final3')]).toEqual([true, true]);
  });

  it('nome automático e os cinco do pré-cadastro (D48e, D64)', () => {
    expect(CONJUNTOS_PADRAO.map(nomeDoConjunto)).toEqual([
      '1. Nome da reclamada (A→Z)',
      '1. Nome da reclamada (A→Z) · 2. Advogado do autor, global (A→Z)',
      '1. Ano (crescente) · 2. Sequencial (crescente) · 3. Vara (crescente)',
      '1. Juízo 100% Digital (Sim primeiro) · 2. Nome da reclamada (A→Z)',
      '1. Advogado da reclamada, global (A→Z) · 2. Nome da reclamada (A→Z)',
    ]);
    expect(nomeDoConjunto({ criterios: [{ campo: 'ultimoDigito', ordem: 'final4' }, { campo: 'sequencial', ordem: 'decresc' }] })).toBe(
      '1. Último dígito (final 4) · 2. Sequencial (decrescente)',
    );
  });

  it('critérios salvos: inválido, repetido e sem efeito saem; no máximo 5', () => {
    expect(
      normalizarCriterios([
        { campo: 'ano', ordem: 'cresc' },
        { campo: 'ano', ordem: 'decresc' }, // repetido
        { campo: 'inexistente', ordem: 'cresc' },
        { campo: 'juizoDigital', ordem: 'cresc' }, // ordem inválida para o campo
        { campo: 'ultimoDigito', ordem: 'final0' },
        { campo: 'ultimoDigito', ordem: 'final4' }, // final 0 e final 4 podem conviver
        { campo: 'ultimoDigito', ordem: 'final0' }, // o mesmo dígito, não
        { campo: 'vara', ordem: 'cresc' },
        { campo: 'nomeAutor', ordem: 'cresc' },
        { campo: 'nomeReclamada', ordem: 'cresc' }, // o 6º
      ]),
    ).toEqual([
      { campo: 'ano', ordem: 'cresc' },
      { campo: 'ultimoDigito', ordem: 'final0' },
      { campo: 'ultimoDigito', ordem: 'final4' },
      { campo: 'vara', ordem: 'cresc' },
      { campo: 'nomeAutor', ordem: 'cresc' },
    ]);
  });

  it('nas Opções: sem nada salvo, o pré-cadastro; lista vazia salva é respeitada; conjunto sem critério sai', () => {
    expect(opcoesPadrao(false).organizar.conjuntos).toEqual(CONJUNTOS_PADRAO);
    expect(normalizarOpcoes({}, false).organizar.conjuntos).toHaveLength(5);
    expect(normalizarOpcoes({ organizar: { conjuntos: [] } }, false).organizar.conjuntos).toEqual([]);
    expect(normalizarOpcoes({ organizar: { conjuntos: [{ criterios: [{ campo: 'x', ordem: 'y' }] }, { criterios: [{ campo: 'vara', ordem: 'decresc' }] }] } }, false).organizar.conjuntos).toEqual([
      { criterios: [{ campo: 'vara', ordem: 'decresc' }] },
    ]);
  });
});

describe('intervalos manuais ao reordenar (D48i)', () => {
  const p = (chave: string): ItemLote => ({ tipo: 'processo', chave, ajustes: { duracao: chave.length } });
  const i = (chave: string): ItemLote => ({ tipo: 'intervalo', chave, duracao: 15 });

  it('cada intervalo fica com o mesmo número de audiências antes dele; os ajustes vão junto', () => {
    const itens = [i('i0'), p('A'), i('i1'), p('B'), p('C'), i('i3'), p('D')];
    const novos = reordenarItens(itens, ['D', 'C', 'B', 'A']);
    expect(novos.map((x) => x.chave)).toEqual(['i0', 'D', 'i1', 'C', 'B', 'i3', 'A']);
    expect(novos.find((x) => x.chave === 'A')).toEqual(p('A'));
  });
});
