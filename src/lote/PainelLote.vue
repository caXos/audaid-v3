<script setup lang="ts">
// Controle em Lote (§2.3) num diálogo de tela cheia sobre o PJe (D19): tela 1 (texto), tela 2
// (pauta), tela 3 (conferência) e tela 4 (execução). Com o modo simulação, uma faixa avisa que nada
// será gravado (D39). Durante a execução, o "×" fica desabilitado (D68); depois do envio real com
// pendências, fechar pede confirmação (D69).
import { ref } from 'vue';
import Dialogo from '../componentes/Dialogo.vue';
import type { SugestaoGigs } from '../config/opcoes';
import type { Transporte } from '../fluxo/executor';
import type { ConjuntoRegras } from '../regras/organizar';
import type { Armazenamento } from '../ext/api';
import type { Ambiente } from '../pje/ambiente';
import { rotuloEtapa } from './apresentacao';
import { useLote } from './estadoLote';
import TelaConferencia from './TelaConferencia.vue';
import TelaExecucao from './TelaExecucao.vue';
import TelaPauta from './TelaPauta.vue';
import TelaTexto from './TelaTexto.vue';

const props = defineProps<{
  ambiente: Ambiente;
  versao: string;
  sugestoesGigs: SugestaoGigs[];
  /** Conjuntos do Auto organizar (D48). */
  conjuntos: ConjuntoRegras[];
  armazenamento: Armazenamento;
  /** O modo simulação das Opções (D39). */
  simulacao: boolean;
  aoFechar: () => void;
  /** Só nos testes. */
  transporte?: Transporte;
}>();

const lote = useLote(props.ambiente, props.versao, props.sugestoesGigs, props.conjuntos, props.armazenamento, props.simulacao, props.transporte);
const dialogoFechar = ref<{ abrir(): void; fechar(): void } | null>(null);

const descricaoEtapa = () => {
  if (lote.tela !== 'execucao') return 'nada é gravado nesta etapa';
  return lote.simulando ? 'simulação: nada é gravado' : 'grava no PJe';
};

function pedirFechar() {
  if (lote.executando) return;
  if (lote.pendenciasAoFechar) dialogoFechar.value?.abrir();
  else props.aoFechar();
}
</script>

<template>
  <div class="lote-fundo">
    <div class="lote-janela" role="dialog" aria-label="AudAid, Controle em Lote">
      <!-- Tudo numa linha só: título | órgão | etapa. -->
      <header class="cabecalho cabecalho-lote">
        <h1>AudAid · Controle em Lote</h1>
        <template v-if="lote.orgao">
          <span class="separador">|</span>
          <span>logado em {{ lote.orgao.descricao }}</span>
          <span class="separador">|</span>
          <span :class="{ 'etapa-grava': lote.tela === 'execucao' && !lote.simulando }">{{ rotuloEtapa(lote.tela) }} - {{ descricaoEtapa() }}</span>
        </template>
        <button
          class="fechar"
          type="button"
          :disabled="lote.executando"
          :title="lote.executando ? 'Aguarde ou use Parar' : 'Fechar (o rascunho fica guardado)'"
          @click="pedirFechar"
        >
          ×
        </button>
      </header>
      <div v-if="lote.simulando" class="faixa-simulacao">SIMULAÇÃO: nada será gravado no PJe</div>
      <div class="corpo">
        <section v-if="!lote.orgao" class="cartao">
          <div class="cartao-topo">
            <h2>Não foi possível abrir</h2>
            <span class="selo erro">ERRO</span>
          </div>
          <div class="cartao-corpo erro-texto">
            Não foi possível identificar o órgão em que você está logado (o token do PJe não está legível). Recarregue o PJe e
            tente de novo.
          </div>
        </section>
        <TelaPauta v-else-if="lote.tela === 'pauta'" :lote="lote" />
        <TelaConferencia v-else-if="lote.tela === 'conferencia'" :lote="lote" />
        <TelaExecucao v-else-if="lote.tela === 'execucao'" :lote="lote" />
        <TelaTexto v-else :lote="lote" />
      </div>
    </div>
    <!-- D69: depois do envio real, fechar com pendências pede confirmação. -->
    <Dialogo ref="dialogoFechar" class="dialogo-fechar" :titulo="`Há ${lote.pendenciasAoFechar} pendência(s)`" dica="Falhas ou processos não executados que ainda não foram reprocessados.">
      <p>Fechar mesmo assim? O relatório some, e o que falta terá de ser feito pelo PJe.</p>
      <div class="linha-form">
        <button class="acao perigo" type="button" @click="aoFechar()">Fechar mesmo assim</button>
        <button class="acao secundaria" type="button" @click="dialogoFechar?.fechar()">Voltar</button>
      </div>
    </Dialogo>
  </div>
</template>

<style>
.cabecalho-lote { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; padding-right: 44px; color: var(--cor-suave); }
.cabecalho-lote h1 { margin: 0; color: var(--cor-texto); }
.cabecalho-lote .separador { color: var(--cor-borda); }
.cabecalho-lote .etapa-grava { color: var(--cor-erro); font-weight: 700; }
.cabecalho-lote .fechar:disabled { opacity: .35; cursor: not-allowed; }
.faixa-simulacao { background: #e8f0fe; color: #1a56c4; font-weight: 700; text-align: center; padding: 4px 8px; font-size: 12px; border-bottom: 1px solid #c6d8fb; }
.lote-fundo { position: fixed; inset: 0; z-index: 2147483647; background: rgba(20, 28, 38, .45); }
.lote-janela {
  position: absolute; inset: 16px; margin: 0 auto; max-width: 1440px;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--cor-fundo); border: 1px solid var(--cor-borda); border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,.25);
}
.tabela-lote th { text-align: left; font-weight: 600; color: var(--cor-suave); padding: 4px 6px; border-bottom: 1px solid var(--cor-borda); }
.tabela-lote td { padding: 5px 6px; }
.numero { font-variant-numeric: tabular-nums; white-space: nowrap; }
.ajuda { color: var(--cor-marca); cursor: help; font-weight: 600; }
.nao-incluidos { border-color: #e6c46a; }
.nao-incluidos .cartao-topo { background: var(--cor-aviso-fundo); }
.nao-incluidos .cartao-topo h2 { color: var(--cor-aviso); }
/* Os mesmos estados de campo do Individual (D42). */
button.acao:disabled { opacity: .45; cursor: not-allowed; }
button.acao.perigo { background: #b3261e; border-color: #b3261e; }
select:disabled, input:disabled { background: #d5dbe3; color: #5b6878; border-color: #c3cad4; cursor: not-allowed; }
button:disabled { cursor: not-allowed; }
/* D62: o botão pequeno vem do CSS base (src/prova/estilo.ts); aqui, a variante de aviso. */
button.acao.secundaria.aviso { color: var(--cor-aviso); border-color: #e6c46a; background: var(--cor-aviso-fundo); }
.rotulo-check { cursor: pointer; }
.rotulo-check.desabilitado { color: #8a94a3; cursor: not-allowed; }
.pendencias { margin: 0; padding-left: 18px; font-size: 12px; color: var(--cor-aviso); overflow: auto; flex: 1; }
.pendencias:empty::before { content: 'Tudo pronto.'; color: var(--cor-ok); margin-left: -18px; }
</style>
