<script setup lang="ts">
// Tela 3 do Lote (§2.3): a última conferência antes de gravar (D78). Consulta a pauta da sala de
// novo e mostra o que mudou desde a tela 2, porque outro servidor pode ter ocupado um horário nesse
// meio (§6, item 2). Os achados vêm de conferencia.ts; cada conflito tem a dropdown com o padrão e
// um "Aplicar" (D66), e a tela reavalia tudo depois de cada aplicação (D16). O plano continua sobre
// a pauta que a tela 2 viu: nada muda sem um clique. O "Continuar" só libera sem vermelho.
import { computed, onMounted, reactive, ref } from 'vue';
import { nomeSala } from '../componentes/mensagens';
import { dataBr } from '../regras/gigs';
import type { EntradaPauta } from '../regras/pauta';
import { BLOQUEIAM, mudancasDaPauta, type Achado } from './conferencia';
import type { EstadoLote } from './estadoLote';
import { paraHora } from './pauta';
import { aplicarResolucao, opcoesDoAchado, textoDoAchado, type Opcao } from './resolucoes';

const props = defineProps<{ lote: EstadoLote }>();

const pauta = () => props.lote.pauta!;
const sala = computed(() => pauta().salas.find((s) => s.id === pauta().topo.idSala));

/** A pauta que a tela 2 viu, para comparar com a nova. */
const vistaNaTela2: EntradaPauta[] | undefined = pauta().entradasPje ? [...pauta().entradasPje!] : undefined;
onMounted(() => pauta().consultarPauta());

const carregando = computed(() => pauta().pautaCarregando);
const entradas = computed(() => (carregando.value ? undefined : pauta().entradasPje));
const mudancas = computed(() => (vistaNaTela2 && entradas.value ? mudancasDaPauta(vistaNaTela2, entradas.value) : null));
const achados = computed(() => (entradas.value ? pauta().achados : new Map<string, Achado[]>()));
const bloqueios = computed(() => [...achados.value.values()].flat().filter((a) => BLOQUEIAM.includes(a.tipo)).length);
const deFora = computed(() => {
  const lote = new Set(pauta().paraConferir.map((i) => i.idProcesso));
  const e = entradas.value ?? [];
  return { audiencias: e.filter((x) => x.tipo === 'audiencia' && !lote.has(x.idProcesso!)).length, vagas: e.filter((x) => x.tipo === 'vaga').length };
});

// ── Opções de cada achado (D28, D32) ──

const escolhas = reactive<Record<string, Opcao>>({});
const chaveEscolha = (chave: string, a: Achado) => `${chave}|${a.tipo}`;
const opcoes = (a: Achado) => opcoesDoAchado(a, pauta().modo);
const opcaoDe = (chave: string, a: Achado): Opcao => escolhas[chaveEscolha(chave, a)] ?? opcoes(a)[0]!.valor;
const aviso = ref('');

function aplicar(chave: string, a: Achado, opcao: Opcao = opcaoDe(chave, a)): boolean {
  const r = aplicarResolucao(pauta(), entradas.value ?? [], chave, a, opcao);
  aviso.value = r.aviso ?? '';
  if (r.ok) delete escolhas[chaveEscolha(chave, a)];
  return r.ok;
}

/** "Aplicar o padrão a todos" (D66): um vermelho por vez, reavaliando entre um e outro. */
function aplicarPadraoATodos() {
  for (let volta = 0; volta < 100; volta++) {
    const proximo = [...achados.value].flatMap(([chave, lista]) => lista.filter((a) => BLOQUEIAM.includes(a.tipo)).map((a) => [chave, a] as const))[0];
    if (!proximo || !aplicar(proximo[0], proximo[1], 'encaixar')) return;
  }
}

const nrDeFora = (chave: string) => {
  const l = pauta().linhas.find((x) => x.linha.chave === chave);
  return l?.fora?.nrProcesso ?? String(l?.fora?.idProcesso ?? '');
};

const pronto = ref(false);
function continuar() {
  if (!bloqueios.value && entradas.value) pronto.value = true;
}
</script>

<template>
  <section v-if="lote.pauta" class="cartao">
    <div class="cartao-topo">
      <h2>
        3. Conferência: {{ lote.pauta.quantidade }} audiência(s) em {{ lote.pauta.topo.data ? dataBr(lote.pauta.topo.data) : '?' }}
        · {{ sala ? nomeSala(sala) : '?' }}
      </h2>
      <button class="acao secundaria" type="button" :disabled="carregando" @click="lote.pauta.consultarPauta()">Consultar de novo</button>
      <button class="acao secundaria" type="button" :disabled="!bloqueios" @click="aplicarPadraoATodos">Aplicar o padrão a todos</button>
      <button class="acao secundaria" type="button" @click="lote.voltarAPauta()">Voltar à pauta</button>
    </div>
    <div class="cartao-corpo">
      <p :class="['situacao-pauta', lote.pauta.erroPauta ? 'erro-texto' : 'suave']">
        <template v-if="lote.pauta.erroPauta">{{ lote.pauta.erroPauta }}</template>
        <template v-else-if="!entradas">Consultando a pauta da sala no PJe…</template>
        <template v-else>
          Pauta da sala no PJe: {{ deFora.audiencias }} audiência(s) de fora do lote e {{ deFora.vagas }} vaga(s), que nunca são
          conflito. Código do lote: <strong>{{ lote.pauta.hash }}</strong>
        </template>
      </p>
      <!-- D78: só o que mudou desde a tela 2. -->
      <div v-if="mudancas && mudancas.length" class="mudancas-pauta">
        <strong>A pauta da sala mudou desde a tela 2:</strong>
        <ul>
          <li v-for="(m, i) in mudancas" :key="i">{{ m }}</li>
        </ul>
        Os horários do lote não mudaram sozinhos: confira os conflitos abaixo ou volte à pauta.
      </div>
      <p v-else-if="mudancas" class="ok-texto sem-mudancas">Nada mudou na pauta da sala desde a tela 2.</p>
      <table class="tabela-lote tabela-conferencia">
        <thead>
          <tr>
            <th>#</th>
            <th>Número</th>
            <th>Início</th>
            <th>Duração</th>
            <th>Tipo</th>
            <th>GIGS</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="l in lote.pauta.linhas" :key="l.linha.chave">
            <template v-if="l.linha.tipo === 'vaga'"></template>
            <tr v-else-if="l.linha.tipo === 'fora'" class="resumo-fora">
              <td></td>
              <td class="numero">{{ nrDeFora(l.linha.chave) }}</td>
              <td>{{ paraHora(l.linha.inicio) }}</td>
              <td>{{ l.linha.duracao }} min</td>
              <td>{{ l.fora?.descricaoTipo ?? '?' }}</td>
              <td>Já na pauta: não muda</td>
            </tr>
            <tr v-else-if="l.linha.tipo !== 'processo'" class="resumo-intervalo">
              <td></td>
              <td>{{ l.linha.tipo === 'intervalo' ? 'Intervalo' : 'Intervalo automático' }}</td>
              <td>{{ paraHora(l.linha.inicio) }}</td>
              <td>{{ l.linha.duracao }} min</td>
              <td colspan="2"></td>
            </tr>
            <template v-else>
              <tr :class="['linha-conferida', { 'com-vermelho': (achados.get(l.linha.chave) ?? []).some((a) => BLOQUEIAM.includes(a.tipo)) }]">
                <td>{{ l.linha.ordem }}</td>
                <td class="numero">{{ l.linha.chave }}</td>
                <td>{{ paraHora(l.linha.inicio) }}</td>
                <td>{{ l.linha.duracao }} min</td>
                <td>{{ l.tipo?.tipo?.descricao ?? '?' }}</td>
                <td :title="l.gigs?.texto">
                  {{ l.semMudanca ? 'sem mudança: nada a fazer' : l.gigs?.lancar ? `"${l.gigs.texto}" · ${l.gigs.valores.prazo > 0 ? `${l.gigs.valores.prazo} d.u.` : 'sem prazo'}` : '—' }}
                </td>
              </tr>
              <tr v-for="(a, i) in achados.get(l.linha.chave) ?? []" :key="`${l.linha.chave}-${i}`" class="linha-achado">
                <td></td>
                <td colspan="5">
                  <div :class="['achado', `achado-${a.tipo}`]">
                    <span class="texto-achado">{{ textoDoAchado(a) }}</span>
                    <template v-if="opcoes(a).length">
                      <select
                        :value="opcaoDe(l.linha.chave, a)"
                        :aria-label="`Resolução para ${l.linha.chave}`"
                        @change="escolhas[chaveEscolha(l.linha.chave, a)] = ($event.target as HTMLSelectElement).value as Opcao"
                      >
                        <option v-for="o in opcoes(a)" :key="o.valor" :value="o.valor">{{ o.rotulo }}</option>
                      </select>
                      <button
                        class="acao secundaria pequena"
                        type="button"
                        :disabled="opcaoDe(l.linha.chave, a) === 'redesignar'"
                        :title="opcaoDe(l.linha.chave, a) === 'redesignar' ? 'É o padrão: a audiência existente será redesignada na execução' : ''"
                        @click="aplicar(l.linha.chave, a)"
                      >
                        Aplicar
                      </button>
                    </template>
                  </div>
                </td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
      <p class="erro-texto aviso-conferencia">{{ aviso }}</p>
    </div>
  </section>
  <div v-if="lote.pauta" class="rodape-pauta">
    <button class="acao" type="button" :disabled="!entradas || bloqueios > 0" @click="continuar">Continuar</button>
    <ul class="pendencias">
      <li v-if="!entradas && !lote.pauta.erroPauta">Aguarde a consulta da pauta da sala.</li>
      <li v-if="lote.pauta.erroPauta">Não foi possível conferir a pauta da sala: use "Consultar de novo".</li>
      <li v-if="bloqueios">{{ bloqueios }} conflito(s) vermelho(s) para resolver.</li>
    </ul>
  </div>
  <div v-if="pronto" class="cartao pronto-para-executar">
    <div class="cartao-corpo ok-texto">
      Tudo conferido. A execução (tela 4) chega na entrega 6; nada foi gravado no PJe.
    </div>
  </div>
</template>

<style>
.situacao-pauta { margin: 0 0 8px; }
.mudancas-pauta { border: 1px solid #e6c46a; background: var(--cor-aviso-fundo); color: var(--cor-aviso); border-radius: 6px; padding: 6px 10px; margin: 0 0 8px; font-size: 12px; }
.mudancas-pauta ul { margin: 4px 0; padding-left: 18px; }
.sem-mudancas { margin: 0 0 8px; font-size: 12px; }
.tabela-conferencia td { vertical-align: middle; }
.linha-conferida.com-vermelho td { background: var(--cor-erro-fundo); }
.linha-achado td { border-top: 0; padding-top: 0; }
.achado { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 12px; padding: 3px 8px; border-radius: 6px; }
.achado-vermelho, .achado-ciclo { background: var(--cor-erro-fundo); color: var(--cor-erro); }
.achado-amarelo { background: var(--cor-aviso-fundo); color: var(--cor-aviso); }
.achado-do-lote { background: var(--cor-fundo-2); color: var(--cor-suave); }
.achado-existente { background: #e8f0fe; color: #1a56c4; }
.texto-achado { flex: 1 1 320px; }
.aviso-conferencia { min-height: 1.4em; margin: 6px 0 0; font-size: 12px; }
.pronto-para-executar { border-color: #bfe3c9; }
.resumo-intervalo td { color: var(--cor-suave); font-style: italic; }
.resumo-fora td { color: #5b2a91; background: #f3ecfb; }
</style>
