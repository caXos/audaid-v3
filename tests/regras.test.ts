import { describe, expect, it } from 'vitest';
import type { EventoCalendario, PautaDia } from '../src/pje/api';
import { CODIGO_HORARIO_OCUPADO, interpretarErro } from '../src/pje/http';
import { classificarData, diaDaSemana, hoje } from '../src/regras/calendario';
import { lerPauta, ocupanteDoMinuto } from '../src/regras/pauta';
import { conferirTiposConhecidos, DESCRICOES_CONHECIDAS, resolverTipo } from '../src/regras/tipos';
import calendarioJson from './fixtures/calendario-cejusc.json';
import pautaComVagaJson from './fixtures/pauta-com-vaga.json';
import pautaSemVagasJson from './fixtures/pauta-sem-vagas.json';

const calendario = calendarioJson as EventoCalendario[];
const pautaComVaga = pautaComVagaJson as PautaDia;
const pautaSemVagas = pautaSemVagasJson as PautaDia;

describe('classificarData (D34, D34b, D34c) com o calendário real do CEJUSC', () => {
  it('dia útil sem evento é livre', () => {
    expect(classificarData('2026-10-27', calendario)).toEqual({ nivel: 'livre', bloqueios: [], avisos: [] });
  });

  it('fim de semana bloqueia', () => {
    expect(diaDaSemana('2026-10-24')).toBe(6);
    expect(classificarData('2026-10-24', calendario).bloqueios).toEqual(['Sábado']);
    expect(classificarData('2026-10-25', calendario).bloqueios).toEqual(['Domingo']);
  });

  it('feriado com suspensão de audiência bloqueia', () => {
    const c = classificarData('2026-12-25', calendario);
    expect(c.nivel).toBe('bloqueia');
    expect(c.bloqueios).toContain('Nascimento de Jesus Cristo');
  });

  it('evento de vários dias bloqueia o intervalo inteiro', () => {
    expect(classificarData('2026-12-28', calendario).nivel).toBe('bloqueia');
    expect(classificarData('2027-01-06', calendario).nivel).toBe('bloqueia');
    expect(classificarData('2027-01-07', calendario).nivel).toBe('livre');
  });

  it('suspensão de expediente bloqueia, mesmo sem suspender audiência', () => {
    expect(classificarData('2026-06-05', calendario).nivel).toBe('bloqueia');
    expect(classificarData('2026-04-20', calendario).nivel).toBe('bloqueia');
  });

  it('suspensão só de prazo apenas avisa', () => {
    for (const data of ['2026-06-29', '2026-09-01', '2026-09-11', '2026-08-28', '2026-01-22']) {
      expect(classificarData(data, calendario).nivel, data).toBe('avisa');
    }
  });

  it('recusa data malformada', () => {
    expect(() => classificarData('27/10/2026', calendario)).toThrow();
  });

  it('hoje() usa a data local', () => {
    expect(hoje(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
  });
});

describe('lerPauta e ocupanteDoMinuto (D28, D33)', () => {
  it('separa audiências e vagas', () => {
    const e = lerPauta(pautaComVaga);
    expect(e).toHaveLength(14);
    expect(e.filter((x) => x.tipo === 'vaga')).toEqual([
      expect.objectContaining({ hora: '10:10', tipo: 'vaga', idProcesso: undefined }),
    ]);
  });

  it('vaga nunca é conflito; audiência no mesmo minuto é', () => {
    const e = lerPauta(pautaComVaga);
    expect(ocupanteDoMinuto(e, '10:10')).toBeUndefined();
    expect(ocupanteDoMinuto(e, '08:30')?.tipo).toBe('audiencia');
    expect(ocupanteDoMinuto(e, '08:31')).toBeUndefined();
  });

  it('o próprio processo não conflita consigo (redesignação)', () => {
    const e = lerPauta(pautaComVaga);
    const ocupante = ocupanteDoMinuto(e, '08:30');
    expect(ocupanteDoMinuto(e, '08:30', ocupante?.idProcesso)).toBeUndefined();
  });

  it('sala sem vagas configuradas só tem audiências', () => {
    const e = lerPauta(pautaSemVagas);
    expect(e.every((x) => x.tipo === 'audiencia')).toBe(true);
    expect(e.map((x) => x.hora)[0]).toBe('13:15');
  });
});

describe('interpretarErro (D31d)', () => {
  it('lê o formato de erro do PJe', () => {
    const corpo = JSON.stringify({
      identificadorRequisicao: 'db223e14-72fa-472a-9770-7b9e93e6bc30',
      codigoErro: 'PJE-064',
      mensagem: 'Já existe uma audiência marcada para o horário solicitado. Por favor, informe outro horário.',
    });
    const e = interpretarErro(400, corpo);
    expect(e.codigoErro).toBe(CODIGO_HORARIO_OCUPADO);
    expect(e.identificadorRequisicao).toBe('db223e14-72fa-472a-9770-7b9e93e6bc30');
    expect(e.mensagem).toMatch(/^Já existe uma audiência/);
  });

  it('corpo que não é JSON vira texto com o status', () => {
    expect(interpretarErro(502, '<html>  Bad   Gateway </html>').mensagem).toBe('HTTP 502: <html> Bad Gateway </html>');
    expect(interpretarErro(500, '').mensagem).toBe('HTTP 500 sem corpo');
  });
});

describe('tipos de audiência (D6)', () => {
  it('resolve pela descrição ignorando acento, caixa e espaço duplo', () => {
    const tipos = [{ id: 24, descricao: 'Inquirição de testemunha  por videoconferência (juízo deprecado)' }];
    expect(resolverTipo('inquiricao de testemunha por videoconferencia (juizo deprecado)', tipos)?.id).toBe(24);
  });

  it('confere quais descrições conhecidas existem no PJe', () => {
    const tipos = DESCRICOES_CONHECIDAS.slice(1).map((descricao, i) => ({ id: i, descricao }));
    expect(conferirTiposConhecidos(tipos)).toEqual({
      encontradas: DESCRICOES_CONHECIDAS.length - 1,
      faltando: ['Conciliação em Conhecimento'],
    });
  });
});
