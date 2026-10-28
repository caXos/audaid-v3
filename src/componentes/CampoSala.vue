<script setup lang="ts">
// Campo "Sala": as salas do órgão logado (D5). Na grade (Individual), uma linha da grade;
// `empilhado`, um campo com o rótulo acima (Lote, D59).
import type { Sala } from '../pje/api';
import { nomeSala } from './mensagens';

defineProps<{ salas: Sala[]; empilhado?: boolean }>();
const salaId = defineModel<string>({ required: true });
</script>

<template>
  <div v-if="empilhado" class="campo">
    <label>Sala</label>
    <select v-model="salaId">
      <option v-for="s in salas" :key="s.id" :value="String(s.id)">{{ nomeSala(s) }}</option>
    </select>
  </div>
  <template v-else>
    <label>Sala</label>
    <div class="controles">
      <select v-model="salaId">
        <option v-for="s in salas" :key="s.id" :value="String(s.id)">{{ nomeSala(s) }}</option>
      </select>
    </div>
  </template>
</template>
