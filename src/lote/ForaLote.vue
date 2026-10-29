<script setup lang="ts">
// Uma audiência que já estava no dia, de um processo que o usuário não listou (D74): roxo-claro,
// selo "Já na pauta", com os dados da própria pauta do dia. Fica no horário dela e, até a entrega
// 7, não se move nem se edita; só a duração, que muda o desenho da pauta e não vai ao PJe. Em
// sequência, dá para soltar um processo antes ou depois dela.
import type { Arrastar } from './arrastar';
import type { EstadoPauta, LinhaVista } from './estadoPauta';
import { paraHora } from './pauta';

const props = defineProps<{ vista: LinhaVista; pauta: EstadoPauta; arr: Arrastar }>();

const emSequencia = () => props.pauta.modo === 'sequencia';
function sobre(ev: DragEvent) {
  if (emSequencia()) props.arr.sobre(props.vista.linha.indice, ev);
}
function largar(ev: DragEvent) {
  if (emSequencia()) props.arr.largar(ev);
}
function mudarDuracao(ev: Event) {
  props.pauta.definirDuracaoFora(props.vista.linha.chave, Number((ev.target as HTMLInputElement).value));
}
</script>

<template>
  <div
    :class="[
      'linha-lote',
      'linha-fora',
      { 'alvo-antes': arr.alvo?.indice === vista.linha.indice && arr.alvo.posicao === 'antes', 'alvo-depois': arr.alvo?.indice === vista.linha.indice && arr.alvo.posicao === 'depois' },
    ]"
    data-linha
    :data-inicio="paraHora(vista.linha.inicio)"
    @dragover="sobre"
    @drop="largar"
  >
    <span class="alca" title="Já estava na pauta: não se move (até a entrega 7)"></span>
    <span class="ordem"></span>
    <div class="dados">
      <div class="linha-numero">
        <span class="numero">{{ vista.fora?.nrProcesso ?? vista.fora?.idProcesso }}</span>
        <span class="selo-mini ja-na-pauta" title="Audiência que já estava no dia, de um processo que não está na sua lista. O AudAid não mexe nela.">Já na pauta</span>
      </div>
      <div v-for="polo in [vista.fora?.poloAtivo, vista.fora?.poloPassivo]" :key="polo === vista.fora?.poloAtivo ? 'ativo' : 'passivo'" class="linha-parte">
        <span class="nome-parte" :title="polo?.nome">{{ polo?.nome ?? '—' }}</span>
        <span v-if="polo?.varios" class="ajuda" title="E outras partes neste polo">(+)</span>
      </div>
    </div>
    <div class="tipo-item">
      <div class="tipo-resolvido" :title="vista.fora?.descricaoTipo">{{ vista.fora?.descricaoTipo ?? '—' }}</div>
    </div>
    <div class="campo-item" title="O horário dela no PJe">
      <span>Início</span><span class="valor-fixo">{{ paraHora(vista.linha.inicio) }}</span>
    </div>
    <label v-if="emSequencia()" class="campo-item" title="A pauta do PJe não diz quanto ela dura: só muda o desenho da pauta, nada vai ao PJe">
      <span>Duração</span>
      <input type="number" min="1" max="600" :value="vista.linha.duracao" @change="mudarDuracao" />
    </label>
    <span v-else></span>
    <span></span>
    <span></span>
    <span></span>
    <div class="aviso-linha suave-linha" :title="vista.avisos.join('\n')">{{ vista.avisos[0] ?? 'Já estava na pauta: o AudAid não mexe nela.' }}</div>
  </div>
</template>
