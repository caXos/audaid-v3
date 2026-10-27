// Estado do tipo composto (D6, D42): tipo base + vídeo + fase + Semana Nacional, e o que se aplica
// a cada combinação. Os componentes só mostram e editam este objeto (TipoComposto.vue).

import { computed, reactive, ref, watch } from 'vue';
import type { TipoAudiencia } from '../pje/api';
import {
  aplicabilidade,
  descricaoTipo,
  ehSumarissimo,
  escolhaDaDescricao,
  estadoVideo,
  faseDoProcesso,
  type EscolhaTipo,
  type EstadoVideo,
  type Fase,
  type Semana,
  type TipoBase,
} from '../regras/tipoComposto';
import { resolverTipo } from '../regras/tipos';

/** O que do processo influencia o tipo. */
export interface ProcessoDoTipo {
  juizoDigital: boolean;
  siglaClasse?: string;
  faseProcessual?: string;
}

export interface TipoResolvido {
  descricao: string;
  /** Ausente quando a descrição não existe neste tribunal. */
  tipo?: TipoAudiencia;
}

export function useTipoComposto(processo: ProcessoDoTipo, tipos: TipoAudiencia[], descricaoAntiga?: string) {
  // Da audiência antiga vem só o tipo base (o caso comum: só muda data/hora). Vídeo segue o
  // processo e Semana Nacional começa vazia, por ser coisa de evento específico (D42).
  const base = ref<TipoBase | ''>((descricaoAntiga && escolhaDaDescricao(descricaoAntiga)?.base) || '');
  const video = ref(false);
  // D42: a fase vem sempre do processo (não da audiência antiga).
  const faseAtual = faseDoProcesso(processo.faseProcessual);
  const fase = ref<Fase>(faseAtual);
  const semana = ref<Semana>('nenhuma');
  const sumarissimo = ehSumarissimo(processo.siglaClasse);

  const ap = computed(() => aplicabilidade(base.value || 'Conciliação', fase.value));
  const ev = computed<EstadoVideo>(() => (base.value ? estadoVideo(base.value, processo.juizoDigital) : { habilitada: false }));

  // Valores impostos ficam gravados no próprio campo, como na 3.0.
  watch(
    ev,
    (e) => {
      if (e.marcada !== undefined) video.value = e.marcada;
    },
    { immediate: true, flush: 'sync' },
  );
  watch(
    () => [semana.value, ap.value.semanaExecucao] as const,
    ([s, podeExecucao]) => {
      if (s === 'execucao' && !podeExecucao) semana.value = 'nenhuma';
    },
    { immediate: true, flush: 'sync' },
  );

  const escolha = computed<EscolhaTipo | null>(() =>
    base.value ? { base: base.value, video: video.value, fase: fase.value, semana: semana.value, sumarissimo } : null,
  );

  const resolvido = computed<TipoResolvido | null>(() => {
    if (!escolha.value) return null;
    const descricao = descricaoTipo(escolha.value);
    return { descricao, tipo: resolverTipo(descricao, tipos) };
  });

  const textoRito = computed(() =>
    !escolha.value
      ? '—'
      : ap.value.rito
        ? sumarissimo
          ? 'Sumaríssimo (classe ATSum)'
          : `Ordinário (classe ${processo.siglaClasse ?? '?'})`
        : 'Não se aplica a este tipo',
  );

  const tituloVideo = computed(() =>
    !escolha.value
      ? ''
      : !ap.value.video
        ? 'Este tipo não tem versão por videoconferência.'
        : processo.juizoDigital
          ? 'Processo 100% Digital: a audiência é sempre por videoconferência.'
          : '',
  );

  const pendencia = computed(() =>
    !resolvido.value ? 'Escolha o tipo de audiência.' : !resolvido.value.tipo ? 'O tipo escolhido não existe neste tribunal.' : null,
  );

  return reactive({
    base,
    video,
    fase,
    semana,
    faseAtual,
    videoHabilitado: computed(() => ev.value.habilitada),
    faseHabilitada: computed(() => Boolean(escolha.value) && ap.value.fase),
    semanaHabilitada: computed(() => Boolean(escolha.value) && ap.value.semana),
    semanaExecucaoHabilitada: computed(() => ap.value.semanaExecucao),
    resolvido,
    textoRito,
    tituloVideo,
    pendencia,
  });
}

export type EstadoTipo = ReturnType<typeof useTipoComposto>;
