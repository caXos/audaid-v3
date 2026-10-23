import {
  LIMITES,
  normalizarOpcoes,
  opcoesPadrao,
  POSICOES_FAB,
  ROTULO_POSICAO,
  type Opcoes,
  type SugestaoGigs,
} from '../config/opcoes';
import { cssDaPosicao, cssDoEstilo } from '../config/posicao';
import { aoMudarArmazenado, ext, lerArmazenado, salvarAceite, salvarOpcoes } from '../ext/api';
import { VARIAVEIS_GIGS } from '../regras/gigs';
import { h } from '../ui/dom';
import { criarIcone } from '../ui/icone';

const DEV = __AUDAID_DEV__;

function campo<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado`);
  return el as T;
}

const posicao = campo<HTMLSelectElement>('posicao');
const corIcone = campo<HTMLInputElement>('cor-icone');
const tamanho = campo<HTMLInputElement>('tamanho');
const fundoAtivo = campo<HTMLInputElement>('fundo-ativo');
const fundoCor = campo<HTMLInputElement>('fundo-cor');
const bordaAtivo = campo<HTMLInputElement>('borda-ativo');
const bordaCor = campo<HTMLInputElement>('borda-cor');
const bordaEspessura = campo<HTMLInputElement>('borda-espessura');
const previa = campo<HTMLDivElement>('previa');
const corpoGigs = campo<HTMLTableSectionElement>('gigs');
const simulacao = campo<HTMLInputElement>('simulacao');
const salvo = campo<HTMLParagraphElement>('salvo');

let sugestoes: SugestaoGigs[] = [];

tamanho.min = String(LIMITES.tamanho.min);
tamanho.max = String(LIMITES.tamanho.max);
bordaEspessura.min = String(LIMITES.espessura.min);
bordaEspessura.max = String(LIMITES.espessura.max);
for (const p of POSICOES_FAB) posicao.append(h('option', { value: p }, ROTULO_POSICAO[p]));
campo('gigs-variaveis').replaceChildren(
  'Variáveis que você pode usar no texto (o AudAid as preenche na hora de lançar o GIGS):',
  h('ul', {}, ...VARIAVEIS_GIGS.map((v) => h('li', {}, h('code', {}, v.variavel), ` · ${v.descricao}`))),
);
campo('versao-extensao').textContent = __AUDAID_VERSAO__ + (DEV ? ' (desenvolvimento)' : '');
campo('diagnostico-nota').textContent = DEV
  ? 'Versão de desenvolvimento: o modo simulação vem ligado por padrão.'
  : 'Ferramentas para investigar problemas. Normalmente não é preciso mexer aqui.';
if (DEV) campo<HTMLDetailsElement>('diagnostico').open = true;

// ── Formulário ↔ opções ────────────────────────────────────────────────────────────────────

function preencher(o: Opcoes) {
  posicao.value = o.fab.posicao;
  corIcone.value = o.fab.estilo.corIcone;
  tamanho.value = String(o.fab.estilo.tamanho);
  fundoAtivo.checked = o.fab.estilo.fundo.ativo;
  fundoCor.value = o.fab.estilo.fundo.cor;
  bordaAtivo.checked = o.fab.estilo.borda.ativo;
  bordaCor.value = o.fab.estilo.borda.cor;
  bordaEspessura.value = String(o.fab.estilo.borda.espessura);
  simulacao.checked = o.simulacao;
  sugestoes = o.gigs.sugestoes.map((s) => ({ ...s }));
  desenharGigs();
  atualizarHabilitados();
  desenharPrevia(o);
}

function coletar(): Opcoes {
  return normalizarOpcoes(
    {
      fab: {
        posicao: posicao.value,
        estilo: {
          corIcone: corIcone.value,
          tamanho: Number(tamanho.value),
          fundo: { ativo: fundoAtivo.checked, cor: fundoCor.value },
          borda: { ativo: bordaAtivo.checked, cor: bordaCor.value, espessura: Number(bordaEspessura.value) },
        },
      },
      gigs: { sugestoes },
      simulacao: simulacao.checked,
    },
    DEV,
  );
}

/** Campos que não se aplicam ficam visíveis, mas desabilitados (layout estável, §5). */
function atualizarHabilitados() {
  fundoCor.disabled = !fundoAtivo.checked;
  bordaCor.disabled = !bordaAtivo.checked;
  bordaEspessura.disabled = !bordaAtivo.checked;
}

function desenharPrevia(o: Opcoes) {
  const botao = h('div', { class: 'fab-previa' });
  for (const [k, v] of Object.entries({ ...cssDaPosicao(o.fab.posicao), ...cssDoEstilo(o.fab.estilo) })) botao.style.setProperty(k, v);
  botao.append(criarIcone());
  previa.replaceChildren(botao);
}

function desenharGigs() {
  const linhas = sugestoes.map((s, i) => {
    const texto = h('input', { type: 'text', value: s.texto });
    texto.maxLength = LIMITES.textoGigs; // limite do campo Observação do GIGS no PJe
    texto.addEventListener('input', () => {
      sugestoes[i] = { ...sugestoes[i]!, texto: texto.value };
      agendarSalvar();
    });
    const prazo = h('input', { type: 'number', value: String(s.prazo) });
    prazo.min = String(LIMITES.prazo.min);
    prazo.max = String(LIMITES.prazo.max);
    prazo.addEventListener('input', () => {
      sugestoes[i] = { ...sugestoes[i]!, prazo: Number(prazo.value) };
      agendarSalvar();
    });
    const remover = h('button', {
      class: 'secundario',
      type: 'button',
      onclick: () => {
        sugestoes.splice(i, 1);
        desenharGigs();
        void salvar();
      },
    }, 'Remover');
    return h('tr', {}, h('td', {}, texto), h('td', {}, prazo), h('td', {}, remover));
  });
  corpoGigs.replaceChildren(
    h('tr', { class: 'fixa' }, h('td', {}, '(vazio): não lança GIGS. Fica sempre em primeiro, como padrão.'), h('td', {}, '—'), h('td')),
    ...linhas,
    h('tr', { class: 'fixa' }, h('td', {}, 'Outro: você digita o texto na hora.'), h('td', {}, '2'), h('td')),
  );
}

// ── Salvar ────────────────────────────────────────────────────────────────────────────────

let temporizador: ReturnType<typeof setTimeout> | undefined;
function agendarSalvar() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => void salvar(), 400);
}

async function salvar() {
  clearTimeout(temporizador);
  const o = coletar();
  atualizarHabilitados();
  desenharPrevia(o);
  await salvarOpcoes(o);
  salvo.textContent = `Salvo às ${new Date().toLocaleTimeString('pt-BR')}.`;
}

for (const el of [posicao, corIcone, fundoAtivo, fundoCor, bordaAtivo, bordaCor, simulacao]) {
  el.addEventListener('change', () => void salvar());
}
for (const el of [tamanho, bordaEspessura, corIcone, fundoCor, bordaCor]) {
  el.addEventListener('input', agendarSalvar);
}

campo('gigs-adicionar').addEventListener('click', () => {
  sugestoes.push({ texto: '', prazo: 2 });
  desenharGigs();
  const inputs = corpoGigs.querySelectorAll<HTMLInputElement>('input[type="text"]');
  inputs[inputs.length - 1]?.focus();
});

campo('ler-termos').addEventListener('click', () => void ext.tabs.create({ url: ext.runtime.getURL('termos.html') }));

// ── Diálogo de confirmação ────────────────────────────────────────────────────────────────

interface PedidoConfirmacao {
  titulo: string;
  itens: (string | Node)[];
  botaoPerigo: string;
}

const dialogo = campo<HTMLDialogElement>('confirmacao');

/** Pergunta com um `<dialog>` nativo. Cancelar tem o foco; Esc também cancela. */
function confirmar({ titulo, itens, botaoPerigo }: PedidoConfirmacao): Promise<boolean> {
  campo('confirmacao-titulo').textContent = titulo;
  campo('confirmacao-itens').replaceChildren(...itens.map((i) => h('li', {}, i)));
  campo('confirmacao-ok').textContent = botaoPerigo;
  return new Promise((resolver) => {
    const fechar = (resposta: boolean) => {
      dialogo.removeEventListener('close', aoFechar);
      if (dialogo.open) dialogo.close();
      resolver(resposta);
    };
    const aoFechar = () => fechar(false);
    dialogo.addEventListener('close', aoFechar);
    campo('confirmacao-cancelar').onclick = () => fechar(false);
    campo('confirmacao-ok').onclick = () => fechar(true);
    dialogo.showModal();
    campo('confirmacao-cancelar').focus();
  });
}

const negrito = (texto: string) => h('strong', {}, texto);

campo('revogar').addEventListener('click', async () => {
  const ok = await confirmar({
    titulo: 'Revogar o aceite dos termos?',
    itens: [
      h('span', {}, 'O AudAid fica ', negrito('inativo'), ' em todas as abas do PJe até você aceitar os termos de novo.'),
      'Suas opções (botão e sugestões de GIGS) não são apagadas.',
    ],
    botaoPerigo: 'Revogar aceite',
  });
  if (ok) await salvarAceite(null);
});

campo('restaurar').addEventListener('click', async () => {
  const padrao = opcoesPadrao(DEV);
  const qtd = sugestoes.filter((s) => s.texto.trim()).length;
  const ok = await confirmar({
    titulo: 'Restaurar as opções padrão?',
    itens: [
      h('span', {}, negrito('Botão do AudAid:'), ' posição, cor do ícone, tamanho, fundo e borda voltam ao padrão (desenho preto sobre círculo branco, no topo ao centro).'),
      h(
        'span',
        {},
        negrito('Sugestões de GIGS:'),
        ` voltam às ${padrao.gigs.sugestoes.length} de fábrica. `,
        negrito(`As que você criou ou editou serão apagadas`),
        ` (hoje você tem ${qtd} sugest${qtd === 1 ? 'ão' : 'ões'}).`,
      ),
      h('span', {}, negrito('Modo simulação:'), ` volta ao padrão desta versão (${padrao.simulacao ? 'ligado' : 'desligado'}).`),
      'O aceite dos termos não muda.',
    ],
    botaoPerigo: 'Restaurar padrão',
  });
  if (!ok) return;
  preencher(padrao);
  await salvarOpcoes(padrao);
  salvo.textContent = 'Opções padrão restauradas.';
});

// ── Carga e sincronização ─────────────────────────────────────────────────────────────────

async function carregar(recarregarFormulario: boolean) {
  const { opcoes, aceite } = await lerArmazenado(DEV);
  if (recarregarFormulario) preencher(opcoes);
  const estado = campo('estado-termos');
  estado.className = aceite ? 'estado-ok' : 'suave';
  estado.textContent = aceite
    ? `Aceitos em ${new Date(aceite.aceitoEm).toLocaleString('pt-BR')}.`
    : 'Ainda não aceitos: o AudAid está inativo até você aceitar.';
}

// Mudanças vindas de fora (outra aba de Opções, aceite nos termos) atualizam só a situação dos
// termos, para não atropelar o que está sendo digitado aqui.
aoMudarArmazenado(() => void carregar(false));
void carregar(true);
