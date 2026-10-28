<script setup lang="ts">
// Confirmação das Opções (revogar aceite, restaurar padrão), com o `<dialog>` nativo. Cancelar tem o
// foco, e Esc também cancela.
import { nextTick, ref } from 'vue';
import type { PedidoConfirmacao } from '../estadoOpcoes';

const el = ref<HTMLDialogElement | null>(null);
const cancelar = ref<HTMLButtonElement | null>(null);
const pedido = ref<PedidoConfirmacao>({ titulo: '', itens: [], botaoPerigo: '' });
let responder: ((ok: boolean) => void) | null = null;

function perguntar(p: PedidoConfirmacao): Promise<boolean> {
  pedido.value = p;
  return new Promise((resolver) => {
    responder = resolver;
    const d = el.value;
    if (d && typeof d.showModal === 'function') d.showModal();
    else d?.setAttribute('open', '');
    void nextTick(() => cancelar.value?.focus());
  });
}

function fechar(ok: boolean) {
  const r = responder;
  responder = null;
  const d = el.value;
  if (d?.open && typeof d.close === 'function') d.close();
  else d?.removeAttribute('open');
  r?.(ok);
}

defineExpose({ perguntar });
</script>

<template>
  <dialog ref="el" aria-labelledby="confirmacao-titulo" @close="fechar(false)">
    <h2 id="confirmacao-titulo">{{ pedido.titulo }}</h2>
    <ul>
      <li v-for="(item, i) in pedido.itens" :key="i">
        <template v-for="(t, j) in item" :key="j"><strong v-if="t.negrito">{{ t.texto }}</strong><template v-else>{{ t.texto }}</template></template>
      </li>
    </ul>
    <div class="linha acoes-dialogo">
      <button ref="cancelar" class="secundario" type="button" @click="fechar(false)">Cancelar</button>
      <button class="perigo-cheio" type="button" @click="fechar(true)">{{ pedido.botaoPerigo }}</button>
    </div>
  </dialog>
</template>
