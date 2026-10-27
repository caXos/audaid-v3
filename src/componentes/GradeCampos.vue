<script setup lang="ts">
// Grade de duas colunas (rótulo · controles) dos formulários. Layout estável (§5): toda linha de
// mensagem tem altura fixa, e o texto que não couber vai para o tooltip.
</script>

<template>
  <div class="grade"><slot /></div>
</template>

<style>
.grade { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; align-items: center; }
.grade > label { color: var(--cor-suave); font-size: 12px; }
.grade .controles { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
/* §5, layout estável: toda linha de mensagem tem altura FIXA de duas linhas; o excedente vai
   para o tooltip. Assim nada abaixo se mexe quando o texto muda. */
.msg, .linha-fixa {
  height: 2.9em; line-height: 1.45em; overflow: hidden; font-size: 12px;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
}
.msg { grid-column: 2; }
.msg.carregando { color: var(--cor-suave); }
.msg.carregando::before {
  content: ''; display: inline-block; width: 10px; height: 10px; margin-right: 6px; vertical-align: -1px;
  border: 2px solid #c3cad4; border-top-color: var(--cor-marca); border-radius: 50%;
  animation: girar .8s linear infinite;
}
@keyframes girar { to { transform: rotate(360deg); } }
.msg.bloqueia, .msg.erro { color: var(--cor-erro); }
.msg.avisa { color: var(--cor-aviso); }
.msg.ok { color: var(--cor-ok); }
.msg.suave { color: var(--cor-suave); }
</style>
