<script setup lang="ts">
// Entrega 0 da 3.2 (D86b): o diagnóstico da Pauta, provisório e SÓ DE LEITURA. Abre pelo item
// "Pauta" do menu do FAB (D88) até a Pauta de verdade chegar (entrega 1).
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import type { Ambiente } from '../pje/ambiente';
import { pjeGet } from '../pje/http';
import { lerCookie, lerSessao } from '../pje/sessao';
import { hoje } from '../regras/calendario';
import {
  DIAS_LIDOS,
  diagnosticoGeral,
  diagnosticoOrgao,
  textoDoRelatorio,
  type LeitorPauta,
  type PassoDiagnostico,
} from './diagnostico';
import type { OrgaoDoPerfil } from './forma';

const props = defineProps<{ ambiente: Ambiente; versao: string; aoFechar: () => void }>();

const passos = reactive<PassoDiagnostico[]>([]);
const rodando = ref(false);
const outros = ref<OrgaoDoPerfil[]>([]);
/** O "outro órgão": da lista dos perfis ou digitado (se os perfis não vierem). */
const outroId = ref('');
const aviso = ref('');
const area = ref<HTMLTextAreaElement | null>(null);
const sessao = lerSessao(document.cookie);
let geracao = 0;
let inicio = '';

function navegador(): string {
  const ua = navigator.userAgent;
  const m = /Firefox\/(\d+)/.exec(ua) ?? /Edg\/(\d+)/.exec(ua) ?? /Chrome\/(\d+)/.exec(ua);
  if (!m) return 'navegador desconhecido';
  return `${ua.includes('Firefox/') ? 'Firefox' : ua.includes('Edg/') ? 'Edge' : 'Chrome'} ${m[1]}`;
}

const relatorio = computed(() =>
  textoDoRelatorio(
    [
      `AudAid ${props.versao} · Pauta · diagnóstico (3.2, entrega 0) · ${navegador()} · ${inicio}`,
      `Ambiente: ${props.ambiente.ambiente} · ${props.ambiente.tribunal} · órgão logado: ${sessao.orgaoLogado?.id ?? 'NÃO identificado'} · outro órgão: ${outroId.value || 'nenhum'}`,
      `Sessão: xsrf=${sessao.xsrfToken ? 'sim' : 'NÃO'} · access_token legível=${sessao.accessTokenLegivel ? 'sim' : 'NÃO'}`,
    ],
    passos,
  ),
);

const leitor: LeitorPauta = (caminho, opcoes) => {
  // O token é lido na hora: o PJe o renova sozinho.
  const bearer = opcoes?.bearer ? lerCookie(document.cookie, 'access_token') : undefined;
  return pjeGet(props.ambiente.origem + caminho, { xsrfToken: lerSessao(document.cookie).xsrfToken, ...(bearer ? { bearer } : {}) });
};

async function rodar() {
  const minha = ++geracao;
  const ativo = () => minha === geracao;
  passos.splice(0);
  aviso.value = '';
  inicio = new Date().toLocaleString('pt-BR');
  const logado = sessao.orgaoLogado;
  if (!logado) {
    passos.push({ chave: 'sessao', titulo: 'Sessão', estado: 'erro', linhas: ['Não foi possível ler o órgão logado do token do PJe. Recarregue o PJe e tente de novo.'] });
    return;
  }
  rodando.value = true;
  try {
    const geral = await diagnosticoGeral(leitor, logado.id);
    if (!ativo()) return;
    passos.push(...geral.passos);
    // Na primeira vez, o "outro órgão" é o primeiro dos perfis que não é o logado.
    outros.value = geral.orgaos.filter((o) => o.id !== logado.id);
    if (!outroId.value && outros.value[0]) outroId.value = String(outros.value[0].id);

    const hojeIso = hoje();
    const emitir = (p: PassoDiagnostico) => {
      if (ativo()) passos.push(p);
    };
    await diagnosticoOrgao(leitor, { id: logado.id, rotulo: `Órgão logado (${logado.id})` }, hojeIso, emitir, ativo);
    const id = Number(outroId.value);
    if (ativo() && Number.isInteger(id) && id > 0 && id !== logado.id) {
      await diagnosticoOrgao(leitor, { id, rotulo: `Outro órgão (${id})` }, hojeIso, emitir, ativo);
    }
  } finally {
    if (ativo()) rodando.value = false;
  }
}

async function copiar() {
  area.value?.select();
  try {
    await navigator.clipboard.writeText(relatorio.value);
    aviso.value = 'Copiado.';
  } catch {
    aviso.value = document.execCommand('copy') ? 'Copiado.' : 'Selecionado: use Ctrl+C.';
  }
}

const rotuloEstado = { ok: 'OK', aviso: 'ATENÇÃO', erro: 'ERRO' } as const;

onMounted(() => void rodar());
onUnmounted(() => {
  geracao++;
});
</script>

<template>
  <div class="pauta-fundo">
    <div class="pauta-janela" role="dialog" aria-label="AudAid, Pauta: diagnóstico">
      <header class="cabecalho cabecalho-pauta">
        <h1>AudAid · Pauta · diagnóstico</h1>
        <span class="separador">|</span>
        <span>Somente leitura: nada é gravado no PJe</span>
        <button class="fechar" type="button" title="Fechar" @click="aoFechar()">×</button>
      </header>
      <div class="corpo">
        <section class="cartao">
          <div class="cartao-topo"><h2>Como usar</h2></div>
          <div class="cartao-corpo">
            <p>
              A Pauta (3.2) começa por esta prova técnica (D86b). Ela lê os perfis, os órgãos do tribunal e, para o órgão logado e
              para outro órgão seu, as salas, o calendário, o mês da sala, a pauta dos próximos {{ DIAS_LIDOS }} dias úteis e as audiências
              do órgão no AUD4. Quando terminar, use <strong>Copiar diagnóstico</strong> e cole na conversa.
            </p>
            <div class="linha-form">
              <label for="outro-orgao">Outro órgão</label>
              <select v-if="outros.length" id="outro-orgao" v-model="outroId" :disabled="rodando">
                <option v-for="o in outros" :key="o.id" :value="String(o.id)">{{ o.id }} · {{ o.descricao ?? 'sem nome' }}</option>
              </select>
              <input v-else id="outro-orgao" v-model="outroId" type="text" inputmode="numeric" placeholder="id do órgão, ex.: 49" :disabled="rodando" />
              <button class="acao secundaria" type="button" :disabled="rodando" @click="rodar()">{{ rodando ? 'Lendo…' : 'Rodar de novo' }}</button>
            </div>
          </div>
        </section>

        <section v-for="p in passos" :key="p.chave" class="cartao">
          <div class="cartao-topo">
            <h2>{{ p.titulo }}</h2>
            <span class="selo" :class="p.estado">{{ rotuloEstado[p.estado] }}</span>
          </div>
          <div class="cartao-corpo">
            <ul>
              <li v-for="(l, i) in p.linhas" :key="i" class="linha-diagnostico">{{ l }}</li>
            </ul>
          </div>
        </section>
        <section v-if="rodando" class="cartao">
          <div class="cartao-topo"><h2>Consultando…</h2><span class="selo aguardando">…</span></div>
        </section>

        <section class="cartao">
          <div class="cartao-topo"><h2>Diagnóstico para devolver</h2></div>
          <div class="cartao-corpo">
            <p class="suave">Sem nomes de partes e sem tokens: só os campos e os tipos das respostas.</p>
            <textarea ref="area" readonly :value="relatorio"></textarea>
            <div class="linha-form">
              <button class="acao" type="button" :disabled="rodando" @click="copiar()">Copiar diagnóstico</button>
              <span class="suave">{{ aviso }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style>
.pauta-fundo { position: fixed; inset: 0; z-index: 2147483647; background: rgba(20, 28, 38, .45); }
.pauta-janela {
  position: absolute; inset: 16px; margin: 0 auto; max-width: 1100px;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--cor-fundo); border: 1px solid var(--cor-borda); border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,.25);
}
.cabecalho-pauta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; padding-right: 44px; color: var(--cor-suave); position: relative; }
.cabecalho-pauta h1 { margin: 0; color: var(--cor-texto); }
.cabecalho-pauta .separador { color: var(--cor-borda); }
.linha-diagnostico { font: 12px/1.45 ui-monospace, Consolas, monospace; overflow-wrap: anywhere; }
.pauta-janela textarea { height: 260px; }
button.acao:disabled { opacity: .45; cursor: not-allowed; }
</style>
