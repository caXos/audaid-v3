import { describe, expect, it } from 'vitest';
import {
  camposSimples,
  entradaDoDia,
  formaDe,
  lerOrgaosDoTribunal,
  orgaosDosPerfis,
  proximosDiasUteis,
  somarDias,
} from '../src/pauta/forma';

describe('formaDe (diagnóstico da Pauta, D86b)', () => {
  it('mostra campos e tipos, nunca o texto livre', () => {
    const forma = formaDe({ nome: 'FULANO DE TAL', idade: 40, ativo: true, nada: null });
    expect(forma).toBe('{ nome: texto, idade: nº, ativo: bool(true), nada: null }');
    expect(forma).not.toContain('FULANO');
  });

  it('mostra códigos curtos, datas e horas, que não identificam ninguém', () => {
    expect(formaDe({ tipo: 'F', dia: '2026-11-09', inicio: '2026-11-09T09:00:00', hora: '09:20:00' })).toBe(
      '{ tipo: "F", dia: data, inicio: data, hora: hora }',
    );
  });

  it('junta os campos e os códigos de todos os itens de uma lista', () => {
    const forma = formaDe([{ tipo: 'F' }, { tipo: 'U', extra: 1 }, { tipo: 'U', ativo: false }, { tipo: 'F', ativo: true }]);
    expect(forma).toBe('[4 × { tipo: "F"|"U", extra: nº, ativo: bool(false,true) }]');
  });

  it('marca o campo que muda de tipo entre os itens', () => {
    expect(formaDe([{ idProcesso: 1 }, { idProcesso: null }])).toBe('[2 × { idProcesso: nº | null }]');
  });

  it('não desce mais de três níveis e aceita lista vazia', () => {
    expect(formaDe({ a: { b: { c: { d: 1, e: 2 } } } })).toBe('{ a: { b: { c: { …2 campos } } } }');
    expect(formaDe([])).toBe('[0]');
  });

  it('não mostra texto com cara de nome mesmo curto, se não for código em maiúsculas', () => {
    expect(formaDe({ x: 'Ana' })).toBe('{ x: texto }');
  });
});

describe('orgaosDosPerfis (D87b)', () => {
  it('lê o idOrgaoJulgador, como a v1, sem repetir o órgão de dois papéis', () => {
    const perfis = [
      { idOrgaoJulgador: 174, papel: 'Diretor', nomeUsuario: 'FULANO' },
      { idOrgaoJulgador: 174, papel: 'Assessor' },
      { idOrgaoJulgador: 49 },
    ];
    expect(orgaosDosPerfis(perfis)).toEqual([{ id: 174 }, { id: 49 }]);
  });

  it('aceita o órgão como objeto, com o nome, e respostas embrulhadas', () => {
    const perfis = { resultado: [{ orgaoJulgador: { id: 50, descricao: ' 02ª VARA DO TRABALHO DE CASCAVEL ' } }, { idOrgao: 51 }] };
    expect(orgaosDosPerfis(perfis)).toEqual([{ id: 50, descricao: '02ª VARA DO TRABALHO DE CASCAVEL' }, { id: 51 }]);
  });

  it('ignora o que não tem id numérico', () => {
    expect(orgaosDosPerfis([{ idOrgaoJulgador: '49' }, {}, null, 7])).toEqual([]);
    expect(orgaosDosPerfis(null)).toEqual([]);
  });
});

describe('lerOrgaosDoTribunal (audpje/oj)', () => {
  it('lê id, nome, sigla e cidade, como na captura de 19/10/2026', () => {
    const oj = [
      { idOrgaoJulgador: 49, nomeOrgaoJulgador: '01ª VARA DO TRABALHO DE CASCAVEL', sigla: '1 VTCSV', nomeMunicipio: 'CASCAVEL' },
      { idOrgaoJulgador: 'x' },
    ];
    expect(lerOrgaosDoTribunal(oj)).toEqual([{ id: 49, nome: '01ª VARA DO TRABALHO DE CASCAVEL', sigla: '1 VTCSV', municipio: 'CASCAVEL' }]);
    expect(lerOrgaosDoTribunal({})).toEqual([]);
  });
});

describe('o mês da sala', () => {
  const mes = Array.from({ length: 30 }, (_, i) => ({ tipo: i % 7 === 0 ? 'F' : 'U' }));

  it('acha o dia pela posição, como a v1 (diasUteis[dia - 1])', () => {
    expect(entradaDoDia(mes, '2026-11-08')).toEqual({ tipo: 'F' });
    expect(entradaDoDia(mes, '2026-11-09')).toEqual({ tipo: 'U' });
  });

  it('prefere o dia pela data, quando a entrada a traz', () => {
    const comData = [{ data: '2026-11-10', tipo: 'P' }, { data: '2026-11-09T00:00:00', tipo: 'L' }];
    expect(entradaDoDia(comData, '2026-11-09')).toEqual({ data: '2026-11-09T00:00:00', tipo: 'L' });
  });

  it('camposSimples mostra números, códigos e datas, e esconde texto', () => {
    expect(camposSimples({ tipo: 'F', quantidade: 3, livre: false, data: '2026-11-09', obs: 'Feriado de Fulano' })).toBe(
      '{ tipo=F, quantidade=3, livre=false, data=2026-11-09, obs=texto }',
    );
    expect(camposSimples(undefined)).toBe('null');
  });
});

describe('datas', () => {
  it('próximos dias úteis pulam o fim de semana e atravessam o mês', () => {
    // 27/11/2026 é sexta-feira.
    expect(proximosDiasUteis('2026-11-27', 3)).toEqual(['2026-11-27', '2026-11-30', '2026-12-01']);
    expect(proximosDiasUteis('2026-11-28', 1)).toEqual(['2026-11-30']);
  });

  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-12-15', 30)).toBe('2027-01-14');
  });
});
