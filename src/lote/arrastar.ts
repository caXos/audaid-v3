// Arrastar para reordenar a lista do Lote (D14, D50b), com o arrastar nativo do HTML5 e sem
// biblioteca: os eventos ficam nos próprios elementos da lista, dentro do Shadow DOM, e por isso
// funcionam igual no Firefox e no Chrome. Só a alça `::` inicia o arraste, para os campos da linha
// continuarem editáveis. Com a alça em foco, ↑ e ↓ também movem.

import { reactive, ref } from 'vue';
import { destinoDoArraste } from './pauta';

export function useArrastar(mover: (de: number, para: number) => void) {
  /** Linha cuja alça está pressionada: só ela fica `draggable`. */
  const liberada = ref<number | null>(null);
  const origem = ref<number | null>(null);
  const alvo = ref<{ indice: number; posicao: 'antes' | 'depois' } | null>(null);

  function terminar() {
    origem.value = null;
    alvo.value = null;
    liberada.value = null;
  }

  return reactive({
    liberada,
    origem,
    alvo,
    /** `pointerdown` na alça. O atributo vai direto no elemento: o arraste começa antes do redesenho. */
    segurar(indice: number, ev: Event) {
      liberada.value = indice;
      (ev.currentTarget as HTMLElement | null)?.closest('[data-linha]')?.setAttribute('draggable', 'true');
    },
    soltarAlca() {
      if (origem.value === null) liberada.value = null;
    },
    iniciar(indice: number, ev: DragEvent) {
      if (liberada.value !== indice) {
        ev.preventDefault();
        return;
      }
      origem.value = indice;
      if (ev.dataTransfer) {
        // O Firefox só inicia o arraste com algum dado.
        ev.dataTransfer.setData('text/plain', String(indice));
        ev.dataTransfer.effectAllowed = 'move';
      }
    },
    sobre(indice: number, ev: DragEvent) {
      if (origem.value === null) return;
      ev.preventDefault();
      const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
      alvo.value = { indice, posicao: ev.clientY < r.top + r.height / 2 ? 'antes' : 'depois' };
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    },
    largar(ev: DragEvent) {
      ev.preventDefault();
      if (origem.value !== null && alvo.value) mover(origem.value, destinoDoArraste(origem.value, alvo.value.indice, alvo.value.posicao));
      terminar();
    },
    terminar,
  });
}

export type Arrastar = ReturnType<typeof useArrastar>;
