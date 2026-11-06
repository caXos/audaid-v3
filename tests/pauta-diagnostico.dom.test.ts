// @vitest-environment happy-dom
// Entrega 0 da 3.2 (D86b): o diagnóstico da Pauta com um PJe falso, e o menu do FAB (D88). Nomes
// fictícios: o teste confere que eles não chegam ao relatório.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { opcoesPadrao } from '../src/config/opcoes';
import { ControlePauta } from '../src/pauta/ControlePauta';
import { lerAmbiente } from '../src/pje/ambiente';
import { Fab } from '../src/ui/fab';
import calendario from './fixtures/calendario-cejusc.json';

const ambiente = lerAmbiente('https://pje.trt9.jus.br/pjekz/painel/global/todos/lista-processos')!;

function jwt(payload: object): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `cab.${b64}.ass`;
}
const TOKEN = jwt({ exp: 4102444800, nome: 'FULANO DE TAL', orgaoJulgador: { id: 174, descricao: 'CEJUSC - JT - CASCAVEL' } });

const SALAS: Record<string, object[]> = {
  '174': [{ id: 503, nome: 'Sala 01 Cejusc-CSC', orgaoJulgador: { id: 174, sigla: 'CEJUSC-CSC', codigoOrigem: '3603', cejusc: true } }],
  '49': [{ id: 162, nome: 'Sala 1', orgaoJulgador: { id: 49, sigla: '1 VTCSV', codigoOrigem: '71', cejusc: false } }],
};
const ORGAO_DA_SALA: Record<string, number> = { '503': 174, '162': 49 };

const pedidos: { caminho: string; bearer: boolean }[] = [];
/** Simula o AUD4 recusando quem não manda o token como Bearer. */
let aud4PedeBearer = true;

function responder(url: string, init?: RequestInit): Response {
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
  const u = new URL(url);
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const bearer = headers['Authorization'] === `Bearer ${TOKEN}`;
  pedidos.push({ caminho: u.pathname + u.search, bearer });

  if (u.pathname.startsWith('/audapi/') && aud4PedeBearer && !bearer) return new Response('', { status: 401 });
  if (u.pathname.endsWith('/token/perfis')) {
    return json([
      { idOrgaoJulgador: 174, papel: { nome: 'Diretor de Secretaria' }, nomeUsuario: 'FULANO DE TAL' },
      { idOrgaoJulgador: 174, papel: { nome: 'Assessor' } },
      { idOrgaoJulgador: 49, papel: { nome: 'Diretor de Secretaria' } },
    ]);
  }
  if (u.pathname.endsWith('/audpje/oj')) {
    return json([
      { idOrgaoJulgador: 49, nomeOrgaoJulgador: '01ª VARA DO TRABALHO DE CASCAVEL', sigla: '1 VTCSV', nomeMunicipio: 'CASCAVEL' },
      { idOrgaoJulgador: 174, nomeOrgaoJulgador: 'CEJUSC - JT - CASCAVEL', sigla: 'CEJUSC-CSC', nomeMunicipio: 'CASCAVEL' },
    ]);
  }
  if (u.pathname.endsWith('/audpje/pautas')) return json([{ idProcesso: 1, nomeParte: 'BELTRANO DA SILVA', dataInicio: '2026-11-10T09:00:00' }]);
  if (u.pathname.endsWith('/salasaudiencias')) return json(SALAS[u.searchParams.get('idOrgaoJulgador') ?? ''] ?? []);
  if (u.pathname.endsWith('/calendarioeventos')) return json(calendario);
  if (u.pathname.endsWith('/pautasaudiencias/classificacoes')) {
    return json(Array.from({ length: 31 }, (_, i) => ({ tipo: i % 7 === 0 ? 'F' : 'U', quantidade: i % 3 })));
  }
  if (u.pathname.endsWith('/classificacoes/dia')) {
    const oj = ORGAO_DA_SALA[u.searchParams.get('idSalaAudiencia') ?? ''];
    return json({
      dia: u.searchParams.get('data'),
      pautasDoDia: [
        {
          idProcesso: 10,
          nrProcesso: '0000101-52.2026.5.09.0001',
          pautaAudienciaHorario: { id: 900, horaInicial: '09:00:00', horaFinal: '09:10:00' },
          poloAtivo: { nome: 'FULANO DE TAL' },
          poloPassivo: { nome: 'EMPRESA FICTICIA LTDA' },
          processo: { id: 10, orgaoJulgador: { id: oj } },
        },
        { pautaAudienciaHorario: { horaInicial: '09:10:00', horaFinal: '09:20:00' }, tipo: { id: 3, descricao: 'Conciliação' } },
      ],
    });
  }
  return new Response('não encontrado', { status: 404 });
}

beforeEach(() => {
  pedidos.length = 0;
  aud4PedeBearer = true;
  Object.defineProperty(document, 'cookie', { configurable: true, get: () => `Xsrf-Token=XYZ; access_token=${TOKEN}` });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => responder(url, init)));
  document.body.replaceChildren();
});

afterEach(() => vi.unstubAllGlobals());

function abrir() {
  const pauta = new ControlePauta(ambiente, '3.2.0');
  pauta.abrir();
  const raiz = document.getElementById('audaid-v3-pauta')!.shadowRoot!;
  const relatorio = () => raiz.querySelector('textarea')?.value ?? '';
  return { pauta, raiz, relatorio };
}

const terminou = (texto: string) => texto.includes('## Outro órgão (49): audiências do órgão');

describe('diagnóstico da Pauta (3.2, entrega 0)', () => {
  it('lê perfis, órgãos, e salas, mês, dias e AUD4 do logado e de outro órgão', async () => {
    const { relatorio, raiz } = abrir();
    await vi.waitFor(() => expect(terminou(relatorio())).toBe(true));
    const r = relatorio();

    expect(r).toContain('órgão logado: 174 · outro órgão: 49');
    expect(r).toContain('2 órgão(s) distinto(s): 174, 49');
    expect(r).toContain('inclui o órgão logado (174): sim');
    expect(r).toContain('órgão 49: 1 VTCSV · cidade: CASCAVEL');
    expect(r).toContain('as salas são deste órgão: sim');
    expect(r).toContain('órgão nas salas: id=174 · sigla=CEJUSC-CSC · codigoOrigem=3603 · cejusc=true');
    expect(r).toContain('órgão nas salas: id=49 · sigla=1 VTCSV · codigoOrigem=71 · cejusc=false');
    expect(r).toMatch(/2 entrada\(s\): 1 audiência\(s\), 1 vaga\(s\) · órgão dos processos: 49 · o mês diz \{ tipo=[FU], quantidade=\d \}/);
    expect(r).toContain('com o token (Bearer): 200');
    // O "outro órgão" vem dos perfis, com o nome do AUD4.
    const select = raiz.querySelector('select')!;
    expect(select.value).toBe('49');
    expect(select.textContent).toContain('49 · 01ª VARA DO TRABALHO DE CASCAVEL');
  });

  it('não leva ao relatório nenhum nome nem token', async () => {
    const { relatorio } = abrir();
    await vi.waitFor(() => expect(terminou(relatorio())).toBe(true));
    const r = relatorio();
    for (const proibido of ['FULANO', 'BELTRANO', 'EMPRESA FICTICIA', '0000101-52', TOKEN, 'XYZ', 'Diretor']) expect(r).not.toContain(proibido);
  });

  it('nada é gravado: só GET, e o Bearer só vai ao AUD4', async () => {
    const { relatorio } = abrir();
    await vi.waitFor(() => expect(terminou(relatorio())).toBe(true));
    const chamadas = vi.mocked(fetch).mock.calls;
    expect(chamadas.every(([, init]) => (init as RequestInit).method === 'GET')).toBe(true);
    expect(pedidos.filter((p) => p.bearer).every((p) => p.caminho.startsWith('/audapi/'))).toBe(true);
  });

  it('sem os perfis, pede o id do outro órgão e roda de novo com ele', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (url.includes('/token/perfis') ? new Response('', { status: 500 }) : responder(url, init))));
    const { raiz, relatorio } = abrir();
    const rodarDeNovo = () => [...raiz.querySelectorAll('button')].find((b) => b.textContent?.includes('Rodar de novo'))!;
    await vi.waitFor(() => {
      expect(relatorio()).toContain('## Órgão logado (174): audiências do órgão');
      expect(rodarDeNovo().disabled).toBe(false);
    });
    expect(relatorio()).toContain('## Perfis do usuário (token/perfis) [ERRO]');
    expect(relatorio()).toContain('outro órgão: nenhum');
    expect(relatorio()).not.toContain('## Outro órgão');

    const campo = raiz.querySelector<HTMLInputElement>('input#outro-orgao')!;
    campo.value = '49';
    campo.dispatchEvent(new Event('input'));
    await nextTick();
    rodarDeNovo().click();
    await vi.waitFor(() => expect(terminou(relatorio())).toBe(true));
    expect(relatorio()).toContain('outro órgão: 49');
  });

  it('se o AUD4 aceitar só os cookies, não manda o token', async () => {
    aud4PedeBearer = false;
    const { relatorio } = abrir();
    await vi.waitFor(() => expect(terminou(relatorio())).toBe(true));
    expect(relatorio()).toContain('só com os cookies: 200');
    expect(relatorio()).not.toContain('com o token (Bearer)');
    expect(pedidos.some((p) => p.bearer)).toBe(false);
  });
});

describe('menu do FAB (D88)', () => {
  function fab() {
    const f = new Fab(() => {}, () => {});
    f.garantirNaPagina();
    f.aplicar(opcoesPadrao(true), 'ativo');
    const raiz = document.getElementById('audaid-v3-fab')!.shadowRoot!;
    const itens = () => [...raiz.querySelectorAll<HTMLButtonElement>('.item-menu')];
    return { f, raiz, itens };
  }

  it('abre com "Pauta" e "Controle em Lote"; escolher fecha o menu e age', () => {
    const { f, itens } = fab();
    const escolhidos: string[] = [];
    f.alternarMenu([
      { rotulo: 'Pauta', titulo: '', acao: () => escolhidos.push('pauta') },
      { rotulo: 'Controle em Lote', titulo: '', acao: () => escolhidos.push('lote') },
    ]);
    expect(itens().map((b) => b.textContent)).toEqual(['Pauta', 'Controle em Lote']);
    itens()[1]!.click();
    expect(escolhidos).toEqual(['lote']);
    expect(itens()).toHaveLength(0);
    expect(f.menuAberto).toBe(false);
  });

  it('o segundo clique no FAB e o Esc fecham; reaplicar as opções mantém o menu', () => {
    const { f, raiz, itens } = fab();
    const menu = [{ rotulo: 'Pauta', titulo: '', acao: () => {} }];
    f.alternarMenu(menu);
    f.aplicar(opcoesPadrao(true), 'ativo');
    expect(itens()).toHaveLength(1);
    f.alternarMenu(menu);
    expect(itens()).toHaveLength(0);
    f.alternarMenu(menu);
    raiz.querySelector('.menu')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(itens()).toHaveLength(0);
  });

  it('sem o aceite dos termos, o menu some', () => {
    const { f, itens } = fab();
    f.alternarMenu([{ rotulo: 'Pauta', titulo: '', acao: () => {} }]);
    f.aplicar(opcoesPadrao(true), 'sem-aceite');
    expect(itens()).toHaveLength(0);
  });
});
