<script setup lang="ts">
// Tela 1 do Lote (§2.3, D12): cola-se qualquer texto; os números são reconhecidos enquanto se cola.
import type { EstadoLote } from './estadoLote';

defineProps<{ lote: EstadoLote }>();
</script>

<template>
  <section class="cartao">
    <div class="cartao-topo"><h2>1. Cole a lista de processos</h2></div>
    <div class="cartao-corpo">
      <p class="suave dica-texto">
        Qualquer texto serve: e-mail, planilha, pauta. Valem os números no formato 0000000-00.0000.0.00.0000 e os mesmos 20
        dígitos sem pontuação. Repetidos entram uma vez só.
      </p>
      <textarea v-model="lote.texto" class="texto-lote" :disabled="lote.tela === 'consultando'" spellcheck="false"></textarea>
      <div class="rodape-texto">
        <button class="acao" type="button" :disabled="!lote.numeros.length || lote.tela === 'consultando'" @click="lote.continuar()">
          {{ lote.tela === 'consultando' ? `Consultando ${lote.progresso.feitos} de ${lote.progresso.total}…` : 'Continuar' }}
        </button>
        <span class="suave">{{ lote.numeros.length }} número(s) reconhecido(s)</span>
        <span class="erro-texto">{{ lote.aviso }}</span>
      </div>
    </div>
  </section>
</template>

<style>
.dica-texto { margin: 0 0 8px; }
textarea.texto-lote { height: min(50vh, 420px); font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
textarea.texto-lote:disabled { background: var(--cor-fundo-2); }
.rodape-texto { display: flex; gap: 12px; align-items: center; margin-top: 10px; min-height: 30px; }
</style>
