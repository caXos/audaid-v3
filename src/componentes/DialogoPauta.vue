<script setup lang="ts">
// Pauta do dia num diálogo (D28, D33). Clicar numa vaga escolhe o horário dela. Texto sozinho fica
// centralizado, numa área de tamanho fixo.
import { computed, ref } from 'vue';
import type { EntradaPauta } from '../regras/pauta';
import Dialogo from './Dialogo.vue';

const props = defineProps<{
  titulo: string;
  /** Ausente enquanto a pauta não chegou (ou se a consulta falhou). */
  entradas?: EntradaPauta[];
  erro?: string;
  /** Horário escolhido, destacado na lista. */
  hora: string | null;
  /** O processo do painel, marcado como "(este processo)". */
  idProcesso: number;
}>();
const emit = defineEmits<{ escolher: [hora: string] }>();

const dialogo = ref<{ abrir(): void; fechar(): void } | null>(null);

const dica = computed(() =>
  !props.entradas?.length
    ? ''
    : props.entradas.some((e) => e.tipo === 'vaga')
      ? 'Clique numa vaga para usar o horário dela.'
      : 'Esta sala não tem vaga configurada neste dia: feche e digite o horário (o AudAid confere se está livre).',
);

function classe(e: EntradaPauta): string {
  return [e.tipo === 'vaga' ? 'vaga clicavel' : '', e.hora === props.hora ? 'destaque' : ''].join(' ').trim();
}

function descricao(e: EntradaPauta): string {
  if (e.tipo === 'vaga') return 'vaga';
  if (e.idProcesso === props.idProcesso) return `${e.nrProcesso ?? ''} (este processo)`;
  return e.nrProcesso ?? String(e.idProcesso);
}

function escolher(e: EntradaPauta) {
  if (e.tipo !== 'vaga') return;
  dialogo.value?.fechar();
  emit('escolher', e.hora);
}

defineExpose({ abrir: () => dialogo.value?.abrir() });
</script>

<template>
  <Dialogo ref="dialogo" class="dialogo-pauta" :titulo="titulo" :dica="dica">
    <div class="corpo-pauta">
      <div v-if="!entradas" class="centralizado">{{ erro ?? 'Consultando a pauta do dia…' }}</div>
      <div v-else-if="!entradas.length" class="centralizado">Nenhuma audiência nem vaga nesta sala neste dia. Feche e digite o horário.</div>
      <table v-else>
        <tbody>
          <tr
            v-for="(e, i) in entradas"
            :key="i"
            :class="classe(e)"
            :title="e.tipo === 'vaga' ? `Usar ${e.hora}` : undefined"
            @click="escolher(e)"
          >
            <td class="hora">{{ e.hora }}</td>
            <td>{{ descricao(e) }}</td>
            <td class="suave">{{ e.descricaoTipo ?? '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </Dialogo>
</template>

<style>
.corpo-pauta { height: 340px; overflow: auto; border: 1px solid #eef1f4; border-radius: 6px; }
.corpo-pauta .centralizado { height: 100%; display: flex; align-items: center; justify-content: center; text-align: center; color: var(--cor-suave); padding: 0 16px; }
</style>
