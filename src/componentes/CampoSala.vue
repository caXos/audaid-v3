<script setup lang="ts">
// Linha "Sala" da grade: as salas do órgão logado (D5).
import type { Sala } from '../pje/api';
import { nomeSala } from './mensagens';

defineProps<{ salas: Sala[] }>();
const salaId = defineModel<string>({ required: true });
</script>

<template>
  <label>Sala</label>
  <div class="controles">
    <select v-model="salaId">
      <option v-for="s in salas" :key="s.id" :value="String(s.id)">{{ nomeSala(s) }}</option>
    </select>
  </div>
</template>
