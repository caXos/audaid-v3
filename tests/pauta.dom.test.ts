// @vitest-environment happy-dom
// A Pauta (3.2, entrega 1), só leitura, com um PJe falso e um IntersectionObserver falso (o teste
// diz quais dias estão perto da tela). Números de processo e nomes fictícios.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { opcoesPadrao, type OrgaoConhecido } from '../src/config/opcoes';
import type { Armazenamento } from '../src/ext/api';
import { ControlePauta } from '../src/pauta/ControlePauta';
import { leitorDoPje, type FocoPauta } from '../src/pauta/estadoPauta';
import { lerAmbiente } from '../src/pje/ambiente';
import partes from './fixtures/partes-ficticias.json';

const ambiente = lerAmbiente('https://pje.trt9.jus.br/pjekz/painel/global/todos/lista-processos')!;
// 09/11/2026 é segunda-feira; 10/11, terça.
const HOJE = '2026-11-09';
const D1 = '2026-11-09';
const D2 = '2026-11-10';
const D3 = '2026-11-11';

function jwt(payload: object): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `cab.${b64}.ass`;
}

const oj = (id: number, sigla: string, codigoOrigem: string) => ({ id, sigla, codigoOrigem });
const SALAS: Record<number, object[]> = {
  174: [
    { id: 503, nome: 'Sala 01 Cejusc-CSC', orgaoJulgador: oj(174, 'CEJUSC-CSC', '3603') },
    { id: 504, nome: 'Sala 02 Cejusc-CSC', orgaoJulgador: oj(174, 'CEJUSC-CSC', '3603') },
  ],
  49: [{ id: 162, nome: 'Sala 1', orgaoJulgador: oj(49, '1 VTCSV', '71') }],
  50: [{ id: 170, nome: 'Sala 1', orgaoJulgador: oj(50, '2 VTCSV', '69') }],
  77: [{ id: 300, nome: 'Sala 1', orgaoJulgador: oj(77, '1 VTFOZ', '30') }],
  63: [],
};
const TRIBUNAL = [
  { idOrgaoJulgador: 77, nomeOrgaoJulgador: '01ª VARA DO TRABALHO DE FOZ DO IGUAÇU', sigla: '1 VTFOZ', nomeMunicipio: 'FOZ DO IGUAÇU' },
  { idOrgaoJulgador: 50, nomeOrgaoJulgador: '02ª VARA DO TRABALHO DE CASCAVEL', sigla: '2 VTCSV', nomeMunicipio: 'CASCAVEL' },
  { idOrgaoJulgador: 49, nomeOrgaoJulgador: '01ª VARA DO TRABALHO DE CASCAVEL', sigla: '1 VTCSV', nomeMunicipio: 'CASCAVEL' },
  { idOrgaoJulgador: 174, nomeOrgaoJulgador: 'CEJUSC - JT - CASCAVEL', sigla: 'CEJUSC-CSC', nomeMunicipio: 'CASCAVEL' },
  { idOrgaoJulgador: 63, nomeOrgaoJulgador: 'DISTRIBUIÇÃO DOS FEITOS DE CASCAVEL', sigla: 'DIST CSC', nomeMunicipio: 'CASCAVEL' },
];

const audiencia = (idProcesso: number, hora: string, tipo: string, orgao: number, juizoDigital = false) => ({
  idProcesso,
  nrProcesso: `00001${idProcesso}-52.2026.5.09.0001`,
  pautaAudienciaHorario: { id: 9000 + idProcesso, horaInicial: `${hora}:00`, horaFinal: `${hora}:00` },
  tipo: { id: 3, descricao: tipo },
  poloAtivo: { nome: `AUTOR ${idProcesso}`, representaVarios: idProcesso === 11 },
  poloPassivo: { nome: `EMPRESA ${idProcesso} LTDA` },
  segredoJustica: idProcesso === 13,
  processo: { id: idProcesso, juizoDigital, orgaoJulgador: { id: orgao } },
});
const vaga = (hora: string) => ({ pautaAudienciaHorario: { horaInicial: `${hora}:00`, horaFinal: `${hora}:00` }, tipo: { id: 3, descricao: 'Conciliação' } });

/** A pauta de cada sala em cada dia; o que não estiver aqui é dia sem nada. */
const PAUTA: Record<string, object[]> = {
  [`503|${D1}`]: [audiencia(11, '09:00', 'Conciliação em Conhecimento por videoconferência', 174, true), vaga('09:10')],
  [`504|${D1}`]: [audiencia(12, '08:30', 'Conciliação em Conhecimento', 174)],
  [`503|${D2}`]: [audiencia(13, '14:00', 'Instrução', 174)],
  [`162|${D1}`]: [audiencia(21, '10:00', 'Inicial', 49)],
};

let perfisFalham = false;
const lidos: string[] = [];
let ativas = 0;
let maximoAtivas = 0;

async function responder(url: string, init?: RequestInit): Promise<Response> {
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
  const u = new URL(url);
  lidos.push(u.pathname + u.search);
  ativas++;
  maximoAtivas = Math.max(maximoAtivas, ativas);
  try {
    await new Promise((r) => setTimeout(r, 1));
    if (u.pathname.startsWith('/audapi/') && !(init?.headers as Record<string, string>)['Authorization']) return new Response('', { status: 401 });
    if (u.pathname.endsWith('/token/perfis')) {
      if (perfisFalham) return new Response('', { status: 500 });
      return json([174, 77, 49, 63, 50, 174].map((id) => ({ idOrgaoJulgador: id })));
    }
    if (u.pathname.endsWith('/audpje/oj')) return json(TRIBUNAL);
    if (u.pathname.endsWith('/salasaudiencias')) return json(SALAS[Number(u.searchParams.get('idOrgaoJulgador'))] ?? []);
    if (u.pathname.endsWith('/calendarioeventos')) {
      return json([{ id: 1, descricao: 'Feriado municipal', dataInicio: D3, dataFim: D3, feriado: true, suspendeAudiencia: true }]);
    }
    if (u.pathname.endsWith('/classificacoes/dia')) {
      const dia = u.searchParams.get('data');
      const itens = PAUTA[`${u.searchParams.get('idSalaAudiencia')}|${dia}`];
      return json(itens ? { dia, pautasDoDia: itens } : { dia });
    }
    if (/\/processos\/id\/\d+\/partes$/.test(u.pathname)) return json(partes);
    return new Response('não encontrado', { status: 404 });
  } finally {
    ativas--;
  }
}

/** O IntersectionObserver falso: `mostrar` diz quais dias estão perto da tela. */
class ObservadorFalso {
  static atual: ObservadorFalso | null = null;
  readonly observados = new Set<Element>();
  constructor(private readonly callback: IntersectionObserverCallback) {
    ObservadorFalso.atual = this;
  }
  observe(el: Element) {
    this.observados.add(el);
  }
  unobserve(el: Element) {
    this.observados.delete(el);
  }
  disconnect() {
    this.observados.clear();
  }
  mostrar(dias: string[]) {
    const entradas = [...this.observados].map((el) => ({ target: el, isIntersecting: dias.includes((el as HTMLElement).dataset['dia'] ?? '') }));
    this.callback(entradas as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

function memoria(): Armazenamento & { dados: Map<string, unknown> } {
  const dados = new Map<string, unknown>();
  return { dados, ler: async (c) => dados.get(c), gravar: async (c, v) => void dados.set(c, v), remover: async (c) => void dados.delete(c) };
}

beforeEach(() => {
  perfisFalham = false;
  lidos.length = 0;
  ativas = 0;
  maximoAtivas = 0;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => `Xsrf-Token=XYZ; access_token=${jwt({ exp: 4102444800, orgaoJulgador: { id: 174, descricao: 'CEJUSC - JT - CASCAVEL' } })}`,
  });
  vi.stubGlobal('fetch', vi.fn(responder));
  vi.stubGlobal('IntersectionObserver', ObservadorFalso);
  document.body.replaceChildren();
});

afterEach(() => vi.unstubAllGlobals());

async function abrir(o: { armazenamento?: Armazenamento; foco?: FocoPauta; ocultos?: number[]; meses?: number } = {}) {
  const conhecidos: OrgaoConhecido[][] = [];
  const pauta = new ControlePauta(ambiente, '3.2.0', o.armazenamento ?? memoria(), (lista) => conhecidos.push(lista), {
    ler: leitorDoPje(ambiente),
    hoje: HOJE,
  });
  const opcoes = opcoesPadrao(true);
  opcoes.pauta.ocultos = o.ocultos ?? [];
  if (o.meses) opcoes.pauta.mesesAFrente = o.meses;
  pauta.abrir(opcoes, o.foco);
  const raiz = document.getElementById('audaid-v3-pauta')!.shadowRoot!;
  const texto = () => raiz.textContent ?? '';
  const dia = (d: string) => raiz.querySelector<HTMLElement>(`[data-dia="${d}"]`)!;
  const mostrar = async (dias: string[]) => {
    ObservadorFalso.atual!.mostrar(dias);
    await nextTick();
  };
  /** As opções de uma combobox: foca, lê a lista e fecha. */
  const opcoesDe = async (id: string) => {
    const campo = raiz.querySelector<HTMLInputElement>(`#${id}`)!;
    campo.dispatchEvent(new Event('focus'));
    await nextTick();
    const itens = [...raiz.querySelectorAll(`#${id}-lista li`)].map((li) => li.querySelector('.rotulo-opcao')?.textContent ?? '');
    campo.dispatchEvent(new Event('blur'));
    await nextTick();
    return itens;
  };
  /** Escolhe numa combobox digitando e apertando Enter. */
  const escolher = async (id: string, digitado: string) => {
    const campo = raiz.querySelector<HTMLInputElement>(`#${id}`)!;
    campo.dispatchEvent(new Event('focus'));
    await nextTick();
    campo.value = digitado;
    campo.dispatchEvent(new Event('input'));
    await nextTick();
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await nextTick();
  };
  await vi.waitFor(() => expect(raiz.querySelector('[data-dia]')).not.toBeNull());
  return { pauta, raiz, texto, dia, mostrar, opcoesDe, escolher, conhecidos };
}

const leiturasDoDia = () => lidos.filter((l) => l.includes('/classificacoes/dia'));

describe('Pauta (3.2, entrega 1)', () => {
  it('órgãos: o logado primeiro, os outros por cidade e número; sem sala fica de fora (D87b)', async () => {
    const { opcoesDe, conhecidos } = await abrir();
    expect(await opcoesDe('pauta-orgao')).toEqual(['CEJUSC-CSC · 3603', '1 VTCSV · 0071', '2 VTCSV · 0069', '1 VTFOZ · 0030']);
    expect(conhecidos.at(-1)!.map((o) => o.rotulo)).toEqual(['CEJUSC-CSC · 3603', '1 VTCSV · 0071', '2 VTCSV · 0069', '1 VTFOZ · 0030']);
    expect(conhecidos.at(-1)![1]!.nome).toBe('01ª VARA DO TRABALHO DE CASCAVEL');
  });

  it('órgão oculto nas Opções não aparece; o logado, nem oculto, some (D87)', async () => {
    const { opcoesDe } = await abrir({ ocultos: [49, 174] });
    expect(await opcoesDe('pauta-orgao')).toEqual(['CEJUSC-CSC · 3603', '2 VTCSV · 0069', '1 VTFOZ · 0030']);
    expect(lidos.some((l) => l.includes('idOrgaoJulgador=49'))).toBe(false);
  });

  it('só lê os dias perto da tela, e cada um uma vez só (D92)', async () => {
    const { mostrar } = await abrir();
    expect(leiturasDoDia()).toEqual([]);
    await mostrar([D1, D2]);
    await vi.waitFor(() => expect(leiturasDoDia()).toHaveLength(2));
    expect(leiturasDoDia().every((l) => l.includes('idSalaAudiencia=503'))).toBe(true);
    await mostrar([D1, D2]);
    await new Promise((r) => setTimeout(r, 20));
    expect(leiturasDoDia()).toHaveLength(2);
  });

  it('mostra audiências, vagas e o dia sem nada, com a contagem no cabeçalho', async () => {
    const { mostrar, dia } = await abrir();
    await mostrar([D1, D2, '2026-11-12']);
    await vi.waitFor(() => expect(dia(D1).textContent).toContain('1 audiência · 1 vaga livre'));
    const d1 = dia(D1).textContent ?? '';
    expect(d1).toContain('seg, 09/11');
    expect(d1).toContain('09:00');
    expect(d1).toContain('AUTOR 11 (+) × EMPRESA 11 LTDA');
    expect(d1).toContain('100% Digital');
    expect(d1).toContain('Vaga livre');
    expect(dia(D1).querySelector('a')!.getAttribute('href')).toBe('https://pje.trt9.jus.br/pjekz/processo/11/detalhe');
    await vi.waitFor(() => expect(dia('2026-11-12').textContent).toContain('Não há audiências nem vagas configuradas para esta sala neste dia'));
    // Segredo de justiça: sem os nomes.
    expect(dia(D2).textContent).toContain('Segredo de justiça');
    expect(dia(D2).textContent).not.toContain('AUTOR 13');
  });

  it('o feriado do calendário do órgão aparece no cabeçalho do dia (D34)', async () => {
    const { mostrar, dia } = await abrir();
    await mostrar([D3]);
    await vi.waitFor(() => expect(dia(D3).textContent).toContain('Feriado municipal'));
  });

  it('em outro órgão, o selo "só consulta" e a pauta da sala dele (D89, D90)', async () => {
    const { raiz, mostrar, escolher, dia } = await abrir();
    const selo = () => raiz.querySelector('.selo-consulta')!;
    expect(selo().classList.contains('oculto')).toBe(true);
    await mostrar([D1]);
    await escolher('pauta-orgao', '1 vtcsv');
    expect(selo().classList.contains('oculto')).toBe(false);
    await vi.waitFor(() => expect(dia(D1).textContent).toContain('AUTOR 21'));
    expect(leiturasDoDia().some((l) => l.includes('idSalaAudiencia=162'))).toBe(true);
  });

  it('"Todas as salas" junta as salas pela hora, com o nome de cada uma', async () => {
    const { mostrar, escolher, dia } = await abrir();
    await mostrar([D1]);
    await escolher('pauta-sala', 'todas');
    await vi.waitFor(() => expect(dia(D1).textContent).toContain('2 audiências · 1 vaga livre'));
    const linhas = [...dia(D1).querySelectorAll('tr')].map((tr) => tr.textContent ?? '');
    expect(linhas[0]).toContain('08:30');
    expect(linhas[0]).toContain('Sala 02 Cejusc-CSC');
    expect(linhas[1]).toContain('09:00');
    expect(linhas[1]).toContain('Sala 01 Cejusc-CSC');
  });

  it('os advogados só são lidos quando pedidos, no "(?)" (D61, D92)', async () => {
    const { mostrar, dia } = await abrir();
    await mostrar([D1]);
    await vi.waitFor(() => expect(dia(D1).querySelector('.botao-ajuda')).not.toBeNull());
    expect(lidos.some((l) => l.endsWith('/partes'))).toBe(false);
    const ajuda = dia(D1).querySelector<HTMLButtonElement>('.botao-ajuda')!;
    ajuda.dispatchEvent(new Event('mouseenter'));
    await vi.waitFor(() => expect(ajuda.getAttribute('title')).not.toMatch(/consultar|Consultando/));
    expect(lidos.filter((l) => l.endsWith('/partes'))).toEqual(['/pje-comum-api/api/processos/id/11/partes']);
    expect(ajuda.getAttribute('title')).toContain(':');
  });

  it('nunca mais de 4 consultas ao mesmo tempo (D92)', async () => {
    const { mostrar } = await abrir();
    maximoAtivas = 0;
    await mostrar(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);
    await vi.waitFor(() => expect(leiturasDoDia()).toHaveLength(9));
    expect(maximoAtivas).toBeLessThanOrEqual(4);
  });

  it('"Atualizar" lê de novo os dias perto da tela', async () => {
    const { raiz, mostrar } = await abrir();
    await mostrar([D1]);
    await vi.waitFor(() => expect(leiturasDoDia()).toHaveLength(1));
    [...raiz.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Atualizar')!.click();
    await vi.waitFor(() => expect(leiturasDoDia()).toHaveLength(2));
  });

  it('"Carregar mais um mês" estende o horizonte das Opções (D91)', async () => {
    const { raiz, opcoesDe } = await abrir({ meses: 2 });
    expect(await opcoesDe('pauta-mes')).toEqual(['Novembro 2026', 'Dezembro 2026']);
    [...raiz.querySelectorAll('button')].find((b) => b.textContent?.includes('Carregar mais um mês'))!.click();
    await nextTick();
    expect(await opcoesDe('pauta-mes')).toEqual(['Novembro 2026', 'Dezembro 2026', 'Janeiro 2027']);
    expect(raiz.querySelector('[data-mes="2027-01"]')).not.toBeNull();
  });

  it('lembra a última sala de cada órgão (D90)', async () => {
    const armazenamento = memoria();
    const primeira = await abrir({ armazenamento });
    await primeira.escolher('pauta-sala', 'sala 02');
    await vi.waitFor(() => expect(armazenamento.dados.get('audaid-pauta-salas')).toEqual({ '174': 504 }));
    primeira.pauta.fechar();
    document.body.replaceChildren();
    const segunda = await abrir({ armazenamento });
    await vi.waitFor(() => expect(segunda.raiz.querySelector<HTMLInputElement>('#pauta-sala')!.value).toBe('Sala 02 Cejusc-CSC'));
  });

  it('pelo Individual, abre na sala e no dia da audiência, com ela destacada (D90)', async () => {
    const { raiz, mostrar, dia } = await abrir({ foco: { idSala: 504, dia: D1, idProcesso: 12 } });
    await vi.waitFor(() => expect(raiz.querySelector<HTMLInputElement>('#pauta-sala')!.value).toBe('Sala 02 Cejusc-CSC'));
    await mostrar([D1]);
    await vi.waitFor(() => expect(dia(D1).querySelector('tr.destaque')?.textContent).toContain('08:30'));
  });

  it('o foco além do horizonte faz o horizonte crescer até o mês dele', async () => {
    const { raiz } = await abrir({ meses: 1, foco: { idSala: 503, dia: '2027-02-10', idProcesso: 99 } });
    await vi.waitFor(() => expect(raiz.querySelector('[data-mes="2027-02"]')).not.toBeNull());
  });

  it('sem os perfis, avisa e mostra só o órgão logado', async () => {
    perfisFalham = true;
    const { texto, opcoesDe } = await abrir();
    expect(texto()).toContain('Não foi possível ler os seus perfis no PJe: a Pauta mostra só o órgão logado.');
    expect(await opcoesDe('pauta-orgao')).toEqual(['CEJUSC-CSC · 3603']);
  });

  it('nada é gravado: só GET', async () => {
    const { mostrar, escolher } = await abrir();
    await mostrar([D1, D2]);
    await escolher('pauta-sala', 'todas');
    await escolher('pauta-orgao', 'foz');
    await vi.waitFor(() => expect(leiturasDoDia().some((l) => l.includes('idSalaAudiencia=300'))).toBe(true));
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => (init as RequestInit).method === 'GET')).toBe(true);
  });
});

describe('o diagnóstico dentro da Pauta', () => {
  it('abre por cima e, ao fechar, a lista é a mesma e continua carregando os dias', async () => {
    const { raiz, mostrar, dia } = await abrir();
    const lista = raiz.querySelector('.lista-pauta');
    [...raiz.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Diagnóstico')!.click();
    await vi.waitFor(() => expect(raiz.textContent).toContain('AudAid · Pauta · diagnóstico'));
    [...raiz.querySelectorAll<HTMLButtonElement>('.pauta-janela .fechar')].at(-1)!.click();
    await vi.waitFor(() => expect(raiz.textContent).not.toContain('AudAid · Pauta · diagnóstico'));
    expect(raiz.querySelector('.lista-pauta')).toBe(lista);
    await mostrar([D1]);
    await vi.waitFor(() => expect(dia(D1).textContent).toContain('AUTOR 11'));
  });
});
