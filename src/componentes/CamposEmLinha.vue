<script setup lang="ts">
// Campos lado a lado, com o rótulo acima de cada um (D59): o padrão das telas largas, como o Lote.
// O painel lateral do Individual continua com a grade de rótulo à esquerda (GradeCampos.vue).
</script>

<template>
  <div class="campos-em-linha"><slot /></div>
</template>

<style src="./campos-mensagens.css"></style>

<style>
.campos-em-linha { display: flex; flex-wrap: wrap; gap: 8px 22px; align-items: flex-start; }
.campo { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.campo > label { color: var(--cor-suave); font-size: 12px; }
.campo .controles { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.campo-largo { flex: 1 1 320px; }
.campo-largo .controles { flex-wrap: nowrap; }
/* O texto ocupa o que sobrar; o botão ao lado nunca quebra (e não desalinha a linha). */
.campo-largo .controles > input[type="text"] { flex: 1 1 auto; width: auto; min-width: 120px; }
.campo .controles > button { flex: none; white-space: nowrap; }
/* A mensagem do dia ocupa uma linha fixa embaixo do campo (§5); o texto todo fica no tooltip. */
.campo-data { width: 340px; }
.campo-data .msg { display: block; height: 1.45em; white-space: nowrap; text-overflow: ellipsis; }
</style>
