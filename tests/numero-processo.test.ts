// O campo do número do processo no "+" da Pauta (D99): a máscara e as sugestões do PJe.
// Números de processo fictícios (com dígito válido).

import { describe, expect, it } from 'vitest';
import { sugerirNumeros, SUGESTOES_MAXIMAS, type LeitorPauta } from '../src/pauta/dados';
import type { Resposta } from '../src/pje/http';
import { mascararNumero } from '../src/regras/numeros';

const N1 = '0000101-52.2026.5.09.0001';
const N2 = '0000102-37.2026.5.09.0001';

describe('mascararNumero (D99)', () => {
  it('o hífen completa o sequencial com zeros à esquerda, como a busca do PJe', () => {
    expect(mascararNumero('369-')).toBe('0000369-');
    expect(mascararNumero('55-53')).toBe('0000055-53');
    expect(mascararNumero('0000369-')).toBe('0000369-');
    expect(mascararNumero('1234567-')).toBe('1234567-');
  });

  it('digitando, os separadores entram quando chega o dígito depois deles', () => {
    expect(mascararNumero('369')).toBe('369');
    expect(mascararNumero('00003697')).toBe('0000369-7');
    expect(mascararNumero('0000369-772')).toBe('0000369-77.2');
    expect(mascararNumero('0000369-77.20245')).toBe('0000369-77.2024.5');
    expect(mascararNumero('0000369-77.2024.509')).toBe('0000369-77.2024.5.09');
    expect(mascararNumero('0000369-77.2024.5.09.019')).toBe('0000369-77.2024.5.09.019');
    expect(mascararNumero('0000369-77.2024.5.09.0195')).toBe('0000369-77.2024.5.09.0195');
  });

  it('separador digitado antes da hora sai, e dígito a mais não entra', () => {
    expect(mascararNumero('0000369-77.')).toBe('0000369-77');
    expect(mascararNumero('0000369-77.2024.5.09.01951')).toBe('0000369-77.2024.5.09.0195');
    expect(mascararNumero('abc')).toBe('');
    expect(mascararNumero('-')).toBe('');
  });

  it('apagando: o hífen apagado não volta; o que sobra depois dele fica', () => {
    expect(mascararNumero('0000369')).toBe('0000369');
    expect(mascararNumero('0000369-')).toBe('0000369-');
    expect(mascararNumero('0000369-7')).toBe('0000369-7');
  });

  it('colado: formatado, com os 20 dígitos ou no meio de um texto', () => {
    expect(mascararNumero(N1)).toBe(N1);
    expect(mascararNumero(N1.replace(/\D/g, ''))).toBe(N1);
    expect(mascararNumero(`Processo: ${N1} (ATOrd)`)).toBe(N1);
    expect(mascararNumero(` ${N1} `)).toBe(N1);
  });

  it('mais de 7 dígitos antes do hífen: nada se perde', () => {
    expect(mascararNumero('12345678-9')).toBe('1234567-89');
  });
});

describe('sugerirNumeros (D99)', () => {
  const ok = <T>(dados: unknown): Resposta<T> => ({ ok: true, status: 200, ms: 1, via: 'fetch', dados: dados as T });
  const item = (n: string, idAgrupamentoProcesso = 8) => ({ idAgrupamentoProcesso, idProcesso: 1, numeroProcessoCompleto: n });
  const leitor = (r: Resposta<unknown>, pedidos: string[] = []): LeitorPauta =>
    (async (caminho: string) => {
      pedidos.push(caminho);
      return r;
    }) as LeitorPauta;

  it('lê a forma confirmada em 09/11/2026, pela busca do painel, sem repetir', async () => {
    const pedidos: string[] = [];
    const r = ok([item(N1), item(N1, 9), item(N2)]);
    expect(await sugerirNumeros(leitor(r, pedidos), '0000101-')).toEqual([N1]);
    expect(pedidos).toEqual(['/pje-comum-api/api/agrupamentotarefas/processos?numero=0000101-']);
    expect(await sugerirNumeros(leitor(r), '00001')).toEqual([N1, N2]);
  });

  it('nada encontrado: lista vazia (o campo diz que não achou, D101)', async () => {
    expect(await sugerirNumeros(leitor(ok([])), '0000101-')).toEqual([]);
    expect(await sugerirNumeros(leitor(ok([{ idProcesso: 1 }, null, 'x'])), '0000101-')).toEqual([]);
  });

  it('erro ou resposta que não é lista: null (o campo diz que a consulta deu erro, D101)', async () => {
    expect(await sugerirNumeros(leitor({ ok: false, status: 500, ms: 1, via: 'fetch', erro: { mensagem: 'erro' } }), '0000101-')).toBeNull();
    expect(await sugerirNumeros(leitor(ok({ numeroProcessoCompleto: N1 })), '0000101-')).toBeNull();
    expect(await sugerirNumeros(leitor(ok(null)), '0000101-')).toBeNull();
  });

  it(`no máximo ${SUGESTOES_MAXIMAS}`, async () => {
    const muitos = Array.from({ length: 12 }, (_, i) => item(`00001${String(i).padStart(2, '0')}-00.2026.5.09.0001`));
    expect(await sugerirNumeros(leitor(ok(muitos)), '00001')).toHaveLength(SUGESTOES_MAXIMAS);
  });
});
