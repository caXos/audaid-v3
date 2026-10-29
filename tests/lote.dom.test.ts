// @vitest-environment happy-dom
// Controle em Lote com um PJe falso e armazenamento em memória: tela 1 (texto), tela 2 (pauta) e o
// resumo provisório. Números de processo e nomes fictícios.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { opcoesPadrao } from '../src/config/opcoes';
import type { Armazenamento } from '../src/ext/api';
import { ControleLote } from '../src/lote/ControleLote';
import { lerAmbiente } from '../src/pje/ambiente';
import { DESCRICOES_CONHECIDAS } from '../src/regras/tipos';
import calendario from './fixtures/calendario-cejusc.json';
import { CONJUNTOS_PADRAO, nomeDoConjunto } from '../src/regras/organizar';
import partes from './fixtures/partes-ficticias.json';

const ambiente = lerAmbiente('https://pje.trt9.jus.br/pjekz/painel/global/todos/lista-processos')!;
// Fictícios, com dígito verificador válido. N2 tramita em outro órgão; N3 já tem audiência no órgão.
const N1 = '0000101-52.2026.5.09.0001';
const N2 = '0000109-13.2026.5.09.0071';
const N3 = '0000102-37.2026.5.09.0001';
const INVALIDO = '0000101-00.2026.5.09.0001';
const DIA = '2026-11-17';
const tipos = DESCRICOES_CONHECIDAS.map((descricao, i) => ({ id: i + 1, descricao }));
const partes3 = {
  ...partes,
  PASSIVO: [{ id: 990, polo: 'passivo', tipo: 'RÉU', nome: 'ALFA COMERCIO LTDA', situacao: 'Ativo', ordem: 1, idPessoa: 290, representantes: [] }],
};

function jwt(payload: object): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `cab.${b64}.ass`;
}

const lidos: string[] = [];
/** Pauta do dia da sala no PJe falso (tela 3); vazia = dia sem audiência nem vaga. */
let pautaDaSala: object[] = [];
let consultasPauta = 0;

function responder(url: string): Response {
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
  const u = new URL(url);
  lidos.push(u.pathname + u.search);
  if (u.pathname.endsWith('/processos') && u.searchParams.has('numero')) {
    // Como o PJe real (teste de 27/10/2026): a resposta é só o id.
    const id = { [N1]: 1, [N2]: 2, [N3]: 3 }[u.searchParams.get('numero') ?? ''];
    return id ? json(id) : new Response('', { status: 200 });
  }
  const m = /\/processos\/id\/(\d+)(\/\w+)?$/.exec(u.pathname);
  if (m) {
    const id = Number(m[1]);
    // O processo 3 tem outra reclamada, para a ordenação por nome ter efeito.
    if (m[2] === '/partes') return json(id === 3 ? partes3 : partes);
    if (m[2] === '/audiencias') {
      return json(id === 3 ? [{ id: 777, dataInicio: '2026-10-20T10:10:00', status: 'Designada', tipo: { id: 3, descricao: 'Conciliação em Conhecimento' }, salaFisica: { id: 503, nome: 'Sala 01', orgaoJulgador: { id: 174, descricao: 'CEJUSC' } } }] : []);
    }
    const numero = { 1: N1, 2: N2, 3: N3 }[id];
    // Originário de outra vara, tramitando no CEJUSC: `orgaoJulgador` é o órgão atual.
    const orgao = id === 2 ? { id: 49, descricao: '1ª VT DE CASCAVEL' } : { id: 174, descricao: 'CEJUSC', cejusc: true };
    return json({ id, numero, classeJudicial: { sigla: id === 1 ? 'ATSum' : 'ATOrd' }, orgaoJulgador: orgao, juizoDigital: id === 1, faseProcessual: 'CONHECIMENTO' });
  }
  if (u.pathname.endsWith('/dominio/tiposaudiencias')) return json(tipos);
  if (u.pathname.endsWith('/salasaudiencias')) return json([{ id: 503, nome: 'Sala 01' }, { id: 504, nome: 'Sala 02' }]);
  if (u.pathname.endsWith('/calendarioeventos')) return json(calendario);
  if (u.pathname.endsWith('/classificacoes/dia')) {
    consultasPauta++;
    const dia = u.searchParams.get('data');
    return json(pautaDaSala.length ? { dia, pautasDoDia: pautaDaSala } : { dia });
  }
  return new Response('não encontrado', { status: 404 });
}

function memoria(): Armazenamento & { dados: Map<string, unknown> } {
  const dados = new Map<string, unknown>();
  return {
    dados,
    ler: async (c) => dados.get(c),
    gravar: async (c, v) => void dados.set(c, v),
    remover: async (c) => void dados.delete(c),
  };
}

beforeEach(() => {
  lidos.length = 0;
  pautaDaSala = [];
  consultasPauta = 0;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => `Xsrf-Token=XYZ; access_token=${jwt({ exp: 4102444800, nome: 'FULANO DE TAL', orgaoJulgador: { id: 174, descricao: 'CEJUSC - JT - CASCAVEL' } })}`,
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => responder(url)));
  document.body.replaceChildren();
});

afterEach(() => vi.unstubAllGlobals());

function abrir(armazenamento = memoria()) {
  const lote = new ControleLote(ambiente, '3.1.0', armazenamento);
  lote.abrir(opcoesPadrao(true));
  const raiz = document.getElementById('audaid-v3-lote')!.shadowRoot!;
  const texto = () => raiz.textContent ?? '';
  const botao = (t: RegExp, dentro: ParentNode = raiz) => [...dentro.querySelectorAll('button')].find((b) => t.test(b.textContent?.trim() ?? ''))!;
  const mudar = async (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, valor: string | boolean) => {
    if (typeof valor === 'boolean') (el as HTMLInputElement).checked = valor;
    else el.value = valor;
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
    await nextTick();
  };
  const clicar = async (el: HTMLElement) => {
    el.click();
    await nextTick();
  };
  const linhas = () => [...raiz.querySelectorAll<HTMLElement>('.linha-processo')];
  const inicios = () => linhas().map((l) => l.querySelector<HTMLInputElement>('input[type="time"]')!.value);
  const topo = () => raiz.querySelector('.topo-lote')!;
  const numeroDoTopo = (i: number) => topo().querySelectorAll<HTMLInputElement>('input[type="number"]')[i]!; // duração, intervalo, a cada, prazo do GIGS
  return { lote, armazenamento, raiz, texto, botao, mudar, clicar, linhas, inicios, topo, numeroDoTopo };
}

type Painel = ReturnType<typeof abrir>;

/** Cola N1, N2, N3 e o inválido, continua e espera a tela 2. */
async function irParaPauta(p: Painel) {
  await p.mudar(p.raiz.querySelector('textarea')!, `${N1}\n${N2}\n${N3}\n${INVALIDO}`);
  await p.clicar(p.botao(/^Continuar$/));
  await vi.waitFor(() => expect(p.texto()).toContain('2. Pauta: 2 processo(s)'));
}

/** Preenche o que falta no topo para poder continuar: dia e tipo. */
async function preencherTopo(p: Painel) {
  await p.mudar(p.topo().querySelector<HTMLInputElement>('input[type="date"]')!, DIA);
  await p.mudar(p.topo().querySelectorAll('select')[1]!, 'Conciliação'); // sala, tipo base, Semana Nacional, horários, GIGS
}

/** Espera a tela 2 terminar de consultar a pauta da sala (rodada 15). */
async function esperarPautaDaTela2(p: Painel) {
  await vi.waitFor(() => expect(p.raiz.querySelector('.msg-pauta')!.textContent).toMatch(/^Pauta do dia/), { timeout: 2000 });
}

// A pauta do dia no PJe falso.
const deFora = (hora: string, id = 999, nr = '0000999-11.2026.5.09.0001') => ({ idProcesso: id, nrProcesso: nr, status: 'M', pautaAudienciaHorario: { horaInicial: `${hora}:00`, horaFinal: `${hora}:00` } });
const vaga = (hora: string) => ({ tipo: { id: 3, descricao: 'Conciliação' }, pautaAudienciaHorario: { horaInicial: `${hora}:00`, horaFinal: `${hora}:00` } });

describe('Controle em Lote, tela 1', () => {
  it('reconhece os números ao colar; sem número, não dá para continuar; nada é consultado antes', async () => {
    const p = abrir();
    expect(p.texto()).toContain('logado em CEJUSC - JT - CASCAVEL');
    expect(p.raiz.querySelector('.cabecalho-lote')!.textContent).toContain('Etapa 1 - Lista de processos - nada é gravado nesta etapa');
    expect(p.botao(/^Continuar$/).disabled).toBe(true);
    await p.mudar(p.raiz.querySelector('textarea')!, `Hoje:\n${N1}\n${N3.replace(/\D/g, '')}\n${N1} (repetido)`);
    expect(p.texto()).toContain('2 número(s) reconhecido(s)');
    expect(p.botao(/^Continuar$/).disabled).toBe(false);
    expect(lidos).toEqual([]);
  });
});

describe('Controle em Lote, tela 2 (entrega 2)', () => {
  it('lista com partes, "Não incluídos" num diálogo e horários a partir do topo (09:00, 10 min)', async () => {
    const p = abrir();
    await irParaPauta(p);
    expect(p.raiz.querySelector('.cabecalho-lote')!.textContent).toContain('Etapa 2 - Formulário');
    // D60: o botão fica na barra da pauta, junto de "Voltar ao texto"; a lista abre num diálogo.
    expect(p.raiz.querySelector('section.nao-incluidos')).toBeNull();
    const barra = [...p.raiz.querySelectorAll('.cartao-topo')].find((b) => b.textContent?.includes('2. Pauta'))!;
    expect(p.botao(/^Não incluídos \(2\)$/, barra)).toBeTruthy();
    const dialogo = p.raiz.querySelector('dialog.dialogo-nao-incluidos')!;
    expect(dialogo.hasAttribute('open')).toBe(false);
    await p.clicar(p.botao(/^Não incluídos \(2\)$/));
    expect(dialogo.hasAttribute('open')).toBe(true);
    expect(dialogo.textContent).toContain(`${N2} · tramita em outro órgão: 1ª VT DE CASCAVEL`);
    expect(dialogo.textContent).toContain(`${INVALIDO} · número inválido`);
    expect(p.linhas().map((l) => l.querySelector('.numero')!.textContent)).toEqual([N1, N3]);
    // D61: autor numa linha, réu na outra; a primeira parte e "(+X)" com as demais no hover.
    const partesDe = (l: HTMLElement) => [...l.querySelectorAll('.linha-parte')].map((x) => x.textContent!.trim());
    expect(partesDe(p.linhas()[0]!)).toEqual(['ANA EXEMPLO(+1)(?)', 'EMPRESA MODELO LTDA(+1)(?)']);
    const mais = p.linhas()[0]!.querySelector('.linha-parte .ajuda')!;
    expect(mais.getAttribute('title')).toBe('BRUNA FICTICIA');
    expect(p.linhas()[1]!.textContent).toContain('tem audiência');
    expect(p.inicios()).toEqual(['09:00', '09:10']);
    expect(p.texto()).toContain('Escolha a data.');
    expect(p.texto()).toContain('Escolha o tipo de audiência (no topo ou nos itens).');
    expect(p.botao(/^Continuar$/).disabled).toBe(true);
  });

  it('topo: tipo por processo (100% Digital vira vídeo), duração recalcula e "a cada N" põe intervalo', async () => {
    const p = abrir();
    await irParaPauta(p);
    await preencherTopo(p);
    expect(p.linhas()[0]!.querySelector('.tipo-resolvido')!.textContent).toBe('Conciliação em Conhecimento por videoconferência'); // 100% Digital
    expect(p.linhas()[1]!.querySelector('.tipo-resolvido')!.textContent).toBe('Conciliação em Conhecimento');
    await p.mudar(p.numeroDoTopo(0), '30');
    expect(p.inicios()).toEqual(['09:00', '09:30']);
    await p.mudar(p.numeroDoTopo(2), '1'); // intervalo de 10 min a cada 1 audiência
    expect(p.texto()).toContain('Intervalo automático (a cada 1)');
    expect(p.inicios()).toEqual(['09:00', '09:40']);
    expect(p.botao(/^Continuar$/).disabled).toBe(false);
  });

  it('ajuste do item: "ajustado", "voltar ao padrão" e "Aplicar a todos"', async () => {
    const p = abrir();
    await irParaPauta(p);
    await preencherTopo(p);
    const duracao1 = p.linhas()[0]!.querySelector<HTMLInputElement>('input[type="number"]')!;
    await p.mudar(duracao1, '25');
    expect(p.linhas()[0]!.querySelector('.selo-mini.ajustado')).not.toBeNull();
    expect(p.inicios()).toEqual(['09:00', '09:25']);
    await p.mudar(p.numeroDoTopo(0), '15'); // o ajustado não acompanha o topo (D13)
    expect(p.inicios()).toEqual(['09:00', '09:25']);
    await p.clicar(p.botao(/^Aplicar a todos$/, p.numeroDoTopo(0).parentElement!));
    expect(p.inicios()).toEqual(['09:00', '09:15']);
    expect(p.linhas()[0]!.querySelector('.selo-mini.padrao')).not.toBeNull();

    await p.mudar(p.linhas()[1]!.querySelector('select')!, 'Instrução');
    expect(p.linhas()[1]!.querySelector('.tipo-resolvido')!.textContent).toBe('Instrução');
    await p.clicar(p.botao(/^voltar ao padrão$/, p.linhas()[1]!));
    expect(p.linhas()[1]!.querySelector('.tipo-resolvido')!.textContent).toBe('Conciliação em Conhecimento');
  });

  it('âncora (D55): mesmo minuto bloqueia; sobreposição pede confirmação; o resumo mostra o plano', async () => {
    const p = abrir();
    await irParaPauta(p);
    await preencherTopo(p);
    const inicio2 = () => p.linhas()[1]!.querySelector<HTMLInputElement>('input[type="time"]')!;
    await p.mudar(inicio2(), '09:00');
    expect(p.linhas()[1]!.classList.contains('sinal-mesmo-minuto')).toBe(true);
    expect(p.texto()).toContain('começa no mesmo minuto');
    expect(p.botao(/^Continuar$/).disabled).toBe(true);

    await p.mudar(inicio2(), '09:05');
    expect(p.linhas()[1]!.classList.contains('sinal-sobreposto')).toBe(true);
    expect(inicio2().classList.contains('ancorado')).toBe(true);
    await p.clicar(p.botao(/^Continuar$/));
    expect(p.texto()).toContain('Há horários sobrepostos');
    await p.clicar(p.botao(/^Continuar mesmo assim$/));
    expect(p.texto()).toContain('3. Conferência: 2 audiência(s) em 17/11/2026');
    expect(p.raiz.querySelector('.cabecalho-lote')!.textContent).toContain('Etapa 3 - Conferência');
    await vi.waitFor(() => expect(p.texto()).toMatch(/Código do lote: AUD-[23456789A-Z]{8}/), { timeout: 2000 });
    expect(p.texto()).toContain('Já tem audiência designada no órgão: 20/10/2026 10:10');
    expect(p.texto()).toContain('09:05');
    await p.clicar(p.botao(/^Voltar à pauta$/));
    expect(p.texto()).toContain('2. Pauta: 2 processo(s)');
  });

  it('mover pela alça com o teclado e adicionar intervalo manual', async () => {
    const p = abrir();
    await irParaPauta(p);
    const alca = p.linhas()[0]!.querySelector<HTMLElement>('.alca')!;
    alca.focus();
    alca.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await nextTick();
    await nextTick();
    expect(p.linhas().map((l) => l.querySelector('.numero')!.textContent)).toEqual([N3, N1]);
    await p.clicar(p.botao(/^Adicionar intervalo$/));
    const intervalos = [...p.raiz.querySelectorAll('.linha-intervalo')];
    expect(intervalos).toHaveLength(1);
    expect(intervalos[0]!.textContent).toContain('Intervalo');
  });

  it('arrastar pela alça (HTML5 nativo): só a alça libera o arraste; soltar depois do outro item troca a ordem', async () => {
    const p = abrir();
    await irParaPauta(p);
    const [primeira, segunda] = p.linhas() as [HTMLElement, HTMLElement];
    const evento = async (alvo: HTMLElement, tipo: string) => {
      alvo.dispatchEvent(new Event(tipo, { bubbles: true, cancelable: true }));
      await nextTick();
    };
    // Sem segurar a alça, o arraste não começa (os campos da linha continuam editáveis).
    await evento(primeira, 'dragstart');
    await evento(segunda, 'dragover');
    await evento(segunda, 'drop');
    expect(p.linhas().map((l) => l.querySelector('.numero')!.textContent)).toEqual([N1, N3]);
    // Com a alça: no happy-dom a linha não tem altura, então o alvo é "depois" da segunda.
    await evento(primeira.querySelector<HTMLElement>('.alca')!, 'pointerdown');
    expect(primeira.getAttribute('draggable')).toBe('true');
    await evento(primeira, 'dragstart');
    await evento(segunda, 'dragover');
    expect(segunda.classList.contains('alvo-depois')).toBe(true);
    await evento(segunda, 'drop');
    expect(p.linhas().map((l) => l.querySelector('.numero')!.textContent)).toEqual([N3, N1]);
    expect(p.linhas().some((l) => l.classList.contains('alvo-depois'))).toBe(false);
  });

  it('GIGS de um item: o diálogo aplica um texto com as variáveis daquele processo', async () => {
    const p = abrir();
    await irParaPauta(p);
    await preencherTopo(p);
    await p.clicar(p.botao(/^editar$/, p.linhas()[1]!));
    const dialogo = p.raiz.querySelector('dialog.dialogo-gigs-item')!;
    expect(dialogo.hasAttribute('open')).toBe(true);
    await p.mudar(dialogo.querySelector('select')!, 'outro');
    await p.mudar(dialogo.querySelector<HTMLInputElement>('input[type="text"]')!, 'Lote {hash}: {acao} às {hora}');
    await p.clicar(p.botao(/^Aplicar a este processo$/, dialogo));
    expect(p.linhas()[1]!.querySelector('.resumo-gigs')!.getAttribute('title')).toMatch(/^Lote AUD-[23456789A-Z]{8}: redesignada às 09:10$/);
    expect(p.linhas()[1]!.querySelector('.selo-mini.ajustado')).not.toBeNull();
    expect(p.linhas()[0]!.querySelector('.resumo-gigs')!.textContent).toBe('Sem GIGS');
  });
});

describe('Tela 3: conferência com a pauta da sala (D28, D32, D65–D67, D78)', () => {
  const inicioNa3 = (p: Painel, numero: string) =>
    [...p.raiz.querySelectorAll('tr.linha-conferida')].find((tr) => tr.textContent?.includes(numero))?.querySelectorAll('td')[2]?.textContent;

  /**
   * A tela 2 monta a pauta com a sala vazia; `mudou` é a pauta que a tela 3 encontra ao consultar
   * de novo, como se outro servidor tivesse designado nesse meio (D78).
   */
  async function irParaConferencia(p: Painel, mudou?: object[]) {
    await irParaPauta(p);
    await preencherTopo(p);
    await esperarPautaDaTela2(p);
    if (mudou) pautaDaSala = mudou;
    await p.clicar(p.botao(/^Continuar$/));
    await vi.waitFor(() => expect(p.texto()).toContain('3. Conferência'));
    await vi.waitFor(() => expect(p.texto()).toContain('Pauta da sala no PJe'), { timeout: 2000 });
  }

  it('vermelho, amarelo e audiência existente; vaga não conta; "Encaixar" (padrão) resolve e libera o Continuar', async () => {
    // Lote: N1 às 09:00 (10 min) e N3 às 09:10. N3 já tem audiência no órgão (20/10).
    const p = abrir();
    await irParaConferencia(p, [vaga('09:00'), deFora('09:10'), deFora('09:05', 777, '0000777-22.2026.5.09.0001')]);
    expect(p.texto()).toContain('Pauta da sala no PJe: 2 audiência(s) de fora do lote e 1 vaga(s)');
    // D78: o que mudou desde a tela 2, e o plano não se mexeu sozinho.
    const mudancas = p.raiz.querySelector('.mudancas-pauta')!;
    expect(mudancas.textContent).toContain('A pauta da sala mudou desde a tela 2');
    expect(mudancas.textContent).toContain('entrou 0000999-11.2026.5.09.0001 às 09:10');
    expect(mudancas.textContent).toContain('vaga nova às 09:00');
    expect([inicioNa3(p, N1), inicioNa3(p, N3)]).toEqual(['09:00', '09:10']);
    expect(p.raiz.querySelector('.achado-vermelho')!.textContent).toContain('0000999-11.2026.5.09.0001 já começa às 09:10 nesta sala');
    expect(p.raiz.querySelector('.achado-amarelo')!.textContent).toContain('0000777-22.2026.5.09.0001 começa às 09:05');
    expect(p.raiz.querySelector('.achado-existente')!.textContent).toContain('Já tem audiência designada no órgão: 20/10/2026 10:10');
    expect(p.botao(/^Continuar$/).disabled).toBe(true);
    expect(p.texto()).toContain('1 conflito(s) vermelho(s) para resolver.');

    await p.clicar(p.botao(/^Aplicar$/, p.raiz.querySelector('.achado-vermelho')!));
    expect(inicioNa3(p, N3)).toBe('09:11');
    expect(p.raiz.querySelector('.achado-vermelho')).toBeNull();
    expect(p.raiz.querySelector('.achado-amarelo')).not.toBeNull(); // amarelo só avisa
    expect(p.botao(/^Continuar$/).disabled).toBe(false);
    await p.clicar(p.botao(/^Continuar$/));
    expect(p.texto()).toContain('Tudo conferido.');
  });

  it('"Empurrar" (D65) põe um intervalo com a duração base a partir do processo de fora', async () => {
    const p = abrir();
    await irParaConferencia(p, [deFora('09:10')]);
    await p.mudar(p.raiz.querySelector<HTMLSelectElement>('.achado-vermelho select')!, 'empurrar');
    await p.clicar(p.botao(/^Aplicar$/, p.raiz.querySelector('.achado-vermelho')!));
    expect(inicioNa3(p, N3)).toBe('09:20');
    const intervalo = p.raiz.querySelector('tr.resumo-intervalo')!;
    expect(intervalo.textContent).toContain('Intervalo');
    expect(intervalo.textContent).toContain('09:10');
    expect(p.botao(/^Continuar$/).disabled).toBe(false);
    // A mudança vale para a pauta (tela 2) também, e lá a audiência nova aparece, no horário dela.
    await p.clicar(p.botao(/^Voltar à pauta$/));
    expect(p.raiz.querySelectorAll('.linha-intervalo')).toHaveLength(1);
    await vi.waitFor(() => expect(p.raiz.querySelector('.linha-fora')?.textContent).toContain('0000999-11.2026.5.09.0001'));
    expect(p.inicios()).toEqual(['09:00', '09:20']);
  });

  it('sem mudança na pauta, a tela 3 diz isso', async () => {
    const p = abrir();
    await irParaConferencia(p);
    expect(p.raiz.querySelector('.sem-mudancas')!.textContent).toBe('Nada mudou na pauta da sala desde a tela 2.');
  });

  it('audiência existente: "Redesignar" é o padrão; "Remover da lista" tira o processo e recalcula', async () => {
    const p = abrir();
    await irParaConferencia(p);
    const aplicarExistente = () => p.botao(/^Aplicar$/, p.raiz.querySelector('.achado-existente')!);
    expect(aplicarExistente().disabled).toBe(true); // o padrão não muda nada
    await p.mudar(p.raiz.querySelector<HTMLSelectElement>('.achado-existente select')!, 'remover');
    await p.clicar(aplicarExistente());
    expect(p.texto()).toContain('3. Conferência: 1 audiência(s)');
    expect(p.raiz.querySelector('.achado-existente')).toBeNull();
  });

  it('"Aplicar o padrão a todos" resolve um vermelho por vez; "Consultar de novo" relê a pauta', async () => {
    const p = abrir();
    await irParaConferencia(p, [deFora('09:00'), deFora('09:10', 888, '0000888-33.2026.5.09.0001')]);
    expect(p.raiz.querySelectorAll('.achado-vermelho')).toHaveLength(2);
    await p.clicar(p.botao(/^Aplicar o padrão a todos$/));
    expect(p.raiz.querySelectorAll('.achado-vermelho')).toHaveLength(0);
    expect([inicioNa3(p, N1), inicioNa3(p, N3)]).toEqual(['09:01', '09:11']);
    const antes = consultasPauta;
    await p.clicar(p.botao(/^Consultar de novo$/));
    await vi.waitFor(() => expect(consultasPauta).toBe(antes + 1), { timeout: 2000 });
  });
});

describe('A pauta do PJe na tela 2 (entrega 5, rodada 15)', () => {
  /** "número@HH:MM" de cada linha, na ordem da tela; "vaga@HH:MM" nas vagas. */
  const desenho = (p: Painel) =>
    [...p.raiz.querySelectorAll<HTMLElement>('.lista-pauta [data-inicio]')].map((l) => `${l.classList.contains('linha-vaga') ? 'vaga' : l.querySelector('.numero')!.textContent}@${l.dataset.inicio}`);
  const horarios = (p: Painel) => p.topo().querySelector<HTMLSelectElement>('.campo-horarios select')!;

  async function irParaPautaComPje(p: Painel) {
    await irParaPauta(p);
    await preencherTopo(p);
    await esperarPautaDaTela2(p);
  }

  it('consulta a pauta ao escolher sala e dia; sem vaga, os horários seguem em sequência', async () => {
    const p = abrir();
    await irParaPauta(p);
    expect(p.raiz.querySelector('.msg-pauta')!.textContent).toBe('Escolha sala e dia: a pauta da sala é consultada na hora.');
    await preencherTopo(p);
    await esperarPautaDaTela2(p);
    expect(p.raiz.querySelector('.msg-pauta')!.textContent).toBe('Pauta do dia vazia nesta sala.');
    expect(lidos.some((l) => l.includes('classificacoes/dia?idSalaAudiencia=503&data=2026-11-17'))).toBe(true);
    expect(horarios(p).value).toBe('sequencia');
    expect(horarios(p).disabled).toBe(true);
    expect(p.inicios()).toEqual(['09:00', '09:10']);
  });

  it('pelas vagas (D73): os processos ocupam as vagas na ordem; "Deixar livre", "Usar esta vaga" e "Levar para a vaga"', async () => {
    pautaDaSala = [vaga('09:00'), vaga('09:10'), vaga('09:20')];
    const p = abrir();
    await irParaPautaComPje(p);
    expect(p.raiz.querySelector('.msg-pauta')!.textContent).toContain('Pauta do dia: 0 audiência(s), 3 vaga(s).');
    expect(horarios(p).value).toBe('vagas');
    expect(desenho(p)).toEqual([`${N1}@09:00`, `${N3}@09:10`, 'vaga@09:20']);
    expect(p.linhas().every((l) => l.classList.contains('na-vaga'))).toBe(true);
    expect(p.raiz.querySelector('.linha-vaga')!.textContent).toContain('Vaga livre');
    // As vagas definem os horários: início, duração e intervalos ficam desabilitados.
    expect(p.topo().querySelector<HTMLInputElement>('input[type="time"]')!.disabled).toBe(true);
    expect(p.numeroDoTopo(0).disabled).toBe(true);
    expect(p.botao(/^Adicionar intervalo$/).disabled).toBe(true);

    await p.clicar(p.botao(/^deixar livre$/, p.linhas()[0]!));
    expect(desenho(p)).toEqual(['vaga@09:00', `${N1}@09:10`, `${N3}@09:20`]);
    expect(p.raiz.querySelector('.linha-vaga')!.textContent).toContain('Deixada livre');
    await p.clicar(p.botao(/^Usar esta vaga$/));
    expect(desenho(p)).toEqual([`${N1}@09:00`, `${N3}@09:10`, 'vaga@09:20']);

    await p.mudar(p.linhas()[0]!.querySelector<HTMLSelectElement>('.campo-vaga select')!, '09:20'); // N1 → 09:20
    expect(desenho(p)).toEqual([`${N3}@09:00`, 'vaga@09:10', `${N1}@09:20`]);
    expect(p.linhas()[1]!.querySelector('.campo-vaga select')!.classList.contains('ancorado')).toBe(true);

    await p.mudar(horarios(p), 'sequencia');
    expect(p.raiz.querySelector('.linha-vaga')).toBeNull();
    expect(p.topo().querySelector<HTMLInputElement>('input[type="time"]')!.disabled).toBe(false);
  });

  it('quem passa das vagas segue depois da última, com a duração base e um aviso', async () => {
    pautaDaSala = [vaga('09:00')];
    const p = abrir();
    await irParaPautaComPje(p);
    expect(desenho(p)).toEqual([`${N1}@09:00`, `${N3}@09:10`]);
    expect(p.linhas()[1]!.querySelector('.aviso-linha')!.textContent).toContain('Além das vagas configuradas');
    expect(p.botao(/^Continuar$/).disabled).toBe(false); // só avisa
  });

  it('audiências que já estavam no dia (D74): roxas, sem alça, no horário delas; os novos se encaixam em volta', async () => {
    pautaDaSala = [
      {
        ...deFora('09:10'),
        tipo: { id: 9, descricao: 'Instrução' },
        poloAtivo: { nome: 'CARLOS FICTICIO', representaVarios: false },
        poloPassivo: { nome: 'BETA SERVICOS LTDA', representaVarios: true },
      },
    ];
    const p = abrir();
    await irParaPautaComPje(p);
    const fora = p.raiz.querySelector<HTMLElement>('.linha-fora')!;
    expect(fora.textContent).toContain('0000999-11.2026.5.09.0001');
    expect(fora.textContent).toContain('Já na pauta');
    expect(fora.textContent).toContain('Instrução');
    expect([...fora.querySelectorAll('.linha-parte')].map((x) => x.textContent!.trim())).toEqual(['CARLOS FICTICIO', 'BETA SERVICOS LTDA(+)']);
    expect(fora.querySelector('.alca')!.textContent).toBe('');
    expect(desenho(p)).toEqual([`${N1}@09:00`, '0000999-11.2026.5.09.0001@09:10', `${N3}@09:20`]);
    // A duração dela só muda o desenho da pauta.
    await p.mudar(fora.querySelector<HTMLInputElement>('input[type="number"]')!, '30');
    expect(p.inicios()).toEqual(['09:00', '09:40']);
    // Ela não vai para o rascunho e não entra no Auto organizar.
    await p.mudar(p.raiz.querySelector<HTMLSelectElement>('label.ordenar select')!, '1. Nome da reclamada (A→Z)');
    expect(desenho(p)).toEqual([`${N3}@09:00`, '0000999-11.2026.5.09.0001@09:10', `${N1}@09:40`]);
  });

  it('processo da lista que já está nesta pauta não é roxo; no mesmo horário e tipo, "sem mudança" (D79)', async () => {
    const conciliacao = tipos.find((t) => t.descricao === 'Conciliação em Conhecimento')!;
    pautaDaSala = [{ ...deFora('09:10', 3, N3), tipo: conciliacao }];
    const p = abrir();
    await irParaPautaComPje(p);
    expect(p.raiz.querySelector('.linha-fora')).toBeNull();
    const n3 = () => p.linhas()[1]!;
    expect(n3().querySelector('.sem-mudanca')).not.toBeNull();
    expect(n3().querySelector('.resumo-gigs')!.textContent).toBe('Sem GIGS (sem mudança)');
    await p.mudar(p.numeroDoTopo(0), '15'); // N3 passa para 09:15
    expect(n3().querySelector('.sem-mudanca')).toBeNull();
    expect(n3().textContent).toContain('nesta pauta, 09:10');
  });

  it('conflito com a pauta da sala já na tela 2, com a ação da tela 3 na própria linha (D78)', async () => {
    pautaDaSala = [deFora('09:30')];
    const p = abrir();
    await irParaPautaComPje(p);
    const n3 = () => p.linhas().find((l) => l.querySelector('.numero')!.textContent === N3)!;
    await p.mudar(n3().querySelector<HTMLInputElement>('input[type="time"]')!, '09:30');
    expect(n3().classList.contains('conflito-vermelho')).toBe(true);
    expect(n3().querySelector('.aviso-linha')!.textContent).toContain('0000999-11.2026.5.09.0001 já começa às 09:30');
    expect(p.botao(/^Continuar$/).disabled).toBe(false); // a tela 3 é que barra
    await p.clicar(p.botao(/^Aplicar$/, n3()));
    expect(n3().dataset.inicio).toBe('09:31');
    expect(n3().classList.contains('conflito-vermelho')).toBe(false);
  });

  it('o rascunho guarda o modo de horários e as vagas deixadas livres, sem as audiências de fora', async () => {
    pautaDaSala = [vaga('09:00'), vaga('09:10'), vaga('09:20'), deFora('11:00')];
    const mem = memoria();
    const p = abrir(mem);
    await irParaPautaComPje(p);
    await p.clicar(p.botao(/^deixar livre$/, p.linhas()[0]!));
    await vi.waitFor(() => expect(JSON.stringify(mem.dados.get('lote.rascunho.174') ?? {})).toContain('"vagasLivres":["09:00"]'), { timeout: 2000 });
    const guardado = JSON.stringify(mem.dados.get('lote.rascunho.174'));
    expect(guardado).toContain('"horarios":"vagas"');
    expect(guardado).not.toContain('fora-');
    p.lote.fechar();
    p.lote.abrir(opcoesPadrao(true));
    await vi.waitFor(() => expect(p.texto()).toContain('Retomar rascunho'));
    await p.clicar(p.botao(/^Retomar rascunho/));
    await vi.waitFor(() => expect(p.texto()).toContain('2. Pauta: 2 processo(s)'));
    await esperarPautaDaTela2(p);
    expect(desenho(p)).toEqual(['vaga@09:00', `${N1}@09:10`, `${N3}@09:20`, '0000999-11.2026.5.09.0001@11:00']);
  });
});

describe('Auto organizar na tela 2 (D48, D63)', () => {
  const POR_NOME = '1. Nome da reclamada (A→Z)';
  const DIGITAL_PRIMEIRO = '1. Juízo 100% Digital (Sim primeiro) · 2. Nome da reclamada (A→Z)';
  const ordenar = (p: Painel) => p.raiz.querySelector<HTMLSelectElement>('label.ordenar select')!;
  const numeros = (p: Painel) => p.linhas().map((l) => l.querySelector('.numero')!.textContent);

  it('na barra da pauta, com "Ordem manual" e o pré-cadastro; aplicar reordena e leva os ajustes', async () => {
    const p = abrir();
    await irParaPauta(p);
    const barra = [...p.raiz.querySelectorAll('.cartao-topo')].find((b) => b.textContent?.includes('2. Pauta'))!;
    expect(barra.querySelector('label.ordenar select')).not.toBeNull();
    expect([...ordenar(p).options].map((o) => o.textContent)).toEqual(['Ordem manual', ...CONJUNTOS_PADRAO.map(nomeDoConjunto)]);
    expect(numeros(p)).toEqual([N1, N3]);
    await p.mudar(p.linhas()[0]!.querySelector<HTMLInputElement>('input[type="number"]')!, '25'); // ajuste no N1
    await p.mudar(ordenar(p), POR_NOME); // ALFA (N3) antes de EMPRESA MODELO (N1)
    expect(numeros(p)).toEqual([N3, N1]);
    expect(p.linhas()[1]!.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('25'); // o ajuste foi junto (D48d)
    expect(ordenar(p).value).toBe(POR_NOME);
    await p.mudar(ordenar(p), DIGITAL_PRIMEIRO); // N1 é 100% Digital
    expect(numeros(p)).toEqual([N1, N3]);
  });

  it('mover à mão volta para "Ordem manual"; outro conjunto, então, pede confirmação', async () => {
    const p = abrir();
    await irParaPauta(p);
    await p.mudar(ordenar(p), POR_NOME);
    expect(numeros(p)).toEqual([N3, N1]);
    const alca = p.linhas()[0]!.querySelector<HTMLElement>('.alca')!;
    alca.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await nextTick();
    await nextTick();
    expect(numeros(p)).toEqual([N1, N3]);
    expect(ordenar(p).value).toBe('');

    await p.mudar(ordenar(p), POR_NOME);
    const dialogo = p.raiz.querySelector('dialog.dialogo-ordenar')!;
    expect(dialogo.hasAttribute('open')).toBe(true);
    expect(dialogo.textContent).toContain(POR_NOME);
    expect(ordenar(p).value).toBe(''); // até a resposta, fica o valor anterior
    await p.clicar(p.botao(/^Manter a minha ordem$/, dialogo));
    expect(numeros(p)).toEqual([N1, N3]);

    await p.mudar(ordenar(p), POR_NOME);
    await p.clicar(p.botao(/^Reordenar$/, dialogo));
    expect(numeros(p)).toEqual([N3, N1]);
    expect(ordenar(p).value).toBe(POR_NOME);
  });

  it('o rascunho guarda a ordenação, e ela volta ao retomar (D18)', async () => {
    const mem = memoria();
    const p = abrir(mem);
    await irParaPauta(p);
    await p.mudar(ordenar(p), DIGITAL_PRIMEIRO);
    await vi.waitFor(() => expect(JSON.stringify(mem.dados.get('lote.rascunho.174') ?? {})).toContain('"ordenacao":"1. Juízo 100% Digital'), { timeout: 2000 });
    p.lote.fechar();
    p.lote.abrir(opcoesPadrao(true));
    await vi.waitFor(() => expect(p.texto()).toContain('Retomar rascunho'));
    await p.clicar(p.botao(/^Retomar rascunho/));
    await vi.waitFor(() => expect(p.texto()).toContain('2. Pauta: 2 processo(s)'));
    expect(ordenar(p).value).toBe(DIGITAL_PRIMEIRO);
    expect(numeros(p)).toEqual([N1, N3]);
  });
});

describe('Rascunho (D18) e topo lembrado (D56)', () => {
  it('fica guardado sem nomes; ao reabrir, "Retomar" consulta de novo e devolve os ajustes', async () => {
    const mem = memoria();
    const p = abrir(mem);
    await irParaPauta(p);
    await preencherTopo(p);
    await p.mudar(p.linhas()[0]!.querySelector<HTMLInputElement>('input[type="number"]')!, '25');
    await vi.waitFor(() => expect(JSON.stringify(mem.dados.get('lote.rascunho.174') ?? {})).toContain('"duracao":25'), { timeout: 2000 });
    const guardado = JSON.stringify(mem.dados.get('lote.rascunho.174'));
    for (const proibido of ['ANA EXEMPLO', 'EMPRESA MODELO', 'FULANO', INVALIDO]) expect(guardado).not.toContain(proibido);
    expect(JSON.stringify(mem.dados.get('lote.topo.174'))).toContain('"data":""'); // o dia nunca é lembrado
    // Reabre o mesmo controle, como o content.ts faz.
    p.lote.fechar();
    lidos.length = 0;
    p.lote.abrir(opcoesPadrao(true));
    const q = p;
    await vi.waitFor(() => expect(q.texto()).toMatch(/Retomar rascunho de \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2} \(2 processos\)/));
    await q.clicar(q.botao(/^Retomar rascunho/));
    await vi.waitFor(() => expect(q.texto()).toContain('2. Pauta: 2 processo(s)'));
    expect(lidos.some((l) => l.includes('processos?numero='))).toBe(true); // consultou de novo
    expect(q.inicios()).toEqual(['09:00', '09:25']);
    expect(q.topo().querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe(DIA);
    expect(q.linhas()[0]!.querySelector('.selo-mini.ajustado')).not.toBeNull();
  });

  it('"Descartar" apaga o rascunho; uma lista nova começa com o topo lembrado, sem o dia', async () => {
    const mem = memoria();
    const p = abrir(mem);
    await irParaPauta(p);
    await preencherTopo(p);
    await p.mudar(p.numeroDoTopo(0), '20');
    await vi.waitFor(() => expect(JSON.stringify(mem.dados.get('lote.topo.174') ?? {})).toContain('"duracao":20'), { timeout: 2000 });
    p.lote.fechar();
    p.lote.abrir(opcoesPadrao(true));
    const q = p;
    await vi.waitFor(() => expect(q.texto()).toContain('Retomar rascunho'));
    await q.clicar(q.botao(/^Descartar$/));
    await vi.waitFor(() => expect(mem.dados.has('lote.rascunho.174')).toBe(false));
    expect(q.texto()).not.toContain('Retomar rascunho');
    await irParaPauta(q);
    expect(q.numeroDoTopo(0).value).toBe('20');
    expect(q.topo().querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe('');
    expect(q.inicios()).toEqual(['09:00', '09:20']);
  });

  it('"Voltar ao texto" e Continuar de novo: mantém os ajustes, os novos entram no fim', async () => {
    const p = abrir();
    await irParaPauta(p);
    await preencherTopo(p);
    await p.mudar(p.linhas()[0]!.querySelector<HTMLInputElement>('input[type="number"]')!, '25');
    await p.clicar(p.botao(/^Voltar ao texto$/));
    expect(p.raiz.querySelector('textarea')!.value).toContain(N1);
    await p.mudar(p.raiz.querySelector('textarea')!, `${N3}\n${N1}`);
    await p.clicar(p.botao(/^Continuar$/));
    await vi.waitFor(() => expect(p.texto()).toContain('2. Pauta: 2 processo(s)'));
    expect(p.linhas().map((l) => l.querySelector('.numero')!.textContent)).toEqual([N1, N3]); // a ordem montada fica
    expect(p.inicios()).toEqual(['09:00', '09:25']);
    expect(p.texto()).not.toContain('Não incluídos');
  });

  it('fechar desmonta o lote', async () => {
    const p = abrir();
    await p.clicar(p.botao(/^×$/));
    expect(p.lote.aberto).toBe(false);
    expect(p.raiz.querySelector('.lote-fundo')).toBeNull();
  });
});
