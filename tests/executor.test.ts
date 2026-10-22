import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Audiencia, EventoCalendario, PautaDia } from '../src/pje/api';
import {
  ESCRITA_LIBERADA,
  executarDesignacao,
  transportePje,
  type PedidoDesignacao,
  type Requisicao,
  type RespostaTransporte,
  type Transporte,
} from '../src/fluxo/executor';
import calendarioJson from './fixtures/calendario-cejusc.json';

const eventos = calendarioJson as EventoCalendario[];
const OJ = 174;

function audiencia(id: number, dataInicio: string, oj = OJ): Audiencia {
  return { id, dataInicio, status: 'Designada', salaFisica: { id: 503, nome: 'Sala 01', orgaoJulgador: { id: oj, descricao: 'CEJUSC' } } };
}

const pautaVazia: PautaDia = { dia: '2026-10-27', pautasDoDia: [] };
const pautaOcupada: PautaDia = {
  dia: '2026-10-27',
  pautasDoDia: [{ idProcesso: 999, nrProcesso: '0000999-00.2026.5.09.0000', status: 'M', pautaAudienciaHorario: { horaInicial: '10:11:00', horaFinal: '10:20:00' } }],
};

function pedido(extra: Partial<PedidoDesignacao> = {}): PedidoDesignacao {
  return {
    idProcesso: 100,
    idOrgaoLogado: OJ,
    processoBruto: { id: 100, numero: '0000100-00.2026.5.09.0000', juizoDigital: false },
    juizoDigital: false,
    idSala: 503,
    data: '2026-10-27', // terça-feira, sem evento no calendário
    hora: '10:11',
    idTipoAudiencia: 18,
    ehJulgamento: false,
    eventos,
    hoje: '2026-10-22',
    ...extra,
  };
}

type Roteiro = (r: Requisicao) => RespostaTransporte;

/** Transporte falso: responde pelo roteiro e registra o que recebeu. */
function falso(roteiro: Roteiro, simulando = false): Transporte & { recebidas: Requisicao[] } {
  const recebidas: Requisicao[] = [];
  return {
    simulando,
    recebidas,
    async enviar(r) {
      recebidas.push(r);
      return roteiro(r);
    },
  };
}

const ok = (dados: unknown): RespostaTransporte => ({ ok: true, status: 200, dados });
const erro = (status: number, codigoErro?: string): RespostaTransporte => ({ ok: false, status, erro: { mensagem: 'erro do PJe', codigoErro } });

/** Roteiro padrão: pauta livre, escritas OK. */
function roteiroPadrao(sobrescrever: Partial<Record<string, Roteiro>> = {}): Roteiro {
  return (r) => {
    if (r.caminho.includes('classificacoes/dia')) return (sobrescrever['pauta'] ?? (() => ok(pautaVazia)))(r);
    if (r.caminho.includes('/redesignacao')) return (sobrescrever['redesignar'] ?? (() => ok(audiencia(555, '2026-10-27T10:11:00'))))(r);
    if (r.caminho.endsWith('/pautasaudiencias/audiencias')) return (sobrescrever['designar'] ?? (() => ok(audiencia(555, '2026-10-27T10:11:00'))))(r);
    if (r.caminho.includes('alteracaoParcial')) return (sobrescrever['digital'] ?? (() => ok(null)))(r);
    if (r.metodo === 'GET' && /\/processos\/id\/\d+$/.test(r.caminho)) {
      return (sobrescrever['processo'] ?? (() => ok({ id: 100, numero: '0000100-00.2026.5.09.0000', juizoDigital: true, valorDaCausa: 1 })))(r);
    }
    if (r.caminho.includes('/audiencias?status=M')) return (sobrescrever['lista'] ?? (() => ok([])))(r);
    if (r.caminho.includes('retorna-prazo')) return (sobrescrever['prazo'] ?? (() => ok({ DATA: '2026-10-26T00:00:00' })))(r);
    if (r.caminho.endsWith('/pje-gigs-api/api/atividade')) return (sobrescrever['gigs'] ?? (() => ok({ id: 1 })))(r);
    throw new Error(`requisição inesperada: ${r.metodo} ${r.caminho}`);
  };
}

const ordem = (t: { recebidas: Requisicao[] }) => t.recebidas.map((r) => `${r.metodo} ${r.caminho.split('?')[0]}`);

describe('executor: caminho feliz', () => {
  it('designa (POST) quando não há audiência no órgão', async () => {
    const t = falso(roteiroPadrao());
    const r = await executarDesignacao(pedido(), t);
    expect(r.desfecho).toBe('sucesso');
    expect(ordem(t)).toEqual(['GET /pje-comum-api/api/pautasaudiencias/classificacoes/dia', 'POST /pje-comum-api/api/pautasaudiencias/audiencias']);
  });

  it('dia sem nenhuma audiência nem vaga (resposta só com {dia}) conta como livre', async () => {
    const t = falso(roteiroPadrao({ pauta: () => ok({ dia: '2026-10-27' }) }));
    const r = await executarDesignacao(pedido(), t);
    expect(r.desfecho).toBe('sucesso');
  });

  it('redesigna (PUT) quando há audiência no órgão (D32)', async () => {
    const t = falso(roteiroPadrao());
    const antiga = { id: 444, dataInicio: '2026-10-20T10:10:00', descricaoTipo: 'Conciliação', nomeSala: 'Sala 01' };
    const r = await executarDesignacao(pedido({ antiga }), t);
    expect(r.desfecho).toBe('sucesso');
    expect(t.recebidas[1]).toMatchObject({ metodo: 'PUT', corpo: { idProcessoAudiencia: 444, horarioInicial: '10:11', horarioFinal: '10:12' } });
  });

  it('Julgamento em processo 100% Digital: retira, designa e recoloca (D26)', async () => {
    const t = falso(roteiroPadrao());
    const r = await executarDesignacao(pedido({ juizoDigital: true, ehJulgamento: true }), t);
    expect(r.desfecho).toBe('sucesso');
    expect(ordem(t)).toEqual([
      'GET /pje-comum-api/api/pautasaudiencias/classificacoes/dia',
      'GET /pje-comum-api/api/processos/id/100', // releitura antes de retirar
      'PUT /pje-comum-api/api/processos/100',
      'POST /pje-comum-api/api/pautasaudiencias/audiencias',
      'GET /pje-comum-api/api/processos/id/100', // releitura antes de recolocar
      'PUT /pje-comum-api/api/processos/100',
    ]);
    const puts = t.recebidas.filter((x) => x.caminho.includes('alteracaoParcial'));
    expect(puts.map((x) => (x.corpo as { juizoDigital: boolean }).juizoDigital)).toEqual([false, true]);
  });

  it('o 100% Digital usa o processo relido na hora, não o lido ao abrir o painel', async () => {
    let leitura = 0;
    const t = falso(roteiroPadrao({ processo: () => ok({ id: 100, juizoDigital: ++leitura === 1, valorDaCausa: 1000 + leitura }) }));
    await executarDesignacao(pedido({ juizoDigital: true, ehJulgamento: true, processoBruto: { id: 100, valorDaCausa: 1 } }), t);
    const puts = t.recebidas.filter((x) => x.caminho.includes('alteracaoParcial')).map((x) => x.corpo);
    expect(puts).toEqual([
      { id: 100, juizoDigital: false, valorDaCausa: 1001 },
      { id: 100, juizoDigital: true, valorDaCausa: 1002 },
    ]);
  });

  it('se não der para reler o processo antes de retirar, nada é alterado', async () => {
    const t = falso(roteiroPadrao({ processo: () => erro(500) }));
    const r = await executarDesignacao(pedido({ juizoDigital: true, ehJulgamento: true }), t);
    expect(r.desfecho).toBe('falha');
    expect(r.resumo).toMatch(/Nada foi alterado/);
    expect(t.recebidas.every((x) => x.metodo === 'GET')).toBe(true);
  });

  it('se não der para reler antes de recolocar, recoloca com a leitura anterior e avisa', async () => {
    let leitura = 0;
    const t = falso(roteiroPadrao({ processo: () => (++leitura === 1 ? ok({ id: 100, juizoDigital: true, valorDaCausa: 7 }) : erro(503)) }));
    const r = await executarDesignacao(pedido({ juizoDigital: true, ehJulgamento: true }), t);
    expect(r.desfecho).toBe('sucesso');
    const ultimoPut = t.recebidas.filter((x) => x.caminho.includes('alteracaoParcial')).at(-1);
    expect(ultimoPut?.corpo).toEqual({ id: 100, juizoDigital: true, valorDaCausa: 7 });
    expect(r.passos.find((p) => p.titulo === 'Recolocar o Juízo 100% Digital')?.estado).toBe('aviso');
  });

  it('100% Digital sem Julgamento não é alterado', async () => {
    const t = falso(roteiroPadrao());
    await executarDesignacao(pedido({ juizoDigital: true, ehJulgamento: false }), t);
    expect(ordem(t).some((x) => x.includes('/processos/100'))).toBe(false);
  });

  it('GIGS com prazo calcula a data no retorna-prazo e lança depois', async () => {
    const t = falso(roteiroPadrao());
    const r = await executarDesignacao(pedido({ gigs: { texto: 'Analisar', prazo: 2 } }), t);
    expect(r.desfecho).toBe('sucesso');
    expect(t.recebidas[2]?.caminho).toBe('/pje-gigs-api/api/atividade/retorna-prazo/2?idOj=174&dataInicio=2026-10-22');
    expect(t.recebidas[3]?.corpo).toMatchObject({ dataInicioPrazo: '2026-10-22', dataPrazo: '2026-10-26', observacao: 'Analisar', idProcesso: '100' });
  });

  it('GIGS com prazo 0 não consulta prazo nem manda datas', async () => {
    const t = falso(roteiroPadrao());
    await executarDesignacao(pedido({ gigs: { texto: 'Analisar', prazo: 0 } }), t);
    expect(ordem(t).some((x) => x.includes('retorna-prazo'))).toBe(false);
    expect(t.recebidas.at(-1)?.corpo).not.toHaveProperty('dataPrazo');
  });
});

describe('executor: barreiras antes de escrever', () => {
  it('data bloqueada não envia nada', async () => {
    const t = falso(roteiroPadrao());
    const r = await executarDesignacao(pedido({ data: '2026-12-25' }), t);
    expect(r.desfecho).toBe('falha');
    expect(t.recebidas).toEqual([]);
  });

  it('minuto ocupado por outro processo não escreve e sugere outro horário', async () => {
    const t = falso(roteiroPadrao({ pauta: () => ok(pautaOcupada) }));
    const r = await executarDesignacao(pedido({ juizoDigital: true, ehJulgamento: true }), t);
    expect(r.desfecho).toBe('falha');
    expect(r.acoes).toEqual(['escolher-outro-horario']);
    expect(t.recebidas.every((x) => x.metodo === 'GET')).toBe(true);
  });

  it('falha ao retirar o 100% Digital para tudo antes de designar', async () => {
    const t = falso(roteiroPadrao({ digital: () => erro(500) }));
    const r = await executarDesignacao(pedido({ juizoDigital: true, ehJulgamento: true }), t);
    expect(r.desfecho).toBe('falha');
    expect(ordem(t).filter((x) => x.startsWith('POST'))).toEqual([]);
  });
});

describe('executor: falha na designação (D32b, D26, D9b)', () => {
  const antiga = { id: 444, dataInicio: '2026-10-20T10:10:00', descricaoTipo: 'Conciliação', nomeSala: 'Sala 01' };

  it('antiga continua lá: nada mudou, sem fallback; PJE-064 sugere outro horário', async () => {
    const t = falso(roteiroPadrao({ redesignar: () => erro(400, 'PJE-064'), lista: () => ok([audiencia(444, '2026-10-20T10:10:00')]) }));
    const r = await executarDesignacao(pedido({ antiga }), t);
    expect(r.desfecho).toBe('falha');
    expect(r.resumo).toMatch(/antiga continua/);
    expect(r.acoes).toEqual(['escolher-outro-horario']);
    expect(ordem(t).filter((x) => !x.startsWith('GET'))).toEqual(['PUT /pje-comum-api/api/pautasaudiencias/audiencias/redesignacao']);
  });

  it('nova está lá apesar do erro: trata como sucesso e segue para o GIGS', async () => {
    const t = falso(roteiroPadrao({ redesignar: () => erro(504), lista: () => ok([audiencia(555, '2026-10-27T10:11:00')]) }));
    const r = await executarDesignacao(pedido({ antiga, gigs: { texto: 'x', prazo: 0 } }), t);
    expect(r.desfecho).toBe('sucesso');
    expect(ordem(t).at(-1)).toBe('POST /pje-gigs-api/api/atividade');
  });

  it('nenhuma das duas: avisa que o processo ficou sem audiência e oferece as redes da D9', async () => {
    const t = falso(roteiroPadrao({ redesignar: () => erro(500), lista: () => ok([]) }));
    const r = await executarDesignacao(pedido({ antiga }), t);
    expect(r.desfecho).toBe('falha');
    expect(r.resumo).toMatch(/SEM audiência/);
    expect(r.acoes).toEqual(['redesignar-antiga', 'gigs-audiencia-perdida']);
  });

  it('POST 200 devolvendo a audiência antiga não conta como designação (D9b)', async () => {
    const t = falso(roteiroPadrao({ designar: () => ok(audiencia(444, '2026-10-20T10:10:00')), lista: () => ok([audiencia(444, '2026-10-20T10:10:00')]) }));
    const r = await executarDesignacao(pedido(), t);
    expect(r.desfecho).toBe('falha');
    expect(r.passos.find((p) => p.titulo === 'Designar a audiência')?.estado).toBe('erro');
  });

  it('100% Digital é recolocado mesmo quando a designação falha (D26)', async () => {
    const t = falso(roteiroPadrao({ designar: () => erro(400, 'PJE-064'), lista: () => ok([]) }));
    const r = await executarDesignacao(pedido({ juizoDigital: true, ehJulgamento: true }), t);
    expect(r.desfecho).toBe('falha');
    const puts = t.recebidas.filter((x) => x.caminho.includes('alteracaoParcial'));
    expect(puts.map((x) => (x.corpo as { juizoDigital: boolean }).juizoDigital)).toEqual([false, true]);
  });

  it('falha ao recolocar o 100% Digital vira pendência destacada', async () => {
    let chamadas = 0;
    const t = falso(roteiroPadrao({ digital: () => (++chamadas === 2 ? erro(500) : ok(null)) }));
    const r = await executarDesignacao(pedido({ juizoDigital: true, ehJulgamento: true }), t);
    expect(r.desfecho).toBe('parcial');
    expect(r.resumo).toMatch(/SEM o Juízo 100% Digital/);
  });
});

describe('simulação e envio real (entrega 4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a trava foi liberada na entrega 4: quem decide é o modo simulação', () => {
    expect(ESCRITA_LIBERADA).toBe(true);
  });

  it('simulação: leituras de verdade, escritas não saem, e o resultado mostra tudo', async () => {
    const t = falso((r) => (r.metodo === 'GET' ? roteiroPadrao()(r) : { ok: true, status: 0, dados: null, simulado: true }), true);
    const r = await executarDesignacao(pedido({ juizoDigital: true, ehJulgamento: true, gigs: { texto: 'x', prazo: 2 } }), t);
    expect(r.desfecho).toBe('simulado');
    expect(r.passos.map((p) => p.estado)).toEqual(['ok', 'ok', 'simulado', 'simulado', 'simulado', 'ok', 'simulado']);
  });

  it('transportePje com simulação LIGADA não escreve', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const t = transportePje('https://pje.trt9.jus.br', () => 'XSRF', true);
    expect(t.simulando).toBe(true);
    const r = await t.enviar({ metodo: 'POST', caminho: '/pje-comum-api/api/pautasaudiencias/audiencias', corpo: {} });
    expect(r).toEqual({ ok: true, status: 0, dados: null, simulado: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('transportePje com simulação DESLIGADA grava: JSON, Content-Type e XSRF lido na hora', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{"id":555}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    let xsrf = 'A';
    const t = transportePje('https://pje.trt9.jus.br', () => xsrf, false);
    expect(t.simulando).toBe(false);
    xsrf = 'B';
    const r = await t.enviar({ metodo: 'PUT', caminho: '/pje-comum-api/api/pautasaudiencias/audiencias/redesignacao', corpo: { a: 1 } });
    expect(r).toEqual({ ok: true, status: 200, dados: { id: 555 } });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://pje.trt9.jus.br/pje-comum-api/api/pautasaudiencias/audiencias/redesignacao');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe('{"a":1}');
    expect(init?.credentials).toBe('include');
    const headers = init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-XSRF-TOKEN']).toBe('B');
  });

  it('erro do PJe no envio real vira ErroPje (PJE-064)', async () => {
    const corpo = JSON.stringify({ identificadorRequisicao: 'abc', codigoErro: 'PJE-064', mensagem: 'Já existe uma audiência marcada para o horário solicitado.' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(corpo, { status: 400 })));
    const t = transportePje('https://pje.trt9.jus.br', () => 'X', false);
    const r = await t.enviar({ metodo: 'POST', caminho: '/pje-comum-api/api/pautasaudiencias/audiencias', corpo: {} });
    expect(r).toEqual({ ok: false, status: 400, erro: { mensagem: 'Já existe uma audiência marcada para o horário solicitado.', codigoErro: 'PJE-064', identificadorRequisicao: 'abc' } });
  });

  it('transportePje faz as leituras de verdade, com o XSRF lido na hora', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    let xsrf = 'A';
    const t = transportePje('https://pje.trt9.jus.br', () => xsrf, true);
    xsrf = 'B';
    await t.enviar({ metodo: 'GET', caminho: '/pje-comum-api/api/processos/id/1/audiencias?status=M' });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://pje.trt9.jus.br/pje-comum-api/api/processos/id/1/audiencias?status=M');
    expect((init?.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('B');
  });
});
