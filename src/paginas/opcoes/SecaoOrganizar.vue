<script setup lang="ts">
// Opções: conjuntos do Auto organizar do Lote (D48, §2.6). Aparecem em "Ordenar", na tela 2 do Lote
// (D63). O nome é automático (D48e); o pré-cadastro tem cinco (D64).
import type { Opcoes } from '../../config/opcoes';
import { nomeDoConjunto, primeiroCriterioLivre } from '../../regras/organizar';
import EditorConjunto from './EditorConjunto.vue';

const props = defineProps<{ opcoes: Opcoes }>();

function adicionarConjunto() {
  const primeiro = primeiroCriterioLivre([]);
  if (primeiro) props.opcoes.organizar.conjuntos.push({ criterios: [primeiro] });
}
</script>

<template>
  <section>
    <h2>Auto organizar o Lote</h2>
    <p class="suave pequeno">
      Conjuntos de regras para reordenar a lista do Controle em Lote ("Ordenar", na tela 2). Cada conjunto tem de 1 a 5
      critérios: o 1º ordena, o 2º desempata o 1º, e assim por diante; empate em tudo mantém a ordem. Partes são comparadas na
      ordem do polo; advogados, em ordem alfabética; processo sem advogado vai para o fim. O nome se monta sozinho.
    </p>
    <div v-for="(c, i) in opcoes.organizar.conjuntos" :key="i" class="conjunto">
      <div class="conjunto-topo">
        <strong class="nome-conjunto">{{ nomeDoConjunto(c) }}</strong>
        <button class="perigo pequeno" type="button" @click="opcoes.organizar.conjuntos.splice(i, 1)">Remover conjunto</button>
      </div>
      <EditorConjunto :conjunto="c" />
    </div>
    <p v-if="!opcoes.organizar.conjuntos.length" class="suave">Nenhum conjunto: na tela 2 do Lote, só a "Ordem manual".</p>
    <div class="linha"><button class="secundario" type="button" @click="adicionarConjunto">Adicionar conjunto</button></div>
  </section>
</template>

<style>
.conjunto { border: 1px solid var(--cor-borda); border-radius: 8px; padding: 10px 12px; margin: 10px 0; }
.conjunto-topo { display: flex; gap: 10px; align-items: baseline; justify-content: space-between; }
.nome-conjunto { font-size: 14px; }
.criterios { margin: 8px 0; padding-left: 0; list-style: none; }
.posicao-criterio { min-width: 1.4em; color: var(--cor-suave); font-variant-numeric: tabular-nums; }
.criterio { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; margin: 4px 0; }
.criterio select { max-width: 280px; }
button.pequeno { padding: 3px 10px; font-size: 13px; }
</style>
