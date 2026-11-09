// @vitest-environment happy-dom
// A Pauta (3.2) com um PJe falso e um IntersectionObserver falso (o teste diz quais dias estão
// perto da tela): a leitura (entrega 1, D95) e o "+" e o "×" (entrega 2, D98). Números de processo e
// nomes fictícios.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { opcoesPadrao, type OrgaoConhecido } from '../src/config/opcoes';
import type { Armazenamento } from '../src/ext/api';
import { ControlePauta } from '../src/pauta/ControlePauta';
import { leitorDoPje, type FocoPauta } from '../src/pauta/estadoPauta';
import { lerAmbiente } from '../src/pje/ambiente';
import { DESCRICOES_CONHECIDAS } from '../src/regras/tipos';
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

/** A pauta de cada sala em cada dia; o que não estiver aqui é dia sem nada. Refeita a cada teste (o "×" real a muda). */
const pautaInicial = (): Record<string, object[]> => ({
  [`503|${D1}`]: [audiencia(11, '09:00', 'Conciliação em Conhecimento por videoconferência', 174, true), vaga('09:10')],
  [`504|${D1}`]: [audiencia(12, '08:30', 'Conciliação em Conhecimento', 174)],
  // O 14 tem audiência no CEJUSC, mas tramita na 1ª VT: não dá para cancelar (D27).
  [`503|${D2}`]: [audiencia(13, '14:00', 'Instrução', 174), audiencia(14, '15:00', 'Instrução', 49)],
  [`162|${D1}`]: [audiencia(21, '10:00', 'Inicial', 49)],
  // Um sábado com audiência (D90: o fim de semana com algo aparece).
  ['503|2026-11-14']: [audiencia(15, '09:00', 'Conciliação', 174)],
});
let PAUTA = pautaInicial();

/**
 * O mês da sala como o PJe respondeu na prova técnica de 06/11/2026: um item por dia, `{ dia, tipo }`.
 * Aqui: "C" com audiência, "V" só com vaga, "Z" fim de semana com audiência, "F" feriado ou fim de
 * semana, "S" sem nada.
 */
function mesDaSala(idSala: string, ano: number, mes: number) {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return Array.from({ length: ultimo }, (_, i) => {
    const dia = `${ano}-${String(mes).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
    const fds = [0, 6].includes(new Date(`${dia}T12:00:00Z`).getUTCDay());
    const itens = PAUTA[`${idSala}|${dia}`];
    if (itens) return { dia: i + 1, tipo: itens.some((x) => 'idProcesso' in x) ? (fds ? 'Z' : 'C') : 'V' };
    return { dia: i + 1, tipo: fds || dia === D3 ? 'F' : 'S' };
  });
}

// O "+" (D89d). Números fictícios com o dígito verificador certo: o 101 não tem audiência, o 102 já
// tem uma no órgão (vira redesignação, D32) e o 109 tramita na 1ª VT (D27).
const N101 = '0000101-52.2026.5.09.0001';
const N102 = '0000102-37.2026.5.09.0001';
const N109 = '0000109-13.2026.5.09.0071';
const NUMEROS: Record<string, number> = { [N101]: 101, [N102]: 102, [N109]: 109 };
const processoFalso = (id: number, numero: string, orgao: { id: number; descricao: string }) => ({
  id,
  numero,
  classeJudicial: { sigla: 'ATOrd' },
  orgaoJulgador: orgao,
  juizoDigital: false,
  faseProcessual: 'CONHECIMENTO',
});
const CEJUSC = { id: 174, descricao: 'CEJUSC - JT - CASCAVEL' };
const PROCESSOS: Record<number, object> = {
  101: processoFalso(101, N101, CEJUSC),
  102: processoFalso(102, N102, CEJUSC),
  109: processoFalso(109, N109, { id: 49, descricao: '01ª VARA DO TRABALHO DE CASCAVEL' }),
};
const AUDIENCIA_DO_102 = {
  id: 7020,
  dataInicio: '2026-11-20T10:00:00',
  status: 'Designada',
  tipo: { id: 6, descricao: 'Instrução' },
  salaFisica: { id: 504, nome: 'Sala 02 Cejusc-CSC', orgaoJulgador: CEJUSC },
};

let perfisFalham = false;
let mesFalha = false;
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
    if (u.pathname.endsWith('/pautasaudiencias/classificacoes')) {
      if (mesFalha) return new Response('', { status: 500 });
      const p = (k: string) => u.searchParams.get(k) ?? '';
      return json(mesDaSala(p('idSala'), Number(p('ano')), Number(p('mes'))));
    }
    if (u.pathname.endsWith('/classificacoes/dia')) {
      const dia = u.searchParams.get('data');
      const itens = PAUTA[`${u.searchParams.get('idSalaAudiencia')}|${dia}`];
      return json(itens ? { dia, pautasDoDia: itens } : { dia });
    }
    if (/\/processos\/id\/\d+\/partes$/.test(u.pathname)) return json(partes);
    // D99: as sugestões do número (a busca do painel), na forma confirmada em 09/11/2026; o 101 vem
    // em dois agrupamentos.
    if (u.pathname.endsWith('/agrupamentotarefas/processos')) {
      const prefixo = u.searchParams.get('numero') ?? '';
      const achados = Object.entries(NUMEROS).filter(([n]) => n.startsWith(prefixo));
      return json(achados.flatMap(([n, id]) => [8, ...(id === 101 ? [9] : [])].map((g) => ({ idAgrupamentoProcesso: g, idProcesso: id, numeroProcessoCompleto: n }))));
    }
    // O "+" (D89d): a busca por número, o processo, as audiências dele e os tipos.
    if (u.pathname.endsWith('/processos') && u.searchParams.has('numero')) {
      const id = NUMEROS[u.searchParams.get('numero') ?? ''];
      return id ? json(id) : new Response('', { status: 200 });
    }
    const audiencias = /\/processos\/id\/(\d+)\/audiencias$/.exec(u.pathname);
    if (audiencias) return json(audiencias[1] === '102' ? [AUDIENCIA_DO_102] : []);
    if (u.pathname.endsWith('/dominio/tiposaudiencias')) return json(DESCRICOES_CONHECIDAS.map((descricao, i) => ({ id: i + 1, descricao })));
    // O prazo do GIGS (leitura, também na simulação).
    if (u.pathname.includes('/atividade/retorna-prazo/')) return json({ DATA: '2026-11-10T00:00:00' });
    const processo = /\/processos\/id\/(\d+)$/.exec(u.pathname);
    if (processo && PROCESSOS[Number(processo[1])]) return json(PROCESSOS[Number(processo[1])]);
    // D94: o processo 12 está em segredo de justiça; o 11 é 100% Digital.
    if (processo) return json({ id: Number(processo[1]), segredoDeJustica: processo[1] === '12', juizoDigital: processo[1] === '11' });
    // O "×" real (D89e): o PJe tira a audiência da pauta.
    if (u.pathname.endsWith('/audiencias/cancelamento') && init?.method === 'PATCH') {
      const [id] = JSON.parse(String(init.body)) as number[];
      for (const chave of Object.keys(PAUTA)) PAUTA[chave] = PAUTA[chave]!.filter((x) => (x as { pautaAudienciaHorario?: { id?: number } }).pautaAudienciaHorario?.id !== id);
      return json({ pautasProcessadas: [{ id, status: 'Designada', designada: false }] });
    }
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
  PAUTA = pautaInicial();
  perfisFalham = false;
  mesFalha = false;
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

async function abrir(o: { armazenamento?: Armazenamento; foco?: FocoPauta; ocultos?: number[]; meses?: number; real?: boolean } = {}) {
  const conhecidos: OrgaoConhecido[][] = [];
  const pauta = new ControlePauta(ambiente, '3.2.0', o.armazenamento ?? memoria(), (lista) => conhecidos.push(lista), {
    ler: leitorDoPje(ambiente),
    hoje: HOJE,
  });
  const opcoes = opcoesPadrao(true);
  // Na versão de desenvolvimento, a simulação vem ligada (D39); `real` a desliga.
  if (o.real) opcoes.simulacao = false;
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
    expect(d1).toContain('Vaga livre · Conciliação');
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

  it('"Todas as salas" (D95): a pauta de cada sala, junta pela hora, com vagas, partes e a sala em cada linha', async () => {
    const { raiz, mostrar, escolher, dia, opcoesDe } = await abrir();
    expect(await opcoesDe('pauta-sala')).toEqual(['Sala 01 Cejusc-CSC', 'Sala 02 Cejusc-CSC', 'Todas as salas']);
    await mostrar([D1, '2026-11-12']);
    await escolher('pauta-sala', 'todas');
    await vi.waitFor(() => expect(dia(D1).textContent).toContain('2 audiências · 1 vaga livre'));
    const linhas = [...dia(D1).querySelectorAll('tr')].map((tr) => tr.textContent ?? '');
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatch(/08:30.*Sala 02 Cejusc-CSC.*AUTOR 12/);
    expect(linhas[1]).toMatch(/09:00.*Sala 01 Cejusc-CSC.*AUTOR 11.*100% Digital/);
    expect(linhas[2]).toMatch(/09:10.*Sala 01 Cejusc-CSC.*Vaga livre/);
    // D96, D97: o "(?)" dos advogados, como na sala; sem "Carregar partes" e sem o AUD4.
    expect(dia(D1).querySelector('.botao-ajuda')).not.toBeNull();
    expect(raiz.textContent).not.toContain('Carregar partes');
    expect(lidos.some((l) => l.includes('/audpje/pautas'))).toBe(false);
    expect(leiturasDoDia().filter((l) => l.endsWith(D1)).map((l) => /idSalaAudiencia=(\d+)/.exec(l)![1]).sort()).toEqual(['503', '504']);
    await vi.waitFor(() => expect(dia('2026-11-12').textContent).toContain('Não há audiências nem vagas configuradas em nenhuma sala neste dia'));
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
    // Sem o mês, todo dia útil é consultado: o pior caso para a fila.
    mesFalha = true;
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
    await vi.waitFor(() => expect(lidos.some((l) => l.includes('classificacoes?idSala=300'))).toBe(true));
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

describe('a janela da Pauta', () => {
  // Regressão do teste de 06/11/2026: o estilo da janela estava no componente do diagnóstico, que só
  // entra quando é aberto; sem ele, a Pauta ia para o fim da página, atrás do PJe.
  it('o CSS da janela (tela cheia, fixa, por cima) entra no Shadow DOM sem abrir o diagnóstico', async () => {
    const { raiz } = await abrir();
    const css = [...raiz.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
    expect(css).toMatch(/\.pauta-fundo\s*\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/\.pauta-fundo\s*\{[^}]*z-index:\s*2147483647/);
    expect(css).toMatch(/\.pauta-janela\s*\{[^}]*position:\s*absolute/);
    expect(raiz.textContent).not.toContain('AudAid · Pauta · diagnóstico');
  });

  // O mesmo para os diálogos: o CSS comum ao "+" e ao "×" estava no do "+"; abrir o "×" antes ficava sem ele.
  it('o CSS comum aos diálogos do "+" e do "×" entra sem abrir nenhum deles', async () => {
    const { raiz } = await abrir();
    const css = [...raiz.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
    expect(css).toMatch(/\.fundo-acao\s*\{/);
    expect(css).toMatch(/\.janela-acao\s*\{/);
    expect(css).toMatch(/\.faixa-real-acao\s*\{/);
    expect(css).toMatch(/\.botao-fechar-acao\s*\{[^}]*margin-left:\s*auto/);
    expect(raiz.querySelector('.janela-acao')).toBeNull();
  });
});

describe('o mês da sala (D92, prova técnica de 06/11/2026)', () => {
  const leiturasDoMes = () => lidos.filter((l) => l.includes('/pautasaudiencias/classificacoes?'));

  it('o dia "S" (sem pauta) não é consultado; o mês é lido uma vez por sala', async () => {
    const { mostrar, dia } = await abrir();
    await mostrar([D1, '2026-11-12', '2026-11-13']);
    await vi.waitFor(() => expect(dia('2026-11-12').textContent).toContain('Não há audiências nem vagas configuradas'));
    await vi.waitFor(() => expect(dia(D1).textContent).toContain('AUTOR 11'));
    expect(dia('2026-11-13').textContent).toContain('sem pauta');
    expect(leiturasDoDia().map((l) => l.slice(-10))).toEqual([D1]);
    expect(leiturasDoMes()).toEqual(['/pje-comum-api/api/pautasaudiencias/classificacoes?idSala=503&ano=2026&mes=11']);
  });

  it('o feriado ("F") num dia útil é consultado: pode ter audiência a redesignar', async () => {
    const { mostrar } = await abrir();
    await mostrar([D3]);
    await vi.waitFor(() => expect(leiturasDoDia().some((l) => l.endsWith(D3))).toBe(true));
  });

  it('fim de semana com audiência aparece, com o aviso; sem nada, não aparece (D90)', async () => {
    const { mostrar, dia, raiz } = await abrir();
    expect(raiz.querySelector('[data-dia="2026-11-14"]')).toBeNull();
    await mostrar([D1]);
    await vi.waitFor(() => expect(raiz.querySelector('[data-dia="2026-11-14"]')).not.toBeNull());
    expect(raiz.querySelector('[data-dia="2026-11-15"]')).toBeNull();
    await mostrar(['2026-11-14']);
    await vi.waitFor(() => expect(dia('2026-11-14').textContent).toContain('AUTOR 15'));
    expect(dia('2026-11-14').textContent).toContain('sáb, 14/11');
    expect(dia('2026-11-14').textContent).toContain('Sábado: há 1 audiência(s), será necessário redesignar');
  });

  it('sem o mês, consulta todo dia útil e não mostra fim de semana', async () => {
    mesFalha = true;
    const { mostrar, dia, raiz } = await abrir();
    await mostrar(['2026-11-12']);
    await vi.waitFor(() => expect(dia('2026-11-12').textContent).toContain('Não há audiências nem vagas configuradas'));
    expect(leiturasDoDia().some((l) => l.endsWith('2026-11-12'))).toBe(true);
    expect(raiz.querySelector('[data-dia="2026-11-14"]')).toBeNull();
  });
});

describe('o "+" e o "×" no órgão logado (entrega 2, D89b–D89e)', () => {
  // O formulário do Individual olha a data de hoje: fixa em 06/11/2026, antes dos dias da pauta.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T10:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  const botoes = (el: ParentNode, texto: RegExp) => [...el.querySelectorAll<HTMLButtonElement>('button')].filter((b) => texto.test(b.textContent?.trim() ?? ''));
  const janela = (raiz: ShadowRoot) => [...raiz.querySelectorAll<HTMLElement>('.janela-acao')].at(-1)!;
  const mudar = async (el: HTMLSelectElement | HTMLInputElement, valor: string) => {
    el.value = valor;
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
    await nextTick();
  };
  async function buscarProcesso(raiz: ShadowRoot, numero: string) {
    await mudar(janela(raiz).querySelector<HTMLInputElement>('#designar-numero')!, numero);
    janela(raiz).querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  }
  const tipoBase = (j: HTMLElement) => [...j.querySelectorAll('select')].find((s) => s.querySelector('option')?.textContent?.includes('escolha o tipo'))!;
  const escritas = () => vi.mocked(fetch).mock.calls.filter(([, init]) => (init as RequestInit).method !== 'GET');

  async function abrirComVaga(o: { real?: boolean } = {}) {
    const t = await abrir(o);
    await t.mostrar([D1]);
    await vi.waitFor(() => expect(t.dia(D1).querySelector('.botao-mais')).not.toBeNull());
    return t;
  }

  it('"+" da vaga: sala, dia e hora fixos; designa (simulação) pelo formulário do Individual', async () => {
    const { raiz, dia } = await abrirComVaga();
    dia(D1).querySelector<HTMLButtonElement>('.botao-mais')!.click();
    await nextTick();
    expect(janela(raiz).textContent).toContain('Designar · seg, 09/11 · Sala 01 Cejusc-CSC · 09:10');
    expect(janela(raiz).textContent).toContain('SIMULAÇÃO');
    await buscarProcesso(raiz, N101);
    await vi.waitFor(() => expect(janela(raiz).textContent).toContain('Designar audiência'));
    const j = janela(raiz);
    const sala = j.querySelector<HTMLSelectElement>('.grade select')!;
    const data = j.querySelector<HTMLInputElement>('input[type="date"]')!;
    const hora = j.querySelector<HTMLInputElement>('input[type="time"]')!;
    expect([sala.value, sala.disabled, data.value, data.disabled, hora.value, hora.disabled]).toEqual(['503', true, D1, true, '09:10', true]);
    await mudar(tipoBase(j), 'Conciliação');
    const enviar = botoes(j, /^Simular designação$/)[0]!;
    await vi.waitFor(() => expect(enviar.disabled).toBe(false));
    // D99: o "Fechar" na linha da ação, por último (à direita).
    const rodape = j.querySelector('.rodape-form')!;
    expect(rodape.lastElementChild?.textContent?.trim()).toBe('Fechar');
    enviar.click();
    await vi.waitFor(() => expect(j.textContent).toContain('Simulação concluída'));
    expect(j.textContent).toMatch(/"horarioInicial": "09:10"/);
    expect(j.textContent).not.toContain('Recarregar a página');
    expect(escritas()).toEqual([]);
    // D99: executado uma vez, o botão da ação fica desabilitado, e o "Fechar" continua ali.
    expect(enviar.disabled).toBe(true);
    expect(rodape.textContent).toContain('Já executado. Para outra, feche e abra de novo.');
    expect(rodape.lastElementChild?.textContent?.trim()).toBe('Fechar');
    (rodape.lastElementChild as HTMLButtonElement).click();
    await nextTick();
    expect(raiz.querySelector('.janela-acao')).toBeNull();
  });

  it('D99: o campo do número abre com o foco, mascara e sugere pelo PJe; escolher a sugestão já busca', async () => {
    const { raiz, dia } = await abrirComVaga();
    dia(D1).querySelector<HTMLButtonElement>('.botao-mais')!.click();
    await nextTick();
    const campo = janela(raiz).querySelector<HTMLInputElement>('#designar-numero')!;
    expect(raiz.activeElement).toBe(campo);
    await mudar(campo, '101-');
    expect(campo.value).toBe('0000101-');
    // O 101 vem em dois agrupamentos e aparece uma vez só.
    await vi.waitFor(() => expect(janela(raiz).querySelectorAll('.lista-sugestoes li')).toHaveLength(1));
    expect(lidos).toContain('/pje-comum-api/api/agrupamentotarefas/processos?numero=0000101-');
    expect(janela(raiz).querySelector('.lista-sugestoes li')!.textContent?.trim()).toBe(N101);
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    await vi.waitFor(() => expect(janela(raiz).textContent).toContain('Designar audiência'));
    expect(campo.value).toBe(N101);
    expect(janela(raiz).querySelector('.lista-sugestoes')).toBeNull();
  });

  it('D99: o "+ Designar" do dia também abre com o foco no número; colar o número inteiro não pede sugestão', async () => {
    const { raiz, dia } = await abrirComVaga();
    botoes(dia(D1), /^\+ Designar$/)[0]!.click();
    await nextTick();
    const campo = janela(raiz).querySelector<HTMLInputElement>('#designar-numero')!;
    expect(raiz.activeElement).toBe(campo);
    await mudar(campo, `processo ${N102.replace(/\D/g, '')}.`);
    expect(campo.value).toBe(N102);
    await new Promise((r) => setTimeout(r, 400));
    expect(lidos.some((l) => l.includes('agrupamentotarefas'))).toBe(false);
  });

  it('D99: o ícone depois do número copia o número; o "(+)" diz o que é', async () => {
    const escrever = vi.fn(async (_texto: string) => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: escrever } });
    const { dia } = await abrirComVaga();
    const linha = [...dia(D1).querySelectorAll('tr')].find((tr) => tr.textContent?.includes('AUTOR 11'))!;
    const copiar = linha.querySelector<HTMLButtonElement>('.botao-copiar')!;
    expect(copiar.title).toBe('Copiar o número');
    expect(copiar.querySelector('svg')).not.toBeNull();
    copiar.click();
    await vi.waitFor(() => expect(copiar.title).toBe('Copiado!'));
    expect(escrever).toHaveBeenCalledWith('0000111-52.2026.5.09.0001');
    const mais = linha.querySelector<HTMLElement>('.mais-partes')!;
    expect(mais.textContent?.trim()).toBe('(+)');
    expect(mais.title).toBe('Há mais partes neste polo. O (?) mostra todas, com os advogados.');
  });

  it('"+" com processo que já tem audiência no órgão: avisa antes que redesigna (D89d, D32)', async () => {
    const { raiz, dia } = await abrirComVaga();
    dia(D1).querySelector<HTMLButtonElement>('.botao-mais')!.click();
    await nextTick();
    await buscarProcesso(raiz, N102);
    await vi.waitFor(() =>
      expect(janela(raiz).textContent).toContain(
        'Este processo já tem audiência em 20/11/2026 10:00 (Instrução, Sala 02 Cejusc-CSC). Ela será redesignada para seg, 09/11, 09:10.',
      ),
    );
    expect(janela(raiz).textContent).toContain('Redesignar audiência');
  });

  it('"+" com processo de outro órgão: não segue, com o motivo (D27)', async () => {
    const { raiz, dia } = await abrirComVaga();
    dia(D1).querySelector<HTMLButtonElement>('.botao-mais')!.click();
    await nextTick();
    await buscarProcesso(raiz, N109);
    await vi.waitFor(() => expect(janela(raiz).textContent).toContain('tramita em outro órgão'));
    expect(janela(raiz).textContent).not.toContain('Designar audiência');
  });

  it('"+" do dia: a hora fica livre; no dia bloqueado, o "+" fica desabilitado (D34)', async () => {
    const { raiz, dia, mostrar } = await abrirComVaga();
    botoes(dia(D1), /^\+ Designar$/)[0]!.click();
    await nextTick();
    expect(janela(raiz).textContent).toContain('Designar · seg, 09/11 · Sala 01 Cejusc-CSC');
    await buscarProcesso(raiz, N101);
    await vi.waitFor(() => expect(janela(raiz).querySelector('input[type="time"]')).not.toBeNull());
    const hora = janela(raiz).querySelector<HTMLInputElement>('input[type="time"]')!;
    expect([hora.value, hora.disabled]).toEqual(['', false]);
    janela(raiz).querySelector<HTMLButtonElement>('.fechar')!.click();
    await nextTick();
    await mostrar([D3]);
    await vi.waitFor(() => expect(botoes(dia(D3), /^\+ Designar$/)[0]!.disabled).toBe(true));
    expect(botoes(dia(D3), /^\+ Designar$/)[0]!.title).toBe('Dia bloqueado: Feriado municipal');
  });

  it('"×" em simulação: confirma, monta o PATCH com [idAudiencia] e lança o GIGS opcional, sem enviar', async () => {
    const { raiz, dia } = await abrirComVaga();
    const linha = [...dia(D1).querySelectorAll('tr')].find((tr) => tr.textContent?.includes('AUTOR 11'))!;
    linha.querySelector<HTMLButtonElement>('.botao-cancelar')!.click();
    await nextTick();
    const j = janela(raiz);
    expect(j.textContent).toContain('Cancelar a audiência de seg, 09/11, 09:00 (Conciliação em Conhecimento por videoconferência) do processo 0000111-52.2026.5.09.0001?');
    expect(j.textContent).toContain('Pode ser necessário despacho ou intimação.');
    // GIGS: a sugestão "Analisar".
    await mudar([...j.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent === 'Analisar'))!, 's1');
    // D99: o "Fechar" está lá desde o começo, por último na linha da ação, e não muda de nome.
    const linhaAcao = botoes(j, /^Simular o cancelamento$/)[0]!.parentElement!;
    expect(linhaAcao.lastElementChild?.textContent?.trim()).toBe('Fechar');
    expect(botoes(j, /^Voltar$/)).toEqual([]);
    botoes(j, /^Simular o cancelamento$/)[0]!.click();
    await vi.waitFor(() => expect(j.textContent).toContain('Simulação concluída'));
    expect(j.textContent).toContain('PATCH https://pje.trt9.jus.br/pje-comum-api/api/pautasaudiencias/audiencias/cancelamento');
    expect(j.textContent).toMatch(/\[\s*9011\s*\]/);
    expect(j.textContent).toContain('Lançar o GIGS');
    expect(escritas()).toEqual([]);
    expect(botoes(j, /^Simular o cancelamento$/)[0]!.disabled).toBe(true);
    expect(linhaAcao.lastElementChild?.textContent?.trim()).toBe('Fechar');
    expect((linhaAcao.lastElementChild as HTMLButtonElement).disabled).toBe(false);
  });

  it('"×" real: cancela, confirma relendo o dia, e a Pauta relê o dia', async () => {
    const { raiz, dia, texto } = await abrirComVaga({ real: true });
    expect(texto()).toContain('o "+" e o "×" gravam no PJe, com confirmação');
    const linha = [...dia(D1).querySelectorAll('tr')].find((tr) => tr.textContent?.includes('AUTOR 11'))!;
    linha.querySelector<HTMLButtonElement>('.botao-cancelar')!.click();
    await nextTick();
    const j = janela(raiz);
    expect(j.textContent).toContain('ENVIO REAL');
    botoes(j, /^Cancelar a audiência no PJe$/)[0]!.click();
    await vi.waitFor(() => expect(j.textContent).toContain('Audiência cancelada.'));
    expect(escritas().map(([url, init]) => `${(init as RequestInit).method} ${new URL(String(url)).pathname} ${String((init as RequestInit).body)}`)).toEqual([
      'PATCH /pje-comum-api/api/pautasaudiencias/audiencias/cancelamento [9011]',
    ]);
    botoes(j, /^Fechar$/)[0]!.click();
    await vi.waitFor(() => expect(dia(D1).textContent).not.toContain('AUTOR 11'));
  });

  it('"×" desabilitado, com o motivo, quando o processo tramita em outro órgão (D27)', async () => {
    const { mostrar, dia } = await abrir();
    await mostrar([D2]);
    await vi.waitFor(() => expect(dia(D2).textContent).toContain('15:00'));
    const linha = [...dia(D2).querySelectorAll('tr')].find((tr) => tr.textContent?.includes('15:00'))!;
    const x = linha.querySelector<HTMLButtonElement>('.botao-cancelar')!;
    expect(x.disabled).toBe(true);
    expect(x.title).toContain('tramita em outro órgão');
  });

  it('em outro órgão: sem "+" nem "×", só leitura', async () => {
    const { raiz, mostrar, escolher, dia, texto } = await abrir();
    await mostrar([D1]);
    await escolher('pauta-orgao', '1 vtcsv');
    await vi.waitFor(() => expect(dia(D1).textContent).toContain('AUTOR 21'));
    expect(texto()).toContain('só leitura: nada é gravado no PJe');
    expect(raiz.querySelector('.botao-mais-dia, .botao-mais, .botao-cancelar')).toBeNull();
  });

  it('em "Todas as salas" (D98): o "+" da vaga e o "×" usam a sala da linha; o "+ Designar" do dia deixa escolher a sala', async () => {
    const { raiz, mostrar, escolher, dia } = await abrir();
    await mostrar([D1]);
    await escolher('pauta-sala', 'todas');
    await vi.waitFor(() => expect(dia(D1).textContent).toContain('2 audiências · 1 vaga livre'));
    dia(D1).querySelector<HTMLButtonElement>('.botao-mais')!.click();
    await nextTick();
    expect(janela(raiz).textContent).toContain('Designar · seg, 09/11 · Sala 01 Cejusc-CSC · 09:10');
    janela(raiz).querySelector<HTMLButtonElement>('.fechar')!.click();
    await nextTick();
    const linha12 = [...dia(D1).querySelectorAll('tr')].find((tr) => tr.textContent?.includes('AUTOR 12'))!;
    linha12.querySelector<HTMLButtonElement>('.botao-cancelar')!.click();
    await nextTick();
    expect(janela(raiz).textContent).toContain('Cancelar audiência · seg, 09/11 · Sala 02 Cejusc-CSC · 08:30');
    janela(raiz).querySelector<HTMLButtonElement>('.fechar')!.click();
    await nextTick();
    botoes(dia(D1), /^\+ Designar$/)[0]!.click();
    await nextTick();
    expect(janela(raiz).textContent).toContain('Designar · seg, 09/11 · escolha a sala no formulário');
    await buscarProcesso(raiz, N101);
    await vi.waitFor(() => expect(janela(raiz).querySelector('.grade select')).not.toBeNull());
    const sala = janela(raiz).querySelector<HTMLSelectElement>('.grade select')!;
    expect(sala.disabled).toBe(false);
    expect([...sala.options].map((o) => o.textContent)).toEqual(['Sala 01 Cejusc-CSC', 'Sala 02 Cejusc-CSC']);
  });
});
