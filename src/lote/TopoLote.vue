<script setup lang="ts">
// Campos do topo da tela 2 (§2.3, D14, D56–D58): valem para todos os itens que não foram ajustados
// à mão (D13). Ao lado de tipo, vídeo, duração e GIGS, "Aplicar a todos" sobrescreve os ajustes.
// Rótulo acima e campos lado a lado (D59): duas linhas de campos e o GIGS na largura toda.
// "Horários" (D73): pelas vagas da sala, quando o dia tem vaga livre, ou em sequência; pelas
// vagas, início, duração e intervalo ficam desabilitados, porque as vagas definem os horários.
import CampoData from '../componentes/CampoData.vue';
import CampoGigs from '../componentes/CampoGigs.vue';
import CampoSala from '../componentes/CampoSala.vue';
import CamposEmLinha from '../componentes/CamposEmLinha.vue';
import { TIPOS_BASE } from '../regras/tipoComposto';
import type { EstadoPauta } from './estadoPauta';
import type { ModoHorarios } from './pauta';

const props = defineProps<{ pauta: EstadoPauta }>();
const pelasVagas = () => props.pauta.modo === 'vagas';
const DICA_VAGAS = 'Pelas vagas, os horários vêm das vagas da sala. Para mudar, escolha "em sequência" em Horários.';
</script>

<template>
  <section class="cartao">
    <div class="cartao-topo"><h2>Campos de todas as audiências</h2></div>
    <div class="cartao-corpo topo-lote">
      <CamposEmLinha>
        <CampoData v-model="pauta.topo.data" :mensagem="pauta.avaliacaoData.msg" empilhado />
        <CampoSala v-model="pauta.salaId" :salas="pauta.salas" empilhado />
        <div class="campo">
          <label>Tipo base</label>
          <div class="controles">
            <select v-model="pauta.topo.tipoBase">
              <option value="">— escolha o tipo —</option>
              <option v-for="b in TIPOS_BASE" :key="b" :value="b">{{ b }}</option>
            </select>
            <button class="acao secundaria pequena" type="button" title="Tirar o tipo ajustado de todos os itens" @click="pauta.aplicarATodos('tipoBase')">Aplicar a todos</button>
          </div>
        </div>
        <div class="campo">
          <label>Semana Nacional</label>
          <select v-model="pauta.topo.semana" title="Só vale para Conciliação; a de Execução, só nos processos em execução (D57)">
            <option value="nenhuma">Sem Semana Nacional</option>
            <option value="conciliacao">Semana Nacional de Conciliação</option>
            <option value="execucao">Semana Nacional de Execução</option>
          </select>
        </div>
      </CamposEmLinha>
      <CamposEmLinha>
        <div class="campo campo-horarios">
          <label>Horários</label>
          <div class="controles">
            <select
              :value="pauta.modo"
              :disabled="!pauta.temVagaLivre"
              :title="pauta.temVagaLivre ? 'Pelas vagas: os processos ocupam as vagas livres da sala, na ordem da lista' : 'A sala não tem vaga livre neste dia: os horários seguem em sequência'"
              @change="pauta.escolherHorarios(($event.target as HTMLSelectElement).value as ModoHorarios)"
            >
              <option value="vagas">pelas vagas da sala</option>
              <option value="sequencia">em sequência a partir do início</option>
            </select>
          </div>
          <div :class="['msg', 'msg-pauta', pauta.situacaoPje.classe]" :title="pauta.situacaoPje.texto">{{ pauta.situacaoPje.texto }}</div>
        </div>
        <div class="campo">
          <label>Início</label>
          <input v-model="pauta.topo.inicio" type="time" :disabled="pelasVagas()" :title="pelasVagas() ? DICA_VAGAS : 'Da primeira audiência'" />
        </div>
        <div class="campo">
          <label>Duração</label>
          <div class="controles">
            <input v-model.number="pauta.topo.duracao" type="number" min="1" max="600" :disabled="pelasVagas()" :title="pelasVagas() ? `${DICA_VAGAS} A duração base vale só para quem passar das vagas.` : ''" />
            <span class="suave">min</span>
            <button class="acao secundaria pequena" type="button" :disabled="pelasVagas()" title="Tirar a duração ajustada de todos os itens" @click="pauta.aplicarATodos('duracao')">Aplicar a todos</button>
          </div>
        </div>
        <div class="campo">
          <label>Intervalo</label>
          <div class="controles">
            <input v-model.number="pauta.topo.intervalo.duracao" type="number" min="1" max="600" :disabled="pelasVagas()" :title="pelasVagas() ? 'Pelas vagas, para um intervalo, deixe vagas livres.' : ''" />
            <span class="suave">min, a cada</span>
            <input v-model.number="pauta.topo.intervalo.aCada" type="number" min="0" max="50" :disabled="pelasVagas()" :title="pelasVagas() ? 'Pelas vagas, para um intervalo, deixe vagas livres.' : ''" />
            <span class="suave">audiências (0 = sem)</span>
          </div>
        </div>
        <div class="campo">
          <label>Vídeo</label>
          <div class="controles">
            <label class="rotulo-check" title="Processo 100% Digital é sempre por vídeo"
              ><input v-model="pauta.topo.video" type="checkbox" /> por videoconferência</label
            >
            <button class="acao secundaria pequena" type="button" title="Tirar o vídeo ajustado de todos os itens" @click="pauta.aplicarATodos('video')">Aplicar a todos</button>
          </div>
        </div>
      </CamposEmLinha>
      <div class="separador-topo"></div>
      <CampoGigs :estado="pauta.gigsTopo" :dados-variaveis="pauta.dadosComuns" empilhado>
        <template #acoes>
          <button class="acao secundaria pequena" type="button" title="Tirar o GIGS ajustado de todos os itens" @click="pauta.aplicarATodos('gigs')">Aplicar o GIGS a todos</button>
        </template>
      </CampoGigs>
    </div>
  </section>
</template>

<style>
.topo-lote { display: flex; flex-direction: column; gap: 6px; }
.separador-topo { border-top: 1px solid #eef1f4; }
.topo-lote .previa-gigs { margin-top: -4px; }
.campo-horarios { max-width: 300px; }
</style>
