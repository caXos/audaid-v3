<script setup lang="ts">
// O "+" da Pauta (D89c, D89d): designar numa vaga (hora fixa) ou no dia (hora digitada), no órgão
// logado. O processo é conferido como na tela 1 do Lote (D27) e o resto é o formulário do Individual:
// tipo composto, 100% Digital com Julgamento (D26), GIGS, confirmação no envio real e a
// redesignação da D32 quando o processo já tem audiência no órgão.
import { computed, onMounted, ref, shallowRef } from 'vue';
import CampoNumeroProcesso from '../componentes/CampoNumeroProcesso.vue';
import type { Opcoes } from '../config/opcoes';
import type { ResultadoExecucao } from '../fluxo/executor';
import { carregarDados, type Dados } from '../individual/dados';
import FormularioIndividual from '../individual/FormularioIndividual.vue';
import { resolverLista } from '../lote/resolver';
import type { Ambiente } from '../pje/ambiente';
import { extrairNumeros } from '../regras/numeros';
import { formatarDataHora } from '../ui/dom';
import { sugerirNumeros } from './dados';
import { leitorDoPje } from './estadoPauta';
import { rotuloDoDia } from './orgaos';

const props = defineProps<{
  ambiente: Ambiente;
  opcoes: Opcoes;
  simulando: boolean;
  idOrgaoLogado: number;
  /** A sala da vaga ou da sala escolhida. Sem ela ("+ Designar" do dia em "Todas as salas", D98), escolhe-se no formulário. */
  sala?: { id: number; nome: string };
  /** AAAA-MM-DD */
  dia: string;
  /** HH:MM: o "+" da vaga. Sem ela, o "+" do dia, com a hora digitada. */
  hora?: string;
  aoFechar: () => void;
  /** Gravou de verdade: a Pauta relê o dia e, na redesignação, o dia de onde a audiência saiu. */
  aoGravar: (deOnde?: { idSala: number; dia: string }) => void;
}>();

const numero = ref('');
const buscando = ref(false);
const motivo = ref('');
const dados = shallowRef<Dados | null>(null);
const ler = leitorDoPje(props.ambiente);
const campo = ref<{ focar(): void } | null>(null);
/** D99: as sugestões do PJe para o que foi digitado (a busca do painel). */
const sugerir = (prefixo: string) => sugerirNumeros(ler, prefixo);

// D99: o diálogo abre com o cursor no número.
onMounted(() => campo.value?.focar());

const titulo = computed(
  () => `Designar · ${rotuloDoDia(props.dia)} · ${props.sala ? props.sala.nome : 'escolha a sala no formulário'}${props.hora ? ` · ${props.hora}` : ''}`,
);
const fixos = computed(() => ({ data: props.dia, ...(props.sala ? { idSala: props.sala.id } : {}), ...(props.hora ? { hora: props.hora } : {}) }));

/** D89d: o processo que já tem audiência no órgão é redesignado, e isso é dito antes de gravar. */
const avisoRedesignacao = computed(() => {
  const a = dados.value?.antiga;
  if (!a) return '';
  const para = `${rotuloDoDia(props.dia)}${props.hora ? `, ${props.hora}` : ', no horário escolhido abaixo'}`;
  return `Este processo já tem audiência em ${formatarDataHora(a.dataInicio)} (${a.tipo?.descricao ?? '?'}, ${a.salaFisica?.nome ?? '?'}). Ela será redesignada para ${para}.`;
});

async function buscar() {
  motivo.value = '';
  dados.value = null;
  const [n] = extrairNumeros(numero.value);
  if (!n) {
    motivo.value = 'Digite um número de processo, no formato 0000000-00.0000.0.00.0000 ou com os 20 dígitos.';
    return;
  }
  buscando.value = true;
  try {
    // Como a tela 1 do Lote: dígito verificador, busca, conferência do número e do órgão (D27).
    const r = await resolverLista([n], { ler, idOrgaoLogado: props.idOrgaoLogado });
    const achado = r.incluidos[0];
    if (!achado) {
      motivo.value = `${n}: ${r.naoIncluidos[0]?.motivo ?? 'não encontrado'}.`;
      return;
    }
    const c = await carregarDados(props.ambiente, achado.id);
    if (!c.ok) motivo.value = c.mensagem;
    else dados.value = c.dados;
  } finally {
    buscando.value = false;
  }
}

function aoConcluir(_r: ResultadoExecucao, gravou: boolean) {
  if (!gravou) return;
  const a = dados.value?.antiga;
  props.aoGravar(a?.salaFisica ? { idSala: a.salaFisica.id, dia: a.dataInicio.slice(0, 10) } : undefined);
}
</script>

<template>
  <div class="pauta-fundo fundo-acao">
    <div class="pauta-janela janela-acao" role="dialog" :aria-label="titulo">
      <header class="cabecalho cabecalho-pauta">
        <h1>{{ titulo }}</h1>
        <button class="fechar" type="button" title="Fechar" @click="aoFechar()">×</button>
      </header>
      <div v-if="simulando" class="faixa-simulacao-acao">SIMULAÇÃO: nada será gravado no PJe.</div>
      <div v-else class="faixa-real-acao">ENVIO REAL: o que você confirmar será gravado no PJe em seu nome.</div>
      <div class="corpo">
        <section class="cartao">
          <div class="cartao-topo"><h2>Processo</h2></div>
          <div class="cartao-corpo">
            <form class="linha-form" @submit.prevent="buscar()">
              <CampoNumeroProcesso id="designar-numero" ref="campo" v-model="numero" :desabilitado="buscando" :sugerir="sugerir" @escolher="buscar()" />
              <button class="acao secundaria" type="submit" :disabled="buscando">{{ buscando ? 'Buscando…' : 'Buscar' }}</button>
            </form>
            <p v-if="motivo" class="erro-texto">{{ motivo }}</p>
            <p v-else-if="dados" class="suave">
              {{ dados.processo.numero }} · {{ dados.processo.classeJudicial?.sigla ?? '?' }}{{ dados.processo.juizoDigital ? ' · 100% Digital' : '' }}
            </p>
            <p v-else class="suave">O processo precisa tramitar no órgão logado.</p>
            <p v-if="avisoRedesignacao" class="aviso-redesignacao">{{ avisoRedesignacao }}</p>
          </div>
        </section>
        <FormularioIndividual
          v-if="dados"
          :key="dados.processo.id"
          :ambiente="ambiente"
          :dados="dados"
          :opcoes="opcoes"
          :simulando="simulando"
          :fixos="fixos"
          :sem-recarregar="true"
          :ao-concluir="aoConcluir"
          :uma-vez="true"
        >
          <!-- D99: o "Fechar" fica fixo, na linha da ação, à direita; nenhum botão vira outro. -->
          <template #fim>
            <button class="acao secundaria botao-fechar-acao" type="button" @click="aoFechar()">Fechar</button>
          </template>
        </FormularioIndividual>
      </div>
    </div>
  </div>
</template>

<style>
/* O CSS comum aos diálogos do "+" e do "×" fica no PainelPauta.vue, que está sempre na tela. */
.aviso-redesignacao { color: var(--cor-aviso); background: var(--cor-aviso-fundo); border: 1px solid #e6c46a; border-radius: 6px; padding: 6px 8px; font-weight: 600; }
</style>
