<script setup lang="ts">
// Formulário do Controle Individual (§2.2) e o cartão de resultado. O estado e as regras ficam em
// formulario.ts; aqui só se mostra. Layout estável (§5): só muda texto e habilitação.
import { ref } from 'vue';
import CampoData from '../componentes/CampoData.vue';
import CampoGigs from '../componentes/CampoGigs.vue';
import CampoSala from '../componentes/CampoSala.vue';
import DialogoPauta from '../componentes/DialogoPauta.vue';
import GradeCampos from '../componentes/GradeCampos.vue';
import TipoComposto from '../componentes/TipoComposto.vue';
import type { Opcoes } from '../config/opcoes';
import type { Ambiente } from '../pje/ambiente';
import type { Dados } from './dados';
import { useFormulario } from './formulario';
import ResultadoIndividual from './ResultadoIndividual.vue';

const props = defineProps<{ ambiente: Ambiente; dados: Dados; opcoes: Opcoes; simulando: boolean }>();

const f = useFormulario(props.ambiente, props.dados, props.opcoes, props.simulando);
const dialogoPauta = ref<{ abrir(): void } | null>(null);
</script>

<template>
  <section class="cartao">
    <div class="cartao-topo"><h2>{{ f.redesignacao ? 'Redesignar audiência' : 'Designar audiência' }}</h2></div>
    <div class="cartao-corpo">
      <GradeCampos>
        <CampoSala v-model="f.salaId" :salas="f.salas" />
        <CampoData v-model="f.data" :mensagem="f.avaliacaoData.msg" />
        <!-- Caminho principal: escolher o horário clicando numa vaga da pauta (digitar é a alternativa). -->
        <label>Horário</label>
        <div class="controles">
          <button class="acao secundaria" type="button" :disabled="!f.entradas" @click="dialogoPauta?.abrir()">Escolher horário na pauta do dia</button>
        </div>
        <span></span>
        <div class="controles"><span class="suave">ou digite:</span><input v-model="f.hora" type="time" /></div>
        <span></span>
        <div :class="['msg', f.avaliacaoHora.msg.classe]" :title="f.avaliacaoHora.msg.texto">{{ f.avaliacaoHora.msg.texto }}</div>
        <DialogoPauta
          ref="dialogoPauta"
          :titulo="f.tituloPauta"
          :entradas="f.entradas"
          :erro="f.erroPauta"
          :hora="f.hora || null"
          :id-processo="f.idProcesso"
          @escolher="(hora) => (f.hora = hora)"
        />
        <TipoComposto :estado="f.tipo" />
        <div class="aviso-digital linha-fixa">{{ f.avisoDigital }}</div>
        <CampoGigs :estado="f.gigs" :dados-variaveis="f.dadosVariaveis" />
      </GradeCampos>
      <div class="rodape-form">
        <button class="acao" type="button" :disabled="!f.podeEnviar" @click="f.enviar()">{{ f.rotuloEnviar }}</button>
        <ul class="pendencias">
          <li v-for="p in f.pendencias" :key="p">{{ p }}</li>
        </ul>
      </div>
    </div>
  </section>
  <ResultadoIndividual :envio="f.envio" :origem="ambiente.origem" />
</template>

<style>
.aviso-digital { grid-column: 1 / -1; color: var(--cor-aviso); }
.rodape-form { display: flex; gap: 10px; align-items: flex-start; margin-top: 10px; }
/* Altura fixa também: a lista de pendências não empurra o cartão de resultado. */
.pendencias { margin: 0; padding-left: 18px; font-size: 12px; color: var(--cor-aviso); height: 7.4em; overflow: auto; flex: 1; }
.pendencias:empty::before { content: 'Tudo pronto.'; color: var(--cor-ok); margin-left: -18px; }
</style>
