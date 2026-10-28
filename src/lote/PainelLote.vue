<script setup lang="ts">
// Controle em Lote (§2.3) num diálogo de tela cheia sobre o PJe (D19): tela 1 (texto), tela 2
// (pauta) e o resumo provisório, até a tela 3 (entrega 4).
import type { SugestaoGigs } from '../config/opcoes';
import type { Armazenamento } from '../ext/api';
import type { Ambiente } from '../pje/ambiente';
import { useLote } from './estadoLote';
import ResumoLote from './ResumoLote.vue';
import TelaPauta from './TelaPauta.vue';
import TelaTexto from './TelaTexto.vue';

const props = defineProps<{
  ambiente: Ambiente;
  versao: string;
  sugestoesGigs: SugestaoGigs[];
  armazenamento: Armazenamento;
  aoFechar: () => void;
}>();

const lote = useLote(props.ambiente, props.versao, props.sugestoesGigs, props.armazenamento);
</script>

<template>
  <div class="lote-fundo">
    <div class="lote-janela" role="dialog" aria-label="AudAid, Controle em Lote">
      <header class="cabecalho">
        <h1>AudAid · Controle em Lote</h1>
        <p>{{ lote.orgao ? `logado em ${lote.orgao.descricao} · nada é gravado nesta etapa` : '' }}</p>
        <button class="fechar" type="button" title="Fechar (o rascunho fica guardado)" @click="aoFechar()">×</button>
      </header>
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
        <ResumoLote v-else-if="lote.tela === 'resumo'" :lote="lote" />
        <TelaTexto v-else :lote="lote" />
      </div>
    </div>
  </div>
</template>

<style>
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
select:disabled, input:disabled { background: #d5dbe3; color: #5b6878; border-color: #c3cad4; cursor: not-allowed; }
button:disabled { cursor: not-allowed; }
/* D62: o botão pequeno vem do CSS base (src/prova/estilo.ts); aqui, a variante de aviso. */
button.acao.secundaria.aviso { color: var(--cor-aviso); border-color: #e6c46a; background: var(--cor-aviso-fundo); }
.rotulo-check { cursor: pointer; }
.rotulo-check.desabilitado { color: #8a94a3; cursor: not-allowed; }
.pendencias { margin: 0; padding-left: 18px; font-size: 12px; color: var(--cor-aviso); overflow: auto; flex: 1; }
.pendencias:empty::before { content: 'Tudo pronto.'; color: var(--cor-ok); margin-left: -18px; }
</style>
