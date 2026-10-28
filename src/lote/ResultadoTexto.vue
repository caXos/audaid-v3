<script setup lang="ts">
// Resultado da tela 1 (entrega 1, provisório até a tela 2): quem entrou, com partes e advogados, e
// a faixa "Não incluídos", com o motivo (D12, D27). Nada impede de seguir.
import { ehSumarissimo } from '../regras/tipoComposto';
import { dicaAdvogados, resumoNomes } from './apresentacao';
import type { EstadoLote } from './estadoLote';

defineProps<{ lote: EstadoLote }>();
</script>

<template>
  <template v-if="lote.resultado">
    <section class="cartao">
      <div class="cartao-topo">
        <h2>Processos incluídos ({{ lote.resultado.incluidos.length }})</h2>
        <button class="acao secundaria" type="button" @click="lote.voltar()">Voltar ao texto</button>
      </div>
      <div class="cartao-corpo">
        <table v-if="lote.resultado.incluidos.length" class="tabela-lote">
          <thead>
            <tr>
              <th>Número</th>
              <th>Classe</th>
              <th>Autor(es)</th>
              <th>Réu(s)</th>
              <th>100% Digital</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in lote.resultado.incluidos" :key="p.numero">
              <td class="numero">{{ p.numero }}</td>
              <td>{{ p.processo.classeJudicial?.sigla ?? '?' }}{{ ehSumarissimo(p.processo.classeJudicial?.sigla) ? ' (sumaríssimo)' : '' }}</td>
              <td :title="p.partes.autores.map((a) => a.nome).join('\n')">
                {{ resumoNomes(p.partes.autores) }}
                <span v-if="p.partes.autores.length" class="ajuda" :title="dicaAdvogados(p.partes.autores)">(?)</span>
              </td>
              <td :title="p.partes.reus.map((r) => r.nome).join('\n')">
                {{ resumoNomes(p.partes.reus) }}
                <span v-if="p.partes.reus.length" class="ajuda" :title="dicaAdvogados(p.partes.reus)">(?)</span>
              </td>
              <td>{{ p.processo.juizoDigital ? 'sim' : '' }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="suave">Nenhum processo entrou. Confira a faixa abaixo.</div>
      </div>
    </section>
    <section v-if="lote.resultado.naoIncluidos.length" class="cartao nao-incluidos">
      <div class="cartao-topo">
        <h2>Não incluídos ({{ lote.resultado.naoIncluidos.length }})</h2>
      </div>
      <div class="cartao-corpo">
        <ul>
          <li v-for="n in lote.resultado.naoIncluidos" :key="n.numero"><span class="numero">{{ n.numero }}</span> · {{ n.motivo }}</li>
        </ul>
      </div>
    </section>
    <section class="cartao">
      <div class="cartao-topo">
        <h2>Diagnóstico</h2>
        <button class="acao secundaria" type="button" @click="lote.copiarDiagnostico()">{{ lote.rotuloCopiar }}</button>
      </div>
      <div class="cartao-corpo suave">
        Leva só as contagens, os motivos e a forma da resposta da busca por número, sem nomes nem números de processo.
        A tela 2, para montar a pauta, chega na próxima entrega.
      </div>
    </section>
  </template>
</template>

<style>
.tabela-lote th { text-align: left; font-weight: 600; color: var(--cor-suave); padding: 4px 6px; border-bottom: 1px solid var(--cor-borda); }
.tabela-lote td { padding: 5px 6px; }
.numero { font-variant-numeric: tabular-nums; white-space: nowrap; }
.ajuda { color: var(--cor-marca); cursor: help; font-weight: 600; }
.nao-incluidos { border-color: #e6c46a; }
.nao-incluidos .cartao-topo { background: var(--cor-aviso-fundo); }
.nao-incluidos .cartao-topo h2 { color: var(--cor-aviso); }
</style>
