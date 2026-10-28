<script setup lang="ts">
// Resumo provisório (entrega 2): o que seria designado, item a item, com os horários, os tipos e os
// textos do GIGS já resolvidos. Na entrega 4, vira a tela 3 (conferência com a pauta da sala).
import { formatarDataHora } from '../ui/dom';
import { dataBr } from '../regras/gigs';
import type { EstadoLote } from './estadoLote';
import { paraHora } from './pauta';

defineProps<{ lote: EstadoLote }>();
</script>

<template>
  <section v-if="lote.pauta" class="cartao">
    <div class="cartao-topo">
      <h2>Resumo: {{ lote.pauta.quantidade }} audiência(s) em {{ lote.pauta.topo.data ? dataBr(lote.pauta.topo.data) : '?' }}</h2>
      <button class="acao secundaria" type="button" @click="lote.voltarAPauta()">Voltar à pauta</button>
    </div>
    <div class="cartao-corpo">
      <p class="suave">
        Provisório: na entrega 4, aqui entra a tela 3, que confere a pauta da sala e as audiências já designadas antes de
        executar. Nada foi gravado no PJe. Código do lote: <strong>{{ lote.pauta.hash }}</strong>
      </p>
      <table class="tabela-lote">
        <thead>
          <tr>
            <th>#</th>
            <th>Número</th>
            <th>Início</th>
            <th>Duração</th>
            <th>Tipo</th>
            <th>Ação</th>
            <th>GIGS</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in lote.pauta.linhas" :key="l.linha.chave" :class="{ 'resumo-intervalo': l.linha.tipo !== 'processo' }">
            <template v-if="l.linha.tipo === 'processo'">
              <td>{{ l.linha.ordem }}</td>
              <td class="numero">{{ l.linha.chave }}</td>
              <td>{{ paraHora(l.linha.inicio) }}</td>
              <td>{{ l.linha.duracao }} min</td>
              <td>{{ l.tipo?.tipo?.descricao ?? '?' }}</td>
              <td>{{ l.processo?.antiga ? `redesignar (de ${formatarDataHora(l.processo.antiga.dataInicio)})` : 'designar' }}</td>
              <td>{{ l.gigs?.lancar ? `"${l.gigs.texto}" · ${l.gigs.valores.prazo > 0 ? `${l.gigs.valores.prazo} dia(s) útil(eis)` : 'sem prazo'}` : '—' }}</td>
            </template>
            <template v-else>
              <td></td>
              <td>{{ l.linha.tipo === 'intervalo' ? 'Intervalo' : 'Intervalo automático' }}</td>
              <td>{{ paraHora(l.linha.inicio) }}</td>
              <td>{{ l.linha.duracao }} min</td>
              <td colspan="3"></td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style>
.resumo-intervalo td { color: var(--cor-suave); font-style: italic; }
</style>
