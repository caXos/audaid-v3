<script setup lang="ts">
// A Pauta (3.2, §2.7), só leitura nesta entrega: filtros no topo (D90), lista contínua a partir de
// hoje (D91) e a pauta de cada dia lida quando ele chega perto da tela (D92).
import { computed, onMounted, onUnmounted, ref } from 'vue';
import CampoBusca from '../componentes/CampoBusca.vue';
import type { OpcaoBusca } from '../componentes/opcaoBusca';
import type { Opcoes, OrgaoConhecido } from '../config/opcoes';
import type { Armazenamento } from '../ext/api';
import type { Ambiente } from '../pje/ambiente';
import type { LeitorPauta } from './dados';
import DiagnosticoPauta from './DiagnosticoPauta.vue';
import { usePauta, type EstadoDia, type FocoPauta, type LinhaPauta } from './estadoPauta';
import { rotuloDoDia, rotuloDoOrgao } from './orgaos';

const props = defineProps<{
  ambiente: Ambiente;
  versao: string;
  opcoes: Opcoes;
  armazenamento: Armazenamento;
  foco?: FocoPauta;
  aoFechar: () => void;
  aoConhecerOrgaos?: (orgaos: OrgaoConhecido[]) => void;
  /** Só nos testes. */
  ler?: LeitorPauta;
  hoje?: string;
}>();

const p = usePauta({
  ambiente: props.ambiente,
  opcoes: props.opcoes,
  armazenamento: props.armazenamento,
  ...(props.foco ? { foco: props.foco } : {}),
  ...(props.aoConhecerOrgaos ? { aoConhecerOrgaos: props.aoConhecerOrgaos } : {}),
  ...(props.ler ? { ler: props.ler } : {}),
  ...(props.hoje ? { hoje: props.hoje } : {}),
});
const e = p.estado;
const mostrarDiagnostico = ref(false);
const lista = ref<HTMLElement | null>(null);

// ── Filtros ──────────────────────────────────────────────────────────────────────────────────
const opcoesOrgao = computed<OpcaoBusca[]>(() => e.orgaos.map((o) => ({ valor: String(o.id), rotulo: rotuloDoOrgao(o), detalhe: o.nome })));
const opcoesSala = computed<OpcaoBusca[]>(() => {
  const o = p.orgao();
  if (!o) return [];
  const salas = o.salas.map((s) => ({ valor: String(s.id), rotulo: s.nome }));
  return o.salas.length > 1 ? [...salas, { valor: 'todas', rotulo: 'Todas as salas', detalhe: 'só leitura' }] : salas;
});
const opcoesMes = computed<OpcaoBusca[]>(() => e.meses.map((m) => ({ valor: m.chave, rotulo: m.rotulo })));

const orgaoEscolhido = computed({
  get: () => (e.idOrgao === null ? '' : String(e.idOrgao)),
  set: (v: string) => void p.escolherOrgao(Number(v)),
});
const salaEscolhida = computed({
  get: () => (e.sala === null ? '' : String(e.sala)),
  set: (v: string) => void p.escolherSala(v === 'todas' ? 'todas' : Number(v)),
});
const mesEscolhido = computed({
  get: () => e.mesVisivel,
  set: (v: string) => irParaMes(v),
});
const soConsulta = computed(() => p.orgao()?.logado === false);
const todasAsSalas = computed(() => e.sala === 'todas');

// ── Rolagem: o mês no alto e o salto pela combobox (D91) ────────────────────────────────────
function irParaMes(chave: string) {
  e.mesVisivel = chave;
  const alvo = lista.value?.querySelector<HTMLElement>(`[data-mes="${chave}"]`);
  if (lista.value && alvo) lista.value.scrollTop = alvo.offsetTop;
}

let quadro = 0;
function aoRolar() {
  cancelAnimationFrame(quadro);
  quadro = requestAnimationFrame(() => {
    const l = lista.value;
    if (!l) return;
    let atual = e.meses[0]?.chave ?? '';
    for (const d of l.querySelectorAll<HTMLElement>('[data-mes]')) {
      if (d.offsetTop <= l.scrollTop + 8) atual = d.dataset['mes'] ?? atual;
    }
    if (atual) e.mesVisivel = atual;
  });
}

// ── Carga progressiva (D92): cada dia é lido quando chega perto da tela ─────────────────────
const elementos = new Map<string, Element>();
let observador: IntersectionObserver | null = null;

function observarDia(dia: string, el: Element | null) {
  const anterior = elementos.get(dia);
  if (anterior === el) return;
  if (anterior) observador?.unobserve(anterior);
  if (!el) {
    elementos.delete(dia);
    return;
  }
  elementos.set(dia, el);
  if (observador) observador.observe(el);
  else {
    // Sem IntersectionObserver (não deveria acontecer nos navegadores suportados): lê na hora.
    p.marcarVisivel(dia, true);
    p.pedirDia(dia);
  }
}

onMounted(async () => {
  if (typeof IntersectionObserver === 'function') {
    observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          const dia = (entrada.target as HTMLElement).dataset['dia'];
          if (!dia) continue;
          p.marcarVisivel(dia, entrada.isIntersecting);
          if (entrada.isIntersecting) p.pedirDia(dia);
        }
      },
      // Um pouco antes de aparecer, para a linha já estar pronta quando chegar.
      { root: lista.value, rootMargin: '300px 0px' },
    );
    for (const el of elementos.values()) observador.observe(el);
  }
  await p.iniciar();
  // Pelo Individual: rola até o dia da audiência (D90).
  if (props.foco) {
    requestAnimationFrame(() => {
      const alvo = lista.value?.querySelector<HTMLElement>(`[data-dia="${props.foco!.dia}"]`);
      if (lista.value && alvo) lista.value.scrollTop = Math.max(0, alvo.offsetTop - 40);
    });
  }
});
onUnmounted(() => {
  observador?.disconnect();
  cancelAnimationFrame(quadro);
});

// ── Linhas ───────────────────────────────────────────────────────────────────────────────────
function resumoDoDia(d: EstadoDia): string {
  if (d.estado === 'espera' || d.estado === 'carregando') return 'consultando…';
  if (d.estado === 'erro') return 'erro ao consultar';
  const aud = d.linhas.filter((l) => l.tipo === 'audiencia').length;
  const vagas = d.linhas.length - aud;
  if (!d.linhas.length) return 'sem pauta';
  return `${aud} audiência${aud === 1 ? '' : 's'} · ${vagas} vaga${vagas === 1 ? '' : 's'} livre${vagas === 1 ? '' : 's'}`;
}

function textoAviso(dia: string, d: EstadoDia): { classe: string; texto: string } | null {
  const a = p.avisoDoDia(dia);
  if (!a) return null;
  if (a.nivel === 'avisa') return { classe: 'aviso-texto', texto: a.texto };
  const aud = d.linhas.filter((l) => l.tipo === 'audiencia').length;
  return { classe: 'erro-texto', texto: aud ? `${a.texto}: há ${aud} audiência(s), será necessário redesignar` : a.texto };
}

const polo = (x?: { nome: string; varios: boolean }) => (x ? `${x.nome}${x.varios ? ' (+)' : ''}` : '—');
function partes(l: LinhaPauta): string {
  if (l.segredo) return 'Segredo de justiça';
  return `${polo(l.poloAtivo)} × ${polo(l.poloPassivo)}`;
}

function dicaAdvogados(idProcesso?: number): string {
  if (idProcesso === undefined) return '';
  if (!e.advogados.has(idProcesso)) return 'Advogados: passe o mouse ou clique para consultar';
  return e.advogados.get(idProcesso) ?? 'Consultando os advogados…';
}

const urlProcesso = (id?: number) => (id === undefined ? undefined : `${props.ambiente.origem}/pjekz/processo/${id}/detalhe`);
const ehDestaque = (dia: string, l: LinhaPauta) =>
  Boolean(e.destaque && e.destaque.dia === dia && e.destaque.idProcesso !== undefined && l.idProcesso === e.destaque.idProcesso);
</script>

<template>
  <!-- O diagnóstico abre por cima: a Pauta fica montada, com a lista e o que já foi lido. -->
  <div class="pauta-fundo">
    <div class="pauta-janela" role="dialog" aria-label="AudAid, Pauta">
      <header class="cabecalho cabecalho-pauta">
        <h1>AudAid · Pauta</h1>
        <template v-if="p.logado">
          <span class="separador">|</span>
          <span>logado em {{ p.logado.descricao }}</span>
        </template>
        <span class="separador">|</span>
        <span>só leitura: nada é gravado no PJe</span>
        <button class="acao secundaria pequena botao-diagnostico" type="button" title="A prova técnica da Pauta (entrega 0)" @click="mostrarDiagnostico = true">
          Diagnóstico
        </button>
        <button class="fechar" type="button" title="Fechar" @click="aoFechar()">×</button>
      </header>

      <section v-if="e.erro" class="corpo">
        <div class="cartao">
          <div class="cartao-topo"><h2>Não foi possível abrir</h2><span class="selo erro">ERRO</span></div>
          <div class="cartao-corpo erro-texto">{{ e.erro }}</div>
        </div>
      </section>
      <template v-else>
        <div class="filtros-pauta">
          <div class="filtro filtro-orgao">
            <label for="pauta-orgao">Órgão</label>
            <CampoBusca id="pauta-orgao" v-model="orgaoEscolhido" :opcoes="opcoesOrgao" :desabilitado="e.carregando" />
          </div>
          <div class="filtro filtro-sala">
            <label for="pauta-sala">Sala</label>
            <CampoBusca id="pauta-sala" v-model="salaEscolhida" :opcoes="opcoesSala" :desabilitado="e.carregando || !opcoesSala.length" />
          </div>
          <div class="filtro filtro-mes">
            <label for="pauta-mes">Mês</label>
            <CampoBusca id="pauta-mes" v-model="mesEscolhido" :opcoes="opcoesMes" :desabilitado="e.carregando" />
          </div>
          <!-- O selo tem lugar fixo: some no órgão logado sem mover nada (D90). -->
          <span class="selo-consulta" :class="{ oculto: !soConsulta }" title="Neste órgão, a Pauta só mostra">só consulta</span>
          <button class="acao secundaria" type="button" :disabled="e.carregando" title="Ler de novo os dias na tela" @click="p.atualizar()">Atualizar</button>
        </div>
        <div v-for="a in e.avisos" :key="a" class="faixa-aviso-pauta">{{ a }}</div>

        <div ref="lista" class="lista-pauta" @scroll="aoRolar">
          <p v-if="e.carregando" class="suave carregando-orgaos">Lendo os seus órgãos e salas…</p>
          <p v-else-if="p.orgao() && !p.orgao()!.salas.length" class="suave carregando-orgaos">Este órgão não tem salas de audiência.</p>
          <template v-else>
            <template v-for="m in e.meses" :key="m.chave">
              <h2 class="divisor-mes" :data-mes="m.chave">{{ m.rotulo }}</h2>
              <p v-if="!m.dias.some((dia) => p.diaVisivel(dia))" class="vazio-dia suave">Nenhum dia útil daqui até o fim do mês.</p>
              <!-- D90: o fim de semana só aparece quando o mês da sala diz que ele tem algo. -->
              <template v-for="dia in m.dias" :key="dia">
              <section v-if="p.diaVisivel(dia)" :ref="(el) => observarDia(dia, el as Element | null)" class="dia-pauta" :data-dia="dia">
                <!-- Uma leitura do estado por dia e por desenho (o v-for de um item só faz de variável). -->
                <template v-for="d in [p.diaDaSelecao(dia)]" :key="dia">
                <header class="cab-dia">
                  <strong>{{ rotuloDoDia(dia) }}</strong>
                  <span class="suave"> · {{ resumoDoDia(d) }}</span>
                  <template v-for="aviso in [textoAviso(dia, d)]" :key="dia">
                    <span v-if="aviso" :class="aviso.classe"> · {{ aviso.texto }}</span>
                  </template>
                </header>
                <div v-if="d.estado === 'espera' || d.estado === 'carregando'" class="esqueleto" aria-hidden="true">
                  <span></span>
                </div>
                <div v-else-if="d.estado === 'erro'" class="erro-dia">
                  <span class="erro-texto">Erro ao ler a pauta: {{ d.erro }}</span>
                  <button class="acao secundaria pequena" type="button" @click="p.tentarDeNovo(dia)">Tentar de novo</button>
                </div>
                <p v-else-if="!d.linhas.length" class="vazio-dia suave">Não há audiências nem vagas configuradas para esta sala neste dia</p>
                <template v-else>
                  <p v-if="d.erro" class="aviso-texto vazio-dia">{{ d.erro }}</p>
                  <table class="tabela-pauta">
                    <tr
                      v-for="(l, i) in d.linhas"
                      :key="`${l.sala ?? ''}${l.hora}-${l.idProcesso ?? 'vaga'}-${i}`"
                      :class="[l.tipo === 'vaga' ? 'linha-vaga' : 'linha-audiencia', { destaque: ehDestaque(dia, l) }]"
                    >
                      <td class="hora">{{ l.hora }}</td>
                      <td v-if="todasAsSalas" class="sala-linha">{{ l.sala }}</td>
                      <td v-if="l.tipo === 'vaga'" colspan="3">
                        <!-- O separador fica dentro do texto: espaço sozinho no começo de um elemento o Vue descarta. -->
                        <span class="selo-vaga">Vaga livre</span>
                        <span v-if="l.descricaoTipo" class="suave"> · {{ l.descricaoTipo }}</span>
                      </td>
                      <template v-else>
                        <td class="numero">
                          <a :href="urlProcesso(l.idProcesso)" target="_blank" rel="noopener noreferrer" title="Abrir o processo numa aba nova">{{ l.nrProcesso ?? l.idProcesso }}</a>
                        </td>
                        <td class="partes-linha">
                          {{ partes(l) }}
                          <button
                            v-if="l.idProcesso !== undefined && !l.segredo"
                            class="ajuda botao-ajuda"
                            type="button"
                            :title="dicaAdvogados(l.idProcesso)"
                            :aria-label="dicaAdvogados(l.idProcesso)"
                            @mouseenter="p.pedirAdvogados(l.idProcesso!)"
                            @focus="p.pedirAdvogados(l.idProcesso!)"
                            @click="p.pedirAdvogados(l.idProcesso!)"
                          >
                            (?)
                          </button>
                        </td>
                        <td class="tipo-linha">
                          {{ l.descricaoTipo ?? '—' }}
                          <span v-if="l.processo?.juizoDigital" class="selo-digital">100% Digital</span>
                        </td>
                      </template>
                    </tr>
                  </table>
                </template>
                </template>
              </section>
              </template>
            </template>
            <div class="fim-pauta">
              <button class="acao secundaria" type="button" @click="p.carregarMaisUmMes()">Carregar mais um mês</button>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
  <DiagnosticoPauta v-if="mostrarDiagnostico" :ambiente="ambiente" :versao="versao" :ao-fechar="() => (mostrarDiagnostico = false)" />
</template>

<style>
/* A janela de tela cheia sobre o PJe, como a do Lote (D19). Também serve ao diagnóstico, que abre por cima. */
.pauta-fundo { position: fixed; inset: 0; z-index: 2147483647; background: rgba(20, 28, 38, .45); }
.pauta-janela {
  position: absolute; inset: 16px; margin: 0 auto; max-width: 1280px;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--cor-fundo); border: 1px solid var(--cor-borda); border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,.25);
}
.cabecalho-pauta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; padding-right: 44px; color: var(--cor-suave); position: relative; }
.cabecalho-pauta h1 { margin: 0; color: var(--cor-texto); }
.cabecalho-pauta .separador { color: var(--cor-borda); }
.pauta-janela button.acao:disabled { opacity: .45; cursor: not-allowed; }
.botao-diagnostico { margin-left: auto; align-self: center; }
.filtros-pauta { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px 12px; padding: 10px 16px; border-bottom: 1px solid var(--cor-borda); background: var(--cor-fundo); }
.filtro { display: flex; flex-direction: column; gap: 2px; }
.filtro label { color: var(--cor-suave); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; }
.filtro-orgao { width: 240px; }
.filtro-sala { width: 220px; }
.filtro-mes { width: 170px; }
.selo-consulta { align-self: center; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: #eceff3; color: var(--cor-suave); }
.selo-consulta.oculto { visibility: hidden; }
.faixa-aviso-pauta { background: var(--cor-aviso-fundo); color: var(--cor-aviso); padding: 5px 16px; font-size: 12px; border-bottom: 1px solid #e6c46a; }
.lista-pauta { position: relative; flex: 1; overflow: auto; padding: 0 16px 24px; }
.carregando-orgaos { padding: 16px 0; }
.divisor-mes { margin: 18px 0 6px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--cor-marca); border-bottom: 2px solid var(--cor-marca); padding-bottom: 2px; }
.dia-pauta { margin-bottom: 6px; }
.cab-dia { position: sticky; top: 0; z-index: 2; background: var(--cor-fundo-2); padding: 5px 8px; border-radius: 4px; font-size: 12px; }
.esqueleto { padding: 6px 8px; }
.esqueleto span { display: block; height: 14px; border-radius: 4px; background: linear-gradient(90deg, #eceff3 25%, #f6f8fa 50%, #eceff3 75%); background-size: 200% 100%; animation: brilho 1.2s linear infinite; }
@keyframes brilho { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.vazio-dia { margin: 4px 8px; font-size: 12px; }
.erro-dia { display: flex; gap: 8px; align-items: center; margin: 4px 8px; font-size: 12px; }
.tabela-pauta { margin-top: 2px; }
.tabela-pauta td { padding: 4px 8px; vertical-align: middle; }
.tabela-pauta .hora { width: 52px; font-variant-numeric: tabular-nums; }
.tabela-pauta .sala-linha { width: 150px; color: var(--cor-suave); }
.tabela-pauta .numero { width: 210px; }
.tabela-pauta .numero a { color: var(--cor-marca); text-decoration: none; font-variant-numeric: tabular-nums; }
.tabela-pauta .numero a:hover { text-decoration: underline; }
.tabela-pauta .tipo-linha { width: 34%; }
.linha-vaga td { background: #fff4e5; border-top: 1px dashed #f0a35b; border-bottom: 1px dashed #f0a35b; }
.selo-vaga { font-size: 11px; font-weight: 700; color: #a35a00; }
.selo-digital { margin-left: 6px; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; background: #e8f0fe; color: #1a56c4; white-space: nowrap; }
.linha-audiencia.destaque td { background: var(--cor-aviso-fundo); font-weight: 600; }
.botao-ajuda { border: 0; background: none; padding: 0 2px; font: inherit; }
.fim-pauta { display: flex; justify-content: center; padding: 16px 0; }
</style>
