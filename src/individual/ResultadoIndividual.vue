<script setup lang="ts">
// Cartão "Resultado": confirmação do envio real, passos da execução e "Recarregar a página?".
import { nextTick, ref, watch } from 'vue';
import PassoExecucao from '../componentes/PassoExecucao.vue';
import { TEXTO_ACAO, type Envio } from './envio';

const props = defineProps<{ envio: Envio; origem: string }>();

const botaoGravar = ref<HTMLButtonElement | null>(null);
watch(
  () => props.envio.estado.tela.tipo,
  async (tipo) => {
    if (tipo !== 'confirmando') return;
    await nextTick();
    botaoGravar.value?.focus();
  },
);

function dispensarRecarregar() {
  props.envio.estado.recarregarDispensado = true;
}

function recarregar() {
  location.reload();
}
</script>

<template>
  <section class="cartao">
    <div class="cartao-topo">
      <h2>Resultado</h2>
      <button class="acao secundaria" type="button" :disabled="!envio.estado.podeCopiar" @click="envio.copiar()">{{ envio.estado.rotuloCopiar }}</button>
    </div>
    <div v-if="envio.estado.tela.tipo === 'inicial'" class="cartao-corpo suave">
      {{ envio.estado.mostrarRequisicoes ? 'O resultado aparece aqui, com cada requisição que seria feita.' : 'O resultado aparece aqui, passo a passo.' }}
    </div>
    <div v-else-if="envio.estado.tela.tipo === 'cancelado'" class="cartao-corpo suave">Cancelado. Nada foi gravado.</div>
    <div v-else class="cartao-corpo">
      <div v-if="envio.estado.tela.tipo === 'orgao-mudou'" class="resumo falha">
        Você trocou de órgão logado (ou a sessão expirou). Feche e abra o AudAid de novo. Nada foi feito.
      </div>
      <div v-else-if="envio.estado.tela.tipo === 'confirmando'" class="confirmacao">
        <strong>Confira o que será gravado no PJe em seu nome:</strong>
        <ul>
          <li v-for="(item, i) in envio.estado.tela.itens" :key="i">{{ item }}</li>
        </ul>
        <div class="linha-form">
          <button ref="botaoGravar" class="acao perigo" type="button" @click="envio.responder(true)">Confirmar e gravar no PJe</button>
          <button class="acao secundaria" type="button" @click="envio.responder(false)">Cancelar</button>
        </div>
      </div>
      <template v-else-if="envio.estado.tela.tipo === 'executando'">
        <PassoExecucao v-for="(p, i) in envio.estado.tela.passos" :key="i" :passo="p" :origem="origem" :mostrar-requisicao="envio.estado.mostrarRequisicoes" />
      </template>
      <template v-else-if="envio.estado.tela.tipo === 'concluido'">
        <div>
          <div :class="['resumo', envio.estado.tela.resultado.desfecho]">{{ envio.estado.tela.resultado.resumo }}</div>
          <div v-if="envio.estado.hashDaExecucao">
            Código desta execução (para buscar no GIGS): <strong>{{ envio.estado.hashDaExecucao }}</strong>
          </div>
          <ul v-if="envio.estado.tela.resultado.acoes.length" class="aviso-texto">
            <li v-for="a in envio.estado.tela.resultado.acoes" :key="a">{{ TEXTO_ACAO[a] }}</li>
          </ul>
          <!-- §2.2, passo 6: a tela do PJe só mostra a audiência nova depois de recarregar. -->
          <div v-if="envio.estado.tela.gravouDeVerdade && !envio.estado.recarregarDispensado" class="recarregar">
            Recarregar a página para ver a audiência no PJe?
            <div class="linha-form">
              <button class="acao" type="button" @click="recarregar">Recarregar agora</button>
              <button class="acao secundaria" type="button" @click="dispensarRecarregar">Agora não</button>
            </div>
          </div>
        </div>
        <PassoExecucao
          v-for="(p, i) in envio.estado.tela.resultado.passos"
          :key="i"
          :passo="p"
          :origem="origem"
          :mostrar-requisicao="envio.estado.mostrarRequisicoes"
        />
      </template>
    </div>
  </section>
</template>

<style>
.confirmacao { border: 2px solid #f0a14a; background: #fffaf3; border-radius: 8px; padding: 10px 12px; }
.confirmacao ul { margin: 6px 0 8px; }
button.acao.perigo { background: #b3261e; border-color: #b3261e; }
.recarregar { border: 1px solid #bfe3c9; background: var(--cor-ok-fundo); border-radius: 8px; padding: 8px 10px; margin: 6px 0 4px; }
.resumo { font-weight: 600; margin-bottom: 6px; }
.resumo.sucesso, .resumo.simulado { color: var(--cor-ok); }
.resumo.parcial { color: var(--cor-aviso); }
.resumo.falha { color: var(--cor-erro); }
</style>
