import { describe, expect, it } from 'vitest';
import {
  caminhosEscrita,
  dataParaPje,
  lerRetornaPrazo,
  payloadDesignar,
  payloadGigs,
  payloadJuizoDigital,
  payloadRedesignar,
  somarUmMinuto,
} from '../src/pje/escrita';
import { dataHoraPorExtenso, pendenciaGigs, resolverVariaveis } from '../src/regras/gigs';
import {
  aplicabilidade,
  descricaoTipo,
  escolhaDaDescricao,
  ehSumarissimo,
  estadoVideo,
  faseDoProcesso,
  todasEscolhas,
} from '../src/regras/tipoComposto';
import { DESCRICOES_CONHECIDAS, normalizarDescricao } from '../src/regras/tipos';

// Corpos capturados no PJe real (só ids; nenhum dado pessoal).
const CAPTURA_DESIGNAR = {
  considerarIntersticio: true,
  buscarProximoHorarioVago: false,
  validarHorario: true,
  idTipoAudiencia: 18,
  data: '2026-10-20T03:00:00.000Z',
  horarioInicial: '10:11',
  horarioFinal: '10:12',
  idProcesso: 2035079,
  idSalaFisica: 503,
};
const CAPTURA_REDESIGNAR = {
  considerarIntersticio: true,
  idProcessoAudiencia: 3464075,
  data: '2026-10-20T03:00:00.000Z',
  horarioInicial: '10:11',
  horarioFinal: '10:12',
  idProcesso: 2035079,
  idSalaFisica: 503,
  idTipoAudiencia: 18,
  buscarProximoHorarioVago: false,
  marcarNovoHorario: false,
};
const CAPTURA_GIGS_PRAZO_ZERO = {
  tipoAtividade: { id: 24, descricao: 'Prazo', descricaoConsulta: 'PRAZO' },
  observacao: 'texto',
  destaque: false,
  tipoDiaPrazo: 'U',
  idProcesso: '1891131',
};

const DADOS = { idProcesso: 2035079, idTipoAudiencia: 18, idSalaFisica: 503, data: '2026-10-20', hora: '10:11' };

describe('payloads de escrita = capturas reais', () => {
  // Os testes rodam com TZ=America/Sao_Paulo (vitest.config.ts), o fuso das capturas.
  it('data é a meia-noite local em ISO', () => {
    expect(dataParaPje('2026-10-20')).toBe('2026-10-20T03:00:00.000Z');
  });

  it('horário final = início + 1 min, inclusive na virada', () => {
    expect(somarUmMinuto('10:11')).toBe('10:12');
    expect(somarUmMinuto('09:59')).toBe('10:00');
    expect(somarUmMinuto('23:59')).toBe('00:00');
  });

  it('designar', () => {
    expect(payloadDesignar(DADOS)).toEqual(CAPTURA_DESIGNAR);
    expect(payloadDesignar(DADOS, false).validarHorario).toBe(false);
  });

  it('redesignar (sem validarHorario, como a tela nativa)', () => {
    const p = payloadRedesignar({ ...DADOS, idAudienciaAntiga: 3464075 });
    expect(p).toEqual(CAPTURA_REDESIGNAR);
    expect(JSON.stringify(Object.keys(p))).toBe(JSON.stringify(Object.keys(CAPTURA_REDESIGNAR)));
  });

  it('100% Digital: o processo inteiro com juizoDigital trocado', () => {
    const processo = { id: 1899495, numero: '0001132-34.2025.5.09.0069', juizoDigital: true, orgaoJulgador: { id: 174 } };
    expect(payloadJuizoDigital(processo, false)).toEqual({ ...processo, juizoDigital: false });
    expect(processo.juizoDigital).toBe(true);
    expect(caminhosEscrita.juizoDigital(1899495)).toBe('/pje-comum-api/api/processos/1899495?alteracaoParcial=true&lancaMovimentoJuizoDigital=true');
  });

  it('GIGS sem prazo e com prazo', () => {
    expect(payloadGigs({ idProcesso: 1891131, texto: 'texto' })).toEqual(CAPTURA_GIGS_PRAZO_ZERO);
    expect(payloadGigs({ idProcesso: 1891131, texto: 'texto', prazo: { dataInicio: '2026-10-19', dataFim: '2026-10-20' } })).toEqual({
      tipoAtividade: { id: 24, descricao: 'Prazo', descricaoConsulta: 'PRAZO' },
      dataInicioPrazo: '2026-10-19',
      dataPrazo: '2026-10-20',
      observacao: 'texto',
      destaque: false,
      tipoDiaPrazo: 'U',
      idProcesso: '1891131',
    });
    expect(caminhosEscrita.retornaPrazo(1, 174, '2026-10-19')).toBe('/pje-gigs-api/api/atividade/retorna-prazo/1?idOj=174&dataInicio=2026-10-19');
    expect(lerRetornaPrazo({ DATA: '2026-10-20T00:00:00' })).toBe('2026-10-20');
    expect(lerRetornaPrazo({})).toBeUndefined();
  });
});

describe('tipo composto (D6)', () => {
  it('as combinações válidas geram exatamente as 27 descrições conhecidas', () => {
    const geradas = todasEscolhas().map((e) => normalizarDescricao(descricaoTipo(e))).sort();
    const conhecidas = DESCRICOES_CONHECIDAS.map(normalizarDescricao).sort();
    expect(geradas).toEqual(conhecidas);
  });

  it('exemplos', () => {
    const base = { video: false, fase: 'Conhecimento' as const, semana: 'nenhuma' as const, sumarissimo: false };
    expect(descricaoTipo({ ...base, base: 'Conciliação', video: true, semana: 'conciliacao' })).toBe(
      'Conciliação em Conhecimento por videoconferência - Semana Nacional de Conciliação',
    );
    expect(descricaoTipo({ ...base, base: 'Una', video: true, sumarissimo: true })).toBe('Una por videoconferência (rito sumaríssimo)');
    expect(descricaoTipo({ ...base, base: 'Inquirição de testemunha', video: true })).toBe('Inquirição de testemunha por videoconferência (juízo deprecado)');
  });

  it('controles que não se aplicam são ignorados', () => {
    const base = { fase: 'Conhecimento' as const, semana: 'execucao' as const, sumarissimo: true };
    expect(descricaoTipo({ ...base, base: 'Julgamento', video: true })).toBe('Julgamento');
    expect(descricaoTipo({ ...base, base: 'Encerramento', video: false })).toBe('Encerramento de instrução');
    // Semana Nacional de Execução não existe na fase de conhecimento.
    expect(descricaoTipo({ ...base, base: 'Conciliação', video: false })).toBe('Conciliação em Conhecimento');
    expect(aplicabilidade('Conciliação', 'Execução').semanaExecucao).toBe(true);
    expect(aplicabilidade('Julgamento', 'Conhecimento').video).toBe(false);
  });

  it('reconstrói a escolha a partir da descrição da audiência antiga', () => {
    expect(escolhaDaDescricao('Conciliação em Conhecimento por videoconferência')).toMatchObject({ base: 'Conciliação', video: true, fase: 'Conhecimento' });
    expect(escolhaDaDescricao('Instrução (rito sumaríssimo)')).toMatchObject({ base: 'Instrução', video: false, sumarissimo: true });
    expect(escolhaDaDescricao('Tipo que não existe')).toBeUndefined();
  });

  it('checkbox de vídeo segue o processo (D42)', () => {
    expect(estadoVideo('Conciliação', false)).toEqual({ habilitada: true });
    expect(estadoVideo('Conciliação', true)).toEqual({ habilitada: false, marcada: true });
    expect(estadoVideo('Instrução', true)).toEqual({ habilitada: false, marcada: true });
    expect(estadoVideo('Julgamento', false)).toEqual({ habilitada: false, marcada: false });
    expect(estadoVideo('Julgamento', true)).toEqual({ habilitada: false, marcada: false });
  });

  it('rito e fase vêm do processo', () => {
    expect(ehSumarissimo('ATSum')).toBe(true);
    expect(ehSumarissimo('ATOrd')).toBe(false);
    expect(faseDoProcesso('CONHECIMENTO')).toBe('Conhecimento');
    expect(faseDoProcesso('LIQUIDACAO')).toBe('Execução');
    expect(faseDoProcesso(undefined)).toBe('Conhecimento');
  });
});

describe('GIGS: variáveis e validação (D29b)', () => {
  const aud = { data: '2026-10-20', hora: '10:11', tipo: 'Conciliação em Conhecimento por videoconferência', sala: 'Sala 01 Cejusc-CSC' };

  it('resolve as variáveis com os dados da audiência', () => {
    expect(dataHoraPorExtenso('2026-10-20', '10:11')).toBe('20/10/2026, às 10h11');
    expect(resolverVariaveis('Audiência gerada pelo AudAid em {data e hora}', aud)).toBe('Audiência gerada pelo AudAid em 20/10/2026, às 10h11');
    expect(resolverVariaveis('{tipo} em {data} {hora} · {sala} · {DATA}', aud)).toBe(
      'Conciliação em Conhecimento por videoconferência em 20/10/2026 10:11 · Sala 01 Cejusc-CSC · 20/10/2026',
    );
    expect(resolverVariaveis('@RJ1', aud)).toBe('@RJ1');
  });

  it('valida texto e prazo só quando vai lançar', () => {
    expect(pendenciaGigs({ lancar: false, texto: '', prazo: -1 })).toBeNull();
    expect(pendenciaGigs({ lancar: true, texto: 'ok', prazo: 0 })).toBeNull();
    expect(pendenciaGigs({ lancar: true, texto: '  ', prazo: 2 })).toMatch(/texto/);
    expect(pendenciaGigs({ lancar: true, texto: 'ok', prazo: 1.5 })).toMatch(/prazo/);
    expect(pendenciaGigs({ lancar: true, texto: 'ok', prazo: 241 })).toMatch(/prazo/);
  });
});
