<script setup lang="ts">
// Controle em Lote (§2.3) num diálogo de tela cheia sobre o PJe (D19). Entrega 1: tela 1 e o
// resultado da consulta.
import type { Ambiente } from '../pje/ambiente';
import { useLote } from './estadoLote';
import ResultadoTexto from './ResultadoTexto.vue';
import TelaTexto from './TelaTexto.vue';

const props = defineProps<{ ambiente: Ambiente; versao: string; aoFechar: () => void }>();

const lote = useLote(props.ambiente, props.versao);
</script>

<template>
  <div class="lote-fundo">
    <div class="lote-janela" role="dialog" aria-label="AudAid, Controle em Lote">
      <header class="cabecalho">
        <h1>AudAid · Controle em Lote</h1>
        <p>{{ lote.orgao ? `logado em ${lote.orgao.descricao} · nada é gravado nesta etapa` : '' }}</p>
        <button class="fechar" type="button" title="Fechar" @click="aoFechar()">×</button>
      </header>
      <div class="corpo">
        <section v-if="!lote.orgao" class="cartao">
          <div class="cartao-topo">
            <h2>Não foi possível abrir</h2>
            <span class="selo erro">ERRO</span>
          </div>
          <div class="cartao-corpo erro-texto">
            Não foi possível identificar o órgão em que você está logado (o token do PJe não está legível). Recarregue o PJe e
            tente de novo.
          </div>
        </section>
        <TelaTexto v-else-if="lote.tela !== 'resultado'" :lote="lote" />
        <ResultadoTexto v-else :lote="lote" />
      </div>
    </div>
  </div>
</template>

<style>
.lote-fundo { position: fixed; inset: 0; z-index: 2147483647; background: rgba(20, 28, 38, .45); }
.lote-janela {
  position: absolute; inset: 16px; margin: 0 auto; max-width: 1180px;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--cor-fundo); border: 1px solid var(--cor-borda); border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,.25);
}
</style>
