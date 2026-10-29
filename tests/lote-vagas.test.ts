// A pauta do PJe na tela 2 do Lote (rodada 15, src/lote/pauta.ts): horários pelas vagas (D73),
// audiências que já estavam no dia (D74), a sincronização delas com a lista, o rascunho e o que
// mudou entre a tela 2 e a tela 3 (D78). Números de processo fictícios.

import { describe, expect, it } from 'vitest';
import { mudancasDaPauta } from '../src/lote/conferencia';
import {
  calcularPauta,
  lerRascunho,
  mesclarItens,
  montarPautaPje,
  paraHora,
  removerSemRecalcularItens,
  reordenarItens,
  sincronizarFora,
  TOPO_PADRAO,
  type ItemLote,
  type LinhaPauta,
  type Topo,
} from '../src/lote/pauta';
import type { PautaDia } from '../src/pje/api';
import { lerPauta, type EntradaPauta } from '../src/regras/pauta';

const N = ['0000101-52.2026.5.09.0001', '0000102-37.2026.5.09.0001', '0000103-22.2026.5.09.0001', '0000104-07.2026.5.09.0001'];
const topo = (t: Partial<Topo> = {}): Topo => ({ ...TOPO_PADRAO, idSala: 503, data: '2026-11-10', tipoBase: 'Conciliação', ...t });
const proc = (chave: string, ajustes = {}): ItemLote => ({ tipo: 'processo', chave, ajustes });
const fora = (id: number, inicio: string, duracao?: number): ItemLote => ({ tipo: 'fora', chave: `fora-${id}`, idProcesso: id, inicio, ...(duracao ? { duracao } : {}) });
const vaga = (hora: string): EntradaPauta => ({ hora, tipo: 'vaga', descricaoTipo: 'Conciliação' });
const aud = (hora: string, idProcesso: number): EntradaPauta => ({ hora, tipo: 'audiencia', idProcesso, nrProcesso: `nr-${idProcesso}` });
/** "1@09:00", "V@09:20" (vaga), "L@09:20" (deixada livre), "F@10:00" (de fora). */
const desenho = (linhas: LinhaPauta[]) =>
  linhas.map((l) => `${l.tipo === 'processo' ? l.ordem : l.tipo === 'vaga' ? (l.vaga!.deixadaLivre ? 'L' : 'V') : l.tipo === 'fora' ? 'F' : 'I'}@${paraHora(l.inicio)}`);

describe('lerPauta: polos e tipo (D74)', () => {
  it('traz a primeira parte de cada polo, se há mais, e o id do tipo', () => {
    const pauta = {
      dia: '2026-11-10',
      pautasDoDia: [
        {
          idProcesso: 9,
          nrProcesso: 'nr-9',
          tipo: { id: 18, descricao: 'Conciliação em Conhecimento por videoconferência' },
          pautaAudienciaHorario: { id: 1, horaInicial: '10:00:00', horaFinal: '10:10:00' },
          poloAtivo: { nome: 'CARLOS FICTICIO', representaVarios: false },
          poloPassivo: { nome: 'BETA SERVICOS LTDA', representaVarios: true },
        },
        { tipo: { id: 3, descricao: 'Conciliação' }, pautaAudienciaHorario: { horaInicial: '09:00:00', horaFinal: '09:10:00' } },
      ],
    } as PautaDia;
    expect(lerPauta(pauta)).toEqual([
      { hora: '09:00', tipo: 'vaga', idProcesso: undefined, nrProcesso: undefined, descricaoTipo: 'Conciliação', idTipo: 3 },
      {
        hora: '10:00',
        tipo: 'audiencia',
        idProcesso: 9,
        nrProcesso: 'nr-9',
        descricaoTipo: 'Conciliação em Conhecimento por videoconferência',
        idTipo: 18,
        poloAtivo: { nome: 'CARLOS FICTICIO', varios: false },
        poloPassivo: { nome: 'BETA SERVICOS LTDA', varios: true },
      },
    ]);
  });
});

describe('montarPautaPje (D73)', () => {
  it('"pelas vagas" só com vaga livre; as vagas do lote incluem os horários dos processos do lote', () => {
    const entradas = [vaga('09:00'), aud('09:10', 1), aud('09:20', 77), vaga('09:30')];
    const pje = montarPautaPje(entradas, new Map([[1, N[0]!]]), 'vagas', ['09:30', 'lixo']);
    expect(pje.modo).toBe('vagas');
    expect(pje.vagas.map((v) => [paraHora(v.minuto), v.doLote ?? ''])).toEqual([
      ['09:00', ''],
      ['09:10', N[0]],
      ['09:30', ''],
    ]);
    expect(pje.livres.map(paraHora)).toEqual(['09:30']);
    expect(paraHora(pje.ultimo!)).toBe('09:30');
    expect(montarPautaPje(entradas, new Map(), 'sequencia', []).modo).toBe('sequencia');
    // Sem vaga livre (lotada ou sem configuração), não há "pelas vagas".
    expect(montarPautaPje([aud('09:10', 1)], new Map([[1, N[0]!]]), 'vagas', []).modo).toBe('sequencia');
    expect(montarPautaPje([], new Map(), 'vagas', []).ultimo).toBeNull();
  });
});

describe('calcularPauta pelas vagas (D73)', () => {
  const entradas = [vaga('09:00'), vaga('09:10'), vaga('09:20'), aud('09:40', 77)];
  const pje = (livres: string[] = []) => montarPautaPje(entradas, new Map(), 'vagas', livres);
  const itens = [proc(N[0]!), proc(N[1]!), fora(77, '09:40')];

  it('os processos ocupam as vagas na ordem da lista; a que sobra aparece; a de fora fica no horário dela', () => {
    expect(desenho(calcularPauta(itens, topo(), pje()))).toEqual(['1@09:00', '2@09:10', 'V@09:20', 'F@09:40']);
    const linhas = calcularPauta(itens, topo(), pje());
    expect(linhas.filter((l) => l.tipo === 'processo').every((l) => l.naVaga)).toBe(true);
    // Na vaga, a duração vai até o próximo horário do dia.
    expect(linhas.map((l) => l.duracao).slice(0, 2)).toEqual([10, 10]);
  });

  it('"Deixar livre" pula a vaga, e os seguintes descem para a próxima', () => {
    expect(desenho(calcularPauta(itens, topo(), pje(['09:00'])))).toEqual(['L@09:00', '1@09:10', '2@09:20', 'F@09:40']);
  });

  it('"Levar para a vaga" fixa o processo nela; os outros preenchem as restantes', () => {
    const levado = [proc(N[0]!, { inicio: '09:20' }), proc(N[1]!), fora(77, '09:40')];
    expect(desenho(calcularPauta(levado, topo(), pje()))).toEqual(['1@09:00', 'V@09:10', '2@09:20', 'F@09:40']);
    const l = calcularPauta(levado, topo(), pje()).find((x) => x.chave === N[0]);
    expect([l?.ancorado, l?.naVaga]).toEqual([true, true]);
  });

  it('quem passa das vagas segue depois do último horário do dia, com a duração base e o próprio ajuste', () => {
    const muitos = [proc(N[0]!), proc(N[1]!), proc(N[2]!), proc(N[3]!, { duracao: 30 }), fora(77, '09:40')];
    const linhas = calcularPauta(muitos, topo({ duracao: 15 }), pje());
    expect(desenho(linhas)).toEqual(['1@09:00', '2@09:10', '3@09:20', 'F@09:40', '4@09:55']);
    expect(linhas.find((l) => l.chave === N[3])).toMatchObject({ alemDasVagas: true, duracao: 30 });
    expect(linhas.find((l) => l.chave === N[3])?.naVaga).toBeUndefined();
  });

  it('dois processos levados para a mesma vaga: mesmo minuto, vermelho', () => {
    const dois = [proc(N[0]!, { inicio: '09:10' }), proc(N[1]!, { inicio: '09:10' })];
    expect(calcularPauta(dois, topo(), pje()).filter((l) => l.tipo === 'processo').map((l) => l.sinal)).toEqual(['mesmo-minuto', 'mesmo-minuto']);
  });

  it('os intervalos manuais não valem neste modo', () => {
    const comIntervalo: ItemLote[] = [proc(N[0]!), { tipo: 'intervalo', chave: 'intervalo-1', duracao: 30 }, proc(N[1]!)];
    expect(desenho(calcularPauta(comIntervalo, topo({ intervalo: { duracao: 10, aCada: 1 } }), pje()))).toEqual(['1@09:00', '2@09:10', 'V@09:20']);
  });
});

describe('audiências de fora em sequência (D74)', () => {
  it('ficam no horário delas; os seguintes contam do fim delas; nunca puxam a conta para trás', () => {
    expect(desenho(calcularPauta([proc(N[0]!), fora(77, '09:10'), proc(N[1]!)], topo()))).toEqual(['1@09:00', 'F@09:10', '2@09:20']);
    expect(desenho(calcularPauta([proc(N[0]!), fora(77, '09:10', 30), proc(N[1]!)], topo()))).toEqual(['1@09:00', 'F@09:10', '2@09:40']);
    // Uma de fora antes do início do topo não muda o começo da pauta.
    expect(desenho(calcularPauta([fora(77, '08:30'), proc(N[0]!), proc(N[1]!)], topo()))).toEqual(['F@08:30', '1@09:00', '2@09:10']);
  });

  it('sincronizar: entra antes do primeiro item que chegaria ao horário dela; sem mudança, a mesma lista', () => {
    const base = [proc(N[0]!), proc(N[1]!), proc(N[2]!)];
    const com = sincronizarFora(base, [{ idProcesso: 77, hora: '09:15' }], topo());
    expect(com.map((i) => i.chave)).toEqual([N[0], 'fora-77', N[1], N[2]]);
    expect(desenho(calcularPauta(com, topo()))).toEqual(['1@09:00', 'F@09:15', '2@09:25', '3@09:35']);
    expect(sincronizarFora(com, [{ idProcesso: 77, hora: '09:15' }], topo())).toBe(com);
    // Depois de tudo: vai para o fim.
    expect(sincronizarFora(base, [{ idProcesso: 78, hora: '13:00' }], topo()).map((i) => i.chave)).toEqual([N[0], N[1], N[2], 'fora-78']);
  });

  it('sincronizar: a que continua fica onde o usuário a deixou; a que saiu sai; a que mudou de horário é recolocada', () => {
    const arrumada = [fora(77, '09:15', 20), proc(N[0]!), proc(N[1]!)];
    expect(sincronizarFora(arrumada, [{ idProcesso: 77, hora: '09:15' }], topo())).toBe(arrumada);
    expect(sincronizarFora(arrumada, [], topo()).map((i) => i.chave)).toEqual([N[0], N[1]]);
    expect(sincronizarFora(arrumada, [{ idProcesso: 77, hora: '13:00' }], topo())).toEqual([proc(N[0]!), proc(N[1]!), fora(77, '13:00')]);
  });

  it('mesclar mantém as de fora; o Auto organizar as deixa com o mesmo número de processos antes', () => {
    const itens = [proc(N[0]!), fora(77, '09:10'), proc(N[1]!)];
    expect(mesclarItens(itens, [N[1]!, N[2]!]).map((i) => i.chave)).toEqual(['fora-77', N[1], N[2]]);
    expect(reordenarItens(itens, [N[1]!, N[0]!]).map((i) => i.chave)).toEqual([N[1], 'fora-77', N[0]]);
  });

  it('"Remover sem recalcular" não prende a de fora que vem depois (ela já está presa ao horário)', () => {
    expect(removerSemRecalcularItens([proc(N[0]!), fora(77, '09:10')], N[0]!, '09:10')).toEqual([fora(77, '09:10')]);
  });
});

describe('rascunho (D18) com a pauta do PJe', () => {
  it('lê o modo de horários e as vagas deixadas livres; ignora o que vier inválido', () => {
    const base = { versao: 1, idOrgao: 174, salvoEm: '2026-10-29T10:00:00Z', hash: 'AUD-7K3Q9F2M', topo: {}, itens: [proc(N[0]!), fora(77, '09:10')] };
    const r = lerRascunho({ ...base, horarios: 'sequencia', vagasLivres: ['09:00', 'lixo', '09:00'] }, 174)!;
    expect(r.horarios).toBe('sequencia');
    expect(r.vagasLivres).toEqual(['09:00']);
    expect(r.itens.map((i) => i.chave)).toEqual([N[0]]); // a de fora vem da pauta, nunca do rascunho
    const antigo = lerRascunho(base, 174)!;
    expect([antigo.horarios, antigo.vagasLivres]).toEqual([undefined, undefined]);
    expect(lerRascunho({ ...base, horarios: 'outro' }, 174)!.horarios).toBeUndefined();
  });
});

describe('o que mudou na pauta entre a tela 2 e a tela 3 (D78)', () => {
  it('entrou, saiu, mudou de horário, vaga ocupada e vaga nova', () => {
    const antes = [vaga('09:00'), vaga('09:10'), aud('09:20', 7), aud('09:30', 8)];
    const depois = [aud('09:00', 9), vaga('09:10'), aud('09:40', 7), vaga('10:00')];
    expect(mudancasDaPauta(antes, depois)).toEqual(['entrou nr-9 às 09:00, numa vaga', 'nr-8 saiu das 09:30', 'nr-7 passou das 09:20 para as 09:40', 'vaga nova às 10:00']);
    expect(mudancasDaPauta(antes, [...antes])).toEqual([]);
    expect(mudancasDaPauta([vaga('09:00')], [])).toEqual(['a vaga das 09:00 deixou de existir']);
  });
});
