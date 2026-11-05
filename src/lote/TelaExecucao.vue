<script setup lang="ts">
// Tela 4 do Lote (§2.3): a execução, processo a processo, com o estado de cada passo e o fundo
// verde, amarelo, vermelho ou cinza (D17). "Parar depois do processo atual" (D68), um botão para os
// restantes e as falhas, "Encaixar 1 min depois e reprocessar" no horário tomado (D70) e "Copiar
// relatório". No envio real, cada passo aparece sem URL nem payload (D52).
import { reactive } from 'vue';
import PassoExecucao from '../componentes/PassoExecucao.vue';
import { TEXTO_ACAO } from '../individual/envio';
import { dataBr } from '../regras/gigs';
import type { EstadoLote } from './estadoLote';
import { ROTULO_SITUACAO } from './execucao';
import type { LinhaExecucao } from './estadoExecucao';

const props = defineProps<{ lote: EstadoLote }>();
const ex = () => props.lote.execucao!;

/** Passos abertos: as falhas abrem sozinhas; o resto, com um clique. */
const abertos = reactive<Record<string, boolean>>({});
const aberto = (l: LinhaExecucao) => abertos[l.item.chave] ?? (l.situacao === 'falha' || l.situacao === 'atencao');
function alternar(l: LinhaExecucao) {
  abertos[l.item.chave] = !aberto(l);
}
const podeEncaixar = (l: LinhaExecucao) => l.estado.pendente.audiencia && l.estado.acoes.includes('escolher-outro-horario');

function recarregar() {
  location.reload();
}
</script>

<template>
  <section v-if="lote.execucao" class="cartao">
    <div class="cartao-topo">
      <h2>
        4. Execução: {{ lote.execucao.itens.length }} audiência(s) em {{ dataBr(lote.execucao.data) }} · {{ lote.execucao.nomeSala }} · código do lote
        <strong>{{ lote.execucao.hash }}</strong>
      </h2>
      <span class="progresso-execucao">{{ lote.execucao.feitos }} de {{ lote.execucao.itens.length }}</span>
      <button
        v-if="lote.execucao.estado.executando"
        class="acao secundaria"
        type="button"
        :disabled="lote.execucao.estado.pararPedido"
        title="Nunca interrompe um processo no meio: termina o atual e para"
        @click="lote.execucao.parar()"
      >
        {{ lote.execucao.estado.pararPedido ? 'Parando depois do atual…' : 'Parar depois do processo atual' }}
      </button>
      <button v-else-if="lote.execucao.pendentes" class="acao" type="button" @click="lote.execucao.continuar()">{{ lote.execucao.rotuloContinuar }}</button>
      <button class="acao secundaria" type="button" :disabled="lote.execucao.estado.executando" @click="lote.execucao.copiar()">{{ lote.execucao.estado.rotuloCopiar }}</button>
      <!-- D76: para o despacho ou a intimação. -->
      <button
        v-if="lote.execucao.temAlteradas"
        class="acao secundaria"
        type="button"
        :disabled="lote.execucao.estado.executando"
        title="As audiências que já estavam na pauta e mudaram, de → para"
        @click="lote.execucao.copiarAlteradas()"
      >
        {{ lote.execucao.estado.rotuloCopiarAlteradas }}
      </button>
      <button v-if="lote.simulando" class="acao secundaria" type="button" :disabled="lote.execucao.estado.executando" @click="lote.voltarAConferencia()">Voltar à conferência</button>
    </div>
    <div class="cartao-corpo">
      <p class="situacao-execucao">
        <template v-if="lote.execucao.estado.executando">Executando, um processo por vez…</template>
        <template v-else-if="lote.simulando">Simulação: {{ lote.execucao.texto }}. Nada foi gravado no PJe.</template>
        <template v-else>Concluído: {{ lote.execucao.texto }}.</template>
      </p>
      <div v-if="lote.execucao.estado.sessaoExpirada" class="aviso-execucao">
        <strong>A sessão do PJe expirou.</strong> Faça login de novo (noutra aba) e clique em "{{ lote.execucao.rotuloContinuar }}". Nada mais foi
        enviado depois disso.
      </div>
      <div v-else-if="lote.execucao.estado.parada" class="aviso-execucao">A execução foi parada. Os que ficaram faltando estão como "não executado".</div>
      <p v-if="lote.execucao.estado.erro" class="erro-texto">{{ lote.execucao.estado.erro }}</p>
      <p v-if="lote.execucao.estado.aviso" class="aviso-texto">{{ lote.execucao.estado.aviso }}</p>

      <div v-for="l in lote.execucao.linhas" :key="l.item.chave" :class="['item-execucao', `situacao-${l.situacao}`]">
        <div class="item-execucao-topo">
          <span class="ordem">{{ l.item.deFora ? '' : l.item.ordem }}</span>
          <span class="numero">{{ l.item.numero }}</span>
          <span v-if="l.item.deFora" class="selo-mini ja-na-pauta" :title="`Já estava na pauta às ${l.item.deFora.horaOriginal}${l.item.deFora.tipoOriginal ? ` (${l.item.deFora.tipoOriginal})` : ''}`">{{
            l.item.soGigs ? 'Já na pauta: só o GIGS' : `Já na pauta: de ${l.item.deFora.horaOriginal}`
          }}</span>
          <span class="hora-execucao">{{ l.item.hora }}</span>
          <span class="tipo-execucao" :title="l.item.descricaoTipo">{{ l.item.descricaoTipo }}</span>
          <span :class="['selo', `selo-${l.situacao}`]">{{ ROTULO_SITUACAO[l.situacao] }}</span>
          <span class="resumo-execucao" :title="l.resumo">{{ l.resumo }}</span>
          <button v-if="podeEncaixar(l)" class="acao secundaria pequena" type="button" :disabled="lote.execucao.estado.executando" @click="lote.execucao.encaixarEReprocessar(l.item.chave)">
            Encaixar 1 min depois e reprocessar
          </button>
          <button v-if="l.estado.passos.length" class="acao secundaria pequena" type="button" @click="alternar(l)">{{ aberto(l) ? 'ocultar passos' : 'ver passos' }}</button>
        </div>
        <ul v-if="l.estado.acoes.length && l.estado.pendente.audiencia" class="aviso-texto acoes-execucao">
          <li v-for="a in l.estado.acoes" :key="a">{{ TEXTO_ACAO[a] }}</li>
        </ul>
        <div v-if="aberto(l) && l.estado.passos.length" class="passos-execucao">
          <PassoExecucao v-for="(p, i) in l.estado.passos" :key="i" :passo="p" :origem="lote.execucao.origem" :mostrar-requisicao="lote.simulando" />
        </div>
      </div>
    </div>
  </section>
  <div v-if="lote.execucao && !lote.simulando && lote.execucao.estado.comecou && !lote.execucao.estado.executando" class="rodape-pauta recarregar-lote">
    <button class="acao" type="button" @click="recarregar">Recarregar a página</button>
    <span class="suave">A tela do PJe só mostra as audiências novas depois de recarregar.</span>
  </div>
</template>

<style>
.progresso-execucao { font-variant-numeric: tabular-nums; color: var(--cor-suave); font-size: 12px; }
.situacao-execucao { margin: 0 0 8px; font-weight: 600; }
.aviso-execucao { border: 1px solid #e6c46a; background: var(--cor-aviso-fundo); color: var(--cor-aviso); border-radius: 6px; padding: 6px 10px; margin: 0 0 8px; font-size: 12px; }
.item-execucao { border: 1px solid #eef1f4; border-left: 5px solid #c3cad4; border-radius: 6px; padding: 6px 10px; margin: 0 0 6px; background: var(--cor-fundo); }
.item-execucao-topo { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; font-size: 12px; }
.hora-execucao { font-variant-numeric: tabular-nums; font-weight: 600; }
.tipo-execucao { color: var(--cor-suave); max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.resumo-execucao { flex: 1 1 260px; min-width: 0; }
.item-execucao.situacao-ok, .item-execucao.situacao-simulado { border-left-color: var(--cor-ok); background: var(--cor-ok-fundo); }
.item-execucao.situacao-atencao { border-left-color: #e6c46a; background: var(--cor-aviso-fundo); }
.item-execucao.situacao-falha { border-left-color: var(--cor-erro); background: var(--cor-erro-fundo); }
.item-execucao.situacao-mantida, .item-execucao.situacao-nao-executado { background: var(--cor-fundo-2); }
.item-execucao.situacao-executando { border-left-color: var(--cor-marca); }
.selo-ok, .selo-simulado { background: var(--cor-ok-fundo); color: var(--cor-ok); }
.selo-atencao { background: var(--cor-aviso-fundo); color: var(--cor-aviso); }
.selo-falha { background: var(--cor-erro-fundo); color: var(--cor-erro); }
.selo-mantida, .selo-nao-executado, .selo-aguardando { background: #eceff3; color: var(--cor-suave); }
.selo-executando { background: #e8f0fe; color: #1a56c4; }
.passos-execucao { margin-top: 4px; padding-top: 2px; border-top: 1px dashed #d5dbe3; }
.acoes-execucao { margin: 4px 0 0; font-size: 12px; }
.recarregar-lote { align-items: center; }
.item-execucao .selo-mini.ja-na-pauta { background: #e4d6f5; color: #5b2a91; }
</style>
