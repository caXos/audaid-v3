<script setup lang="ts">
// Uma audiência da lista (tela 2, como em ControleEmLote_Exemplo_ListaProcessos.png): alça, ordem,
// processo com partes, tipo e vídeo, início (editável: vira âncora, D55), duração, GIGS e ajustes.
// Pelas vagas (D73), o início é "Levar para a vaga", e a vaga ocupada pode ser deixada livre. Os
// conflitos com a pauta da sala aparecem na linha, com as ações da tela 3 (D78).
import { reactive, ref } from 'vue';
import { formatarDataHora } from '../ui/dom';
import { TIPOS_BASE } from '../regras/tipoComposto';
import { dicaAdvogados, resumoGigs, resumoPolo } from './apresentacao';
import type { Arrastar } from './arrastar';
import { BLOQUEIAM } from './conferencia';
import type { EstadoPauta, LinhaVista } from './estadoPauta';
import { paraHora } from './pauta';
import { aplicarResolucao, opcoesDoAchado, type Opcao } from './resolucoes';

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

// ── Pelas vagas (D73) ──
const pelasVagas = () => props.pauta.modo === 'vagas';
const fixo = () => (props.vista.item?.tipo === 'processo' ? (props.vista.item.ajustes.inicio ?? '') : '');
/** As vagas para onde dá para levar o processo; um horário fixo fora delas também aparece. */
function opcoesDeVaga(): { valor: string; rotulo: string }[] {
  const vagas = props.pauta.linhas.filter((l) => l.linha.tipo === 'vaga' || l.linha.naVaga).map((l) => paraHora(l.linha.inicio));
  const lista = [...new Set(vagas)].filter((h) => !props.pauta.vagasLivres.includes(h) || h === fixo()).sort();
  if (fixo() && !lista.includes(fixo())) lista.push(fixo());
  return [{ valor: '', rotulo: fixo() ? 'pela ordem' : `${paraHora(props.vista.linha.inicio)} · pela ordem` }, ...lista.map((h) => ({ valor: h, rotulo: h }))];
}
function levarParaVaga(ev: Event) {
  props.pauta.definirInicio(chave(), (ev.target as HTMLSelectElement).value);
}

// ── Conflitos com a pauta da sala, na linha (D78) ──
const acionavel = () => props.vista.achados.find((a) => BLOQUEIAM.includes(a.tipo));
const escolhas = reactive<Record<string, Opcao>>({});
const aviso = ref('');
const opcoes = () => {
  const a = acionavel();
  return a ? opcoesDoAchado(a, props.pauta.modo) : [];
};
const escolhida = () => escolhas[acionavel()?.tipo ?? ''] ?? opcoes()[0]?.valor;
function resolver() {
  const a = acionavel();
  const opcao = escolhida();
  if (!a || !opcao) return;
  const r = aplicarResolucao(props.pauta, props.pauta.entradasPje ?? [], chave(), a, opcao);
  aviso.value = r.aviso ?? '';
}
const classeConflito = () => {
  if (props.vista.achados.some((a) => BLOQUEIAM.includes(a.tipo))) return 'conflito-vermelho';
  if (props.vista.achados.some((a) => a.tipo === 'amarelo')) return 'conflito-amarelo';
  return '';
};
</script>

<template>
  <div
    :class="[
      'linha-lote',
      'linha-processo',
      `sinal-${vista.linha.sinal}`,
      classeConflito(),
      { 'na-vaga': vista.linha.naVaga, arrastando: arr.origem === vista.linha.indice, 'alvo-antes': arr.alvo?.indice === vista.linha.indice && arr.alvo.posicao === 'antes', 'alvo-depois': arr.alvo?.indice === vista.linha.indice && arr.alvo.posicao === 'depois' },
    ]"
    data-linha
    :data-inicio="paraHora(vista.linha.inicio)"
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
        <span v-if="vista.semMudanca" class="selo-mini sem-mudanca" title="Mesmo dia, sala, horário e tipo que já tinha: a execução não faz nada com ele, nem o GIGS (D79)">sem mudança</span>
        <span
          v-else-if="vista.nestaPauta"
          class="selo-mini redesignar"
          :title="`Este processo já tem audiência nesta pauta, às ${vista.nestaPauta}: na execução, ela é redesignada`"
          >nesta pauta, {{ vista.nestaPauta }}</span
        >
        <span
          v-else-if="vista.processo?.antiga"
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
    <label v-if="pelasVagas()" class="campo-item campo-vaga">
      <span>{{ vista.linha.naVaga ? 'Vaga' : vista.linha.alemDasVagas ? 'Sem vaga' : 'Horário fixo' }}</span>
      <select :value="fixo()" :class="{ ancorado: vista.linha.ancorado }" title="Levar para a vaga: fixa o processo nela; os outros preenchem as restantes" @change="levarParaVaga">
        <option v-for="o in opcoesDeVaga()" :key="o.valor" :value="o.valor">{{ o.rotulo }}</option>
      </select>
      <button
        v-if="vista.linha.naVaga"
        class="acao secundaria pequena"
        type="button"
        title="Deixar esta vaga livre: este processo e os seguintes descem para a próxima vaga"
        @click.prevent="pauta.deixarLivre(vista.linha.inicio)"
      >
        deixar livre
      </button>
    </label>
    <label v-else class="campo-item">
      <span>Início</span>
      <input type="time" :value="paraHora(vista.linha.inicio)" :class="{ ancorado: vista.linha.ancorado }" :title="vista.linha.ancorado ? 'Início fixo (âncora): os seguintes contam a partir dele' : 'Calculado. Editar fixa este horário.'" @change="mudarInicio" />
    </label>
    <div v-if="vista.linha.naVaga" class="campo-item" title="Na vaga, a duração vai até o próximo horário do dia">
      <span>Duração</span><span class="valor-fixo">{{ vista.linha.duracao }} min</span>
    </div>
    <label v-else class="campo-item">
      <span>Duração</span>
      <input type="number" min="1" max="600" :value="vista.linha.duracao" @change="mudarDuracao" />
    </label>
    <div class="gigs-item">
      <span class="resumo-gigs" :title="vista.gigs?.lancar ? `${vista.gigs.texto}` : ''">{{
        vista.semMudanca ? 'Sem GIGS (sem mudança)' : resumoGigs(vista.gigs?.lancar ?? false, vista.gigs?.texto ?? '', vista.gigs?.valores.prazo ?? 0)
      }}</span>
      <button class="acao secundaria pequena" type="button" @click="emit('editarGigs', vista.item!.chave)">editar</button>
    </div>
    <div class="ajustes-item">
      <span :class="['selo-mini', vista.ajustado ? 'ajustado' : 'padrao']">{{ vista.ajustado ? 'ajustado' : 'padrão' }}</span>
      <button class="acao secundaria pequena" type="button" :disabled="!vista.ajustado" @click="pauta.voltarAoPadrao(vista.item!.chave)">voltar ao padrão</button>
    </div>
    <button class="remover" type="button" title="Tirar da lista" @click="pauta.remover(vista.item!.chave)">×</button>
    <div :class="['aviso-linha', classeConflito()]" :title="vista.avisos.join('\n')">
      <span class="texto-aviso">{{ aviso || vista.avisos[0] || '' }}</span>
      <template v-if="acionavel() && opcoes().length">
        <select
          :value="escolhida()"
          :aria-label="`Resolução para ${vista.item!.chave}`"
          @change="escolhas[acionavel()!.tipo] = ($event.target as HTMLSelectElement).value as Opcao"
        >
          <option v-for="o in opcoes()" :key="o.valor" :value="o.valor">{{ o.rotulo }}</option>
        </select>
        <button class="acao secundaria pequena" type="button" @click="resolver">Aplicar</button>
      </template>
    </div>
  </div>
</template>
