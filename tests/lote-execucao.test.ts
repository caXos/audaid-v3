// A execução do Lote (src/lote/execucao.ts, entrega 6): a ordem das dependências e a troca
// circular (D67, D75), o resumo da confirmação (D71) e o motor, contra um PJe falso que guarda a
// pauta e recusa o minuto ocupado (PJE-064). Números de processo fictícios.

import { describe, expect, it } from 'vitest';
import type { RegistroPasso, Requisicao, RespostaTransporte, Transporte } from '../src/fluxo/executor';
import {
  estadoInicial,
  executarPendencias,
  minutoParaEncaixar,
  ordenarMovimentos,
  resumoDoLote,
  situacaoDoItem,
  type EstadoItem,
  type ItemExecucao,
} from '../src/lote/execucao';
import { paraMinutos } from '../src/lote/pauta';
import type { EventoCalendario } from '../src/pje/api';
import type { EntradaPauta } from '../src/regras/pauta';
import calendarioJson from './fixtures/calendario-cejusc.json';

const eventos = calendarioJson as EventoCalendario[];
const DIA = '2026-10-27'; // terça-feira, sem evento no calendário
const OJ = 174;
const SALA = 503;
const m = paraMinutos;
const nr = (id: number) => `0000${String(id).padStart(3, '0')}-00.2026.5.09.0001`;

function item(id: number, hora: string, extra: Partial<ItemExecucao> = {}): ItemExecucao {
  return {
    chave: nr(id),
    ordem: id,
    idProcesso: id,
    hora,
    descricaoTipo: 'Conciliação em Conhecimento',
    mantida: false,
    redesignacao: false,
    alternaDigital: false,
    pedido: { idProcesso: id, idOrgaoLogado: OJ, processoBruto: { id, juizoDigital: false }, juizoDigital: false, idSala: SALA, data: DIA, hora, idTipoAudiencia: 3, ehJulgamento: false, eventos, hoje: '2026-10-22' },
    ...extra,
  };
}

// ── A ordem ───────────────────────────────────────────────────────────────────────────────

describe('ordenarMovimentos (D67, D75)', () => {
  it('sem dependência, vale a ordem da lista; numa cadeia, quem sai do horário vai antes', () => {
    expect(ordenarMovimentos([{ chave: 'A', destino: m('09:00') }, { chave: 'B', destino: m('09:10') }])).toEqual([
      { tipo: 'mover', chave: 'A' },
      { tipo: 'mover', chave: 'B' },
    ]);
    // A vai para o horário de B, B para o de C, C para um livre: C, B, A.
    const cadeia = [
      { chave: 'A', origem: m('09:00'), destino: m('09:10') },
      { chave: 'B', origem: m('09:10'), destino: m('09:20') },
      { chave: 'C', origem: m('09:20'), destino: m('10:00') },
    ];
    expect(ordenarMovimentos(cadeia).map((e) => e.chave)).toEqual(['C', 'B', 'A']);
    // Um processo novo (sem horário hoje) também espera quem sai do horário que ele vai ocupar.
    expect(ordenarMovimentos([{ chave: 'N', destino: m('09:00') }, { chave: 'X', origem: m('09:00'), destino: m('11:00') }]).map((e) => e.chave)).toEqual(['X', 'N']);
  });

  it('troca circular: um vai antes para o primeiro minuto livre depois do destino dele e volta no fim', () => {
    const troca = [
      { chave: 'A', origem: m('09:00'), destino: m('09:10') },
      { chave: 'B', origem: m('09:10'), destino: m('09:00') },
    ];
    expect(ordenarMovimentos(troca)).toEqual([
      { tipo: 'estacionar', chave: 'A', minuto: m('09:11') },
      { tipo: 'mover', chave: 'B' },
      { tipo: 'mover', chave: 'A' },
    ]);
    // O minuto de estacionar foge das audiências de fora.
    expect(ordenarMovimentos(troca, [m('09:11'), m('09:12')])[0]).toEqual({ tipo: 'estacionar', chave: 'A', minuto: m('09:13') });
  });

  it('dois ciclos: um estacionamento em cada', () => {
    const dois = [
      { chave: 'A', origem: m('09:00'), destino: m('09:10') },
      { chave: 'B', origem: m('09:10'), destino: m('09:00') },
      { chave: 'C', origem: m('10:00'), destino: m('10:10') },
      { chave: 'D', origem: m('10:10'), destino: m('10:00') },
    ];
    const etapas = ordenarMovimentos(dois);
    expect(etapas.filter((e) => e.tipo === 'estacionar').map((e) => e.chave)).toEqual(['A', 'C']);
    expect(etapas.filter((e) => e.tipo === 'mover')).toHaveLength(4);
  });
});

describe('resumoDoLote (D71)', () => {
  it('conta designações, redesignações, mantidas, 100% Digital, GIGS e trocas circulares', () => {
    const itens = [
      item(1, '09:10', { redesignacao: true, gigs: { texto: 'x', prazo: 2 } }),
      item(2, '09:00', { redesignacao: true, alternaDigital: true }),
      item(3, '09:20'),
      item(4, '09:30', { mantida: true, redesignacao: true }),
    ];
    const pauta: EntradaPauta[] = [
      { hora: '09:00', tipo: 'audiencia', idProcesso: 1 },
      { hora: '09:10', tipo: 'audiencia', idProcesso: 2 },
      { hora: '09:30', tipo: 'audiencia', idProcesso: 4 },
    ];
    expect(resumoDoLote(itens, pauta)).toEqual({ gravar: 3, designacoes: 1, redesignacoes: 2, mantidas: 1, alternaDigital: 1, gigs: 1, trocasCirculares: 1 });
  });
});

describe('minutoParaEncaixar (D70)', () => {
  it('o primeiro minuto depois do planejado sem audiência na sala nem outro item do lote', () => {
    const itens = [item(1, '09:10'), item(2, '09:12')];
    const pauta: EntradaPauta[] = [{ hora: '09:10', tipo: 'audiencia', idProcesso: 99 }, { hora: '09:11', tipo: 'audiencia', idProcesso: 98 }, { hora: '09:13', tipo: 'vaga' }];
    expect(minutoParaEncaixar(itens[0]!, itens, pauta)).toBe(m('09:13'));
  });
});

// ── O motor, contra um PJe falso ──────────────────────────────────────────────────────────

interface AudFalsa {
  id: number;
  idProcesso: number;
  hora: string;
  idTipo: number;
}

/** Um PJe que guarda as audiências da sala no dia e recusa o minuto ocupado com PJE-064. */
function pjeFalso(inicial: AudFalsa[], opcoes: { simulando?: boolean; falharGigs?: number; falharRecolocar?: number; expirarDepoisDe?: number } = {}) {
  const auds = inicial.map((a) => ({ ...a }));
  const recebidas: Requisicao[] = [];
  let proximoId = 5000;
  let falharGigs = opcoes.falharGigs ?? 0;
  let falharRecolocar = opcoes.falharRecolocar ?? 0;
  let expirarDepoisDe = opcoes.expirarDepoisDe ?? Infinity;
  const ok = (dados: unknown): RespostaTransporte => ({ ok: true, status: 200, dados });
  const ocupado = (): RespostaTransporte => ({ ok: false, status: 400, erro: { mensagem: 'Já existe uma audiência marcada para o horário solicitado.', codigoErro: 'PJE-064' } });
  const audiencia = (a: AudFalsa) => ({
    id: a.id,
    dataInicio: `${DIA}T${a.hora}:00`,
    status: 'Designada',
    tipo: { id: a.idTipo, descricao: a.idTipo === 4 ? 'Julgamento' : 'Conciliação em Conhecimento' },
    salaFisica: { id: SALA, nome: 'Sala 01', orgaoJulgador: { id: OJ, descricao: 'CEJUSC' } },
  });
  const outroNoMinuto = (hora: string, idProcesso: number) => auds.some((a) => a.hora === hora && a.idProcesso !== idProcesso);

  const t: Transporte & { recebidas: Requisicao[]; auds: AudFalsa[]; renovarSessao(): void } = {
    simulando: Boolean(opcoes.simulando),
    recebidas,
    auds,
    renovarSessao() {
      expirarDepoisDe = Infinity;
    },
    async enviar(r) {
      recebidas.push(r);
      if (recebidas.length > expirarDepoisDe) return { ok: false, status: 401, erro: { mensagem: 'HTTP 401 sem corpo' } };
      const c = r.caminho;
      if (r.metodo !== 'GET' && opcoes.simulando) return { ok: true, status: 0, dados: null, simulado: true };
      if (c.includes('classificacoes/dia')) {
        return ok({ dia: DIA, pautasDoDia: auds.map((a) => ({ idProcesso: a.idProcesso, nrProcesso: nr(a.idProcesso), status: 'M', pautaAudienciaHorario: { horaInicial: `${a.hora}:00`, horaFinal: `${a.hora}:00` } })) });
      }
      const doProcesso = /\/processos\/id\/(\d+)\/audiencias/.exec(c);
      if (doProcesso) return ok(auds.filter((a) => a.idProcesso === Number(doProcesso[1])).map(audiencia));
      if (r.metodo === 'GET' && /\/processos\/id\/\d+$/.test(c)) return ok({ id: Number(c.split('/').pop()), juizoDigital: true });
      if (c.includes('alteracaoParcial')) {
        const corpo = r.corpo as { juizoDigital: boolean };
        if (corpo.juizoDigital && falharRecolocar > 0) {
          falharRecolocar--;
          return { ok: false, status: 500, erro: { mensagem: 'falha ao recolocar' } };
        }
        return ok(null);
      }
      if (c.endsWith('/redesignacao')) {
        const b = r.corpo as { idProcessoAudiencia: number; horarioInicial: string; idProcesso: number; idTipoAudiencia: number };
        if (outroNoMinuto(b.horarioInicial, b.idProcesso)) return ocupado();
        const a = auds.find((x) => x.id === b.idProcessoAudiencia);
        if (!a) return { ok: false, status: 400, erro: { mensagem: 'audiência não encontrada' } };
        Object.assign(a, { id: proximoId++, hora: b.horarioInicial, idTipo: b.idTipoAudiencia });
        return ok(audiencia(a));
      }
      if (c.endsWith('/pautasaudiencias/audiencias')) {
        const b = r.corpo as { horarioInicial: string; idProcesso: number; idTipoAudiencia: number };
        if (outroNoMinuto(b.horarioInicial, b.idProcesso)) return ocupado();
        const existente = auds.find((x) => x.idProcesso === b.idProcesso);
        if (existente) return ok(audiencia(existente)); // D9b
        const nova = { id: proximoId++, idProcesso: b.idProcesso, hora: b.horarioInicial, idTipo: b.idTipoAudiencia };
        auds.push(nova);
        return ok(audiencia(nova));
      }
      if (c.includes('retorna-prazo')) return ok({ DATA: '2026-10-26T00:00:00' });
      if (c.endsWith('/pje-gigs-api/api/atividade')) {
        if (falharGigs > 0) {
          falharGigs--;
          return { ok: false, status: 500, erro: { mensagem: 'GIGS fora do ar' } };
        }
        return ok({ id: 1 });
      }
      throw new Error(`requisição inesperada: ${r.metodo} ${c}`);
    },
  };
  return t;
}

const estadosDe = (itens: ItemExecucao[]) => Object.fromEntries(itens.map((i) => [i.chave, estadoInicial(i)])) as Record<string, EstadoItem>;
const sempre = { pararPedido: () => false };
const situacoes = (itens: ItemExecucao[], e: Record<string, EstadoItem>, simulando = false) => itens.map((i) => situacaoDoItem(e[i.chave]!, simulando).situacao);
const escritas = (t: { recebidas: Requisicao[] }) => t.recebidas.filter((r) => r.metodo !== 'GET').map((r) => `${r.metodo} ${r.caminho.split('?')[0]!.split('/').slice(-1)[0]}`);
const horaDe = (t: { auds: AudFalsa[] }, id: number) => t.auds.find((a) => a.idProcesso === id)?.hora;
const titulos = (passos: RegistroPasso[]) => passos.map((p) => p.titulo);

describe('executarPendencias: a ordem e as dependências', () => {
  it('primeiro todas as audiências, depois os GIGS (D75)', async () => {
    const itens = [item(1, '09:00', { gigs: { texto: 'Analisar', prazo: 0 } }), item(2, '09:10', { gigs: { texto: 'Analisar', prazo: 0 } })];
    const t = pjeFalso([]);
    const e = estadosDe(itens);
    const fim = await executarPendencias(itens, e, t, sempre);
    expect(fim).toEqual({ parada: false, sessaoExpirada: false });
    expect(escritas(t)).toEqual(['POST audiencias', 'POST audiencias', 'POST atividade', 'POST atividade']);
    expect(situacoes(itens, e)).toEqual(['ok', 'ok']);
    expect(situacaoDoItem(e[nr(1)]!, false).resumo).toBe('Audiência designada. GIGS lançado.');
  });

  it('quem sai do horário vai antes de quem entra nele (D67), e a pauta do PJe confere', async () => {
    // 1 está às 09:00 e vai para 09:10, que hoje é do 2; o 2 vai para 09:20.
    const itens = [item(1, '09:10'), item(2, '09:20')];
    const t = pjeFalso([
      { id: 11, idProcesso: 1, hora: '09:00', idTipo: 3 },
      { id: 22, idProcesso: 2, hora: '09:10', idTipo: 3 },
    ]);
    const e = estadosDe(itens);
    await executarPendencias(itens, e, t, sempre);
    expect(situacoes(itens, e)).toEqual(['ok', 'ok']);
    expect([horaDe(t, 1), horaDe(t, 2)]).toEqual(['09:10', '09:20']);
    expect(escritas(t)).toEqual(['PUT redesignacao', 'PUT redesignacao']);
    expect((t.recebidas.find((r) => r.metodo === 'PUT')!.corpo as { idProcesso: number }).idProcesso).toBe(2);
  });

  it('troca circular (D75): um processo vai antes para um minuto livre e volta depois', async () => {
    const itens = [item(1, '09:10'), item(2, '09:00')];
    const t = pjeFalso([
      { id: 11, idProcesso: 1, hora: '09:00', idTipo: 3 },
      { id: 22, idProcesso: 2, hora: '09:10', idTipo: 3 },
    ]);
    const e = estadosDe(itens);
    await executarPendencias(itens, e, t, sempre);
    expect(situacoes(itens, e)).toEqual(['ok', 'ok']);
    expect([horaDe(t, 1), horaDe(t, 2)]).toEqual(['09:10', '09:00']);
    expect(e[nr(1)]!.estacionado).toBe('09:11');
    expect(titulos(e[nr(1)]!.passos)).toContain('Estacionar às 09:11 (troca circular)');
    expect(situacaoDoItem(e[nr(1)]!, false).resumo).toBe('Audiência redesignada. Passou antes pelas 09:11 (troca circular).');
    expect(escritas(t)).toEqual(['PUT redesignacao', 'PUT redesignacao', 'PUT redesignacao']);
  });

  it('na simulação nada é gravado, e a dependência passa assim mesmo', async () => {
    const itens = [item(1, '09:10'), item(2, '09:20')];
    const t = pjeFalso(
      [
        { id: 11, idProcesso: 1, hora: '09:00', idTipo: 3 },
        { id: 22, idProcesso: 2, hora: '09:10', idTipo: 3 },
      ],
      { simulando: true },
    );
    const e = estadosDe(itens);
    await executarPendencias(itens, e, t, sempre);
    expect(situacoes(itens, e, true)).toEqual(['simulado', 'simulado']);
    expect([horaDe(t, 1), horaDe(t, 2)]).toEqual(['09:00', '09:10']); // nada mudou no PJe
  });

  it('"mantida" (D79): nenhuma requisição para ela', async () => {
    const itens = [item(1, '09:00', { mantida: true, gigs: { texto: 'x', prazo: 0 } }), item(2, '09:10')];
    const t = pjeFalso([{ id: 11, idProcesso: 1, hora: '09:00', idTipo: 3 }]);
    const e = estadosDe(itens);
    await executarPendencias(itens, e, t, sempre);
    expect(situacoes(itens, e)).toEqual(['mantida', 'ok']);
    expect(t.recebidas.some((r) => r.caminho.includes('/processos/id/1/'))).toBe(false);
    expect(escritas(t)).toEqual(['POST audiencias']);
  });

  it('horário tomado por alguém de fora: falha sem gravar nada, com "escolher outro horário"', async () => {
    const itens = [item(1, '09:10')];
    const t = pjeFalso([{ id: 99, idProcesso: 99, hora: '09:10', idTipo: 3 }]);
    const e = estadosDe(itens);
    await executarPendencias(itens, e, t, sempre);
    expect(situacoes(itens, e)).toEqual(['falha']);
    expect(e[nr(1)]!.acoes).toContain('escolher-outro-horario');
    expect(escritas(t)).toEqual([]);
  });
});

describe('executarPendencias: reprocessar só o que falhou (D17)', () => {
  it('GIGS que falhou: o reprocessamento lança só ele', async () => {
    const itens = [item(1, '09:00', { gigs: { texto: 'Analisar', prazo: 2 } })];
    const t = pjeFalso([], { falharGigs: 1 });
    const e = estadosDe(itens);
    await executarPendencias(itens, e, t, sempre);
    expect(situacaoDoItem(e[nr(1)]!, false)).toEqual({ situacao: 'atencao', resumo: 'Audiência gravada, mas o GIGS não foi lançado.' });
    t.recebidas.length = 0;
    await executarPendencias(itens, e, t, sempre);
    expect(situacoes(itens, e)).toEqual(['ok']);
    expect(escritas(t)).toEqual(['POST atividade']);
    expect(titulos(e[nr(1)]!.passos)).toContain('Nova tentativa');
  });

  it('100% Digital que não voltou: o reprocessamento só o recoloca', async () => {
    const itens = [item(1, '09:00', { alternaDigital: true, pedido: { ...item(1, '09:00').pedido, juizoDigital: true, ehJulgamento: true, idTipoAudiencia: 4 } })];
    const t = pjeFalso([], { falharRecolocar: 1 });
    const e = estadosDe(itens);
    await executarPendencias(itens, e, t, sempre);
    expect(situacaoDoItem(e[nr(1)]!, false).situacao).toBe('falha');
    expect(e[nr(1)]!.pendente).toEqual({ audiencia: false, recolocar: true, gigs: false });
    t.recebidas.length = 0;
    await executarPendencias(itens, e, t, sempre);
    expect(situacoes(itens, e)).toEqual(['ok']);
    expect(escritas(t)).toEqual(['PUT 1']); // só o PUT do processo (recolocar)
  });

  it('a audiência que falhou: o reprocessamento relê o estado real e tenta de novo', async () => {
    const itens = [item(1, '09:10')];
    const t = pjeFalso([{ id: 99, idProcesso: 99, hora: '09:10', idTipo: 3 }]);
    const e = estadosDe(itens);
    await executarPendencias(itens, e, t, sempre);
    expect(situacoes(itens, e)).toEqual(['falha']);
    t.auds.splice(0, 1); // o de fora saiu do horário
    await executarPendencias(itens, e, t, sempre);
    expect(situacoes(itens, e)).toEqual(['ok']);
    expect(horaDe(t, 1)).toBe('09:10');
  });
});

describe('executarPendencias: parar e sessão expirada (D68)', () => {
  it('"Parar" para depois do processo atual; os outros e os GIGS ficam para "Executar os restantes"', async () => {
    const itens = [item(1, '09:00', { gigs: { texto: 'x', prazo: 0 } }), item(2, '09:10', { gigs: { texto: 'x', prazo: 0 } })];
    const t = pjeFalso([]);
    const e = estadosDe(itens);
    let pedido = false;
    const fim = await executarPendencias(itens, e, t, {
      pararPedido: () => pedido,
      aoMudar: () => {
        if (e[nr(1)]!.rodou) pedido = true;
      },
    });
    expect(fim.parada).toBe(true);
    expect(situacoes(itens, e)).toEqual(['atencao', 'nao-executado']);
    expect(situacaoDoItem(e[nr(1)]!, false).resumo).toBe('Audiência gravada; o GIGS ficou para depois (a execução parou).');
    await executarPendencias(itens, e, t, sempre);
    expect(situacoes(itens, e)).toEqual(['ok', 'ok']);
  });

  it('com a troca circular no meio, "Parar" só para depois de o estacionado voltar', async () => {
    // Duas trocas: 1 ↔ 2 e 3 ↔ 4.
    const itens = [item(1, '09:10'), item(2, '09:00'), item(3, '10:10'), item(4, '10:00')];
    const t = pjeFalso([
      { id: 11, idProcesso: 1, hora: '09:00', idTipo: 3 },
      { id: 22, idProcesso: 2, hora: '09:10', idTipo: 3 },
      { id: 33, idProcesso: 3, hora: '10:00', idTipo: 3 },
      { id: 44, idProcesso: 4, hora: '10:10', idTipo: 3 },
    ]);
    const e = estadosDe(itens);
    // Pede para parar logo depois do primeiro estacionamento.
    let pedido = false;
    await executarPendencias(itens, e, t, {
      pararPedido: () => pedido,
      aoMudar: () => {
        if (e[nr(1)]!.estacionado) pedido = true;
      },
    });
    expect([horaDe(t, 1), horaDe(t, 2)]).toEqual(['09:10', '09:00']); // a primeira troca terminou
    expect([horaDe(t, 3), horaDe(t, 4)]).toEqual(['10:00', '10:10']); // a segunda nem começou
    expect(situacoes(itens, e)).toEqual(['ok', 'ok', 'nao-executado', 'nao-executado']);
  });

  it('sessão expirada (401): para, marca os seguintes, e "Executar os restantes" retoma depois do login', async () => {
    const itens = [item(1, '09:00'), item(2, '09:10')];
    // Pauta, audiências do 1, pauta do executor, POST do 1; a 5ª requisição já recebe 401.
    const t = pjeFalso([], { expirarDepoisDe: 4 });
    const e = estadosDe(itens);
    const fim = await executarPendencias(itens, e, t, sempre);
    expect(fim.sessaoExpirada).toBe(true);
    expect(situacoes(itens, e)).toEqual(['ok', 'falha']);
    expect(situacaoDoItem(e[nr(2)]!, false).resumo).toMatch(/^A sessão do PJe expirou/);
    t.renovarSessao();
    await executarPendencias(itens, e, t, sempre);
    expect(situacoes(itens, e)).toEqual(['ok', 'ok']);
  });
});
