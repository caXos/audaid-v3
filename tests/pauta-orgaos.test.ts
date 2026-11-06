import { describe, expect, it } from 'vitest';
import { normalizarOpcoes, opcoesPadrao } from '../src/config/opcoes';
import type { Audiencia } from '../src/pje/api';
import type { Resposta } from '../src/pje/http';
import { carregarAudienciasDoOrgao, type LeitorPauta } from '../src/pauta/dados';
import { focoDoProcesso } from '../src/pauta/estadoPauta';
import { FilaDeLeitura } from '../src/pauta/fila';
import {
  cidadeDoNome,
  codigoDoOrgao,
  ehFimDeSemana,
  temConteudo,
  mesDaPauta,
  mesesDoHorizonte,
  mesSeguinte,
  ordenarOrgaos,
  rotuloDoDia,
  rotuloDoOrgao,
  type OrgaoPauta,
} from '../src/pauta/orgaos';

describe('rótulo do órgão (D87b)', () => {
  it('código de 4 dígitos, sem "0000" (a Presidência, D89)', () => {
    expect(codigoDoOrgao('71')).toBe('0071');
    expect(codigoDoOrgao(3603)).toBe('3603');
    expect(codigoDoOrgao('0')).toBeUndefined();
    expect(codigoDoOrgao(0)).toBeUndefined();
    expect(codigoDoOrgao('')).toBeUndefined();
    expect(codigoDoOrgao('12345')).toBeUndefined();
    expect(codigoDoOrgao(null)).toBeUndefined();
  });

  it('sigla e código para todos, inclusive o CEJUSC; sem sigla, o nome', () => {
    expect(rotuloDoOrgao({ nome: '01ª VARA DO TRABALHO DE CASCAVEL', sigla: '1 VTCSV', codigo: '0071' })).toBe('1 VTCSV · 0071');
    expect(rotuloDoOrgao({ nome: 'CEJUSC - JT - CASCAVEL', sigla: 'CEJUSC-CSC', codigo: '3603' })).toBe('CEJUSC-CSC · 3603');
    expect(rotuloDoOrgao({ nome: 'VARA DO TRABALHO DE PINHAIS', sigla: 'VT PN' })).toBe('VT PN');
    expect(rotuloDoOrgao({ nome: 'ÓRGÃO SEM SIGLA' })).toBe('ÓRGÃO SEM SIGLA');
  });

  it('a cidade sai do fim do nome quando o AUD4 não a dá', () => {
    expect(cidadeDoNome('01ª VARA DO TRABALHO DE CASCAVEL')).toBe('CASCAVEL');
    expect(cidadeDoNome('CEJUSC - JT - CASCAVEL')).toBe('CASCAVEL');
    expect(cidadeDoNome('02ª VARA DO TRABALHO DE FOZ DO IGUAÇU')).toBe('FOZ DO IGUAÇU');
    expect(cidadeDoNome('VARA DO TRABALHO DE SÃO JOSÉ DOS PINHAIS')).toBe('SÃO JOSÉ DOS PINHAIS');
    expect(cidadeDoNome('ÓRGÃO')).toBeUndefined();
  });
});

describe('ordem dos órgãos (D87b)', () => {
  const o = (id: number, nome: string, cidade?: string, logado = false): OrgaoPauta => ({ id, nome, logado, salas: [], ...(cidade ? { cidade } : {}) });

  it('o logado primeiro; depois por cidade e, na cidade, pelo número (não pelo código)', () => {
    const ordem = ordenarOrgaos([
      o(77, '01ª VARA DO TRABALHO DE FOZ DO IGUAÇU', 'FOZ DO IGUAÇU'),
      o(59, '04ª VARA DO TRABALHO DE CASCAVEL', 'CASCAVEL'),
      o(51, '03ª VARA DO TRABALHO DE CASCAVEL', 'CASCAVEL'),
      o(174, 'CEJUSC - JT - CASCAVEL', 'CASCAVEL', true),
      o(49, '01ª VARA DO TRABALHO DE CASCAVEL', 'CASCAVEL'),
      o(50, '02ª VARA DO TRABALHO DE CASCAVEL', 'CASCAVEL'),
      o(90, '01ª VARA DO TRABALHO DE CURITIBA', 'CURITIBA'),
      o(10, '10ª VARA DO TRABALHO DE CURITIBA', 'CURITIBA'),
      o(2, '02ª VARA DO TRABALHO DE CURITIBA', 'CURITIBA'),
    ]).map((x) => x.id);
    expect(ordem).toEqual([174, 49, 50, 51, 59, 90, 2, 10, 77]);
  });

  it('na cidade, os sem número (CEJUSC, posto) vêm depois das varas, pelo nome', () => {
    const ordem = ordenarOrgaos([
      o(3, 'POSTO AVANÇADO DE X', 'CASCAVEL'),
      o(174, 'CEJUSC - JT - CASCAVEL', 'CASCAVEL'),
      o(49, '01ª VARA DO TRABALHO DE CASCAVEL', 'CASCAVEL'),
    ]).map((x) => x.id);
    expect(ordem).toEqual([49, 174, 3]);
  });
});

describe('período (D91)', () => {
  it('o mês de hoje começa hoje; os outros, no dia 1; o fim de semana entra (a tela decide se mostra)', () => {
    // 09/11/2026 é segunda-feira; 14/11, sábado.
    const [nov, dez] = mesesDoHorizonte('2026-11-11', 2);
    expect(nov!.rotulo).toBe('Novembro 2026');
    expect(nov!.dias[0]).toBe('2026-11-11');
    expect(nov!.dias).toContain('2026-11-14');
    expect(dez!.dias[0]).toBe('2026-12-01');
    expect(dez!.dias).toHaveLength(31);
    expect(ehFimDeSemana('2026-11-14')).toBe(true);
    expect(ehFimDeSemana('2026-11-13')).toBe(false);
  });

  it('o código do mês (prova técnica de 06/11/2026): S = sem pauta; F e R = sem expediente; o resto tem algo', () => {
    expect(['C', 'V', 'Z', 'X'].map(temConteudo)).toEqual([true, true, true, true]);
    expect(['S', 'F', 'R'].map(temConteudo)).toEqual([false, false, false]);
    expect(temConteudo(undefined)).toBe(false);
  });

  it('o horizonte tem o número de meses das Opções e atravessa o ano', () => {
    const meses = mesesDoHorizonte('2026-11-09', 6).map((m) => m.chave);
    expect(meses).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
    expect(mesSeguinte('2026-12')).toBe('2027-01');
    expect(mesDaPauta('2027-02').rotulo).toBe('Fevereiro 2027');
  });

  it('a partir de hoje, até o último dia do mês', () => {
    expect(mesDaPauta('2026-11', '2026-11-28').dias).toEqual(['2026-11-28', '2026-11-29', '2026-11-30']);
    expect(mesDaPauta('2026-01', '2026-01-31').dias).toEqual(['2026-01-31']);
  });

  it('rótulo do dia', () => {
    expect(rotuloDoDia('2026-11-12')).toBe('qui, 12/11');
  });
});

describe('fila de leitura (D92)', () => {
  it('no máximo 4 ao mesmo tempo, na ordem do pedido', async () => {
    const fila = new FilaDeLeitura(4);
    let maximo = 0;
    const ordem: number[] = [];
    const tarefas = Array.from({ length: 10 }, (_, i) =>
      fila.executar(async () => {
        maximo = Math.max(maximo, fila.emAndamento);
        ordem.push(i);
        await new Promise((r) => setTimeout(r, 2));
        return i;
      }),
    );
    expect(await Promise.all(tarefas)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(maximo).toBe(4);
    expect(ordem).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('uma tarefa que falha libera a vaga', async () => {
    const fila = new FilaDeLeitura(1);
    await expect(fila.executar(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await fila.executar(async () => 'ok')).toBe('ok');
    expect(fila.emAndamento).toBe(0);
  });
});

describe('"Abrir a pauta" pelo Individual (D88, D90)', () => {
  const sala = (id: number, orgao: number) => ({ id, nome: `Sala ${id}`, orgaoJulgador: { id: orgao, descricao: '' } });
  const audiencias: Audiencia[] = [
    { id: 1, dataInicio: '2026-11-05T09:00:00', status: 'Designada', salaFisica: sala(503, 174) },
    { id: 2, dataInicio: '2026-12-02T14:00:00', status: 'Designada', salaFisica: sala(162, 49) },
    { id: 3, dataInicio: '2026-11-20T10:30:00', status: 'Designada', salaFisica: sala(504, 174) },
  ];

  it('a próxima audiência designada no órgão logado, de hoje em diante', () => {
    expect(focoDoProcesso(audiencias, 174, 77, '2026-11-09')).toEqual({ idSala: 504, dia: '2026-11-20', idProcesso: 77 });
  });

  it('sem audiência futura no órgão logado, abre como pelo FAB', () => {
    expect(focoDoProcesso(audiencias, 174, 77, '2026-11-21')).toBeUndefined();
    expect(focoDoProcesso([], 174, 77, '2026-11-09')).toBeUndefined();
  });
});

describe('Opções da Pauta', () => {
  it('padrão: 6 meses à frente, nada oculto', () => {
    expect(opcoesPadrao(false).pauta).toEqual({ mesesAFrente: 6, ocultos: [], orgaos: [] });
  });

  it('limita os meses a 1–12 e limpa ocultos e órgãos inválidos', () => {
    const o = normalizarOpcoes(
      {
        pauta: {
          mesesAFrente: 40,
          ocultos: [49, 49, '50', -1, 51.5, 59],
          orgaos: [{ id: 49, rotulo: ' 1 VTCSV · 0071 ', nome: '01ª VARA' }, { id: 'x', rotulo: 'a', nome: 'b' }, { id: 50 }],
        },
      },
      false,
    );
    expect(o.pauta).toEqual({ mesesAFrente: 12, ocultos: [49, 59], orgaos: [{ id: 49, rotulo: '1 VTCSV · 0071', nome: '01ª VARA' }] });
    expect(normalizarOpcoes({ pauta: { mesesAFrente: 0 } }, false).pauta.mesesAFrente).toBe(1);
  });
});

describe('"Todas as salas" pelo AUD4 (D92b)', () => {
  it('agrupa por dia, ordena por hora e sala, e aguenta item sem data ou sem hora', async () => {
    const itens = [
      { numeroProcesso: 'N2', idProcesso: 2, siglaClasseJudicial: 'ATOrd', tipoAudiencia: 'Instrução', dataAudiencia: '2026-11-10T10:00:00', idSala: 504, nomeSala: 'Sala 02' },
      { numeroProcesso: 'N1', idProcesso: 1, siglaClasseJudicial: 'ATSum', tipoAudiencia: 'Conciliação', dataAudiencia: '2026-11-10T10:00:00', idSala: 503, nomeSala: 'Sala 01' },
      { numeroProcesso: 'N3', idProcesso: 3, tipoAudiencia: 'Inicial', dataAudiencia: '2026-11-10T08:00:00', idSala: 503 },
      { numeroProcesso: 'N4', idProcesso: 4, dataAudiencia: '2026-11-11', idSala: 503, nomeSala: 'Sala 01' },
      { numeroProcesso: 'sem data', idProcesso: 5 },
      'lixo',
    ];
    const ler: LeitorPauta = async <T>() => ({ ok: true as const, status: 200, ms: 1, via: 'fetch' as const, dados: itens as T });
    const porDia = await carregarAudienciasDoOrgao(ler, 174, '2026-11-09', '2026-11-30');
    expect([...porDia.keys()]).toEqual(['2026-11-10', '2026-11-11']);
    expect(porDia.get('2026-11-10')!.map((l) => `${l.hora} ${l.sala} ${l.nrProcesso}`)).toEqual(['08:00 Sala 503 N3', '10:00 Sala 01 N1', '10:00 Sala 02 N2']);
    expect(porDia.get('2026-11-10')![1]).toMatchObject({ tipo: 'audiencia', idProcesso: 1, descricaoTipo: 'Conciliação', processo: { classeSigla: 'ATSum' } });
    expect(porDia.get('2026-11-11')![0]!.hora).toBe('--:--');
  });

  it('erro do AUD4 vira erro do mês', async () => {
    const ler: LeitorPauta = async <T>(): Promise<Resposta<T>> => ({ ok: false, status: 500, ms: 1, via: 'fetch', erro: { mensagem: 'HTTP 500' } });
    await expect(carregarAudienciasDoOrgao(ler, 174, '2026-11-09', '2026-11-30')).rejects.toThrow('HTTP 500');
  });
});
