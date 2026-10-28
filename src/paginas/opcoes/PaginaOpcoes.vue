<script setup lang="ts">
// Página de Opções (§2.6), em Vue desde a 3.1 (D50a): botão, sugestões de GIGS, Auto organizar
// (D48), termos e diagnóstico. O visual é o de antes (paginas.css); ações são botões (D62).
import { computed, ref } from 'vue';
import { opcoesPadrao } from '../../config/opcoes';
import { useOpcoes, type ApiOpcoes, type PedidoConfirmacao, type Trecho } from '../estadoOpcoes';
import DialogoConfirmacao from './DialogoConfirmacao.vue';
import SecaoBotao from './SecaoBotao.vue';
import SecaoGigs from './SecaoGigs.vue';
import SecaoOrganizar from './SecaoOrganizar.vue';

const props = defineProps<{ api: ApiOpcoes; desenvolvimento: boolean; versao: string }>();
/** URL relativa à página: com `src` fixo, o compilador do Vue tentaria importar o arquivo. */
const ICONE = 'icons/audaid.svg';

const estado = useOpcoes(props.api, props.desenvolvimento);
const confirmacao = ref<{ perguntar(p: PedidoConfirmacao): Promise<boolean> } | null>(null);

const t = (texto: string): Trecho => ({ texto });
const n = (texto: string): Trecho => ({ texto, negrito: true });
const plural = (qtd: number, um: string, varios: string) => `${qtd} ${qtd === 1 ? um : varios}`;

const textoTermos = computed(() =>
  estado.aceite ? `Aceitos em ${new Date(estado.aceite.aceitoEm).toLocaleString('pt-BR')}.` : 'Ainda não aceitos: o AudAid está inativo até você aceitar.',
);

async function revogar() {
  const ok = await confirmacao.value?.perguntar({
    titulo: 'Revogar o aceite dos termos?',
    itens: [
      [t('O AudAid fica '), n('inativo'), t(' em todas as abas do PJe até você aceitar os termos de novo.')],
      [t('Suas opções (botão, sugestões de GIGS e conjuntos do Auto organizar) não são apagadas.')],
    ],
    botaoPerigo: 'Revogar aceite',
  });
  if (ok) await estado.revogarAceite();
}

async function restaurar() {
  const padrao = opcoesPadrao(props.desenvolvimento);
  const sugestoes = estado.opcoes?.gigs.sugestoes.filter((s) => s.texto.trim()).length ?? 0;
  const conjuntos = estado.opcoes?.organizar.conjuntos.length ?? 0;
  const ok = await confirmacao.value?.perguntar({
    titulo: 'Restaurar as opções padrão?',
    itens: [
      [n('Botão do AudAid:'), t(' posição, cor do ícone, tamanho, fundo e borda voltam ao padrão (desenho preto sobre círculo branco, no topo ao centro).')],
      [
        n('Sugestões de GIGS:'),
        t(` voltam às ${padrao.gigs.sugestoes.length} de fábrica. `),
        n('As que você criou ou editou serão apagadas'),
        t(` (hoje você tem ${plural(sugestoes, 'sugestão', 'sugestões')}).`),
      ],
      [
        n('Auto organizar:'),
        t(` voltam os ${padrao.organizar.conjuntos.length} conjuntos de fábrica. `),
        n('Os que você criou ou editou serão apagados'),
        t(` (hoje você tem ${plural(conjuntos, 'conjunto', 'conjuntos')}).`),
      ],
      [n('Modo simulação:'), t(` volta ao padrão desta versão (${padrao.simulacao ? 'ligado' : 'desligado'}).`)],
      [t('O aceite dos termos não muda.')],
    ],
    botaoPerigo: 'Restaurar padrão',
  });
  if (ok) await estado.restaurar();
}
</script>

<template>
  <main>
    <header class="topo">
      <img :src="ICONE" alt="" />
      <div>
        <h1>AudAid: opções</h1>
        <p>As alterações são salvas automaticamente e valem na hora, também nas abas abertas do PJe.</p>
      </div>
    </header>

    <template v-if="estado.opcoes">
      <SecaoBotao :opcoes="estado.opcoes" />
      <SecaoGigs :opcoes="estado.opcoes" />
      <SecaoOrganizar :opcoes="estado.opcoes" />
    </template>

    <section>
      <h2>Termos de uso</h2>
      <p :class="estado.aceite ? 'estado-ok' : 'suave'">{{ textoTermos }}</p>
      <div class="linha"><button class="secundario" type="button" @click="estado.abrirTermos()">Ler os termos</button></div>
    </section>

    <section v-if="estado.opcoes">
      <details :open="desenvolvimento">
        <summary>Diagnóstico</summary>
        <p class="suave pequeno">
          {{ desenvolvimento ? 'Versão de desenvolvimento: o modo simulação vem ligado por padrão.' : 'Ferramentas para investigar problemas. Normalmente não é preciso mexer aqui.' }}
        </p>
        <div class="linha">
          <label><input v-model="estado.opcoes.simulacao" type="checkbox" /> <strong>Modo simulação</strong></label>
        </div>
        <p class="suave pequeno">
          Com o modo simulação ligado, o AudAid monta e mostra cada requisição que gravaria no PJe (designar, redesignar, GIGS,
          100% Digital), mas <strong>não envia nenhuma</strong>. As leituras continuam.
        </p>
        <div class="linha">
          <button class="perigo" type="button" @click="revogar">Revogar o aceite dos termos</button>
          <button class="secundario" type="button" @click="restaurar">Restaurar opções padrão</button>
        </div>
      </details>
    </section>

    <p class="salvo" aria-live="polite">{{ estado.salvo }}</p>
    <footer>AudAid {{ versao }}{{ desenvolvimento ? ' (desenvolvimento)' : '' }} · © Jorge Henrique Bueno Gomez</footer>
  </main>
  <DialogoConfirmacao ref="confirmacao" />
</template>
