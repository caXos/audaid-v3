<script setup lang="ts">
// Tela 3 do Lote (§2.3): conferência com a pauta do dia da sala, antes de executar. Os achados vêm
// de conferencia.ts; cada conflito tem a dropdown com o padrão e um "Aplicar" (D66), e a tela
// reavalia tudo depois de cada aplicação (D16). O "Continuar" só libera sem vermelho.
import { computed, onMounted, reactive, ref } from 'vue';
import { usePautaDia } from '../componentes/pautaDia';
import { nomeSala } from '../componentes/mensagens';
import { dataBr } from '../regras/gigs';
import { formatarDataHora } from '../ui/dom';
import { BLOQUEIAM, conferir, minutoLivreDepois, type Achado } from './conferencia';
import type { EstadoLote } from './estadoLote';
import { paraHora } from './pauta';

const props = defineProps<{ lote: EstadoLote }>();

const pauta = () => props.lote.pauta!;
const pd = usePautaDia(props.lote.origem);
const sala = computed(() => pauta().salas.find((s) => s.id === pauta().topo.idSala));

function consultar(forcar = false) {
  const t = pauta().topo;
  if (t.idSala !== null && t.data) pd.consultar(t.idSala, t.data, forcar);
}
onMounted(() => consultar());

const entradas = computed(() => pd.estado.value.entradas);
const achados = computed(() => (entradas.value ? conferir(pauta().paraConferir, entradas.value) : new Map<string, Achado[]>()));
const bloqueios = computed(() => [...achados.value.values()].flat().filter((a) => BLOQUEIAM.includes(a.tipo)).length);
const deFora = computed(() => {
  const lote = new Set(pauta().paraConferir.map((i) => i.idProcesso));
  const e = entradas.value ?? [];
  return { audiencias: e.filter((x) => x.tipo === 'audiencia' && !lote.has(x.idProcesso!)).length, vagas: e.filter((x) => x.tipo === 'vaga').length };
});

// ── Opções de cada achado (D28, D32) ──

type Opcao = 'encaixar' | 'empurrar' | 'subir' | 'descer' | 'remover' | 'redesignar' | 'removerSemRecalcular';
const OPCOES: Partial<Record<Achado['tipo'], { valor: Opcao; rotulo: string }[]>> = {
  vermelho: [
    { valor: 'encaixar', rotulo: 'Encaixar 1 min depois' },
    { valor: 'empurrar', rotulo: 'Empurrar para depois dele' },
    { valor: 'subir', rotulo: 'Subir uma posição' },
    { valor: 'descer', rotulo: 'Descer uma posição' },
    { valor: 'remover', rotulo: 'Remover da lista' },
  ],
  ciclo: [
    { valor: 'encaixar', rotulo: 'Encaixar 1 min depois' },
    { valor: 'subir', rotulo: 'Subir uma posição' },
    { valor: 'descer', rotulo: 'Descer uma posição' },
    { valor: 'remover', rotulo: 'Remover da lista' },
  ],
  existente: [
    { valor: 'redesignar', rotulo: 'Redesignar a existente' },
    { valor: 'remover', rotulo: 'Remover da lista e recalcular' },
    { valor: 'removerSemRecalcular', rotulo: 'Remover sem recalcular' },
    { valor: 'subir', rotulo: 'Subir uma posição e recalcular' },
    { valor: 'descer', rotulo: 'Descer uma posição e recalcular' },
  ],
};
const escolhas = reactive<Record<string, Opcao>>({});
const chaveEscolha = (chave: string, a: Achado) => `${chave}|${a.tipo}`;
const opcaoDe = (chave: string, a: Achado): Opcao => escolhas[chaveEscolha(chave, a)] ?? OPCOES[a.tipo]![0]!.valor;
const aviso = ref('');

function aplicar(chave: string, a: Achado, opcao: Opcao = opcaoDe(chave, a)): boolean {
  aviso.value = '';
  const p = pauta();
  switch (opcao) {
    case 'encaixar': {
      if (a.tipo === 'existente') return false;
      const m = minutoLivreDepois(a.inicio, entradas.value ?? [], p.paraConferir, chave);
      if (m === null) {
        aviso.value = 'Não há minuto livre depois deste até a meia-noite.';
        return false;
      }
      p.encaixar(chave, m);
      break;
    }
    case 'empurrar':
      if (a.tipo !== 'existente') p.empurrar(chave, a.inicio);
      break;
    case 'subir':
      p.subir(chave);
      break;
    case 'descer':
      p.descer(chave);
      break;
    case 'remover':
      p.remover(chave);
      break;
    case 'removerSemRecalcular':
      p.removerSemRecalcular(chave);
      break;
    case 'redesignar':
      return false; // é o padrão: nada a mudar na pauta
  }
  delete escolhas[chaveEscolha(chave, a)];
  return true;
}

/** "Aplicar o padrão a todos" (D66): um vermelho por vez, reavaliando entre um e outro. */
function aplicarPadraoATodos() {
  for (let volta = 0; volta < 100; volta++) {
    const proximo = [...achados.value].flatMap(([chave, lista]) => lista.filter((a) => BLOQUEIAM.includes(a.tipo)).map((a) => [chave, a] as const))[0];
    if (!proximo || !aplicar(proximo[0], proximo[1], 'encaixar')) return;
  }
}

function texto(a: Achado): string {
  switch (a.tipo) {
    case 'vermelho':
      return `Vermelho: ${a.outro} já começa às ${paraHora(a.inicio)} nesta sala; o PJe recusaria.`;
    case 'amarelo':
      return `Amarelo: ${a.outro} começa às ${paraHora(a.inicio)}, dentro do horário planejado deste item. O PJe aceita.`;
    case 'do-lote':
      return `${a.outro}, do próprio lote, está neste horário hoje e vai sair dele: na execução, ele é redesignado antes.`;
    case 'ciclo':
      return `Troca circular com ${a.outro}, do próprio lote (um vai para o horário do outro): o PJe recusaria.`;
    case 'existente': {
      const x = a.antiga;
      return `Já tem audiência designada no órgão: ${formatarDataHora(x.dataInicio)} (${x.tipo?.descricao ?? '?'}, ${x.salaFisica?.nome ?? '?'}).`;
    }
  }
}

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
      <button class="acao secundaria" type="button" :disabled="pd.estado.value.carregando" @click="consultar(true)">Consultar de novo</button>
      <button class="acao secundaria" type="button" :disabled="!bloqueios" @click="aplicarPadraoATodos">Aplicar o padrão a todos</button>
      <button class="acao secundaria" type="button" @click="lote.voltarAPauta()">Voltar à pauta</button>
    </div>
    <div class="cartao-corpo">
      <p :class="['situacao-pauta', pd.estado.value.erro ? 'erro-texto' : 'suave']">
        <template v-if="pd.estado.value.erro">{{ pd.estado.value.erro }}</template>
        <template v-else-if="!entradas">Consultando a pauta da sala no PJe…</template>
        <template v-else>
          Pauta da sala no PJe: {{ deFora.audiencias }} audiência(s) de fora do lote e {{ deFora.vagas }} vaga(s), que nunca são
          conflito. Código do lote: <strong>{{ lote.pauta.hash }}</strong>
        </template>
      </p>
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
            <tr v-if="l.linha.tipo !== 'processo'" class="resumo-intervalo">
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
                <td :title="l.gigs?.texto">{{ l.gigs?.lancar ? `"${l.gigs.texto}" · ${l.gigs.valores.prazo > 0 ? `${l.gigs.valores.prazo} d.u.` : 'sem prazo'}` : '—' }}</td>
              </tr>
              <tr v-for="(a, i) in achados.get(l.linha.chave) ?? []" :key="`${l.linha.chave}-${i}`" class="linha-achado">
                <td></td>
                <td colspan="5">
                  <div :class="['achado', `achado-${a.tipo}`]">
                    <span class="texto-achado">{{ texto(a) }}</span>
                    <template v-if="OPCOES[a.tipo]">
                      <select
                        :value="opcaoDe(l.linha.chave, a)"
                        :aria-label="`Resolução para ${l.linha.chave}`"
                        @change="escolhas[chaveEscolha(l.linha.chave, a)] = ($event.target as HTMLSelectElement).value as Opcao"
                      >
                        <option v-for="o in OPCOES[a.tipo]" :key="o.valor" :value="o.valor">{{ o.rotulo }}</option>
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
      <li v-if="!entradas && !pd.estado.value.erro">Aguarde a consulta da pauta da sala.</li>
      <li v-if="pd.estado.value.erro">Não foi possível conferir a pauta da sala: use "Consultar de novo".</li>
      <li v-if="bloqueios">{{ bloqueios }} conflito(s) vermelho(s) para resolver.</li>
    </ul>
  </div>
  <div v-if="pronto" class="cartao pronto-para-executar">
    <div class="cartao-corpo ok-texto">
      Tudo conferido. A execução (tela 4) chega na próxima entrega; nada foi gravado no PJe.
    </div>
  </div>
</template>

<style>
.situacao-pauta { margin: 0 0 8px; }
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
</style>
