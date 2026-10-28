<script setup lang="ts">
// GIGS de um processo do lote (D13, D29): o mesmo CampoGigs do Individual e do topo, num diálogo.
// "Aplicar a este processo" grava o ajuste; "Usar o do topo" tira o ajuste.
import { onMounted, ref } from 'vue';
import CampoGigs from '../componentes/CampoGigs.vue';
import Dialogo from '../componentes/Dialogo.vue';
import { useGigs } from '../componentes/estadoGigs';
import GradeCampos from '../componentes/GradeCampos.vue';
import type { DadosVariaveisGigs } from '../regras/gigs';
import type { EstadoPauta } from './estadoPauta';
import { paraHora } from './pauta';

const props = defineProps<{ pauta: EstadoPauta; chave: string }>();
const emit = defineEmits<{ fechar: [] }>();

const vista = props.pauta.linhas.find((l) => l.item?.chave === props.chave);
const dados = (): DadosVariaveisGigs => {
  const atual = props.pauta.linhas.find((l) => l.item?.chave === props.chave);
  return {
    ...props.pauta.dadosComuns(),
    hora: atual ? paraHora(atual.linha.inicio) : undefined,
    tipo: atual?.tipo?.tipo?.descricao,
    acao: atual?.processo?.antiga ? 'redesignada' : 'designada',
  };
};
const estado = useGigs(props.pauta.sugestoes, dados, vista?.gigs?.valores ?? props.pauta.topoCompleto.gigs);
const dialogo = ref<{ abrir(): void; fechar(): void } | null>(null);

onMounted(() => dialogo.value?.abrir());

function aplicar() {
  props.pauta.ajustar(props.chave, 'gigs', { opcao: estado.opcao, texto: estado.texto, prazo: estado.prazoNumero });
  dialogo.value?.fechar();
}
function usarDoTopo() {
  props.pauta.ajustar(props.chave, 'gigs', props.pauta.topoCompleto.gigs);
  dialogo.value?.fechar();
}
</script>

<template>
  <Dialogo ref="dialogo" class="dialogo-gigs-item" :titulo="`GIGS de ${chave}`" dica="Vale só para este processo. As variáveis usam a data, o horário e o tipo dele." @close="emit('fechar')">
    <GradeCampos>
      <CampoGigs :estado="estado" :dados-variaveis="dados" />
    </GradeCampos>
    <div class="linha-form acoes-gigs-item">
      <button class="acao" type="button" :disabled="Boolean(estado.pendencia)" @click="aplicar">Aplicar a este processo</button>
      <button class="acao secundaria" type="button" @click="usarDoTopo">Usar o do topo</button>
    </div>
  </Dialogo>
</template>

<style>
.dialogo-gigs-item { width: min(640px, calc(100vw - 32px)); }
.acoes-gigs-item { margin-top: 8px; }
</style>
