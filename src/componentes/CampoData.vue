<script setup lang="ts">
// Campo "Data" e a mensagem do calendário do órgão (D34, D34c), que vem pronta de avaliarData
// (mensagens.ts). Na grade (Individual) são linhas da grade; `empilhado`, um campo com o rótulo
// acima (Lote, D59).
import type { Mensagem } from './mensagens';

/** `desabilitado`: a data vem fixa (o "+" da Pauta, D89d). */
defineProps<{ mensagem: Mensagem; empilhado?: boolean; desabilitado?: boolean }>();
const data = defineModel<string>({ required: true });
</script>

<template>
  <div v-if="empilhado" class="campo campo-data">
    <label>Data</label>
    <div class="controles"><input v-model="data" type="date" :disabled="desabilitado" /></div>
    <div :class="['msg', mensagem.classe]" :title="mensagem.texto">{{ mensagem.texto }}</div>
  </div>
  <template v-else>
    <label>Data</label>
    <div class="controles"><input v-model="data" type="date" :disabled="desabilitado" /></div>
    <span></span>
    <div :class="['msg', mensagem.classe]" :title="mensagem.texto">{{ mensagem.texto }}</div>
  </template>
</template>
