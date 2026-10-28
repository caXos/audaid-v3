<script setup lang="ts">
// Campos do GIGS (D29, D29b, D43, D46): sugestão, texto com "Exibir variáveis", prazo e prévia.
// As regras ficam em estadoGigs.ts. Na grade (Individual), linhas da grade; `empilhado`, uma linha
// de campos com o rótulo acima, na largura toda (Lote, D59), e o slot `acoes` no fim.
import { nextTick, ref } from 'vue';
import { VARIAVEIS_GIGS, type DadosVariaveisGigs } from '../regras/gigs';
import CamposEmLinha from './CamposEmLinha.vue';
import Dialogo from './Dialogo.vue';
import type { EstadoGigs } from './estadoGigs';

const props = defineProps<{
  estado: EstadoGigs;
  /** Valores atuais das variáveis, para o diálogo mostrar o que cada uma vira. */
  dadosVariaveis: () => DadosVariaveisGigs;
  empilhado?: boolean;
}>();

const campoTexto = ref<HTMLInputElement | null>(null);
const dialogo = ref<{ abrir(): void; fechar(): void } | null>(null);

async function aoEscolher(ev: Event) {
  if ((ev.target as HTMLSelectElement).value !== 'outro') return;
  await nextTick(); // o campo só se habilita depois do redesenho
  campoTexto.value?.focus();
}

/** Insere no cursor do campo de texto (ou no fim, se o campo nunca recebeu foco). */
async function inserir(trecho: string) {
  const campo = campoTexto.value;
  if (!campo) return;
  const inicio = campo.selectionStart ?? campo.value.length;
  const fim = campo.selectionEnd ?? campo.value.length;
  props.estado.texto = campo.value.slice(0, inicio) + trecho + campo.value.slice(fim);
  dialogo.value?.fechar();
  await nextTick();
  campo.focus();
  campo.setSelectionRange(inicio + trecho.length, inicio + trecho.length);
}
</script>

<template>
  <template v-if="empilhado">
    <CamposEmLinha class="gigs-em-linha">
      <div class="campo">
        <label>GIGS</label>
        <select v-model="estado.opcao" @change="aoEscolher">
          <option value="">— não lançar GIGS —</option>
          <option v-for="s in estado.sugestoes" :key="s.valor" :value="s.valor">{{ s.rotulo }}</option>
          <option value="outro">Outro…</option>
        </select>
      </div>
      <div class="campo campo-largo">
        <label>Texto</label>
        <div class="controles">
          <input ref="campoTexto" v-model="estado.texto" type="text" class="largo" :disabled="!estado.lancar" />
          <button class="acao secundaria pequena" type="button" :disabled="!estado.lancar" @click="dialogo?.abrir()">Exibir variáveis</button>
        </div>
      </div>
      <div class="campo">
        <label>Prazo</label>
        <div class="controles">
          <input v-model="estado.prazo" type="number" :min="estado.prazoMin" :max="estado.prazoMax" :disabled="!estado.lancar" />
          <span class="suave">dias úteis (0 = sem prazo)</span>
        </div>
      </div>
      <div v-if="$slots.acoes" class="campo">
        <label>&nbsp;</label>
        <div class="controles"><slot name="acoes" /></div>
      </div>
    </CamposEmLinha>
    <div class="previa-gigs linha-fixa" :title="estado.previa">{{ estado.previa }}</div>
  </template>
  <template v-else>
    <label>GIGS</label>
    <div class="controles">
      <select v-model="estado.opcao" @change="aoEscolher">
        <option value="">— não lançar GIGS —</option>
        <option v-for="s in estado.sugestoes" :key="s.valor" :value="s.valor">{{ s.rotulo }}</option>
        <option value="outro">Outro…</option>
      </select>
    </div>
    <label>Texto</label>
    <div class="controles">
      <input ref="campoTexto" v-model="estado.texto" type="text" class="largo" :disabled="!estado.lancar" />
      <button class="acao secundaria" type="button" :disabled="!estado.lancar" @click="dialogo?.abrir()">Exibir variáveis</button>
    </div>
    <label>Prazo</label>
    <div class="controles">
      <input v-model="estado.prazo" type="number" :min="estado.prazoMin" :max="estado.prazoMax" :disabled="!estado.lancar" />
      <span class="suave">dias úteis (0 = sem prazo)</span>
    </div>
    <div class="previa-gigs linha-fixa" :title="estado.previa">{{ estado.previa }}</div>
  </template>
  <!-- D43: as variáveis ficam à vista num diálogo, e clicar insere no texto. -->
  <Dialogo
    ref="dialogo"
    class="dialogo-pauta"
    titulo="Variáveis do texto do GIGS"
    dica="Clique numa variável para inseri-la no texto. Variável que o AudAid não conhece vai como está escrita."
  >
    <div class="corpo-variaveis">
      <table>
        <tbody>
          <tr v-for="v in VARIAVEIS_GIGS" :key="v.variavel" class="clicavel" :title="`Inserir ${v.variavel} no texto`" @click="inserir(v.variavel)">
            <td><code>{{ v.variavel }}</code></td>
            <td>
              <template v-if="v.valor(dadosVariaveis()) !== undefined">{{ v.valor(dadosVariaveis()) }}</template>
              <span v-else class="suave">(escolha no formulário)</span>
            </td>
            <td class="suave">{{ v.descricao }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </Dialogo>
</template>

<style>
.previa-gigs { grid-column: 1 / -1; color: var(--cor-suave); }
.corpo-variaveis { max-height: 360px; overflow: auto; border: 1px solid #eef1f4; border-radius: 6px; }
.corpo-variaveis code { font: 12px ui-monospace, Consolas, monospace; background: var(--cor-fundo-2); padding: 1px 5px; border-radius: 4px; white-space: nowrap; }
input[type="text"].largo { width: 100%; }
input[type="number"] { width: 70px; }
</style>
