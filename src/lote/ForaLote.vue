<script setup lang="ts">
// Uma audiência que já estava no dia, de um processo que o usuário não listou (D74): roxo-claro,
// selo "Já na pauta", com os dados da própria pauta do dia. Desde a entrega 7, editável direto
// (D81), com as ferramentas dos processos do lote: alça e início (em sequência) ou "Levar para a
// vaga", tipo e vídeo, duração e GIGS. A alterada ganha o selo "Alterada" e "Desfazer"; não há "×",
// porque tirar da pauta seria cancelar. A de processo que tramita em outro órgão fica fixa (D27).
import { reactive, ref } from 'vue';
import { TIPOS_BASE } from '../regras/tipoComposto';
import { resumoGigs } from './apresentacao';
import type { Arrastar } from './arrastar';
import { BLOQUEIAM } from './conferencia';
import type { EstadoPauta, LinhaVista } from './estadoPauta';
import { paraHora } from './pauta';
import { aplicarResolucao, opcoesDoAchado, type Opcao } from './resolucoes';

const props = defineProps<{ vista: LinhaVista; pauta: EstadoPauta; arr: Arrastar }>();
const emit = defineEmits<{ editarGigs: [chave: string]; moverTeclado: [indice: number, passo: number] }>();

const chave = () => props.vista.linha.chave;
const emSequencia = () => props.pauta.modo === 'sequencia';
const editavel = () => Boolean(props.vista.editavel);
const arrastavel = () => editavel() && emSequencia();
const fixo = () => (props.vista.item?.tipo === 'fora' ? (props.vista.item.alteracao?.inicio ?? '') : '');
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
/** "Levar para a vaga" (D73); vazio = fica onde está no PJe. */
function levarParaVaga(ev: Event) {
  props.pauta.definirInicio(chave(), (ev.target as HTMLSelectElement).value);
}
function sobre(ev: DragEvent) {
  if (emSequencia()) props.arr.sobre(props.vista.linha.indice, ev);
}
function largar(ev: DragEvent) {
  if (emSequencia()) props.arr.largar(ev);
}

// ── Conflitos na linha (D78), sem "remover" ──
const acionavel = () => props.vista.achados.find((a) => BLOQUEIAM.includes(a.tipo));
const escolhas = reactive<Record<string, Opcao>>({});
const aviso = ref('');
const opcoes = () => {
  const a = acionavel();
  return a ? opcoesDoAchado(a, props.pauta.modo, true) : [];
};
const escolhida = () => escolhas[acionavel()?.tipo ?? ''] ?? opcoes()[0]?.valor;
function resolver() {
  const a = acionavel();
  const opcao = escolhida();
  if (!a || !opcao) return;
  aviso.value = aplicarResolucao(props.pauta, props.pauta.entradasPje ?? [], chave(), a, opcao).aviso ?? '';
}

const textoPadrao = () => {
  if (props.vista.motivoFixa) return props.vista.motivoFixa;
  const o = props.vista.original;
  if (props.vista.alterada && o) return `Alterada: estava às ${o.hora}${o.descricaoTipo ? ` (${o.descricaoTipo})` : ''}. Pode ser necessário despacho ou intimação.`;
  return 'Já estava na pauta: só muda se você mexer nela.';
};
</script>

<template>
  <div
    :class="[
      'linha-lote',
      'linha-fora',
      `sinal-${vista.linha.sinal}`,
      {
        alterada: vista.alterada,
        'conflito-vermelho': acionavel(),
        arrastando: arr.origem === vista.linha.indice,
        'alvo-antes': arr.alvo?.indice === vista.linha.indice && arr.alvo.posicao === 'antes',
        'alvo-depois': arr.alvo?.indice === vista.linha.indice && arr.alvo.posicao === 'depois',
      },
    ]"
    data-linha
    :data-inicio="paraHora(vista.linha.inicio)"
    :draggable="arrastavel() && arr.liberada === vista.linha.indice"
    @dragstart="arrastavel() ? arr.iniciar(vista.linha.indice, $event) : $event.preventDefault()"
    @dragover="sobre"
    @drop="largar"
    @dragend="arr.terminar()"
  >
    <span
      v-if="arrastavel()"
      class="alca"
      role="button"
      tabindex="0"
      :data-alca="vista.linha.indice"
      title="Arraste para mudar a ordem (ou use ↑ e ↓): ela deixa o horário dela e segue a sequência"
      @pointerdown="arr.segurar(vista.linha.indice, $event)"
      @pointerup="arr.soltarAlca()"
      @keydown.up.prevent="emit('moverTeclado', vista.linha.indice, -1)"
      @keydown.down.prevent="emit('moverTeclado', vista.linha.indice, 1)"
      >::</span
    >
    <span v-else class="alca" :title="vista.motivoFixa ?? 'Pelas vagas, use &quot;Levar para a vaga&quot;'"></span>
    <span class="ordem"></span>
    <div class="dados">
      <div class="linha-numero">
        <span class="numero">{{ vista.fora?.nrProcesso ?? vista.fora?.idProcesso }}</span>
        <span class="selo-mini ja-na-pauta" title="Audiência que já estava no dia, de um processo que não está na sua lista">Já na pauta</span>
        <span v-if="vista.alterada" class="selo-mini alterada" :title="`Estava às ${vista.original?.hora} (${vista.original?.descricaoTipo ?? '?'})`">Alterada</span>
      </div>
      <div v-for="polo in [vista.fora?.poloAtivo, vista.fora?.poloPassivo]" :key="polo === vista.fora?.poloAtivo ? 'ativo' : 'passivo'" class="linha-parte">
        <span class="nome-parte" :title="polo?.nome">{{ polo?.nome ?? '—' }}</span>
        <span v-if="polo?.varios" class="ajuda" title="E outras partes neste polo">(+)</span>
      </div>
    </div>
    <div class="tipo-item">
      <div v-if="editavel()" class="controles-item">
        <select :value="vista.tipo?.base ?? ''" title="Tipo base desta audiência" @change="mudarTipo">
          <option v-if="!vista.tipo?.base" value="" disabled>— escolha —</option>
          <option v-for="b in TIPOS_BASE" :key="b" :value="b">{{ b }}</option>
        </select>
        <label class="rotulo-check" :class="{ desabilitado: vista.tipo?.videoTravado ?? true }"
          ><input type="checkbox" :checked="vista.tipo?.video ?? false" :disabled="vista.tipo?.videoTravado ?? true" @change="mudarVideo" /> vídeo</label
        >
      </div>
      <div class="tipo-resolvido" :title="vista.tipo?.descricao">{{ vista.tipo?.descricao || vista.fora?.descricaoTipo || '—' }}</div>
    </div>
    <label v-if="editavel() && !emSequencia()" class="campo-item campo-vaga">
      <span>Vaga</span>
      <select :value="fixo()" :class="{ ancorado: Boolean(fixo()) }" title="Levar para a vaga" @change="levarParaVaga">
        <option value="">{{ vista.original?.hora }} · onde está</option>
        <option v-for="h in pauta.vagasParaLevar(fixo()).filter((x) => x !== vista.original?.hora)" :key="h" :value="h">{{ h }}</option>
      </select>
    </label>
    <label v-else-if="editavel()" class="campo-item">
      <span>Início</span>
      <input type="time" :value="paraHora(vista.linha.inicio)" :class="{ ancorado: vista.linha.ancorado && Boolean(fixo()) }" title="Editar muda o horário dela no PJe" @change="mudarInicio" />
    </label>
    <div v-else class="campo-item" title="O horário dela no PJe">
      <span>Início</span><span class="valor-fixo">{{ paraHora(vista.linha.inicio) }}</span>
    </div>
    <label v-if="emSequencia()" class="campo-item" title="A pauta do PJe não diz quanto ela dura: só muda o desenho da pauta, nada vai ao PJe">
      <span>Duração</span>
      <input type="number" min="1" max="600" :value="vista.linha.duracao" @change="mudarDuracao" />
    </label>
    <span v-else></span>
    <div v-if="editavel()" class="gigs-item">
      <span class="resumo-gigs" :title="vista.gigs?.lancar ? vista.gigs.texto : ''">{{ resumoGigs(vista.gigs?.lancar ?? false, vista.gigs?.texto ?? '', vista.gigs?.valores.prazo ?? 0) }}</span>
      <button class="acao secundaria pequena" type="button" @click="emit('editarGigs', chave())">editar</button>
    </div>
    <span v-else></span>
    <div v-if="editavel()" class="ajustes-item">
      <button class="acao secundaria pequena" type="button" :disabled="!vista.ajustado" title="Volta ao horário e ao tipo que estão no PJe" @click="pauta.voltarAoPadrao(chave())">Desfazer</button>
    </div>
    <span v-else></span>
    <span></span>
    <div :class="['aviso-linha', acionavel() ? 'conflito-vermelho' : vista.alterada ? 'alterada-linha' : 'suave-linha']" :title="[...vista.avisos, textoPadrao()].join('\n')">
      <span class="texto-aviso">{{ aviso || vista.avisos[0] || textoPadrao() }}</span>
      <template v-if="acionavel() && opcoes().length">
        <select :value="escolhida()" :aria-label="`Resolução para ${vista.fora?.nrProcesso}`" @change="escolhas[acionavel()!.tipo] = ($event.target as HTMLSelectElement).value as Opcao">
          <option v-for="o in opcoes()" :key="o.valor" :value="o.valor">{{ o.rotulo }}</option>
        </select>
        <button class="acao secundaria pequena" type="button" @click="resolver">Aplicar</button>
      </template>
    </div>
  </div>
</template>
