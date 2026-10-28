<script setup lang="ts">
// Um intervalo da lista (D14). O manual se arrasta, tem início editável (âncora, D55) e duração
// própria; o automático ("a cada N") é recalculado e não se edita aqui.
import type { Arrastar } from './arrastar';
import type { EstadoPauta, LinhaVista } from './estadoPauta';
import { paraHora } from './pauta';

const props = defineProps<{ vista: LinhaVista; pauta: EstadoPauta; arr: Arrastar }>();
const emit = defineEmits<{ moverTeclado: [indice: number, passo: number] }>();

const manual = () => props.vista.linha.tipo === 'intervalo';
const valor = (ev: Event) => (ev.target as HTMLInputElement).value;

function mudarInicio(ev: Event) {
  const v = valor(ev);
  if (v !== paraHora(props.vista.linha.inicio)) props.pauta.definirInicio(props.vista.linha.chave, v);
}
function mudarDuracao(ev: Event) {
  props.pauta.definirDuracaoIntervalo(props.vista.linha.chave, Number(valor(ev)));
}
</script>

<template>
  <div
    v-if="manual()"
    :class="[
      'linha-lote',
      'linha-intervalo',
      { arrastando: arr.origem === vista.linha.indice, 'alvo-antes': arr.alvo?.indice === vista.linha.indice && arr.alvo.posicao === 'antes', 'alvo-depois': arr.alvo?.indice === vista.linha.indice && arr.alvo.posicao === 'depois' },
    ]"
    data-linha
    :draggable="arr.liberada === vista.linha.indice"
    @dragstart="arr.iniciar(vista.linha.indice, $event)"
    @dragover="arr.sobre(vista.linha.indice, $event)"
    @drop="arr.largar($event)"
    @dragend="arr.terminar()"
  >
    <span
      class="alca"
      role="button"
      tabindex="0"
      :data-alca="vista.linha.indice"
      title="Arraste para mudar a ordem (ou use ↑ e ↓)"
      @pointerdown="arr.segurar(vista.linha.indice, $event)"
      @pointerup="arr.soltarAlca()"
      @keydown.up.prevent="emit('moverTeclado', vista.linha.indice, -1)"
      @keydown.down.prevent="emit('moverTeclado', vista.linha.indice, 1)"
      >::</span
    >
    <span class="ordem"></span>
    <div class="dados rotulo-intervalo">Intervalo</div>
    <span></span>
    <label class="campo-item">
      <span>Início</span>
      <input type="time" :value="paraHora(vista.linha.inicio)" :class="{ ancorado: vista.linha.ancorado }" @change="mudarInicio" />
    </label>
    <label class="campo-item">
      <span>Duração</span>
      <input type="number" min="1" max="600" :value="vista.linha.duracao" @change="mudarDuracao" />
    </label>
    <span></span>
    <span></span>
    <button class="remover" type="button" title="Tirar o intervalo" @click="pauta.remover(vista.linha.chave)">×</button>
    <div class="aviso-linha" :title="vista.avisos.join('\n')">{{ vista.avisos[0] ?? '' }}</div>
  </div>
  <div v-else class="linha-lote linha-intervalo automatico">
    <span class="alca"></span>
    <span class="ordem"></span>
    <div class="dados rotulo-intervalo">Intervalo automático (a cada {{ pauta.topo.intervalo.aCada }})</div>
    <span></span>
    <div class="campo-item"><span>Início</span><span class="valor-fixo">{{ paraHora(vista.linha.inicio) }}</span></div>
    <div class="campo-item"><span>Duração</span><span class="valor-fixo">{{ vista.linha.duracao }} min</span></div>
    <span></span>
    <span></span>
    <span></span>
    <div class="aviso-linha"></div>
  </div>
</template>
