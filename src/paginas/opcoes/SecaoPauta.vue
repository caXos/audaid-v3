<script setup lang="ts">
// Opções da Pauta (3.2, §2.6 item 7): os meses à frente (D91) e "Ocultar da Pauta" (D87b). A página
// de Opções não lê o PJe: a lista é a dos órgãos que a Pauta já mostrou.
import { LIMITES, type Opcoes } from '../../config/opcoes';

const props = defineProps<{ opcoes: Opcoes }>();

function ocultar(id: number, sim: boolean) {
  const lista = props.opcoes.pauta.ocultos;
  const i = lista.indexOf(id);
  if (sim && i < 0) lista.push(id);
  if (!sim && i >= 0) lista.splice(i, 1);
}
</script>

<template>
  <section>
    <h2>Pauta</h2>
    <div class="linha">
      <label for="meses-a-frente">Meses à frente</label>
      <input
        id="meses-a-frente"
        v-model.number="opcoes.pauta.mesesAFrente"
        type="number"
        step="1"
        :min="LIMITES.mesesAFrente.min"
        :max="LIMITES.mesesAFrente.max"
      />
    </div>
    <p class="suave pequeno">
      Até onde a lista da Pauta vai, contando o mês atual. Só é consultado o que aparece na tela, e no fim da lista "Carregar mais
      um mês" vai além.
    </p>
    <h3>Órgãos</h3>
    <p v-if="!opcoes.pauta.orgaos.length" class="suave pequeno">
      Abra a Pauta uma vez no PJe: os seus órgãos aparecem aqui, para você ocultar os que não quiser ver.
    </p>
    <template v-else>
      <p class="suave pequeno">Órgão oculto não aparece na Pauta e não é consultado. O órgão em que você estiver logado aparece sempre.</p>
      <div v-for="o in opcoes.pauta.orgaos" :key="o.id" class="linha">
        <label>
          <input type="checkbox" :checked="opcoes.pauta.ocultos.includes(o.id)" @change="ocultar(o.id, ($event.target as HTMLInputElement).checked)" />
          Ocultar da Pauta: <strong>{{ o.rotulo }}</strong> <span class="suave">· {{ o.nome }}</span>
        </label>
      </div>
    </template>
  </section>
</template>
