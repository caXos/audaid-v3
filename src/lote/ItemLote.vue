<script setup lang="ts">
// Uma audiência da lista (tela 2, como em ControleEmLote_Exemplo_ListaProcessos.png): alça, ordem,
// processo com partes, tipo e vídeo, início (editável: vira âncora, D55), duração, GIGS e ajustes.
import { formatarDataHora } from '../ui/dom';
import { TIPOS_BASE } from '../regras/tipoComposto';
import { dicaAdvogados, resumoGigs, resumoPolo } from './apresentacao';
import type { Arrastar } from './arrastar';
import type { EstadoPauta, LinhaVista } from './estadoPauta';
import { paraHora } from './pauta';

const props = defineProps<{ vista: LinhaVista; pauta: EstadoPauta; arr: Arrastar }>();
const emit = defineEmits<{ editarGigs: [chave: string]; moverTeclado: [indice: number, passo: number] }>();

const chave = () => props.vista.item!.chave;
const valor = (ev: Event) => (ev.target as HTMLInputElement).value;

function mudarTipo(ev: Event) {
  props.pauta.ajustar(chave(), 'tipoBase', valor(ev));
}
function mudarVideo(ev: Event) {
  props.pauta.ajustar(chave(), 'video', (ev.target as HTMLInputElement).checked);
}
function mudarDuracao(ev: Event) {
  props.pauta.ajustar(chave(), 'duracao', Number(valor(ev)));
}
function mudarInicio(ev: Event) {
  const v = valor(ev);
  if (v !== paraHora(props.vista.linha.inicio)) props.pauta.definirInicio(chave(), v);
}
</script>

<template>
  <div
    :class="[
      'linha-lote',
      'linha-processo',
      `sinal-${vista.linha.sinal}`,
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
    <span class="ordem">{{ vista.linha.ordem }}</span>
    <div class="dados">
      <div class="linha-numero">
        <span class="numero">{{ vista.item!.chave }}</span>
        <span v-if="vista.processo?.processo.juizoDigital" class="selo-mini">100% Digital</span>
        <span
          v-if="vista.processo?.antiga"
          class="selo-mini redesignar"
          :title="`Audiência de ${formatarDataHora(vista.processo.antiga.dataInicio)} (${vista.processo.antiga.tipo?.descricao ?? '?'}) no órgão: a tela 3 vai oferecer redesigná-la`"
          >tem audiência</span
        >
      </div>
      <!-- D61: autor numa linha, réu na outra; só a primeira parte, com "(+X)" e "(?)" sempre visíveis. -->
      <template v-if="vista.processo">
        <div v-for="polo in [vista.processo.partes.autores, vista.processo.partes.reus]" :key="polo === vista.processo.partes.autores ? 'autores' : 'reus'" class="linha-parte">
          <span class="nome-parte" :title="resumoPolo(polo).nome">{{ resumoPolo(polo).nome }}</span>
          <span v-if="resumoPolo(polo).mais" class="ajuda" :title="resumoPolo(polo).outros">(+{{ resumoPolo(polo).mais }})</span>
          <span v-if="polo.length" class="ajuda" :title="dicaAdvogados(polo)">(?)</span>
        </div>
      </template>
    </div>
    <div class="tipo-item">
      <div class="controles-item">
        <select :value="vista.tipo?.base ?? ''" title="Tipo base desta audiência" @change="mudarTipo">
          <option value="">— escolha —</option>
          <option v-for="b in TIPOS_BASE" :key="b" :value="b">{{ b }}</option>
        </select>
        <label class="rotulo-check" :class="{ desabilitado: vista.tipo?.videoTravado ?? true }"
          ><input type="checkbox" :checked="vista.tipo?.video ?? false" :disabled="vista.tipo?.videoTravado ?? true" @change="mudarVideo" /> vídeo</label
        >
      </div>
      <div class="tipo-resolvido" :title="vista.tipo?.descricao">{{ vista.tipo?.descricao || '—' }}</div>
    </div>
    <label class="campo-item">
      <span>Início</span>
      <input type="time" :value="paraHora(vista.linha.inicio)" :class="{ ancorado: vista.linha.ancorado }" :title="vista.linha.ancorado ? 'Início fixo (âncora): os seguintes contam a partir dele' : 'Calculado. Editar fixa este horário.'" @change="mudarInicio" />
    </label>
    <label class="campo-item">
      <span>Duração</span>
      <input type="number" min="1" max="600" :value="vista.linha.duracao" @change="mudarDuracao" />
    </label>
    <div class="gigs-item">
      <span class="resumo-gigs" :title="vista.gigs?.lancar ? `${vista.gigs.texto}` : ''">{{ resumoGigs(vista.gigs?.lancar ?? false, vista.gigs?.texto ?? '', vista.gigs?.valores.prazo ?? 0) }}</span>
      <button class="acao secundaria pequena" type="button" @click="emit('editarGigs', vista.item!.chave)">editar</button>
    </div>
    <div class="ajustes-item">
      <span :class="['selo-mini', vista.ajustado ? 'ajustado' : 'padrao']">{{ vista.ajustado ? 'ajustado' : 'padrão' }}</span>
      <button class="acao secundaria pequena" type="button" :disabled="!vista.ajustado" @click="pauta.voltarAoPadrao(vista.item!.chave)">voltar ao padrão</button>
    </div>
    <button class="remover" type="button" title="Tirar da lista" @click="pauta.remover(vista.item!.chave)">×</button>
    <div class="aviso-linha" :title="vista.avisos.join('\n')">{{ vista.avisos[0] ?? '' }}</div>
  </div>
</template>
