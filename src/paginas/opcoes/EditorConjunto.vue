<script setup lang="ts">
// Os critérios de um conjunto do Auto organizar (§2.6, D48a): cada um são duas dropdowns, o campo e
// a ordem. Só ficam habilitadas as escolhas que mantêm todos os critérios com efeito
// (`criteriosValidos`): um campo usado não se repete, e o último dígito tem as suas exceções.
import { computed } from 'vue';
import {
  CAMPOS,
  CAMPOS_EM_ORDEM,
  criteriosValidos,
  ordensDoCampo,
  primeiroCriterioLivre,
  rotuloOrdem,
  type CampoOrdem,
  type ConjuntoRegras,
  type Criterio,
  type Ordem,
} from '../../regras/organizar';

const props = defineProps<{ conjunto: ConjuntoRegras }>();

const lista = () => props.conjunto.criterios;
const comTroca = (j: number, novo: Criterio): Criterio[] => lista().map((k, i) => (i === j ? novo : k));
const valor = (ev: Event) => (ev.target as HTMLSelectElement).value;

function campoPossivel(j: number, campo: CampoOrdem): boolean {
  return campo === lista()[j]!.campo || ordensDoCampo(campo).some((ordem) => criteriosValidos(comTroca(j, { campo, ordem })));
}
function ordemPossivel(j: number, ordem: Ordem): boolean {
  const k = lista()[j]!;
  return ordem === k.ordem || criteriosValidos(comTroca(j, { campo: k.campo, ordem }));
}
function mudarCampo(j: number, ev: Event) {
  const campo = valor(ev) as CampoOrdem;
  const ordem = ordensDoCampo(campo).find((o) => criteriosValidos(comTroca(j, { campo, ordem: o })));
  if (ordem) props.conjunto.criterios.splice(j, 1, { campo, ordem });
}
function mudarOrdem(j: number, ev: Event) {
  props.conjunto.criterios.splice(j, 1, { campo: lista()[j]!.campo, ordem: valor(ev) as Ordem });
}
function trocados(j: number, para: number): Criterio[] | null {
  if (para < 0 || para >= lista().length) return null;
  const l = [...lista()];
  [l[j], l[para]] = [l[para]!, l[j]!];
  return criteriosValidos(l) ? l : null;
}
function mover(j: number, passo: number) {
  const l = trocados(j, j + passo);
  if (l) props.conjunto.criterios.splice(0, l.length, ...l);
}

const livre = computed(() => primeiroCriterioLivre(lista()));
function adicionar() {
  if (livre.value) props.conjunto.criterios.push({ ...livre.value });
}
</script>

<template>
  <ol class="criterios">
    <li v-for="(k, j) in conjunto.criterios" :key="j" class="criterio">
      <span class="posicao-criterio">{{ j + 1 }}.</span>
      <select :value="k.campo" :aria-label="`Campo do critério ${j + 1}`" @change="mudarCampo(j, $event)">
        <option v-for="c in CAMPOS_EM_ORDEM" :key="c" :value="c" :disabled="!campoPossivel(j, c)">{{ CAMPOS[c].rotulo }}</option>
      </select>
      <select :value="k.ordem" :aria-label="`Ordem do critério ${j + 1}`" @change="mudarOrdem(j, $event)">
        <option v-for="o in ordensDoCampo(k.campo)" :key="o" :value="o" :disabled="!ordemPossivel(j, o)">{{ rotuloOrdem(k.campo, o) }}</option>
      </select>
      <button class="secundario pequeno" type="button" title="Subir este critério" :disabled="!trocados(j, j - 1)" @click="mover(j, -1)">↑</button>
      <button class="secundario pequeno" type="button" title="Descer este critério" :disabled="!trocados(j, j + 1)" @click="mover(j, 1)">↓</button>
      <button
        class="secundario pequeno"
        type="button"
        :title="conjunto.criterios.length === 1 ? 'Um conjunto tem pelo menos um critério; para tirá-lo, remova o conjunto' : 'Tirar este critério'"
        :disabled="conjunto.criterios.length === 1"
        @click="conjunto.criterios.splice(j, 1)"
      >
        Remover
      </button>
    </li>
  </ol>
  <button class="secundario pequeno" type="button" :disabled="!livre" :title="livre ? '' : 'Já há 5 critérios, ou nenhum outro teria efeito'" @click="adicionar">
    Adicionar critério
  </button>
</template>
