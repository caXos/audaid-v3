<script setup lang="ts">
// Tela 2 do Lote (§2.3): "Não incluídos", campos do topo, a lista arrastável e o "Continuar".
// O estado é o de estadoPauta.ts; as linhas, ItemLote.vue, IntervaloLote.vue, e, com a pauta do
// PJe (rodada 15), VagaLote.vue e ForaLote.vue. Cores (D77): o fundo diz de onde vem a linha, e o
// conflito fica na borda esquerda e no texto do aviso.
import { nextTick, ref } from 'vue';
import Dialogo from '../componentes/Dialogo.vue';
import { useArrastar } from './arrastar';
import DialogoGigsItem from './DialogoGigsItem.vue';
import type { EstadoLote } from './estadoLote';
import ForaLote from './ForaLote.vue';
import IntervaloLote from './IntervaloLote.vue';
import ItemLote from './ItemLote.vue';
import TopoLote from './TopoLote.vue';
import VagaLote from './VagaLote.vue';

const props = defineProps<{ lote: EstadoLote }>();

const lista = ref<HTMLElement | null>(null);
const editandoGigs = ref<string | null>(null);
const dialogoNaoIncluidos = ref<{ abrir(): void } | null>(null);
const dialogoOrdenar = ref<{ abrir(): void; fechar(): void } | null>(null);
/** Conjunto escolhido na dropdown, à espera da confirmação (D48e). */
const ordenacaoPendente = ref<string | null>(null);

/**
 * Auto organizar (D48, D63): escolher um conjunto aplica na hora. Se a lista já foi arrastada à
 * mão, pergunta antes; até a resposta, a dropdown continua mostrando o valor anterior.
 */
function escolherOrdenacao(ev: Event) {
  const pauta = props.lote.pauta;
  if (!pauta) return;
  const select = ev.target as HTMLSelectElement;
  const nome = select.value;
  if (!nome) {
    pauta.ordemManual();
    return;
  }
  if (!pauta.arrastadaAMao) {
    pauta.aplicarOrdenacao(nome);
    return;
  }
  select.value = pauta.ordenacao ?? '';
  ordenacaoPendente.value = nome;
  dialogoOrdenar.value?.abrir();
}

function confirmarOrdenacao() {
  if (ordenacaoPendente.value) props.lote.pauta?.aplicarOrdenacao(ordenacaoPendente.value);
  ordenacaoPendente.value = null;
  dialogoOrdenar.value?.fechar();
}

function manterOrdem() {
  ordenacaoPendente.value = null;
  dialogoOrdenar.value?.fechar();
}
const arr = useArrastar((de, para) => props.lote.pauta?.mover(de, para));

/** ↑ e ↓ na alça: move e mantém o foco na mesma linha, na posição nova. */
async function moverTeclado(indice: number, passo: number) {
  const pauta = props.lote.pauta;
  if (!pauta) return;
  let para = indice + passo;
  // Pelas vagas, o vizinho é o processo anterior ou o seguinte (as de fora e os intervalos não têm vez).
  if (pauta.modo === 'vagas') while (para >= 0 && para < pauta.itens.length && pauta.itens[para]!.tipo !== 'processo') para += passo;
  if (para < 0 || para >= pauta.itens.length) return;
  pauta.mover(indice, para);
  await nextTick();
  lista.value?.querySelector<HTMLElement>(`[data-alca="${para}"]`)?.focus();
}
</script>

<template>
  <template v-if="lote.pauta">
    <!-- D60: a lista dos não incluídos, com os motivos, abre num diálogo (o botão fica na barra da pauta). -->
    <Dialogo
      v-if="lote.naoIncluidos.length"
      ref="dialogoNaoIncluidos"
      class="dialogo-nao-incluidos"
      :titulo="`Não incluídos (${lote.naoIncluidos.length})`"
      dica="Ficaram fora da pauta. Para incluir um deles, resolva o motivo e use &quot;Voltar ao texto&quot;."
    >
      <ul class="lista-nao-incluidos">
        <li v-for="n in lote.naoIncluidos" :key="n.numero"><span class="numero">{{ n.numero }}</span> · {{ n.motivo }}</li>
      </ul>
    </Dialogo>

    <!-- D48e: só pergunta quando há algo a perder (a lista foi arrastada à mão). -->
    <Dialogo
      ref="dialogoOrdenar"
      class="dialogo-ordenar"
      titulo="Reordenar a lista?"
      :dica="`A ordem que você montou será substituída por: ${ordenacaoPendente ?? ''}.`"
      @close="ordenacaoPendente = null"
    >
      <div class="linha-form">
        <button class="acao" type="button" @click="confirmarOrdenacao">Reordenar</button>
        <button class="acao secundaria" type="button" @click="manterOrdem">Manter a minha ordem</button>
      </div>
    </Dialogo>

    <TopoLote :pauta="lote.pauta" />

    <section class="cartao">
      <div class="cartao-topo">
        <h2>2. Pauta: {{ lote.pauta.quantidade }} processo(s)</h2>
        <!-- D63: o Auto organizar fica junto da lista que ele reordena. -->
        <label class="ordenar">
          Ordenar:
          <select :value="lote.pauta.ordenacao ?? ''" title="Auto organizar: os conjuntos de regras ficam nas Opções do AudAid" @change="escolherOrdenacao">
            <option value="">Ordem manual</option>
            <option v-for="c in lote.pauta.conjuntos" :key="c.nome" :value="c.nome">{{ c.nome }}</option>
          </select>
        </label>
        <!-- D60: junto da contagem e do "Voltar ao texto", que é como se resolve; não gasta linha. -->
        <button
          v-if="lote.naoIncluidos.length"
          class="acao secundaria aviso"
          type="button"
          title="Ficaram fora da pauta: clique para ver quais e por quê"
          @click="dialogoNaoIncluidos?.abrir()"
        >
          Não incluídos ({{ lote.naoIncluidos.length }})
        </button>
        <span v-if="lote.pauta.intervalosOcultos" class="suave pequeno" title="Voltam se os horários forem em sequência">
          {{ lote.pauta.intervalosOcultos }} intervalo(s) manual(is) não vale(m) pelas vagas
        </span>
        <button
          class="acao secundaria"
          type="button"
          :disabled="lote.pauta.modo === 'vagas'"
          :title="lote.pauta.modo === 'vagas' ? 'Pelas vagas, para um intervalo, deixe vagas livres' : ''"
          @click="lote.pauta.adicionarIntervalo()"
        >
          Adicionar intervalo
        </button>
        <button class="acao secundaria" type="button" @click="lote.voltarAoTexto()">Voltar ao texto</button>
      </div>
      <div ref="lista" class="cartao-corpo lista-pauta">
        <template v-for="v in lote.pauta.linhas" :key="v.linha.chave">
          <ItemLote v-if="v.linha.tipo === 'processo'" :vista="v" :pauta="lote.pauta" :arr="arr" @editar-gigs="(c) => (editandoGigs = c)" @mover-teclado="moverTeclado" />
          <ForaLote v-else-if="v.linha.tipo === 'fora'" :vista="v" :pauta="lote.pauta" :arr="arr" />
          <VagaLote v-else-if="v.linha.tipo === 'vaga'" :vista="v" :pauta="lote.pauta" />
          <IntervaloLote v-else :vista="v" :pauta="lote.pauta" :arr="arr" @mover-teclado="moverTeclado" />
        </template>
        <div v-if="!lote.pauta.linhas.length" class="suave">A lista está vazia. Volte ao texto e cole os processos.</div>
      </div>
    </section>

    <div v-if="lote.confirmandoSobreposicao" class="confirmacao">
      <strong>Há horários sobrepostos (em amarelo).</strong> O PJe aceita, porque só vê o minuto de início de cada audiência, mas a
      pauta planejada se atropela. Continuar mesmo assim?
      <div class="linha-form">
        <button class="acao" type="button" @click="lote.avancar(true)">Continuar mesmo assim</button>
        <button class="acao secundaria" type="button" @click="lote.cancelarConfirmacao()">Voltar e ajustar</button>
      </div>
    </div>
    <div class="rodape-pauta">
      <button class="acao" type="button" :disabled="lote.pauta.pendencias.length > 0" @click="lote.avancar()">Continuar</button>
      <ul class="pendencias">
        <li v-for="(p, i) in lote.pauta.pendencias" :key="i">{{ p }}</li>
      </ul>
    </div>

    <DialogoGigsItem v-if="editandoGigs" :key="editandoGigs" :pauta="lote.pauta" :chave="editandoGigs" @fechar="editandoGigs = null" />
  </template>
</template>

<style>
.lista-nao-incluidos { max-height: 340px; overflow: auto; margin: 0; padding-left: 18px; border: 1px solid #eef1f4; border-radius: 6px; padding-top: 6px; padding-bottom: 6px; }
.lista-nao-incluidos li { margin: 2px 0; }
.ordenar { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--cor-suave); font-weight: 600; }
.ordenar select { max-width: 420px; font-weight: 400; }
.lista-pauta { display: flex; flex-direction: column; gap: 0; padding: 0; }
.linha-lote {
  display: grid; align-items: center; gap: 2px 10px; padding: 6px 10px;
  grid-template-columns: 20px 22px minmax(220px, 1.6fr) minmax(220px, 1.3fr) 96px 70px minmax(150px, 1fr) 104px 24px;
  border-top: 1px solid #eef1f4; border-left: 5px solid transparent; background: var(--cor-fundo);
}
.linha-lote:first-child { border-top: 0; }
.linha-intervalo { background: var(--cor-fundo-2); }
.linha-intervalo.automatico { color: var(--cor-suave); font-style: italic; }
.linha-lote .aviso-linha {
  grid-column: 3 / -1; height: 22px; line-height: 22px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--cor-erro);
}
.aviso-linha .texto-aviso { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.aviso-linha select { font-size: 11px; padding: 0 2px; max-width: 200px; }
.linha-lote .aviso-linha.suave-linha { color: var(--cor-suave); }
/* D77: o fundo diz de onde vem a linha; o conflito, só a borda e o texto. */
.linha-lote.na-vaga { background: #eaf2fe; }
.linha-lote.linha-vaga { background: #fff3e6; border-top: 1px dashed #e8a35c; border-bottom: 1px dashed #e8a35c; }
.linha-lote.linha-vaga.deixada { background: #fffaf3; }
.linha-lote.linha-fora { background: #f3ecfb; }
.linha-lote.sinal-sobreposto, .linha-lote.conflito-amarelo { border-left-color: #e6c46a; }
.linha-lote.sinal-sobreposto .aviso-linha, .aviso-linha.conflito-amarelo { color: var(--cor-aviso); }
.linha-lote.sinal-mesmo-minuto, .linha-lote.sinal-apos-meia-noite, .linha-lote.conflito-vermelho { border-left-color: var(--cor-erro); }
.aviso-linha.conflito-vermelho { color: var(--cor-erro); }
.selo-mini.vaga-livre { background: #fde3c4; color: #8a4b00; }
.selo-mini.ja-na-pauta { background: #e4d6f5; color: #5b2a91; }
.selo-mini.sem-mudanca { background: var(--cor-ok-fundo); color: var(--cor-ok); cursor: help; }
.pequeno { font-size: 11px; }
.campo-vaga select { font-size: 12px; max-width: 96px; }
.campo-vaga select.ancorado { border-color: var(--cor-marca); font-weight: 700; }
.campo-vaga button { align-self: flex-start; margin-top: 2px; }
.linha-lote.arrastando { opacity: .45; }
.linha-lote.alvo-antes { box-shadow: inset 0 3px 0 var(--cor-marca); }
.linha-lote.alvo-depois { box-shadow: inset 0 -3px 0 var(--cor-marca); }
.alca { cursor: grab; color: var(--cor-suave); font-weight: 700; letter-spacing: -1px; user-select: none; text-align: center; }
.alca:focus-visible { outline: 2px solid var(--cor-marca); outline-offset: 2px; border-radius: 3px; }
.ordem { color: var(--cor-suave); font-variant-numeric: tabular-nums; text-align: right; }
.dados { min-width: 0; }
.linha-numero { display: flex; gap: 6px; align-items: center; }
/* D61: o nome encolhe com "…"; "(+X)" e "(?)" nunca somem. */
.linha-parte { display: flex; gap: 4px; align-items: baseline; min-width: 0; font-size: 12px; }
.nome-parte { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.linha-parte .ajuda { flex: none; }
.rotulo-intervalo { font-weight: 600; }
.selo-mini { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 999px; background: #e8f0fe; color: #1a56c4; white-space: nowrap; }
.selo-mini.redesignar { background: var(--cor-aviso-fundo); color: var(--cor-aviso); cursor: help; }
.selo-mini.ajustado { background: var(--cor-aviso-fundo); color: var(--cor-aviso); }
.selo-mini.padrao { background: #eceff3; color: var(--cor-suave); }
.tipo-item { min-width: 0; }
.controles-item { display: flex; gap: 6px; align-items: center; }
.controles-item select { max-width: 170px; }
.tipo-resolvido { font-size: 11px; color: var(--cor-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.campo-item { display: flex; flex-direction: column; font-size: 11px; color: var(--cor-suave); }
.campo-item input { font-size: 12px; }
.campo-item input[type="number"] { width: 64px; }
.campo-item input.ancorado { border-color: var(--cor-marca); font-weight: 700; }
.valor-fixo { font-size: 12px; color: var(--cor-texto); padding: 4px 0; }
.gigs-item, .ajustes-item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; font-size: 12px; }
.resumo-gigs { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.remover { background: none; border: 0; font-size: 18px; color: var(--cor-suave); cursor: pointer; line-height: 1; }
.remover:hover { color: var(--cor-erro); }
.rodape-pauta { display: flex; gap: 10px; align-items: flex-start; margin: 10px 0; }
.rodape-pauta .pendencias { height: 6em; }
.confirmacao { border: 2px solid #f0a14a; background: #fffaf3; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
</style>
