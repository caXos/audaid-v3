<script setup lang="ts">
// Grade de duas colunas (rótulo · controles) dos formulários do painel lateral (Individual, D59).
// Layout estável (§5): toda linha de mensagem tem altura fixa, e o texto que não couber vai para
// o tooltip.
</script>

<template>
  <div class="grade"><slot /></div>
</template>

<style src="./campos-mensagens.css"></style>

<style>
.grade { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; align-items: center; }
.grade > label { color: var(--cor-suave); font-size: 12px; }
.grade .controles { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.grade .msg { grid-column: 2; }
</style>
