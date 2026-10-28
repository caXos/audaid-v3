// Tela 3 do Lote (src/lote/conferencia.ts): vermelho, amarelo, vaga, o próprio processo, horário
// de outro processo do lote (D67), troca circular, audiência existente (D32), minuto livre para o
// "Encaixar" (D28) e as mudanças de lista do "Empurrar" (D65) e do "Remover sem recalcular".

import { describe, expect, it } from 'vitest';
import { conferir, minutoLivreDepois, type ItemParaConferir } from '../src/lote/conferencia';
import { empurrarItens, paraMinutos, removerSemRecalcularItens, type ItemLote } from '../src/lote/pauta';
import type { Audiencia } from '../src/pje/api';
import type { EntradaPauta } from '../src/regras/pauta';

const m = paraMinutos;
const item = (chave: string, idProcesso: number, inicio: string, duracao = 10, antiga?: Audiencia): ItemParaConferir => ({ chave, idProcesso, inicio: m(inicio), duracao, antiga });
const fora = (hora: string, idProcesso: number): EntradaPauta => ({ hora, tipo: 'audiencia', idProcesso, nrProcesso: `nr-${idProcesso}` });
const vaga = (hora: string): EntradaPauta => ({ hora, tipo: 'vaga', descricaoTipo: 'Conciliação' });
const tipos = (r: ReturnType<typeof conferir>, chave: string) => (r.get(chave) ?? []).map((a) => a.tipo);

describe('conferir (D15, D28, D33)', () => {
  it('mesmo minuto é vermelho; dentro da janela, amarelo; vaga e o próprio processo não contam', () => {
    const itens = [item('A', 1, '09:00'), item('B', 2, '09:10')];
    const r = conferir(itens, [vaga('09:00'), fora('09:10', 99), fora('09:05', 77), fora('09:00', 1), fora('09:20', 55)]);
    expect(tipos(r, 'A')).toEqual(['amarelo']); // 09:05 cai dentro de 09:00–09:10; a vaga e a antiga do próprio A, não
    expect(tipos(r, 'B')).toEqual(['vermelho']); // 09:20 é o fim da janela de B, não está dentro
    expect(r.get('B')![0]).toEqual({ tipo: 'vermelho', outro: 'nr-99', inicio: m('09:10') });
  });

  it('audiência existente no órgão vira um achado próprio, para a escolha da D32', () => {
    const antiga = { id: 444, dataInicio: '2026-10-20T10:10:00', status: 'Designada' } as Audiencia;
    const r = conferir([item('A', 1, '09:00', 10, antiga)], []);
    expect(r.get('A')).toEqual([{ tipo: 'existente', antiga }]);
  });
});

describe('horário de outro processo do lote (D67)', () => {
  it('quem vai sair do horário não é conflito, só aviso', () => {
    // B vai para 09:00, que hoje é a audiência de A; A vai para 10:00.
    const itens = [item('A', 1, '10:00'), item('B', 2, '09:00')];
    const r = conferir(itens, [fora('09:00', 1)]);
    expect(tipos(r, 'B')).toEqual(['do-lote']);
    expect(tipos(r, 'A')).toEqual([]);
  });

  it('troca circular é vermelho para os dois', () => {
    // A vai para 09:10 (hoje de B), e B vai para 09:00 (hoje de A).
    const itens = [item('A', 1, '09:10'), item('B', 2, '09:00')];
    const r = conferir(itens, [fora('09:00', 1), fora('09:10', 2)]);
    expect(tipos(r, 'A')).toEqual(['ciclo']);
    expect(tipos(r, 'B')).toEqual(['ciclo']);
  });
});

describe('minuto livre para o "Encaixar" (D28)', () => {
  it('pula os minutos em que começa um processo de fora ou outro item do lote', () => {
    const itens = [item('A', 1, '09:10'), item('B', 2, '09:12')];
    const entradas = [fora('09:10', 99), fora('09:11', 98), vaga('09:13')];
    expect(minutoLivreDepois(m('09:10'), entradas, itens, 'A')).toBe(m('09:13')); // 09:11 de fora, 09:12 do B; vaga conta como livre
    expect(minutoLivreDepois(m('23:59'), [], itens, 'A')).toBeNull();
  });
});

describe('mudanças de lista da tela 3', () => {
  const p = (chave: string, ajustes = {}): ItemLote => ({ tipo: 'processo', chave, ajustes });

  it('"Empurrar" (D65): intervalo ancorado no horário do de fora, com a duração base; o item perde a âncora', () => {
    const itens = [p('A'), p('B', { inicio: '09:10', duracao: 20 })];
    expect(empurrarItens(itens, 'B', '09:10', 15)).toEqual([p('A'), { tipo: 'intervalo', chave: 'intervalo-1', duracao: 15, inicio: '09:10' }, p('B', { duracao: 20 })]);
  });

  it('"Remover sem recalcular": o seguinte fica no horário em que estava', () => {
    const itens = [p('A'), p('B'), p('C', { duracao: 5 })];
    expect(removerSemRecalcularItens(itens, 'B', '09:20')).toEqual([p('A'), p('C', { duracao: 5, inicio: '09:20' })]);
    expect(removerSemRecalcularItens(itens, 'C', null)).toEqual([p('A'), p('B')]);
  });
});
