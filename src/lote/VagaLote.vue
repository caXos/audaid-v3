<script setup lang="ts">
// Uma vaga da sala que ficou sem processo do lote (D73): laranja-claro, borda tracejada, selo
// "Vaga livre". "Deixar livre" faz a vaga ser pulada (os processos descem para a próxima); "Usar
// esta vaga" a devolve. O tipo configurado nela é só informação.
import type { EstadoPauta, LinhaVista } from './estadoPauta';
import { paraHora } from './pauta';

const props = defineProps<{ vista: LinhaVista; pauta: EstadoPauta }>();
const vaga = () => props.vista.linha.vaga!;
</script>

<template>
  <div :class="['linha-lote', 'linha-vaga', { deixada: vaga().deixadaLivre }]" :data-inicio="paraHora(vista.linha.inicio)">
    <span class="alca"></span>
    <span class="ordem"></span>
    <div class="dados">
      <div class="linha-numero">
        <span class="selo-mini vaga-livre">Vaga livre</span>
        <span v-if="vaga().doLote" class="suave pequeno" :title="`Hoje, ${vaga().doLote} está neste horário e vai sair dele`">hoje de {{ vaga().doLote }}</span>
      </div>
    </div>
    <div class="tipo-item">
      <div class="tipo-resolvido" title="O tipo configurado na vaga: só informação; vale o tipo do processo">{{ vaga().descricaoTipo ? `Configurada: ${vaga().descricaoTipo}` : '' }}</div>
    </div>
    <div class="campo-item"><span>Início</span><span class="valor-fixo">{{ paraHora(vista.linha.inicio) }}</span></div>
    <span></span>
    <span></span>
    <div class="ajustes-item">
      <button v-if="vaga().deixadaLivre" class="acao secundaria pequena" type="button" title="Os processos voltam a ocupar esta vaga" @click="pauta.usarVaga(vista.linha.inicio)">Usar esta vaga</button>
      <button v-else class="acao secundaria pequena" type="button" title="Pular esta vaga: nenhum processo do lote vai para ela" @click="pauta.deixarLivre(vista.linha.inicio)">Deixar livre</button>
    </div>
    <span></span>
    <div class="aviso-linha suave-linha">{{ vaga().deixadaLivre ? 'Deixada livre: nenhum processo do lote vai para ela.' : 'Vaga sem processo do lote.' }}</div>
  </div>
</template>
