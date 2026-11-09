// O "×" da Pauta (D89e): o executor de cancelamento com um transporte falso. O payload é o da
// captura de 06/11/2026 (`[idAudiencia]`), e o sucesso só vale relendo o dia.

import { describe, expect, it } from 'vitest';
import { executarCancelamento, type PedidoCancelamento, type Requisicao, type RespostaTransporte, type Transporte } from '../src/fluxo/executor';
import type { PautaDia } from '../src/pje/api';

const pedido = (extra: Partial<PedidoCancelamento> = {}): PedidoCancelamento => ({
  idProcesso: 100,
  idAudiencia: 3504573,
  idSala: 503,
  idOrgaoLogado: 174,
  data: '2026-11-24',
  hora: '10:50',
  hoje: '2026-11-06',
  ...extra,
});

const comAudiencia: PautaDia = {
  dia: '2026-11-24',
  pautasDoDia: [{ idProcesso: 100, nrProcesso: 'N', pautaAudienciaHorario: { id: 3504573, horaInicial: '10:50:00', horaFinal: '11:00:00' } }],
};
// Depois do cancelamento, o horário volta a ser vaga: sem processo e sem id.
const semAudiencia: PautaDia = { dia: '2026-11-24', pautasDoDia: [{ pautaAudienciaHorario: { horaInicial: '10:50:00', horaFinal: '11:00:00' } }] };

const ok = (dados: unknown): RespostaTransporte => ({ ok: true, status: 200, dados });

/** Transporte falso: a pauta do dia muda depois do PATCH (se `cancelaDeVerdade`). */
function falso(o: { simulando?: boolean; cancelaDeVerdade?: boolean; antes?: PautaDia; patch?: RespostaTransporte }): Transporte & { recebidas: Requisicao[] } {
  const recebidas: Requisicao[] = [];
  let cancelou = false;
  return {
    simulando: o.simulando ?? false,
    recebidas,
    async enviar(r) {
      recebidas.push(r);
      if (r.metodo === 'GET' && r.caminho.includes('/classificacoes/dia')) return ok(cancelou ? semAudiencia : (o.antes ?? comAudiencia));
      if (r.metodo === 'GET' && r.caminho.includes('retorna-prazo')) return ok({ DATA: '2026-11-10T00:00:00' });
      if (o.simulando && r.metodo !== 'GET') return { ok: true, status: 0, dados: null, simulado: true };
      if (r.metodo === 'PATCH') {
        cancelou = o.cancelaDeVerdade ?? true;
        // Como o PJe real: 200, e o status ainda diz "Designada".
        return o.patch ?? ok({ pautasProcessadas: [{ id: 3504573, status: 'Designada', designada: false }] });
      }
      if (r.metodo === 'POST') return ok({ id: 1 });
      return { ok: false, status: 404, erro: { mensagem: 'não esperado' } };
    },
  };
}

const passos = (r: Requisicao[]) => r.map((x) => `${x.metodo} ${x.caminho.split('?')[0]}`);

describe('cancelar pela Pauta (D89e)', () => {
  it('real: confere, cancela com [idAudiencia] e confirma relendo o dia', async () => {
    const t = falso({});
    const r = await executarCancelamento(pedido(), t);
    expect(r.desfecho).toBe('sucesso');
    expect(r.resumo).toBe('Audiência cancelada.');
    expect(passos(t.recebidas)).toEqual([
      'GET /pje-comum-api/api/pautasaudiencias/classificacoes/dia',
      'PATCH /pje-comum-api/api/pautasaudiencias/audiencias/cancelamento',
      'GET /pje-comum-api/api/pautasaudiencias/classificacoes/dia',
    ]);
    expect(t.recebidas[1]!.corpo).toEqual([3504573]);
    expect(r.passos.map((p) => p.estado)).toEqual(['ok', 'ok', 'ok']);
  });

  it('com GIGS: lançado só depois de confirmado', async () => {
    const t = falso({});
    const r = await executarCancelamento(pedido({ gigs: { texto: '@RJ1 intimar do cancelamento', prazo: 2 } }), t);
    expect(r.desfecho).toBe('sucesso');
    expect(passos(t.recebidas).slice(3)).toEqual(['GET /pje-gigs-api/api/atividade/retorna-prazo/2', 'POST /pje-gigs-api/api/atividade']);
  });

  it('se a audiência continua na pauta depois do PATCH: falha, e o GIGS não sai', async () => {
    const t = falso({ cancelaDeVerdade: false });
    const r = await executarCancelamento(pedido({ gigs: { texto: 'x', prazo: 0 } }), t);
    expect(r.desfecho).toBe('falha');
    expect(r.resumo).toMatch(/continua na pauta.*GIGS não foi lançado/);
    expect(t.recebidas.some((x) => x.metodo === 'POST')).toBe(false);
  });

  it('se a audiência já não está na pauta: nada é enviado', async () => {
    const t = falso({ antes: semAudiencia });
    const r = await executarCancelamento(pedido(), t);
    expect(r.desfecho).toBe('falha');
    expect(r.resumo).toMatch(/não está mais na pauta.*Nada foi alterado/);
    expect(t.recebidas.map((x) => x.metodo)).toEqual(['GET']);
  });

  it('erro do PJe no PATCH: falha, sem GIGS', async () => {
    const t = falso({ patch: { ok: false, status: 400, erro: { mensagem: 'erro do PJe', codigoErro: 'PJE-999' } } });
    const r = await executarCancelamento(pedido({ gigs: { texto: 'x', prazo: 0 } }), t);
    expect(r.desfecho).toBe('falha');
    expect(r.passos.at(-1)!.erro?.codigoErro).toBe('PJE-999');
    expect(t.recebidas.some((x) => x.metodo === 'POST')).toBe(false);
  });

  it('simulação: monta o PATCH sem enviar, não relê o dia e simula o GIGS', async () => {
    const t = falso({ simulando: true });
    const r = await executarCancelamento(pedido({ gigs: { texto: 'x', prazo: 0 } }), t);
    expect(r.desfecho).toBe('simulado');
    expect(r.passos.map((p) => `${p.titulo}:${p.estado}`)).toEqual(['Conferir a pauta do dia:ok', 'Cancelar a audiência:simulado', 'Lançar o GIGS:simulado']);
  });
});
