<script setup lang="ts">
// O "×" da Pauta (D89c, D89e): cancelar uma audiência do órgão logado. O diálogo é a confirmação,
// também no envio real, com o lembrete de despacho ou intimação e um GIGS opcional. O executor
// confere a pauta antes, cancela com `[idAudiencia]` e confirma relendo o dia.
import { computed, reactive } from 'vue';
import CampoGigs from '../componentes/CampoGigs.vue';
import { useGigs } from '../componentes/estadoGigs';
import GradeCampos from '../componentes/GradeCampos.vue';
import PassoExecucao from '../componentes/PassoExecucao.vue';
import type { Opcoes } from '../config/opcoes';
import { executarCancelamento, transportePje, type RegistroPasso, type ResultadoExecucao } from '../fluxo/executor';
import { textoParaCopiar } from '../individual/envio';
import type { Ambiente } from '../pje/ambiente';
import { lerSessao } from '../pje/sessao';
import { hoje } from '../regras/calendario';
import { gerarHash, type DadosVariaveisGigs } from '../regras/gigs';
import type { LinhaPauta } from './estadoPauta';
import { rotuloDoDia } from './orgaos';

const props = defineProps<{
  ambiente: Ambiente;
  opcoes: Opcoes;
  simulando: boolean;
  idOrgaoLogado: number;
  descricaoOrgao: string;
  sala: { id: number; nome: string };
  /** AAAA-MM-DD */
  dia: string;
  /** A linha da audiência, com `idAudiencia` e `idProcesso`. */
  linha: LinhaPauta;
  aoFechar: () => void;
  /** Cancelou de verdade: a Pauta relê o dia. */
  aoGravar: () => void;
}>();

const hash = gerarHash();
const dadosVariaveis = (): DadosVariaveisGigs => ({
  data: props.dia,
  hora: props.linha.hora,
  tipo: props.linha.descricaoTipo,
  sala: props.sala.nome,
  acao: 'cancelada',
  usuario: lerSessao(document.cookie).nomeUsuario,
  orgao: props.descricaoOrgao,
  hash,
});
// D89e: o GIGS é opcional e começa vazio.
const gigs = useGigs(props.opcoes.gigs.sugestoes, dadosVariaveis);

const e = reactive({
  fase: 'pergunta' as 'pergunta' | 'executando' | 'concluido' | 'orgao-mudou',
  passos: [] as RegistroPasso[],
  resultado: null as ResultadoExecucao | null,
  rotuloCopiar: 'Copiar requisições',
});

const pergunta = computed(
  () =>
    `Cancelar a audiência de ${rotuloDoDia(props.dia)}, ${props.linha.hora} (${props.linha.descricaoTipo ?? 'tipo não informado'}) do processo ${props.linha.nrProcesso ?? props.linha.idProcesso}?`,
);

async function cancelar() {
  if (gigs.pendencia || props.linha.idAudiencia === undefined || props.linha.idProcesso === undefined) return;
  // D5: o órgão é relido na hora; se mudou em outra aba, nada é feito.
  if (lerSessao(document.cookie).orgaoLogado?.id !== props.idOrgaoLogado) {
    e.fase = 'orgao-mudou';
    return;
  }
  e.fase = 'executando';
  const t = transportePje(props.ambiente.origem, () => lerSessao(document.cookie).xsrfToken, props.opcoes.simulacao);
  let resultado: ResultadoExecucao;
  try {
    resultado = await executarCancelamento(
      {
        idProcesso: props.linha.idProcesso,
        idAudiencia: props.linha.idAudiencia,
        idSala: props.sala.id,
        idOrgaoLogado: props.idOrgaoLogado,
        data: props.dia,
        hora: props.linha.hora,
        hoje: hoje(),
        ...(gigs.lancar ? { gigs: { texto: gigs.textoResolvido, prazo: gigs.prazoNumero } } : {}),
      },
      t,
      (passos) => {
        e.passos = passos;
      },
    );
  } catch (erro) {
    // Erro inesperado no código: mostra, em vez de travar em "executando".
    resultado = {
      desfecho: 'falha',
      resumo: `Erro inesperado no AudAid: ${erro instanceof Error ? erro.message : String(erro)}. Confira no PJe o estado da audiência.`,
      passos: e.passos,
      acoes: [],
      designou: false,
      recolocarFalhou: false,
    };
  }
  e.resultado = resultado;
  e.fase = 'concluido';
  if (!t.simulando && (resultado.desfecho === 'sucesso' || resultado.desfecho === 'parcial')) props.aoGravar();
}

async function copiar() {
  if (!e.resultado) return;
  const texto = textoParaCopiar(e.resultado, props.ambiente.origem, props.simulando, gigs.lancar && /\{\s*hash\s*\}/i.test(gigs.texto) ? hash : null);
  try {
    await navigator.clipboard.writeText(texto);
    e.rotuloCopiar = 'Copiado!';
  } catch {
    e.rotuloCopiar = 'Não deu para copiar';
  }
}
</script>

<template>
  <div class="pauta-fundo fundo-acao">
    <div class="pauta-janela janela-acao" role="dialog" aria-label="Cancelar audiência">
      <header class="cabecalho cabecalho-pauta">
        <h1>Cancelar audiência · {{ rotuloDoDia(dia) }} · {{ sala.nome }} · {{ linha.hora }}</h1>
        <button class="fechar" type="button" title="Fechar" :disabled="e.fase === 'executando'" @click="aoFechar()">×</button>
      </header>
      <div v-if="simulando" class="faixa-simulacao-acao">SIMULAÇÃO: nada será gravado no PJe.</div>
      <div v-else class="faixa-real-acao">ENVIO REAL: o cancelamento será gravado no PJe em seu nome.</div>
      <div class="corpo">
        <section class="cartao">
          <div class="cartao-topo"><h2>Confirmação</h2></div>
          <div class="cartao-corpo">
            <p class="pergunta-cancelar">{{ pergunta }}</p>
            <p class="aviso-texto">Ela sai da pauta. Pode ser necessário despacho ou intimação.</p>
            <GradeCampos>
              <CampoGigs :estado="gigs" :dados-variaveis="dadosVariaveis" />
            </GradeCampos>
            <p v-if="gigs.pendencia" class="aviso-texto">{{ gigs.pendencia }}</p>
            <!-- D99: a ação só uma vez (depois, desabilitada); o "Fechar" sempre ali, à direita, com o mesmo nome. -->
            <div class="linha-form">
              <button class="acao perigo" type="button" :disabled="e.fase !== 'pergunta' || Boolean(gigs.pendencia)" @click="cancelar()">
                {{ simulando ? 'Simular o cancelamento' : 'Cancelar a audiência no PJe' }}
              </button>
              <span v-if="e.fase === 'concluido'" class="suave">Já executado. Para outro, feche e abra de novo.</span>
              <button class="acao secundaria botao-fechar-acao" type="button" :disabled="e.fase === 'executando'" @click="aoFechar()">Fechar</button>
            </div>
          </div>
        </section>
        <section class="cartao">
          <div class="cartao-topo">
            <h2>Resultado</h2>
            <button class="acao secundaria" type="button" :disabled="e.fase !== 'concluido'" @click="copiar()">{{ e.rotuloCopiar }}</button>
          </div>
          <div class="cartao-corpo">
            <p v-if="e.fase === 'pergunta'" class="suave">
              {{ simulando ? 'O resultado aparece aqui, com cada requisição que seria feita.' : 'O resultado aparece aqui, passo a passo.' }}
            </p>
            <p v-else-if="e.fase === 'orgao-mudou'" class="erro-texto">
              Você trocou de órgão logado (ou a sessão expirou). Feche e abra a Pauta de novo. Nada foi feito.
            </p>
            <div v-if="e.resultado" :class="['resumo-cancelar', e.resultado.desfecho]">{{ e.resultado.resumo }}</div>
            <PassoExecucao v-for="(passo, i) in e.passos" :key="i" :passo="passo" :origem="ambiente.origem" :mostrar-requisicao="simulando" />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style>
.pergunta-cancelar { font-weight: 700; margin: 0 0 4px; }
.janela-acao button.acao.perigo { background: #b3261e; border-color: #b3261e; color: #fff; }
.resumo-cancelar { font-weight: 600; margin-bottom: 6px; }
.resumo-cancelar.sucesso, .resumo-cancelar.simulado { color: var(--cor-ok); }
.resumo-cancelar.parcial { color: var(--cor-aviso); }
.resumo-cancelar.falha { color: var(--cor-erro); }
</style>
