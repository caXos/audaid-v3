<script setup lang="ts">
// Diálogo modal que abre por cima do painel: nada no formulário muda de tamanho (§5).
import { ref } from 'vue';

defineProps<{ titulo: string; dica: string }>();

const el = ref<HTMLDialogElement | null>(null);

function abrir() {
  const d = el.value;
  if (!d) return;
  if (typeof d.showModal === 'function') d.showModal();
  else d.setAttribute('open', '');
}

function fechar() {
  el.value?.close();
}

defineExpose({ abrir, fechar });
</script>

<template>
  <dialog ref="el" class="dialogo">
    <h3>{{ titulo }}</h3>
    <p class="suave">{{ dica }}</p>
    <slot />
    <div class="rodape-dialogo"><button class="acao" type="button" @click="fechar">Fechar</button></div>
  </dialog>
</template>

<style>
.dialogo {
  width: min(520px, calc(100vw - 32px)); border: 1px solid var(--cor-borda); border-radius: 10px;
  padding: 14px 16px; color: var(--cor-texto); background: var(--cor-fundo);
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 12px 40px rgba(0,0,0,.25);
}
.dialogo::backdrop { background: rgba(20, 28, 38, .45); }
.dialogo h3 { margin: 0 0 2px; font-size: 14px; }
.dialogo p { margin: 0 0 8px; font-size: 12px; }
.rodape-dialogo { display: flex; justify-content: flex-end; margin-top: 10px; }
tr.clicavel { cursor: pointer; }
tr.clicavel:hover td { background: #e6f4f5; }
</style>
