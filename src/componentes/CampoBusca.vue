<script setup lang="ts">
// Combobox (D90): um campo que mostra a opção escolhida; ao focar ou digitar, abre a lista por
// cima do resto (nada da tela se move) e filtra, sem diferenciar maiúsculas nem acentos. As setas
// andam, Enter escolhe, Esc fecha. Próprio, e não `<datalist>`, que se comporta diferente no
// Firefox e no Chrome e, com um valor escolhido, só mostra esse valor.
import { computed, nextTick, ref, watch } from 'vue';
import type { OpcaoBusca } from './opcaoBusca';

const props = defineProps<{ id: string; opcoes: OpcaoBusca[]; modelValue: string; desabilitado?: boolean; rotuloAcessivel?: string }>();
const emit = defineEmits<{ 'update:modelValue': [valor: string] }>();

const aberto = ref(false);
const filtro = ref('');
const ativo = ref(0);
const lista = ref<HTMLUListElement | null>(null);

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escolhida = computed(() => props.opcoes.find((o) => o.valor === props.modelValue));
const filtradas = computed(() => {
  const f = semAcento(filtro.value.trim());
  return f ? props.opcoes.filter((o) => semAcento(`${o.rotulo} ${o.detalhe ?? ''}`).includes(f)) : props.opcoes;
});
const texto = computed(() => (aberto.value ? filtro.value : (escolhida.value?.rotulo ?? '')));

function abrir() {
  if (props.desabilitado || aberto.value) return;
  filtro.value = '';
  aberto.value = true;
  ativo.value = Math.max(0, filtradas.value.findIndex((o) => o.valor === props.modelValue));
}

function fechar() {
  aberto.value = false;
  filtro.value = '';
}

function escolher(o: OpcaoBusca) {
  fechar();
  if (o.valor !== props.modelValue) emit('update:modelValue', o.valor);
}

function aoDigitar(ev: Event) {
  filtro.value = (ev.target as HTMLInputElement).value;
  aberto.value = true;
  ativo.value = 0;
}

function aoTeclar(ev: KeyboardEvent) {
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    if (!aberto.value) return abrir();
    const n = filtradas.value.length;
    if (n) ativo.value = (ativo.value + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n;
  } else if (ev.key === 'Enter' && aberto.value) {
    ev.preventDefault();
    const o = filtradas.value[ativo.value];
    if (o) escolher(o);
  } else if (ev.key === 'Escape' && aberto.value) {
    ev.preventDefault();
    ev.stopPropagation();
    fechar();
  } else if (ev.key === 'Tab') {
    fechar();
  }
}

// A opção ativa sempre à vista na lista.
watch(ativo, async () => {
  await nextTick();
  const el = lista.value?.querySelector<HTMLElement>('.ativa');
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
});
</script>

<template>
  <div class="campo-busca">
    <input
      :id="id"
      class="campo-busca-entrada"
      type="text"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      :aria-label="rotuloAcessivel"
      :aria-expanded="aberto"
      :aria-controls="`${id}-lista`"
      :aria-activedescendant="aberto && filtradas[ativo] ? `${id}-op-${ativo}` : undefined"
      :value="texto"
      :placeholder="aberto ? (escolhida?.rotulo ?? '') : ''"
      :title="escolhida?.detalhe ?? escolhida?.rotulo"
      :disabled="desabilitado"
      @focus="abrir"
      @click="abrir"
      @input="aoDigitar"
      @keydown="aoTeclar"
      @blur="fechar"
    />
    <span class="campo-busca-seta" aria-hidden="true">▾</span>
    <ul v-if="aberto" :id="`${id}-lista`" ref="lista" class="campo-busca-lista" role="listbox">
      <li
        v-for="(o, i) in filtradas"
        :id="`${id}-op-${i}`"
        :key="o.valor"
        role="option"
        :aria-selected="o.valor === modelValue"
        :class="{ ativa: i === ativo, escolhida: o.valor === modelValue }"
        @mousedown.prevent="escolher(o)"
        @mouseenter="ativo = i"
      >
        <span class="rotulo-opcao">{{ o.rotulo }}</span>
        <span v-if="o.detalhe" class="detalhe-opcao">{{ o.detalhe }}</span>
      </li>
      <li v-if="!filtradas.length" class="vazia">Nada encontrado</li>
    </ul>
  </div>
</template>

<style>
.campo-busca { position: relative; display: inline-block; width: 100%; }
.campo-busca-entrada { width: 100%; padding-right: 22px; cursor: pointer; text-overflow: ellipsis; }
.campo-busca-entrada:focus { cursor: text; outline: 2px solid var(--cor-marca); outline-offset: -1px; }
.campo-busca-seta { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); color: var(--cor-suave); pointer-events: none; font-size: 11px; }
.campo-busca-lista {
  position: absolute; z-index: 20; top: calc(100% + 2px); left: 0; min-width: 100%; width: max-content; max-width: min(560px, 90vw);
  max-height: 320px; overflow: auto; margin: 0; padding: 4px 0; list-style: none;
  background: var(--cor-fundo); border: 1px solid var(--cor-borda); border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,.18);
}
.campo-busca-lista li { padding: 5px 10px; cursor: pointer; display: flex; gap: 8px; align-items: baseline; }
.campo-busca-lista li.ativa { background: #e6f4f5; }
.campo-busca-lista li.escolhida .rotulo-opcao { font-weight: 700; }
.campo-busca-lista li.vazia { color: var(--cor-suave); cursor: default; }
.detalhe-opcao { color: var(--cor-suave); font-size: 11px; }
</style>
