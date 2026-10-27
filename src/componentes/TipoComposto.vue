<script setup lang="ts">
// Linhas do tipo composto (D6, D42): tipo base, vídeo, Semana Nacional, fase, rito e o tipo que
// será designado. As regras ficam em estadoTipo.ts; aqui só se mostra e edita o estado.
import { TIPOS_BASE } from '../regras/tipoComposto';
import type { EstadoTipo } from './estadoTipo';

defineProps<{ estado: EstadoTipo }>();
</script>

<template>
  <label>Tipo base</label>
  <div class="controles">
    <select v-model="estado.base">
      <option value="">— escolha o tipo —</option>
      <option v-for="b in TIPOS_BASE" :key="b" :value="b">{{ b }}</option>
    </select>
  </div>
  <label>Variações</label>
  <div class="controles">
    <label :class="['rotulo-check', { desabilitado: !estado.videoHabilitado }]" :title="estado.tituloVideo"
      ><input v-model="estado.video" type="checkbox" :disabled="!estado.videoHabilitado" /> por videoconferência</label
    >
    <select v-model="estado.semana" :disabled="!estado.semanaHabilitada">
      <option value="nenhuma">Sem Semana Nacional</option>
      <option value="conciliacao">Semana Nacional de Conciliação</option>
      <option value="execucao" :disabled="!estado.semanaExecucaoHabilitada">Semana Nacional de Execução</option>
    </select>
  </div>
  <label>Fase</label>
  <div class="controles">
    <select v-model="estado.fase" :disabled="!estado.faseHabilitada">
      <option value="Conhecimento">Conhecimento</option>
      <option value="Execução">Execução</option>
    </select>
    <span class="suave">fase atual do processo: {{ estado.faseAtual }}</span>
  </div>
  <label>Rito</label>
  <div class="controles"><span class="suave">{{ estado.textoRito }}</span></div>
  <div :class="['resultado-tipo', { erro: estado.resolvido && !estado.resolvido.tipo }]">
    <template v-if="!estado.resolvido">Escolha o tipo base para ver o tipo que será designado.</template>
    <template v-else-if="!estado.resolvido.tipo">"{{ estado.resolvido.descricao }}" não existe neste tribunal.</template>
    <template v-else
      >Será designada: <strong>{{ estado.resolvido.tipo.descricao }}</strong><span class="suave"> (id {{ estado.resolvido.tipo.id }})</span></template
    >
  </div>
</template>

<style>
.resultado-tipo {
  grid-column: 1 / -1; background: var(--cor-fundo-2); border-radius: 6px; padding: 6px 8px;
  height: calc(2.9em + 12px); line-height: 1.45em; overflow: hidden;
}
.resultado-tipo.erro { background: var(--cor-erro-fundo); color: var(--cor-erro); }
.rotulo-check { cursor: pointer; }
.rotulo-check.desabilitado { color: #8a94a3; cursor: not-allowed; }
</style>
