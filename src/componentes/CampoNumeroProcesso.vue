<script setup lang="ts">
// O campo do número do processo (D99), no "+" da Pauta: a máscara 0000000-00.0000.0.00.0000
// (`mascararNumero`), com os zeros à esquerda quando se digita o hífen, e as sugestões do PJe para o
// que já foi digitado, numa lista por cima do resto (nada da tela se move). As setas andam, Enter
// escolhe e Esc fecha; escolher uma sugestão já pede a busca (`escolher`). Sem sugestão, a mesma
// lista diz por quê: nenhum processo começa assim, ou a consulta deu erro (D101).
import { computed, ref } from 'vue';
import { mascararNumero } from '../regras/numeros';

const props = defineProps<{
  id: string;
  desabilitado?: boolean;
  /**
   * As sugestões para o que foi digitado (ex.: "0000369-"); sem ela, o campo só mascara. `[]` = o
   * PJe não achou nenhum processo; `null` (ou exceção) = a consulta deu erro.
   */
  sugerir?: (prefixo: string) => Promise<string[] | null>;
}>();

const AVISO_NENHUM = 'Não foi encontrado nenhum processo com esse número';
const AVISO_ERRO = 'Erro na consulta do número do processo';
const numero = defineModel<string>({ required: true });
const emit = defineEmits<{ escolher: [numero: string] }>();

/** Espera depois da última tecla antes de pedir sugestões: uma consulta por pausa, não por tecla. */
const ESPERA_MS = 300;
/** "0000369-": o sequencial e o hífen. Antes disso, não há o que sugerir. */
const MINIMO = 8;
const COMPLETO = 25;

const entrada = ref<HTMLInputElement | null>(null);
const sugestoes = ref<string[]>([]);
/** D101: o aviso no lugar das sugestões (nenhum processo, ou erro na consulta); vazio = sem aviso. */
const aviso = ref('');
const ativo = ref(0);
const temSugestoes = computed(() => sugestoes.value.length > 0);
const aberto = computed(() => temSugestoes.value || Boolean(aviso.value));
let temporizador: ReturnType<typeof setTimeout> | undefined;
let pedido = 0;

function pedirSugestoes(valor: string) {
  clearTimeout(temporizador);
  const meu = ++pedido;
  sugestoes.value = [];
  aviso.value = '';
  if (!props.sugerir || valor.length < MINIMO || valor.length >= COMPLETO) return;
  temporizador = setTimeout(async () => {
    let lista: string[] | null;
    try {
      lista = await props.sugerir!(valor);
    } catch {
      lista = null;
    }
    // Resposta de uma pausa anterior não sobrescreve a de agora.
    if (meu !== pedido) return;
    sugestoes.value = lista ?? [];
    aviso.value = lista === null ? AVISO_ERRO : lista.length ? '' : AVISO_NENHUM;
    ativo.value = 0;
  }, ESPERA_MS);
}

/** Onde fica o cursor: antes dos mesmos dígitos que estavam depois dele (os zeros entram à esquerda). */
function posicaoDoCursor(mascarado: string, digitosDepois: number): number {
  let vistos = 0;
  for (let i = mascarado.length - 1; i >= 0; i--) {
    if (/\d/.test(mascarado[i]!)) vistos++;
    if (vistos === digitosDepois) return i;
  }
  return 0;
}

function aoDigitar(ev: Event) {
  const campo = ev.target as HTMLInputElement;
  const cursor = campo.selectionStart ?? campo.value.length;
  const digitosDepois = campo.value.slice(cursor).replace(/\D/g, '').length;
  const mascarado = mascararNumero(campo.value);
  // O campo mostra já mascarado, mesmo quando o valor do modelo não muda (ex.: um ponto a mais).
  campo.value = mascarado;
  numero.value = mascarado;
  // Corrigindo no meio, o cursor não pula para o fim.
  if (digitosDepois > 0) {
    const pos = posicaoDoCursor(mascarado, digitosDepois);
    campo.setSelectionRange(pos, pos);
  }
  pedirSugestoes(mascarado);
}

function escolher(n: string) {
  fechar();
  numero.value = n;
  emit('escolher', n);
}

function fechar() {
  clearTimeout(temporizador);
  pedido++;
  sugestoes.value = [];
  aviso.value = '';
}

function aoTeclar(ev: KeyboardEvent) {
  if (!aberto.value) return;
  const n = sugestoes.value.length;
  if (ev.key === 'Escape') {
    ev.preventDefault();
    ev.stopPropagation();
    fechar();
    return;
  }
  // Com um aviso, não há o que escolher: Enter segue para a busca, como sem lista.
  if (!temSugestoes.value) return;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    ativo.value = (ativo.value + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n;
  } else if (ev.key === 'Enter') {
    // Com a lista aberta, Enter escolhe a sugestão (e não envia o formulário da busca).
    ev.preventDefault();
    const s = sugestoes.value[ativo.value];
    if (s) escolher(s);
  }
}

defineExpose({ focar: () => entrada.value?.focus() });
</script>

<template>
  <div class="campo-numero-processo">
    <input
      :id="id"
      ref="entrada"
      class="campo-numero"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      spellcheck="false"
      placeholder="0000000-00.0000.0.00.0000"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="aberto"
      :aria-controls="`${id}-sugestoes`"
      :aria-activedescendant="temSugestoes ? `${id}-sug-${ativo}` : undefined"
      :value="numero"
      :disabled="desabilitado"
      @input="aoDigitar"
      @keydown="aoTeclar"
      @blur="fechar"
    />
    <ul v-if="aberto" :id="`${id}-sugestoes`" class="lista-sugestoes" role="listbox">
      <li
        v-for="(s, i) in sugestoes"
        :id="`${id}-sug-${i}`"
        :key="s"
        role="option"
        :aria-selected="i === ativo"
        :class="{ ativa: i === ativo }"
        @mousedown.prevent="escolher(s)"
        @mouseenter="ativo = i"
      >
        {{ s }}
      </li>
      <!-- D101: nenhum processo começa assim, ou a consulta deu erro; não é uma opção, só o aviso. -->
      <li v-if="aviso" :class="['aviso-sugestao', { erro: aviso === AVISO_ERRO }]" role="option" aria-disabled="true" aria-selected="false" @mousedown.prevent>
        {{ aviso }}
      </li>
    </ul>
  </div>
</template>

<style>
.campo-numero-processo { position: relative; display: inline-block; }
.campo-numero { width: 240px; font-variant-numeric: tabular-nums; }
/* Com o prefixo do campo: dentro de um cartão, o `.cartao-corpo ul` do CSS base (recuo de 18 px)
   ganhava do `.lista-sugestoes` sozinho e empurrava a sugestão para a direita (teste de 09/11/2026). */
.campo-numero-processo .lista-sugestoes {
  position: absolute; z-index: 20; top: calc(100% + 2px); left: 0; box-sizing: border-box; width: max-content; min-width: 100%;
  max-height: 260px; overflow: auto; margin: 0; padding: 4px 0; list-style: none;
  background: var(--cor-fundo); border: 1px solid var(--cor-borda); border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,.18);
}
.campo-numero-processo .lista-sugestoes li { margin: 0; padding: 5px 10px; white-space: nowrap; cursor: pointer; font-variant-numeric: tabular-nums; }
.campo-numero-processo .lista-sugestoes li.ativa { background: #e6f4f5; }
.campo-numero-processo .lista-sugestoes li.aviso-sugestao { color: var(--cor-suave); cursor: default; font-variant-numeric: normal; }
.campo-numero-processo .lista-sugestoes li.aviso-sugestao.erro { color: var(--cor-erro); }
</style>
