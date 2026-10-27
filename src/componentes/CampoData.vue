<script setup lang="ts">
// Linhas "Data" da grade: o campo e a mensagem do calendário do órgão (D34, D34c), que vem pronta
// de avaliarData (mensagens.ts).
import type { Mensagem } from './mensagens';

defineProps<{ mensagem: Mensagem }>();
const data = defineModel<string>({ required: true });
</script>

<template>
  <label>Data</label>
  <div class="controles"><input v-model="data" type="date" /></div>
  <span></span>
  <div :class="['msg', mensagem.classe]" :title="mensagem.texto">{{ mensagem.texto }}</div>
</template>
