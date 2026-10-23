// @vitest-environment happy-dom
// Integração do painel do Controle Individual com um PJe falso: o formulário funciona de ponta a
// ponta e, na entrega 3, nenhuma requisição de escrita sai.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { opcoesPadrao } from '../src/config/opcoes';
import { ControleIndividual } from '../src/individual/painel';
import { lerAmbiente } from '../src/pje/ambiente';
import { DESCRICOES_CONHECIDAS } from '../src/regras/tipos';
import calendario from './fixtures/calendario-cejusc.json';

const ambiente = lerAmbiente('https://pje.trt9.jus.br/pjekz/processo/100/detalhe')!;

function jwt(payload: object): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `cab.${b64}.ass`;
}

let orgaoLogado = 174;
let processoDigital = true;
let faseProcesso = 'CONHECIMENTO';
const escritas: { metodo: string; url: string }[] = [];

const tipos = DESCRICOES_CONHECIDAS.map((descricao, i) => ({ id: i + 1, descricao }));
const idTipo = (d: string) => tipos.find((t) => t.descricao === d)!.id;

function responder(url: string, init?: RequestInit): Response {
  const metodo = init?.method ?? 'GET';
  if (metodo !== 'GET') {
    escritas.push({ metodo, url });
    // Designar/redesignar devolvem a audiência nova, como o PJe real.
    if (/pautasaudiencias\/audiencias/.test(url)) {
      const corpo = JSON.parse(String(init?.body ?? '{}')) as { horarioInicial?: string };
      return new Response(JSON.stringify({ id: 555, status: 'Designada', dataInicio: `2026-10-27T${corpo.horarioInicial}:00` }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
  const u = new URL(url);
  if (u.pathname.endsWith('/processos/id/100')) {
    return json({ id: 100, numero: '0000100-00.2026.5.09.0000', classeJudicial: { sigla: 'ATOrd' }, orgaoJulgador: { id: 174, descricao: 'CEJUSC' }, juizoDigital: processoDigital, faseProcessual: faseProcesso });
  }
  if (u.pathname.endsWith('/processos/id/100/audiencias')) {
    return json([
      { id: 444, dataInicio: '2026-10-20T10:10:00', status: 'Designada', tipo: { id: 18, descricao: 'Conciliação em Conhecimento por videoconferência' }, salaFisica: { id: 503, nome: 'Sala 01', orgaoJulgador: { id: 174, descricao: 'CEJUSC' } } },
      { id: 333, dataInicio: '2026-11-05T14:00:00', status: 'Designada', tipo: { id: 6, descricao: 'Instrução' }, salaFisica: { id: 85, nome: 'Sala VT', orgaoJulgador: { id: 49, descricao: '1ª VT' } } },
    ]);
  }
  if (u.pathname.endsWith('/dominio/tiposaudiencias')) return json(tipos);
  if (u.pathname.endsWith('/salasaudiencias')) return json([{ id: 503, nome: 'Sala 01' }, { id: 504, nome: 'Sala 02' }]);
  if (u.pathname.endsWith('/calendarioeventos')) return json(calendario);
  if (u.pathname.endsWith('/classificacoes/dia')) {
    // Dia sem audiência nem vaga: o PJe real responde só {dia}, sem pautasDoDia.
    if (u.searchParams.get('data') === '2026-12-16') return json({ dia: '2026-12-16' });
    return json({
      dia: u.searchParams.get('data'),
      pautasDoDia: [
        { idProcesso: 999, nrProcesso: '0000999-00.2026.5.09.0000', status: 'M', pautaAudienciaHorario: { horaInicial: '10:11:00', horaFinal: '10:20:00' } },
        { tipo: { id: 18, descricao: 'x' }, pautaAudienciaHorario: { horaInicial: '10:30:00', horaFinal: '10:40:00' } },
      ],
    });
  }
  if (u.pathname.includes('/retorna-prazo/')) return json({ DATA: '2026-10-26T00:00:00' });
  return new Response('não encontrado', { status: 404 });
}

beforeEach(() => {
  orgaoLogado = 174;
  processoDigital = true;
  faseProcesso = 'CONHECIMENTO';
  escritas.length = 0;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => `Xsrf-Token=XYZ; access_token=${jwt({ exp: 4102444800, nome: 'FULANO DE TAL', orgaoJulgador: { id: orgaoLogado, descricao: 'CEJUSC - JT - CASCAVEL' } })}`,
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => responder(url, init)));
  document.body.replaceChildren();
});

afterEach(() => vi.unstubAllGlobals());

function abrir(simulacao = true) {
  const c = new ControleIndividual(ambiente, () => {});
  c.definirProcesso(100);
  c.alternar({ ...opcoesPadrao(true), simulacao });
  const raiz = document.getElementById('audaid-v3-individual')!.shadowRoot!;
  const sel = () => [...raiz.querySelectorAll('select')];
  const inp = (tipo: string) => raiz.querySelector<HTMLInputElement>(`input[type="${tipo}"]`)!;
  const botao = (texto: RegExp) => [...raiz.querySelectorAll('button')].find((b) => texto.test(b.textContent ?? ''))!;
  const texto = () => raiz.textContent ?? '';
  const mudar = (el: HTMLInputElement | HTMLSelectElement, valor: string | boolean) => {
    if (typeof valor === 'boolean') (el as HTMLInputElement).checked = valor;
    else el.value = valor;
    el.dispatchEvent(new Event('change'));
  };
  return { raiz, sel, inp, botao, texto, mudar };
}

describe('Controle Individual (entrega 3, simulação)', () => {
  it('carrega, pré-preenche com a audiência do órgão logado e mostra a de outro órgão só para consulta', async () => {
    const p = abrir();
    await vi.waitFor(() => expect(p.texto()).toContain('Redesignar audiência'));
    expect(p.texto()).toContain('será substituída (redesignação)');
    expect(p.texto()).toContain('1ª VT (só consulta)');
    const [sala, base] = p.sel();
    expect(sala!.value).toBe('503');
    expect(base!.value).toBe('Conciliação');
    // Processo 100% Digital: vídeo marcado e travado (D42).
    expect(p.inp('checkbox').checked).toBe(true);
    expect(p.inp('checkbox').disabled).toBe(true);
    expect(p.texto()).toContain('Conciliação em Conhecimento por videoconferência');
    expect(p.botao(/Simular redesignação/).disabled).toBe(true);
  });

  it('processo comum em execução: vídeo livre e desmarcado, fase Execução, mesmo com a antiga em Conhecimento por vídeo (D42)', async () => {
    processoDigital = false;
    faseProcesso = 'EXECUCAO';
    const p = abrir();
    await vi.waitFor(() => expect(p.texto()).toContain('Redesignar audiência'));
    const [, base, semana, fase] = p.sel(); // ordem na tela: sala, tipo base, semana, fase, GIGS
    expect(base!.value).toBe('Conciliação');
    expect(p.inp('checkbox').checked).toBe(false);
    expect(p.inp('checkbox').disabled).toBe(false);
    expect(fase!.value).toBe('Execução');
    expect(fase!.disabled).toBe(false);
    expect(semana!.value).toBe('nenhuma');
    expect(p.texto()).toContain('fase atual do processo: Execução');
    expect(p.texto()).toContain('Será designada: Conciliação em Execução');
    p.mudar(p.inp('checkbox'), true);
    expect(p.texto()).toContain('Conciliação em Execução por videoconferência');
    // Tipo que não é conciliação: a fase fica desabilitada.
    p.mudar(base!, 'Instrução');
    expect(fase!.disabled).toBe(true);
    expect(p.inp('checkbox').disabled).toBe(false);
  });

  it('pauta: indicador de consulta, botão "Escolher horário na pauta do dia" e clique numa vaga preenche o horário', async () => {
    const p = abrir();
    await vi.waitFor(() => expect(p.texto()).toContain('Redesignar audiência'));
    const verPauta = p.botao(/Escolher horário na pauta do dia/);
    expect(verPauta.disabled).toBe(true);
    expect(p.texto()).toContain('Escolha sala e data: a pauta do dia é consultada na hora.');

    p.mudar(p.inp('date'), '2026-10-27');
    // Logo ao escolher a data, antes da resposta: indicador de consulta.
    expect(p.raiz.querySelector('.msg.carregando')?.textContent).toBe('Consultando a pauta do dia…');
    await vi.waitFor(() => expect(p.texto()).toContain('Pauta do dia: 1 audiência(s), 1 vaga(s). Escolha o horário na pauta ou digite.'), { timeout: 2000 });
    expect(verPauta.disabled).toBe(false);

    verPauta.click();
    const dialogo = p.raiz.querySelector('dialog.dialogo-pauta')!;
    expect(dialogo.hasAttribute('open')).toBe(true);
    expect(dialogo.textContent).toContain('Pauta do dia · Sala 01 · 27/10/2026');
    expect(dialogo.textContent).toContain('Clique numa vaga para usar o horário dela.');
    const vaga = dialogo.querySelector<HTMLTableRowElement>('tr.clicavel')!;
    expect(vaga.textContent).toContain('10:30');
    vaga.click();
    expect(p.inp('time').value).toBe('10:30');
    expect(p.texto()).toContain('10:30: vaga configurada na sala, pode usar.');
  });

  it('dia sem audiência nem vaga ({dia} sem pautasDoDia) libera o horário', async () => {
    const p = abrir();
    await vi.waitFor(() => expect(p.texto()).toContain('Redesignar audiência'));
    p.mudar(p.inp('date'), '2026-12-16');
    p.mudar(p.inp('time'), '09:00');
    await vi.waitFor(() => expect(p.texto()).toContain('09:00 está livre na sala'), { timeout: 2000 });
    expect(p.texto()).toContain('Nenhuma audiência nem vaga nesta sala neste dia');
    expect(p.botao(/Simular/).disabled).toBe(false);
  });

  it('horário ocupado bloqueia até escolher outro (sem o botão "Encaixar", D45)', async () => {
    const p = abrir();
    await vi.waitFor(() => expect(p.texto()).toContain('Redesignar audiência'));
    p.mudar(p.inp('date'), '2026-10-27');
    p.mudar(p.inp('time'), '10:11');
    await vi.waitFor(() => expect(p.texto()).toContain('já está ocupado pelo processo 0000999-00.2026.5.09.0000'), { timeout: 2000 });
    expect(p.texto()).toContain('Escolha outro horário na pauta ou digite outro.');
    expect(p.botao(/Simular/).disabled).toBe(true);
    expect([...p.raiz.querySelectorAll('button')].some((b) => /Encaixar/.test(b.textContent ?? ''))).toBe(false);
    p.mudar(p.inp('time'), '10:12');
    expect(p.texto()).toContain('10:12 está livre na sala');
    expect(p.botao(/Simular/).disabled).toBe(false);
  });

  it('data bloqueada e data só com prazo suspenso', async () => {
    const p = abrir();
    await vi.waitFor(() => expect(p.texto()).toContain('Redesignar audiência'));
    p.mudar(p.inp('time'), '09:00');
    p.mudar(p.inp('date'), '2026-12-25');
    expect(p.texto()).toContain('Data bloqueada: Nascimento de Jesus Cristo');
    await vi.waitFor(() => expect(p.texto()).toContain('09:00 está livre'), { timeout: 2000 });
    expect(p.botao(/Simular/).disabled).toBe(true);
    p.mudar(p.inp('date'), '2026-06-29');
    expect(p.texto()).toContain('Atenção: Suspensão de Prazos - jogo da copa 2026');
  });

  it('Julgamento em processo 100% Digital: aviso, vídeo desabilitado e passos de retirar/recolocar', async () => {
    const p = abrir();
    await vi.waitFor(() => expect(p.texto()).toContain('Redesignar audiência'));
    const [, base, , , gigs] = p.sel();
    p.mudar(base!, 'Julgamento');
    expect(p.inp('checkbox').disabled).toBe(true);
    expect(p.texto()).toContain('vai retirar o Juízo 100% Digital');
    p.mudar(p.inp('date'), '2026-10-27');
    p.mudar(p.inp('time'), '10:12');
    p.mudar(gigs!, 's3'); // "Audiência gerada pelo AudAid em {data e hora}"
    expect(p.texto()).toContain('Será lançado: "Audiência gerada pelo AudAid em 27/10/2026, às 10h12" · prazo de 2 dia(s)');
    await vi.waitFor(() => expect(p.botao(/Simular redesignação/).disabled).toBe(false), { timeout: 2000 });

    p.botao(/Simular redesignação/).click();
    await vi.waitFor(() => expect(p.texto()).toContain('Simulação concluída: nada foi gravado no PJe.'), { timeout: 2000 });
    const texto = p.texto();
    for (const passo of ['Retirar o Juízo 100% Digital', 'Redesignar a audiência', 'Recolocar o Juízo 100% Digital', 'Calcular o prazo do GIGS', 'Lançar o GIGS']) {
      expect(texto).toContain(passo);
    }
    expect(texto).toContain(`"idTipoAudiencia": ${idTipo('Julgamento')}`);
    expect(texto).toContain('"idProcessoAudiencia": 444');
    expect(texto).toContain('"dataPrazo": "2026-10-26"');
    expect(texto).toContain('não enviado (simulação)');
    expect(escritas).toEqual([]);
  });

  it('se o órgão logado mudou em outra aba, nada é feito (D5)', async () => {
    const p = abrir();
    await vi.waitFor(() => expect(p.texto()).toContain('Redesignar audiência'));
    p.mudar(p.inp('date'), '2026-10-27');
    p.mudar(p.inp('time'), '10:12');
    await vi.waitFor(() => expect(p.botao(/Simular/).disabled).toBe(false), { timeout: 2000 });
    orgaoLogado = 49;
    p.botao(/Simular/).click();
    expect(p.texto()).toContain('Você trocou de órgão logado');
    expect(escritas).toEqual([]);
  });
});

describe('Variáveis do GIGS (D43, D44)', () => {
  it('"Exibir variáveis": valores atuais, clique insere no texto; o hash da prévia é o que vai no GIGS', async () => {
    const p = abrir();
    await vi.waitFor(() => expect(p.texto()).toContain('Redesignar audiência'));
    const [, , , , gigs] = p.sel();
    const btn = p.botao(/Exibir variáveis/);
    expect(btn.disabled).toBe(true); // opção vazia: não lança GIGS

    p.mudar(gigs!, 'outro');
    expect(btn.disabled).toBe(false);
    p.mudar(p.inp('text'), 'Por ');

    btn.click();
    const dialogo = p.raiz.querySelectorAll('dialog')[1]!;
    expect(dialogo.hasAttribute('open')).toBe(true);
    const texto = dialogo.textContent ?? '';
    for (const v of ['{data}', '{hora}', '{data e hora}', '{tipo}', '{sala}', '{acao}', '{eu}', '{orgao}', '{hash}']) expect(texto).toContain(v);
    expect(texto).toContain('FULANO DE TAL');
    expect(texto).toContain('CEJUSC - JT - CASCAVEL');
    expect(texto).toContain('redesignada');
    expect(texto).toContain('(escolha no formulário)'); // data ainda não escolhida
    const hash = /AUD-[23456789A-Z]{8}/.exec(texto)![0];

    // Clicar em {eu} insere no fim do texto (o campo nunca recebeu o cursor).
    [...dialogo.querySelectorAll('tr')].find((tr) => tr.textContent?.includes('{eu}'))!.click();
    expect(p.inp('text').value).toBe('Por {eu}');
    p.mudar(p.inp('text'), 'Por {eu} · {acao} · {hash} · {dia}');
    expect(p.texto()).toContain(`Será lançado: "Por FULANO DE TAL · redesignada · ${hash} · {dia}"`);

    p.mudar(p.inp('date'), '2026-10-27');
    p.mudar(p.inp('time'), '10:12');
    await vi.waitFor(() => expect(p.botao(/Simular/).disabled).toBe(false), { timeout: 2000 });
    p.botao(/Simular/).click();
    await vi.waitFor(() => expect(p.texto()).toContain('Simulação concluída'), { timeout: 2000 });
    expect(p.texto()).toContain(`"observacao": "Por FULANO DE TAL · redesignada · ${hash} · {dia}"`);
    expect(p.texto()).toContain(`Código desta execução (para buscar no GIGS): ${hash}`);
    // Depois do envio, o próximo envio terá outro código.
    expect(p.texto()).not.toContain(`Será lançado: "Por FULANO DE TAL · redesignada · ${hash}`);
  });
});

describe('Limite de 4000 caracteres do GIGS no painel', () => {
  it('contador na prévia; acima de 4000 (já com as variáveis) bloqueia; 4000 passa', async () => {
    const p = abrir();
    await vi.waitFor(() => expect(p.texto()).toContain('Redesignar audiência'));
    const [, , , , gigs] = p.sel();
    p.mudar(gigs!, 'outro');
    p.mudar(p.inp('date'), '2026-10-27');
    p.mudar(p.inp('time'), '10:12');
    await vi.waitFor(() => expect(p.texto()).toContain('10:12 está livre na sala'), { timeout: 2000 });

    p.mudar(p.inp('text'), 'x'.repeat(4000));
    expect(p.texto()).toContain('(4000/4000) Será lançado');
    expect(p.botao(/Simular/).disabled).toBe(false);

    p.mudar(p.inp('text'), 'x'.repeat(4001));
    expect(p.texto()).toContain('(4001/4000)');
    expect(p.texto()).toContain('O texto do GIGS tem 4001 caracteres (com as variáveis preenchidas); o limite do PJe é 4000.');
    expect(p.botao(/Simular/).disabled).toBe(true);

    // 3993 + "{orgao}" = 4000 digitados, mas 4015 depois de resolver.
    p.mudar(p.inp('text'), 'x'.repeat(3993) + '{orgao}');
    expect(p.texto()).toContain('(4015/4000)');
    expect(p.botao(/Simular/).disabled).toBe(true);
  });
});

describe('Controle Individual (entrega 4, envio real)', () => {
  async function prontoParaGravar(gigs?: string) {
    processoDigital = false;
    const p = abrir(false);
    await vi.waitFor(() => expect(p.texto()).toContain('Redesignar audiência'));
    p.mudar(p.inp('date'), '2026-10-27');
    p.mudar(p.inp('time'), '10:12');
    if (gigs) p.mudar(p.sel()[4]!, gigs);
    await vi.waitFor(() => expect(p.botao(/^Redesignar$/).disabled).toBe(false), { timeout: 2000 });
    return p;
  }

  it('faixa de envio real e botão sem "Simular"', async () => {
    const p = await prontoParaGravar();
    expect(p.texto()).toContain('ENVIO REAL: o que você confirmar será gravado no PJe em seu nome.');
    expect(p.texto()).not.toContain('SIMULAÇÃO:');
  });

  it('pede confirmação antes de gravar; Cancelar não grava nada', async () => {
    const p = await prontoParaGravar();
    p.botao(/^Redesignar$/).click();
    expect(p.texto()).toContain('Confira o que será gravado no PJe em seu nome:');
    expect(p.texto()).toContain('Redesignar a audiência de 20/10/2026 10:10 (Conciliação em Conhecimento por videoconferência) para 27/10/2026 às 10:12.');
    expect(p.botao(/^Redesignar$/).disabled).toBe(true);
    p.botao(/^Cancelar$/).click();
    expect(p.texto()).toContain('Cancelado. Nada foi gravado.');
    expect(escritas).toEqual([]);
  });

  it('confirmado: grava na ordem certa e oferece recarregar a página', async () => {
    const p = await prontoParaGravar('s1'); // GIGS "Analisar", 2 dias úteis
    p.botao(/^Redesignar$/).click();
    expect(p.texto()).toContain('Lançar GIGS "Analisar" com prazo de 2 dia(s) útil(eis).');
    p.botao(/Confirmar e gravar no PJe/).click();
    await vi.waitFor(() => expect(p.texto()).toContain('Audiência redesignada com sucesso.'), { timeout: 2000 });
    expect(escritas.map((e) => `${e.metodo} ${new URL(e.url).pathname}`)).toEqual([
      'PUT /pje-comum-api/api/pautasaudiencias/audiencias/redesignacao',
      'POST /pje-gigs-api/api/atividade',
    ]);
    expect(p.texto()).toContain('Recarregar a página para ver a audiência no PJe?');
    expect(p.botao(/Recarregar agora/)).toBeTruthy();
  });
});
