// Regras puras da tela 2 do Lote (src/lote/pauta.ts): horários, âncoras, intervalos, topo ×
// ajuste, tipo de cada processo, mover, mesclar e rascunho. Números de processo fictícios.

import { describe, expect, it } from 'vitest';
import {
  aplicarATodos,
  calcularPauta,
  definirAjuste,
  destinoDoArraste,
  lerRascunho,
  mesclarItens,
  moverItem,
  normalizarTopo,
  novoIntervalo,
  paraHora,
  tipoDoItem,
  TOPO_PADRAO,
  type ItemLote,
  type Topo,
} from '../src/lote/pauta';
import type { Processo } from '../src/pje/api';
import { DESCRICOES_CONHECIDAS } from '../src/regras/tipos';

const N = ['0000101-52.2026.5.09.0001', '0000102-37.2026.5.09.0001', '0000103-22.2026.5.09.0001', '0000104-07.2026.5.09.0001', '0000105-89.2026.5.09.0001'];
const topo = (t: Partial<Topo> = {}): Topo => ({ ...TOPO_PADRAO, idSala: 503, data: '2026-11-10', tipoBase: 'Conciliação', ...t });
const proc = (chave: string, ajustes = {}): ItemLote => ({ tipo: 'processo', chave, ajustes });
const horarios = (itens: ItemLote[], t: Topo) => calcularPauta(itens, t).map((l) => `${l.tipo === 'processo' ? l.ordem : l.tipo === 'intervalo' ? 'I' : 'A'}@${paraHora(l.inicio)}`);

describe('calcularPauta (D14, D55)', () => {
  it('em sequência a partir do início, com a duração do topo e a de cada item', () => {
    const itens = [proc(N[0]!), proc(N[1]!, { duracao: 30 }), proc(N[2]!)];
    expect(horarios(itens, topo())).toEqual(['1@09:00', '2@09:10', '3@09:40']);
    expect(horarios(itens, topo({ inicio: '13:30', duracao: 5 }))).toEqual(['1@13:30', '2@13:35', '3@14:05']);
  });

  it('intervalo manual e "a cada N", que conta desde o último intervalo e nunca fica no fim', () => {
    const t = topo({ intervalo: { duracao: 15, aCada: 2 } });
    expect(horarios([proc(N[0]!), proc(N[1]!), proc(N[2]!), proc(N[3]!), proc(N[4]!)], t)).toEqual([
      '1@09:00', '2@09:10', 'A@09:20', '3@09:35', '4@09:45', 'A@09:55', '5@10:10',
    ]);
    expect(horarios([proc(N[0]!), proc(N[1]!)], t)).toEqual(['1@09:00', '2@09:10']); // nada depois da última
    const comManual: ItemLote[] = [proc(N[0]!), { tipo: 'intervalo', chave: 'intervalo-1', duracao: 30 }, proc(N[1]!), proc(N[2]!), proc(N[3]!)];
    expect(horarios(comManual, t)).toEqual(['1@09:00', 'I@09:10', '2@09:40', '3@09:50', 'A@10:00', '4@10:15']);
  });

  it('âncora: o início editado vale dele em diante; sobreposição é amarelo; mesmo minuto é vermelho', () => {
    const itens = [proc(N[0]!), proc(N[1]!), proc(N[2]!, { inicio: '09:05' }), proc(N[3]!)];
    const linhas = calcularPauta(itens, topo());
    expect(linhas.map((l) => paraHora(l.inicio))).toEqual(['09:00', '09:10', '09:05', '09:15']);
    expect(linhas.map((l) => l.ancorado)).toEqual([false, false, true, false]);
    // 3º (09:05–09:15) cruza com o 1º (09:00–09:10) e o 2º (09:10–09:20); o 4º (09:15) cruza com o 2º.
    expect(linhas.map((l) => l.sinal)).toEqual(['sobreposto', 'sobreposto', 'sobreposto', 'sobreposto']);

    const mesmoMinuto = calcularPauta([proc(N[0]!), proc(N[1]!, { inicio: '09:00' })], topo());
    expect(mesmoMinuto.map((l) => l.sinal)).toEqual(['mesmo-minuto', 'mesmo-minuto']);
  });

  it('quem começa depois da meia-noite é vermelho', () => {
    const linhas = calcularPauta([proc(N[0]!), proc(N[1]!)], topo({ inicio: '23:55', duracao: 10 }));
    expect(linhas.map((l) => [paraHora(l.inicio), l.sinal])).toEqual([
      ['23:55', 'ok'],
      ['24:05', 'apos-meia-noite'],
    ]);
  });
});

describe('topo × ajuste (D13)', () => {
  it('ajuste igual ao topo não conta; "Aplicar a todos" limpa o campo em todos', () => {
    const t = topo();
    expect(definirAjuste({}, 'duracao', 10, t)).toEqual({});
    expect(definirAjuste({}, 'duracao', 30, t)).toEqual({ duracao: 30 });
    expect(definirAjuste({ duracao: 30 }, 'duracao', 10, t)).toEqual({});
    expect(definirAjuste({}, 'gigs', { ...t.gigs }, t)).toEqual({});
    const itens = [proc(N[0]!, { duracao: 30, video: true }), proc(N[1]!, { duracao: 5 }), { tipo: 'intervalo', chave: 'intervalo-1', duracao: 20 } as ItemLote];
    expect(aplicarATodos(itens, 'duracao')).toEqual([proc(N[0]!, { video: true }), proc(N[1]!, {}), itens[2]]);
  });
});

describe('tipoDoItem (D6, D42, D57)', () => {
  const tipos = DESCRICOES_CONHECIDAS.map((descricao, i) => ({ id: i + 1, descricao }));
  const p = (x: Partial<Processo> = {}): Processo => ({ id: 1, numero: N[0]!, classeJudicial: { sigla: 'ATOrd' }, faseProcessual: 'CONHECIMENTO', ...x });

  it('fase e rito do processo; Semana Nacional do topo', () => {
    expect(tipoDoItem(p(), topo({ semana: 'conciliacao' }), {}, tipos).descricao).toBe('Conciliação em Conhecimento - Semana Nacional de Conciliação');
    expect(tipoDoItem(p({ faseProcessual: 'EXECUCAO' }), topo(), {}, tipos).descricao).toBe('Conciliação em Execução');
    expect(tipoDoItem(p({ classeJudicial: { sigla: 'ATSum' } }), topo({ tipoBase: 'Instrução' }), {}, tipos).descricao).toBe('Instrução (rito sumaríssimo)');
    // Semana de Execução só vale na fase de execução.
    expect(tipoDoItem(p(), topo({ semana: 'execucao' }), {}, tipos).descricao).toBe('Conciliação em Conhecimento');
  });

  it('100% Digital: vídeo imposto; Julgamento: sem vídeo; ajuste do item vale', () => {
    const digital = tipoDoItem(p({ juizoDigital: true }), topo({ video: false }), {}, tipos);
    expect([digital.video, digital.videoTravado]).toEqual([true, true]);
    const comum = tipoDoItem(p(), topo({ video: false }), { video: true }, tipos);
    expect([comum.video, comum.videoTravado, comum.descricao]).toEqual([true, false, 'Conciliação em Conhecimento por videoconferência']);
    expect(tipoDoItem(p({ juizoDigital: true }), topo({ tipoBase: 'Julgamento' }), {}, tipos).video).toBe(false);
    expect(tipoDoItem(p(), topo(), { tipoBase: 'Inicial' }, tipos).descricao).toBe('Inicial');
  });

  it('sem tipo, ou tipo que o tribunal não tem: pendência', () => {
    expect(tipoDoItem(p(), topo({ tipoBase: '' }), {}, tipos).pendencia).toBe('Escolha o tipo de audiência.');
    expect(tipoDoItem(p(), topo(), {}, [{ id: 1, descricao: 'Instrução' }]).pendencia).toBe('"Conciliação em Conhecimento" não existe neste tribunal.');
  });
});

describe('mover e mesclar', () => {
  it('moverItem e destino do arraste', () => {
    expect(moverItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moverItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moverItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
    expect(destinoDoArraste(0, 2, 'depois')).toBe(2); // a → depois de c: b, c, a
    expect(destinoDoArraste(0, 2, 'antes')).toBe(1);
    expect(destinoDoArraste(3, 0, 'antes')).toBe(0);
    expect(destinoDoArraste(3, 1, 'depois')).toBe(2);
  });

  it('Continuar de novo: mantém posição e ajustes, novos no fim, quem saiu sai; intervalos ficam', () => {
    const atuais: ItemLote[] = [proc(N[2]!, { duracao: 30 }), { tipo: 'intervalo', chave: 'intervalo-1', duracao: 20 }, proc(N[0]!)];
    expect(mesclarItens(atuais, [N[0]!, N[1]!, N[3]!])).toEqual([atuais[1], proc(N[0]!), proc(N[1]!), proc(N[3]!)]);
    expect(novoIntervalo(atuais, 10)).toEqual({ tipo: 'intervalo', chave: 'intervalo-2', duracao: 10 });
  });
});

describe('rascunho (D18) e topo lembrado (D56)', () => {
  const valido = {
    versao: 1,
    idOrgao: 174,
    salvoEm: '2026-10-28T09:30:00.000Z',
    hash: 'AUD-7K3Q9F2M',
    topo: topo({ inicio: '13:00' }),
    itens: [proc(N[0]!, { duracao: 30, inicio: '13:20', gigs: { opcao: 'outro', texto: 'Lote {hash}', prazo: 0 } }), { tipo: 'intervalo', chave: 'intervalo-1', duracao: 15 }],
  };

  it('ida e volta', () => {
    expect(lerRascunho(JSON.parse(JSON.stringify(valido)), 174)).toEqual(valido);
  });

  it('outro órgão, outra versão ou sem processo: nada a retomar', () => {
    expect(lerRascunho(valido, 49)).toBeNull();
    expect(lerRascunho({ ...valido, versao: 2 }, 174)).toBeNull();
    expect(lerRascunho({ ...valido, itens: [valido.itens[1]] }, 174)).toBeNull();
    expect(lerRascunho('lixo', 174)).toBeNull();
  });

  it('dado inválido é descartado ou volta ao padrão', () => {
    const r = lerRascunho(
      {
        ...valido,
        topo: { ...valido.topo, duracao: -5, inicio: '25:00', tipoBase: 'Inexistente', intervalo: { duracao: 10, aCada: 99 } },
        itens: [proc(N[0]!, { duracao: 0, tipoBase: 'Instrução', inicio: 'x' }), proc('não é número'), proc(N[0]!), { tipo: 'intervalo', chave: 'i', duracao: 9999 }],
      },
      174,
    )!;
    expect([r.topo.duracao, r.topo.inicio, r.topo.tipoBase, r.topo.intervalo.aCada]).toEqual([10, '09:00', '', 0]);
    expect(r.itens).toEqual([proc(N[0]!, { tipoBase: 'Instrução' })]);
  });

  it('topo lembrado sem nada salvo: o padrão da D56', () => {
    expect(normalizarTopo(undefined)).toEqual(TOPO_PADRAO);
    expect(TOPO_PADRAO).toMatchObject({ inicio: '09:00', duracao: 10, intervalo: { duracao: 10, aCada: 0 }, tipoBase: '', data: '' });
  });
});
