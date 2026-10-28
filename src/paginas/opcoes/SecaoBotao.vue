<script setup lang="ts">
// Opções: posição e estilo do botão do AudAid, com a prévia (§2.6, D41). Campo que não se aplica
// fica visível, mas desabilitado (§5).
import { computed, onMounted, ref } from 'vue';
import { LIMITES, POSICOES_FAB, ROTULO_POSICAO, type Opcoes } from '../../config/opcoes';
import { cssDaPosicao, cssDoEstilo } from '../../config/posicao';
import { criarIcone } from '../../ui/icone';

const props = defineProps<{ opcoes: Opcoes }>();

const botao = ref<HTMLElement | null>(null);
onMounted(() => botao.value?.append(criarIcone()));
const estiloPrevia = computed(() => ({ ...cssDaPosicao(props.opcoes.fab.posicao), ...cssDoEstilo(props.opcoes.fab.estilo) }));
</script>

<template>
  <section>
    <h2>Botão do AudAid</h2>
    <div class="linha">
      <label for="posicao">Posição na tela</label>
      <select id="posicao" v-model="opcoes.fab.posicao">
        <option v-for="p in POSICOES_FAB" :key="p" :value="p">{{ ROTULO_POSICAO[p] }}</option>
      </select>
    </div>
    <div class="linha">
      <label for="cor-icone">Cor do ícone</label>
      <input id="cor-icone" v-model="opcoes.fab.estilo.corIcone" type="color" />
      <label for="tamanho" style="min-width: auto">Tamanho (px)</label>
      <input id="tamanho" v-model.number="opcoes.fab.estilo.tamanho" type="number" step="1" :min="LIMITES.tamanho.min" :max="LIMITES.tamanho.max" />
    </div>
    <div class="linha">
      <label><input v-model="opcoes.fab.estilo.fundo.ativo" type="checkbox" /> Com fundo</label>
      <input v-model="opcoes.fab.estilo.fundo.cor" type="color" title="Cor do fundo" :disabled="!opcoes.fab.estilo.fundo.ativo" />
    </div>
    <div class="linha">
      <label><input v-model="opcoes.fab.estilo.borda.ativo" type="checkbox" /> Com borda</label>
      <input v-model="opcoes.fab.estilo.borda.cor" type="color" title="Cor da borda" :disabled="!opcoes.fab.estilo.borda.ativo" />
      <label for="borda-espessura" style="min-width: auto">Espessura (px)</label>
      <input
        id="borda-espessura"
        v-model.number="opcoes.fab.estilo.borda.espessura"
        type="number"
        step="1"
        :min="LIMITES.espessura.min"
        :max="LIMITES.espessura.max"
        :disabled="!opcoes.fab.estilo.borda.ativo"
      />
    </div>
    <div class="previa" aria-label="Prévia do botão">
      <div ref="botao" class="fab-previa" :style="estiloPrevia"></div>
    </div>
    <p class="suave pequeno">A faixa escura da prévia imita o topo do PJe.</p>
  </section>
</template>
