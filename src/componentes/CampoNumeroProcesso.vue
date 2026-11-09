<script setup lang="ts">
// O campo do número do processo (D99), no "+" da Pauta: a máscara 0000000-00.0000.0.00.0000
// (`mascararNumero`), com os zeros à esquerda quando se digita o hífen, e as sugestões do PJe para o
// que já foi digitado, numa lista por cima do resto (nada da tela se move). As setas andam, Enter
// escolhe e Esc fecha; escolher uma sugestão já pede a busca (`escolher`).
import { computed, ref } from 'vue';
import { mascararNumero } from '../regras/numeros';

const props = defineProps<{
  id: string;
  desabilitado?: boolean;
  /** As sugestões para o que foi digitado (ex.: "0000369-"); sem ela, o campo só mascara. */
  sugerir?: (prefixo: string) => Promise<string[]>;
}>();
const numero = defineModel<string>({ required: true });
const emit = defineEmits<{ escolher: [numero: string] }>();

/** Espera depois da última tecla antes de pedir sugestões: uma consulta por pausa, não por tecla. */
const ESPERA_MS = 300;
/** "0000369-": o sequencial e o hífen. Antes disso, não há o que sugerir. */
const MINIMO = 8;
const COMPLETO = 25;

const entrada = ref<HTMLInputElement | null>(null);
const sugestoes = ref<string[]>([]);
const ativo = ref(0);
const aberto = computed(() => sugestoes.value.length > 0);
let temporizador: ReturnType<typeof setTimeout> | undefined;
let pedido = 0;

function pedirSugestoes(valor: string) {
  clearTimeout(temporizador);
  const meu = ++pedido;
  sugestoes.value = [];
  if (!props.sugerir || valor.length < MINIMO || valor.length >= COMPLETO) return;
  temporizador = setTimeout(async () => {
    try {
      const lista = await props.sugerir!(valor);
      // Resposta de uma pausa anterior não sobrescreve a de agora.
      if (meu !== pedido) return;
      sugestoes.value = lista;
      ativo.value = 0;
    } catch {
      // Sugestão nunca atrapalha a digitação.
    }
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
  clearTimeout(temporizador);
  pedido++;
  sugestoes.value = [];
  numero.value = n;
  emit('escolher', n);
}

function fechar() {
  clearTimeout(temporizador);
  pedido++;
  sugestoes.value = [];
}

function aoTeclar(ev: KeyboardEvent) {
  if (!aberto.value) return;
  const n = sugestoes.value.length;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    ativo.value = (ativo.value + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n;
  } else if (ev.key === 'Enter') {
    // Com a lista aberta, Enter escolhe a sugestão (e não envia o formulário da busca).
    ev.preventDefault();
    const s = sugestoes.value[ativo.value];
    if (s) escolher(s);
  } else if (ev.key === 'Escape') {
    ev.preventDefault();
    ev.stopPropagation();
    fechar();
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
      :aria-activedescendant="aberto ? `${id}-sug-${ativo}` : undefined"
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
    </ul>
  </div>
</template>

<style>
.campo-numero-processo { position: relative; display: inline-block; }
.campo-numero { width: 240px; font-variant-numeric: tabular-nums; }
.lista-sugestoes {
  position: absolute; z-index: 20; top: calc(100% + 2px); left: 0; min-width: 100%;
  max-height: 260px; overflow: auto; margin: 0; padding: 4px 0; list-style: none;
  background: var(--cor-fundo); border: 1px solid var(--cor-borda); border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,.18);
}
.lista-sugestoes li { padding: 5px 10px; cursor: pointer; font-variant-numeric: tabular-nums; }
.lista-sugestoes li.ativa { background: #e6f4f5; }
</style>
