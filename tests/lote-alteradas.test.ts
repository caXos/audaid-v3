// Entrega 7: alterar as audiências que já estavam no dia (D74–D77, D80–D82). As regras puras de
// src/lote/pauta.ts e src/regras/pauta.ts, e o motor da execução com a audiência de fora alterada.
// Números de processo fictícios.

import { describe, expect, it } from 'vitest';
import type { RegistroPasso, Requisicao, RespostaTransporte, Transporte } from '../src/fluxo/executor';
import { recolocarJuizoDigital } from '../src/fluxo/executor';
import { estadoInicial, executarPendencias, situacaoDoItem, type EstadoItem, type ItemExecucao } from '../src/lote/execucao';
import { calcularPauta, lerRascunho, montarPautaPje, paraHora, paraMinutos, sincronizarFora, TOPO_PADRAO, type ItemLote, type LinhaPauta, type Topo } from '../src/lote/pauta';
import type { EventoCalendario } from '../src/pje/api';
import { lerPauta, naGradeDoDia, type EntradaPauta } from '../src/regras/pauta';
import calendarioJson from './fixtures/calendario-cejusc.json';

const m = paraMinutos;
const N = ['0000101-52.2026.5.09.0001', '0000102-37.2026.5.09.0001'];
const topo = (t: Partial<Topo> = {}): Topo => ({ ...TOPO_PADRAO, idSala: 503, data: '2026-11-10', tipoBase: 'Conciliação', ...t });
const proc = (chave: string, ajustes = {}): ItemLote => ({ tipo: 'processo', chave, ajustes });
const fora = (id: number, inicio: string, alteracao?: Extract<ItemLote, { tipo: 'fora' }>['alteracao']): ItemLote => ({ tipo: 'fora', chave: `fora-${id}`, idProcesso: id, inicio, ...(alteracao ? { alteracao } : {}) });
const desenho = (linhas: LinhaPauta[]) =>
  linhas.map((l) => `${l.tipo === 'processo' ? l.ordem : l.tipo === 'vaga' ? 'V' : l.tipo === 'fora' ? (l.movida ? 'F*' : 'F') : 'I'}@${paraHora(l.inicio)}`);

describe('lerPauta: o processo embutido (D81)', () => {
  it('traz o órgão em que tramita, o 100% Digital, a classe, a fase e o segredo', () => {
    const e = lerPauta({
      dia: '2026-11-10',
      pautasDoDia: [
        {
          idProcesso: 9,
          nrProcesso: 'nr-9',
          segredoJustica: false,
          pautaAudienciaHorario: { horaInicial: '10:00:00', horaFinal: '10:10:00' },
          processo: { id: 9, juizoDigital: true, faseProcessual: 'CONHECIMENTO', classeJudicial: { sigla: 'ATSum' }, orgaoJulgador: { id: 174, descricao: 'CEJUSC' } },
        },
      ],
    });
    expect(e[0]).toMatchObject({ segredo: false, processo: { orgaoId: 174, orgaoDescricao: 'CEJUSC', juizoDigital: true, faseProcessual: 'CONHECIMENTO', classeSigla: 'ATSum' } });
  });
});

describe('naGradeDoDia (D80)', () => {
  const dia = ['08:30', '08:40', '08:50', '09:00', '10:11', '10:20'].map(m);
  it('o passo é a diferença mais comum desde o primeiro horário; o encaixe fica fora', () => {
    expect(naGradeDoDia(m('09:00'), dia)).toBe(true);
    expect(naGradeDoDia(m('10:11'), dia)).toBe(false);
    expect(naGradeDoDia(m('09:00'), [m('09:00')])).toBe(false); // sem grade
  });
});

describe('audiência de fora alterada (D81)', () => {
  it('em sequência: com horário novo, vira âncora; solta (arrastada), segue a sequência', () => {
    expect(desenho(calcularPauta([proc(N[0]!), fora(77, '09:30', { inicio: '09:10' }), proc(N[1]!)], topo()))).toEqual(['1@09:00', 'F*@09:10', '2@09:20']);
    expect(desenho(calcularPauta([fora(77, '09:30', { solta: true }), proc(N[0]!), proc(N[1]!)], topo()))).toEqual(['F*@09:00', '1@09:10', '2@09:20']);
    // Só o tipo mudou: fica no horário dela, sem "movida".
    expect(desenho(calcularPauta([proc(N[0]!), fora(77, '09:30', { tipoBase: 'Instrução' })], topo()))).toEqual(['1@09:00', 'F@09:30']);
  });

  it('a que sai do horário entra nos conflitos do próprio lote (mesmo minuto é vermelho)', () => {
    const linhas = calcularPauta([proc(N[0]!), fora(77, '09:30', { inicio: '09:00' })], topo());
    expect(linhas.map((l) => l.sinal)).toEqual(['mesmo-minuto', 'mesmo-minuto']);
  });

  it('pelas vagas: levada para uma vaga, ocupa-a; o horário que ela deixa vira vaga se cair na grade (D80)', () => {
    const entradas: EntradaPauta[] = [
      { hora: '09:00', tipo: 'vaga' },
      { hora: '09:10', tipo: 'vaga' },
      { hora: '09:20', tipo: 'audiencia', idProcesso: 77 },
      { hora: '09:31', tipo: 'audiencia', idProcesso: 78 },
    ];
    const itens = [proc(N[0]!), fora(77, '09:20', { inicio: '09:00' }), fora(78, '09:31')];
    const pje = montarPautaPje(entradas, new Map(), 'vagas', [], new Set([77]));
    expect(pje.vagas.map((v) => paraHora(v.minuto))).toEqual(['09:00', '09:10', '09:20']); // 09:20 vagou
    expect(desenho(calcularPauta(itens, topo(), pje))).toEqual(['F*@09:00', '1@09:10', 'V@09:20', 'F@09:31']);
    // O encaixe (09:31) que sai não vira vaga.
    expect(montarPautaPje(entradas, new Map(), 'vagas', [], new Set([78])).vagas.map((v) => paraHora(v.minuto))).toEqual(['09:00', '09:10']);
  });

  it('sincronizar: a alterada fica, com a alteração, enquanto continuar no horário original', () => {
    const itens = [proc(N[0]!), fora(77, '09:30', { tipoBase: 'Instrução' })];
    expect(sincronizarFora(itens, [{ idProcesso: 77, hora: '09:30' }], topo())).toBe(itens);
    expect(sincronizarFora(itens, [{ idProcesso: 77, hora: '10:00' }], topo())).toEqual([proc(N[0]!), fora(77, '10:00')]);
  });

  it('rascunho: só a alterada vai, e volta com a alteração; a de fora sem alteração é ignorada', () => {
    const base = { versao: 1, idOrgao: 174, salvoEm: '2026-11-05T10:00:00Z', hash: 'AUD-7K3Q9F2M', topo: {} };
    const r = lerRascunho({ ...base, itens: [proc(N[0]!), fora(77, '09:30', { inicio: '09:10', tipoBase: 'Instrução', gigs: { opcao: 'outro', texto: 'Intimar', prazo: 2 } }), fora(78, '10:00'), { tipo: 'fora', chave: 'fora-79', idProcesso: 80, inicio: '10:00', alteracao: { solta: true } }] }, 174)!;
    expect(r.itens).toEqual([proc(N[0]!), fora(77, '09:30', { inicio: '09:10', tipoBase: 'Instrução', gigs: { opcao: 'outro', texto: 'Intimar', prazo: 2 } })]);
  });
});

// ── A execução com a audiência de fora ────────────────────────────────────────────────────

const eventos = calendarioJson as EventoCalendario[];
const DIA = '2026-10-27';

function itemFora(id: number, hora: string, extra: Partial<ItemExecucao> = {}): ItemExecucao {
  return {
    chave: `fora-${id}`,
    numero: `nr-${id}`,
    ordem: 0,
    idProcesso: id,
    hora,
    descricaoTipo: 'Conciliação em Conhecimento',
    mantida: false,
    redesignacao: true,
    alternaDigital: false,
    deFora: { horaOriginal: '09:30', tipoOriginal: 'Instrução' },
    pedido: { idProcesso: id, idOrgaoLogado: 174, processoBruto: {}, juizoDigital: false, idSala: 503, data: DIA, hora, idTipoAudiencia: 3, ehJulgamento: false, eventos, hoje: '2026-10-22' },
    ...extra,
  };
}

function transporte(roteiro: (r: Requisicao) => RespostaTransporte): Transporte & { recebidas: Requisicao[] } {
  const recebidas: Requisicao[] = [];
  return {
    simulando: false,
    recebidas,
    async enviar(r) {
      recebidas.push(r);
      return roteiro(r);
    },
  };
}
const ok = (dados: unknown): RespostaTransporte => ({ ok: true, status: 200, dados });
const audiencia = (id: number, hora: string) => ({ id, dataInicio: `${DIA}T${hora}:00`, status: 'Designada', tipo: { id: 9, descricao: 'Instrução' }, salaFisica: { id: 503, nome: 'Sala 01', orgaoJulgador: { id: 174 } } });

describe('execução da audiência de fora (D75, D81, D82)', () => {
  it('a alterada é redesignada a partir da audiência dela, relida na hora', async () => {
    const item = itemFora(77, '09:10');
    const t = transporte((r) => {
      if (r.caminho.includes('classificacoes/dia')) return ok({ dia: DIA, pautasDoDia: [{ idProcesso: 77, nrProcesso: 'nr-77', status: 'M', pautaAudienciaHorario: { horaInicial: '09:30:00', horaFinal: '09:30:00' } }] });
      if (r.caminho.includes('/processos/id/77/audiencias')) return ok([audiencia(770, '09:30')]);
      if (r.caminho.endsWith('/redesignacao')) return ok({ ...audiencia(771, '09:10') });
      throw new Error(`inesperada: ${r.metodo} ${r.caminho}`);
    });
    const e: Record<string, EstadoItem> = { [item.chave]: estadoInicial(item) };
    await executarPendencias([item], e, t, { pararPedido: () => false });
    expect(situacaoDoItem(e[item.chave]!, false).situacao).toBe('ok');
    const put = t.recebidas.find((r) => r.metodo === 'PUT')!;
    expect(put.corpo).toMatchObject({ idProcessoAudiencia: 770, horarioInicial: '09:10', idProcesso: 77 });
  });

  it('a que só ganhou GIGS: nenhuma requisição de audiência, só o GIGS', async () => {
    const item = itemFora(78, '09:30', { soGigs: true, gigs: { texto: 'Intimar', prazo: 0 } });
    const t = transporte((r) => {
      if (r.caminho.includes('classificacoes/dia')) return ok({ dia: DIA });
      if (r.caminho.endsWith('/pje-gigs-api/api/atividade')) return ok({ id: 1 });
      throw new Error(`inesperada: ${r.metodo} ${r.caminho}`);
    });
    const e: Record<string, EstadoItem> = { [item.chave]: estadoInicial(item) };
    expect(situacaoDoItem(e[item.chave]!, false).situacao).toBe('aguardando');
    await executarPendencias([item], e, t, { pararPedido: () => false });
    expect(situacaoDoItem(e[item.chave]!, false)).toEqual({ situacao: 'ok', resumo: 'A audiência não muda. GIGS lançado.' });
    expect(t.recebidas.filter((r) => r.metodo !== 'GET').map((r) => r.caminho.split('/').pop())).toEqual(['atividade']);
  });

  it('recolocar o 100% Digital sem reserva: sem a releitura do processo, não envia o PUT', async () => {
    const passos: RegistroPasso[] = [];
    const t = transporte((r) => (r.metodo === 'GET' ? { ok: false, status: 500, erro: { mensagem: 'fora do ar' } } : ok(null)));
    expect(await recolocarJuizoDigital(77, {}, t, (p) => passos.push(p))).toBe(false);
    expect(t.recebidas.map((r) => r.metodo)).toEqual(['GET']);
    expect(passos[0]).toMatchObject({ titulo: 'Recolocar o Juízo 100% Digital', estado: 'erro' });
  });
});
