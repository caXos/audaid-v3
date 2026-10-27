<script setup lang="ts">
// Um passo da execução: título, selo, detalhe e erro do PJe. A requisição (URL e payload) só
// aparece quando `mostrarRequisicao` está ligado, isto é, na simulação (D52).
import { computed } from 'vue';
import type { RegistroPasso } from '../fluxo/executor';
import { ROTULO_ESTADO } from './mensagens';

const props = defineProps<{ passo: RegistroPasso; origem: string; mostrarRequisicao: boolean }>();

const requisicao = computed(() => (props.mostrarRequisicao ? props.passo.requisicao : undefined));
const linhaRequisicao = computed(() => {
  const r = requisicao.value;
  return r ? `${r.metodo} ${props.origem}${r.caminho}${props.passo.estado === 'simulado' ? '  ← não enviado (simulação)' : ''}` : '';
});
const corpo = computed(() => (requisicao.value?.corpo !== undefined ? JSON.stringify(requisicao.value.corpo, null, 2) : null));
</script>

<template>
  <div class="passo">
    <div class="passo-topo">
      <strong>{{ passo.titulo }}</strong><span :class="['selo', passo.estado]">{{ ROTULO_ESTADO[passo.estado] }}</span>
    </div>
    <div v-if="passo.detalhe" :class="passo.estado === 'erro' ? 'erro-texto' : 'suave'">{{ passo.detalhe }}</div>
    <div v-if="passo.erro" class="erro-texto">
      {{ passo.erro.mensagem
      }}<span v-if="passo.erro.codigoErro || passo.erro.identificadorRequisicao" class="suave">
        (código {{ passo.erro.codigoErro ?? '—' }} · requisição {{ passo.erro.identificadorRequisicao ?? '—' }})</span
      >
    </div>
    <div v-if="requisicao" class="req">{{ linhaRequisicao }}</div>
    <pre v-if="corpo !== null">{{ corpo }}</pre>
  </div>
</template>

<style>
.passo { border-top: 1px solid #eef1f4; padding: 6px 0; }
.passo:first-child { border-top: 0; }
.passo-topo { display: flex; gap: 8px; align-items: center; }
.passo-topo strong { flex: 1; }
.selo.simulado { background: #e8f0fe; color: #1a56c4; }
.req { font: 11px/1.4 ui-monospace, Consolas, monospace; color: var(--cor-suave); word-break: break-all; margin-top: 2px; }
pre { margin: 4px 0 0; max-height: 180px; overflow: auto; background: #f7f9fb; border: 1px solid #eef1f4; border-radius: 6px; padding: 6px; font: 11px/1.4 ui-monospace, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
</style>
