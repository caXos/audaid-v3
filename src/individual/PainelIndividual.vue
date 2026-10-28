<script setup lang="ts">
// Painel do Controle Individual (§2.2): cabeçalho, faixa de simulação ou de envio real, as
// audiências do processo e o formulário.
import { onMounted, ref, shallowRef } from 'vue';
import type { Opcoes } from '../config/opcoes';
import { ESCRITA_LIBERADA } from '../fluxo/executor';
import type { Ambiente } from '../pje/ambiente';
import type { Audiencia } from '../pje/api';
import { formatarDataHora } from '../ui/dom';
import { carregarDados, type Dados } from './dados';
import FormularioIndividual from './FormularioIndividual.vue';

const props = defineProps<{
  ambiente: Ambiente;
  idProcesso: number;
  opcoes: Opcoes;
  aoFechar: () => void;
  aoAbrirDiagnostico: () => void;
  aoAbrirLote: () => void;
}>();

const simulando = props.opcoes.simulacao || !ESCRITA_LIBERADA;
const subtitulo = ref('Carregando o processo…');
const dados = shallowRef<Dados | null>(null);
const erro = ref<string | null>(null);

onMounted(async () => {
  const r = await carregarDados(props.ambiente, props.idProcesso);
  if (!r.ok) {
    subtitulo.value = '';
    erro.value = r.mensagem;
    return;
  }
  const { processo, descricaoOrgaoLogado } = r.dados;
  subtitulo.value = `${processo.numero} · ${processo.classeJudicial?.sigla ?? '?'} · logado em ${descricaoOrgaoLogado}`;
  dados.value = r.dados;
});

const doOrgao = (a: Audiencia, d: Dados) => a.salaFisica?.orgaoJulgador?.id === d.idOrgaoLogado;
const linhaAudiencia = (a: Audiencia) => `${formatarDataHora(a.dataInicio)} · ${a.tipo?.descricao ?? '?'} · ${a.salaFisica?.nome ?? '?'} `;
</script>

<template>
  <aside class="painel">
    <header class="cabecalho">
      <h1>AudAid · Controle Individual</h1>
      <div class="linha-cab">
        <p>{{ subtitulo }}</p>
        <button class="acao secundaria pequena" type="button" @click="aoAbrirLote()">Abrir controle em lote</button>
        <button class="acao secundaria pequena" type="button" @click="aoAbrirDiagnostico()">Diagnóstico</button>
      </div>
      <button class="fechar" type="button" title="Fechar" @click="aoFechar()">×</button>
    </header>
    <div v-if="simulando" class="faixa-simulacao">
      {{
        ESCRITA_LIBERADA
          ? 'SIMULAÇÃO: nada será gravado no PJe. Para gravar de verdade, desligue o modo simulação nas Opções.'
          : 'SIMULAÇÃO: nada será gravado no PJe (envio real bloqueado nesta versão).'
      }}
    </div>
    <div v-else class="faixa-real">ENVIO REAL: o que você confirmar será gravado no PJe em seu nome.</div>
    <div class="corpo">
      <section v-if="erro" class="cartao">
        <div class="cartao-topo">
          <h2>Não foi possível abrir</h2>
          <span class="selo erro">ERRO</span>
        </div>
        <div class="cartao-corpo erro-texto">{{ erro }}</div>
      </section>
      <template v-else-if="dados">
        <section class="cartao">
          <div class="cartao-topo"><h2>Audiências designadas</h2></div>
          <div class="cartao-corpo">
            <ul v-if="dados.audiencias.length">
              <li v-for="a in dados.audiencias" :key="a.id">
                {{ linhaAudiencia(a)
                }}<strong v-if="doOrgao(a, dados)" :class="a === dados.antiga ? 'aviso-texto' : 'ok-texto'">{{
                  a === dados.antiga ? '· será substituída (redesignação)' : '· órgão logado'
                }}</strong
                ><span v-else class="suave">· {{ a.salaFisica?.orgaoJulgador?.descricao ?? 'outro órgão' }} (só consulta)</span>
              </li>
            </ul>
            <div v-else class="suave">Nenhuma audiência designada.</div>
          </div>
        </section>
        <FormularioIndividual :ambiente="ambiente" :dados="dados" :opcoes="opcoes" :simulando="simulando" />
      </template>
    </div>
  </aside>
</template>

<style>
.painel { width: min(580px, 100vw); }
.cabecalho .linha-cab { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cabecalho .linha-cab p { margin-right: 2px; }
.faixa-real {
  background: #fff1e0; color: #8a4500; font-weight: 700; font-size: 12px;
  text-align: center; padding: 6px 10px; border-bottom: 2px solid #f0a14a; letter-spacing: .02em;
}
.faixa-simulacao {
  background: var(--cor-erro-fundo); color: var(--cor-erro); font-weight: 700; font-size: 12px;
  text-align: center; padding: 6px 10px; border-bottom: 1px solid #f1c4bf; letter-spacing: .02em;
}
button.acao:disabled { opacity: .45; cursor: not-allowed; }
/* D42: campo que não se aplica fica visivelmente desabilitado. */
select:disabled, input:disabled { background: #d5dbe3; color: #5b6878; border-color: #c3cad4; cursor: not-allowed; }
button:disabled { cursor: not-allowed; }
</style>
