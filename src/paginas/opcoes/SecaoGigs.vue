<script setup lang="ts">
// Opções: sugestões de GIGS (D11, D29, D43). A opção vazia e "Outro" são fixas e não ficam salvas.
import { nextTick, ref } from 'vue';
import { LIMITES, type Opcoes } from '../../config/opcoes';
import { VARIAVEIS_GIGS } from '../../regras/gigs';

const props = defineProps<{ opcoes: Opcoes }>();
const secao = ref<HTMLElement | null>(null);

async function adicionar() {
  props.opcoes.gigs.sugestoes.push({ texto: '', prazo: 2 });
  await nextTick();
  const textos = secao.value?.querySelectorAll<HTMLInputElement>('tbody input[type="text"]');
  textos?.[textos.length - 1]?.focus();
}

function remover(i: number) {
  props.opcoes.gigs.sugestoes.splice(i, 1);
}
</script>

<template>
  <section ref="secao">
    <h2>Sugestões de GIGS</h2>
    <p class="suave pequeno">
      Aparecem na lista de GIGS do Controle Individual e do Lote. Escolher uma sugestão preenche o texto e o prazo, que você
      ainda pode editar. O prazo é em dias úteis; <strong>0</strong> cria uma atividade sem prazo. O tipo de atividade é sempre
      <strong>Prazo</strong>.
    </p>
    <table>
      <thead>
        <tr>
          <th>Texto</th>
          <th style="width: 110px">Prazo (dias úteis)</th>
          <th style="width: 90px"></th>
        </tr>
      </thead>
      <tbody>
        <tr class="fixa">
          <td>(vazio): não lança GIGS. Fica sempre em primeiro, como padrão.</td>
          <td>—</td>
          <td></td>
        </tr>
        <tr v-for="(s, i) in opcoes.gigs.sugestoes" :key="i">
          <!-- O limite é o do campo Observação do GIGS no PJe (D46). -->
          <td><input v-model="s.texto" type="text" :maxlength="LIMITES.textoGigs" /></td>
          <td><input v-model.number="s.prazo" type="number" :min="LIMITES.prazo.min" :max="LIMITES.prazo.max" /></td>
          <td><button class="secundario" type="button" @click="remover(i)">Remover</button></td>
        </tr>
        <tr class="fixa">
          <td>Outro: você digita o texto na hora.</td>
          <td>2</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <div class="linha"><button class="secundario" type="button" @click="adicionar">Adicionar sugestão</button></div>
    <div class="suave pequeno">
      Variáveis que você pode usar no texto (o AudAid as preenche na hora de lançar o GIGS):
      <ul>
        <li v-for="v in VARIAVEIS_GIGS" :key="v.variavel"><code>{{ v.variavel }}</code> · {{ v.descricao }}</li>
      </ul>
    </div>
  </section>
</template>
