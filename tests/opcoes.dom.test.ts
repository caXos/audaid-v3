// @vitest-environment happy-dom
// Página de Opções em Vue (D50a) com uma API da extensão falsa: o que já existia (botão, GIGS,
// termos, diagnóstico) e a seção nova do Auto organizar (D48, D64).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { montarNaPagina } from '../src/componentes/montar';
import { novoAceite, opcoesPadrao, type Aceite, type Opcoes } from '../src/config/opcoes';
import type { ApiOpcoes } from '../src/paginas/estadoOpcoes';
import PaginaOpcoes from '../src/paginas/opcoes/PaginaOpcoes.vue';
import { CONJUNTOS_PADRAO, nomeDoConjunto } from '../src/regras/organizar';

const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function apiFalsa() {
  let opcoes = opcoesPadrao(true);
  let aceite: Aceite | null = novoAceite(new Date(2026, 9, 22, 10, 0));
  let aoMudar = () => {};
  const salvas: Opcoes[] = [];
  const aceites: (Aceite | null)[] = [];
  let termosAbertos = 0;
  const api: ApiOpcoes = {
    ler: async () => ({ opcoes: copia(opcoes), aceite }),
    salvarOpcoes: async (o) => {
      opcoes = copia(o);
      salvas.push(copia(o));
    },
    salvarAceite: async (a) => {
      aceite = a;
      aceites.push(a);
      aoMudar();
    },
    aoMudar: (cb) => {
      aoMudar = cb;
    },
    abrirTermos: () => {
      termosAbertos++;
    },
  };
  return { api, salvas, aceites, termosAbertos: () => termosAbertos };
}

let api: ReturnType<typeof apiFalsa>;
let alvo: HTMLElement;

beforeEach(async () => {
  document.body.replaceChildren();
  document.head.replaceChildren();
  api = apiFalsa();
  alvo = document.createElement('div');
  document.body.append(alvo);
  montarNaPagina(PaginaOpcoes, { api: api.api, desenvolvimento: true, versao: '3.1.0' }, alvo);
  await vi.waitFor(() => expect(alvo.textContent).toContain('Auto organizar o Lote'));
});

const texto = () => alvo.textContent ?? '';
const botao = (t: RegExp, dentro: ParentNode = alvo) => [...dentro.querySelectorAll('button')].find((b) => t.test(b.textContent?.trim() ?? ''))!;
const clicar = async (el: HTMLElement) => {
  el.click();
  await nextTick();
};
const mudar = async (el: HTMLInputElement | HTMLSelectElement, valor: string) => {
  el.value = valor;
  el.dispatchEvent(new Event('input'));
  el.dispatchEvent(new Event('change'));
  await nextTick();
};
const conjuntos = () => [...alvo.querySelectorAll<HTMLElement>('.conjunto')];
const ultimaSalva = () => api.salvas.at(-1)!;

describe('Opções em Vue: o que já existia', () => {
  it('mostra o que está salvo: botão, sugestões, termos e versão; o CSS dos componentes vai para o <head>', () => {
    expect(alvo.querySelector<HTMLSelectElement>('#posicao')!.value).toBe('topo-centro');
    expect(alvo.querySelectorAll('tbody input[type="text"]')).toHaveLength(4);
    expect(texto()).toContain('Aceitos em 22/10/2026');
    expect(texto()).toContain('AudAid 3.1.0 (desenvolvimento)');
    expect(alvo.querySelector('.previa .fab-previa svg')).not.toBeNull();
    expect([...document.head.querySelectorAll('style')].some((s) => s.textContent?.includes('.conjunto'))).toBe(true);
  });

  it('mudar um campo salva sozinho, já normalizado', async () => {
    await mudar(alvo.querySelector<HTMLSelectElement>('#posicao')!, 'abaixo-direita');
    await vi.waitFor(() => expect(api.salvas.length).toBeGreaterThan(0));
    expect(ultimaSalva().fab.posicao).toBe('abaixo-direita');
    expect(texto()).toMatch(/Salvo às \d{2}:\d{2}:\d{2}\./);
  });

  it('acrescentar e remover sugestão de GIGS', async () => {
    await clicar(botao(/^Adicionar sugestão$/));
    const textos = () => [...alvo.querySelectorAll<HTMLInputElement>('tbody input[type="text"]')];
    expect(textos()).toHaveLength(5);
    await mudar(textos()[4]!, 'Pauta montada pelo lote {hash}');
    await clicar(botao(/^Remover$/, textos()[0]!.closest('tr')!));
    await vi.waitFor(() => expect(ultimaSalva().gigs.sugestoes.map((s) => s.texto)).toEqual(['Analisar', 'Audiência gerada pelo AudAid', 'Audiência gerada pelo AudAid em {data e hora}', 'Pauta montada pelo lote {hash}']));
  });

  it('"Ler os termos" abre os termos; "Revogar" pede confirmação antes', async () => {
    await clicar(botao(/^Ler os termos$/));
    expect(api.termosAbertos()).toBe(1);
    await clicar(botao(/^Revogar o aceite dos termos$/));
    const dialogo = alvo.querySelector('dialog')!;
    expect(dialogo.hasAttribute('open')).toBe(true);
    expect(dialogo.textContent).toContain('Revogar o aceite dos termos?');
    await clicar(botao(/^Cancelar$/, dialogo));
    expect(api.aceites).toEqual([]);
    await clicar(botao(/^Revogar o aceite dos termos$/));
    await clicar(botao(/^Revogar aceite$/, dialogo));
    await vi.waitFor(() => expect(api.aceites).toEqual([null]));
    await vi.waitFor(() => expect(texto()).toContain('Ainda não aceitos'));
  });
});

describe('Opções em Vue: Auto organizar (D48, D64)', () => {
  it('os cinco conjuntos do pré-cadastro, com o nome automático', () => {
    expect(conjuntos().map((c) => c.querySelector('.nome-conjunto')!.textContent)).toEqual(CONJUNTOS_PADRAO.map(nomeDoConjunto));
  });

  it('criar um conjunto: o campo já usado fica desabilitado, e o nome se monta sozinho', async () => {
    await clicar(botao(/^Adicionar conjunto$/));
    const novo = () => conjuntos().at(-1)!;
    expect(novo().querySelector('.nome-conjunto')!.textContent).toBe('1. Ano (crescente)');
    await clicar(botao(/^Adicionar critério$/, novo()));
    expect(novo().querySelector('.nome-conjunto')!.textContent).toBe('1. Ano (crescente) · 2. Sequencial (crescente)');
    const [, campo2] = [...novo().querySelectorAll<HTMLSelectElement>('select[aria-label^="Campo"]')];
    expect(campo2!.querySelector<HTMLOptionElement>('option[value="ano"]')!.disabled).toBe(true);
    expect(campo2!.querySelector<HTMLOptionElement>('option[value="vara"]')!.disabled).toBe(false);
    await mudar(campo2!, 'ultimoDigito');
    expect(novo().querySelector('.nome-conjunto')!.textContent).toBe('1. Ano (crescente) · 2. Último dígito (par crescente)');
    // Depois de "par crescente", o último dígito não tem mais o que ordenar.
    await clicar(botao(/^Adicionar critério$/, novo()));
    const campo3 = [...novo().querySelectorAll<HTMLSelectElement>('select[aria-label^="Campo"]')][2]!;
    expect(campo3.querySelector<HTMLOptionElement>('option[value="ultimoDigito"]')!.disabled).toBe(true);
    await vi.waitFor(() => expect(ultimaSalva().organizar.conjuntos).toHaveLength(6));
    expect(nomeDoConjunto(ultimaSalva().organizar.conjuntos[5]!)).toBe('1. Ano (crescente) · 2. Último dígito (par crescente) · 3. Sequencial (crescente)');
  });

  it('subir e remover critério; "Restaurar padrão" (com confirmação) volta aos cinco', async () => {
    const segundo = () => conjuntos()[1]!;
    await clicar(botao(/^↑$/, segundo().querySelectorAll('.criterio')[1]!));
    expect(segundo().querySelector('.nome-conjunto')!.textContent).toBe('1. Advogado do autor, global (A→Z) · 2. Nome da reclamada (A→Z)');
    await clicar(botao(/^Remover conjunto$/, conjuntos()[0]!));
    expect(conjuntos()).toHaveLength(4);
    await vi.waitFor(() => expect(ultimaSalva().organizar.conjuntos).toHaveLength(4));

    await clicar(botao(/^Restaurar opções padrão$/));
    const dialogo = alvo.querySelector('dialog')!;
    expect(dialogo.textContent).toContain('Auto organizar: voltam os 5 conjuntos de fábrica.');
    expect(dialogo.textContent).toContain('(hoje você tem 4 conjuntos)');
    await clicar(botao(/^Restaurar padrão$/, dialogo));
    await vi.waitFor(() => expect(conjuntos()).toHaveLength(5));
    expect(ultimaSalva()).toEqual(opcoesPadrao(true));
    await vi.waitFor(() => expect(texto()).toContain('Opções padrão restauradas.'));
  });
});
