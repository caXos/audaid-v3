// @vitest-environment happy-dom
// Tela 1 do Lote (entrega 1) com um PJe falso: colar, continuar, incluídos e "Não incluídos".

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { ControleLote } from '../src/lote/ControleLote';
import { lerAmbiente } from '../src/pje/ambiente';
import partes from './fixtures/partes-ficticias.json';

const ambiente = lerAmbiente('https://pje.trt9.jus.br/pjekz/painel/global/todos/lista-processos')!;
// Números fictícios, com dígito verificador válido.
const N1 = '0000101-52.2026.5.09.0001';
const N2 = '0000109-13.2026.5.09.0071';
const INVALIDO = '0000101-00.2026.5.09.0001';

function jwt(payload: object): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `cab.${b64}.ass`;
}

let copiado = '';
const lidos: string[] = [];

function responder(url: string): Response {
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
  const u = new URL(url);
  lidos.push(u.pathname + u.search);
  if (u.pathname.endsWith('/processos') && u.searchParams.has('numero')) {
    // Como o PJe real (teste de 27/10/2026): a resposta é só o id.
    const numero = u.searchParams.get('numero');
    return numero === N1 ? json(1) : numero === N2 ? json(2) : new Response('', { status: 200 });
  }
  if (u.pathname.endsWith('/processos/id/1/partes')) return json(partes);
  if (u.pathname.endsWith('/processos/id/1')) {
    // Originário da vara 0001, tramitando no CEJUSC: `orgaoJulgador` é o órgão atual.
    return json({ id: 1, numero: N1, classeJudicial: { sigla: 'ATSum' }, orgaoJulgador: { id: 174, descricao: 'CEJUSC', cejusc: true }, juizoDigital: true });
  }
  if (u.pathname.endsWith('/processos/id/2/partes')) return json(partes);
  if (u.pathname.endsWith('/processos/id/2')) {
    return json({ id: 2, numero: N2, classeJudicial: { sigla: 'ATOrd' }, orgaoJulgador: { id: 49, descricao: '1ª VT DE CASCAVEL' } });
  }
  return new Response('não encontrado', { status: 404 });
}

beforeEach(() => {
  copiado = '';
  lidos.length = 0;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => `Xsrf-Token=XYZ; access_token=${jwt({ exp: 4102444800, nome: 'FULANO DE TAL', orgaoJulgador: { id: 174, descricao: 'CEJUSC - JT - CASCAVEL' } })}`,
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t: string) => void (copiado = t) },
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => responder(url)));
  document.body.replaceChildren();
});

afterEach(() => vi.unstubAllGlobals());

function abrir() {
  const lote = new ControleLote(ambiente, '3.1.0');
  lote.abrir();
  const raiz = document.getElementById('audaid-v3-lote')!.shadowRoot!;
  const texto = () => raiz.textContent ?? '';
  const botao = (t: RegExp) => [...raiz.querySelectorAll('button')].find((b) => t.test(b.textContent?.trim() ?? ''))!;
  const area = () => raiz.querySelector('textarea')!;
  const colar = async (t: string) => {
    area().value = t;
    area().dispatchEvent(new Event('input'));
    await nextTick();
  };
  const clicar = async (el: HTMLElement) => {
    el.click();
    await nextTick();
  };
  return { lote, raiz, texto, botao, area, colar, clicar };
}

describe('Controle em Lote, tela 1 (entrega 1)', () => {
  it('reconhece os números ao colar; sem número, não dá para continuar', async () => {
    const p = abrir();
    expect(p.texto()).toContain('AudAid · Controle em Lote');
    expect(p.texto()).toContain('logado em CEJUSC - JT - CASCAVEL');
    expect(p.texto()).toContain('0 número(s) reconhecido(s)');
    expect(p.botao(/^Continuar$/).disabled).toBe(true);
    await p.colar(`Processos de hoje:\n${N1}\n${N2.replace(/\D/g, '')}\n${N1} (repetido)`);
    expect(p.texto()).toContain('2 número(s) reconhecido(s)');
    expect(p.botao(/^Continuar$/).disabled).toBe(false);
    expect(lidos).toEqual([]); // nada é consultado antes do "Continuar"
  });

  it('continuar: incluídos com partes e advogados; de outro órgão e inválido vão para "Não incluídos"', async () => {
    const p = abrir();
    await p.colar(`${N1} ${N2} ${INVALIDO}`);
    await p.clicar(p.botao(/^Continuar$/));
    await vi.waitFor(() => expect(p.texto()).toContain('Processos incluídos (1)'));
    expect(p.texto()).toContain(N1);
    expect(p.texto()).toContain('ATSum (sumaríssimo)');
    expect(p.texto()).toContain('ANA EXEMPLO; BRUNA FICTICIA');
    expect(p.texto()).toContain('EMPRESA MODELO LTDA; OUTRA EMPRESA S.A.');
    const dicas = [...p.raiz.querySelectorAll('.ajuda')].map((e) => e.getAttribute('title'));
    expect(dicas[0]).toContain('BRUNA FICTICIA: ZETA ADVOGADO TESTE, ALFA ADVOGADA TESTE');
    expect(dicas[1]).toContain('EMPRESA MODELO LTDA: BETA ADVOGADO TESTE');
    expect(p.texto()).toContain('Não incluídos (2)');
    expect(p.texto()).toContain(`${N2} · tramita em outro órgão: 1ª VT DE CASCAVEL`);
    expect(p.texto()).toContain(`${INVALIDO} · número inválido (o dígito verificador não confere)`);
    expect(lidos.some((l) => l.includes(encodeURIComponent(INVALIDO)) || l.includes(INVALIDO))).toBe(false);
    expect(p.texto()).not.toContain('PERITO TESTE');
  });

  it('"Voltar ao texto" mantém o que foi colado', async () => {
    const p = abrir();
    await p.colar(`lista: ${N1}`);
    await p.clicar(p.botao(/^Continuar$/));
    await vi.waitFor(() => expect(p.texto()).toContain('Processos incluídos (1)'));
    await p.clicar(p.botao(/^Voltar ao texto$/));
    expect(p.area().value).toBe(`lista: ${N1}`);
    expect(p.texto()).toContain('1 número(s) reconhecido(s)');
  });

  it('"Copiar diagnóstico" leva contagens e a forma da busca, sem nomes nem números', async () => {
    const p = abrir();
    await p.colar(`${N1} ${N2}`);
    await p.clicar(p.botao(/^Continuar$/));
    await vi.waitFor(() => expect(p.texto()).toContain('Processos incluídos (1)'));
    await p.clicar(p.botao(/^Copiar diagnóstico$/));
    await vi.waitFor(() => expect(copiado).not.toBe(''));
    expect(copiado).toContain('AudAid 3.1.0 · Lote, tela 1');
    expect(copiado).toContain('Números reconhecidos: 2 · incluídos: 1 · não incluídos: 1');
    expect(copiado).toContain('HTTP 200');
    expect(copiado).toContain('HTTP 200\n"number"'); // a busca responde só o id
    for (const proibido of [N1, N2, 'ANA EXEMPLO', 'FULANO']) expect(copiado).not.toContain(proibido);
  });

  it('fechar desmonta o lote', async () => {
    const p = abrir();
    await p.clicar(p.botao(/^×$/));
    expect(p.lote.aberto).toBe(false);
    expect(p.raiz.querySelector('.lote-fundo')).toBeNull();
  });
});
