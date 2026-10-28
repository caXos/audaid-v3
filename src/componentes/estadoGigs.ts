// Estado do GIGS (D29, D29b, D43, D46): sugestão escolhida, texto, prazo, prévia já com as
// variáveis resolvidas e a pendência que impede o envio. Mostrado e editado por CampoGigs.vue.

import { computed, reactive, ref, watch } from 'vue';
import { LIMITES, type SugestaoGigs } from '../config/opcoes';
import { pendenciaGigs, resolverVariaveis, type DadosVariaveisGigs } from '../regras/gigs';

const PRAZO_PADRAO = 2;

export interface ValoresGigs {
  opcao: string;
  texto: string;
  prazo: number;
}

/**
 * `inicial`: valores já escolhidos (o topo lembrado do Lote, o GIGS ajustado de um item). Se a
 * sugestão mudou nas Opções desde então, o texto guardado vale e a escolha passa a "Outro…".
 */
export function useGigs(sugestoes: SugestaoGigs[], dadosVariaveis: () => DadosVariaveisGigs, inicial?: ValoresGigs) {
  const sugestaoInicial = inicial?.opcao.startsWith('s') ? sugestoes[Number(inicial.opcao.slice(1))] : undefined;
  const opcaoInicial = !inicial ? '' : inicial.opcao.startsWith('s') && sugestaoInicial?.texto !== inicial.texto ? 'outro' : inicial.opcao;
  /** `''` = não lançar; `s0`, `s1`… = sugestão das Opções; `outro` = texto livre. */
  const opcao = ref(opcaoInicial);
  const texto = ref(inicial?.texto ?? '');
  /** Como está no campo: o `v-model` de `type="number"` devolve `''` quando o campo está vazio. */
  const prazo = ref<number | string>(inicial?.prazo ?? PRAZO_PADRAO);

  // Escolher uma sugestão preenche texto e prazo; "Outro" começa vazio.
  watch(
    opcao,
    (v) => {
      const sugestao = v.startsWith('s') ? sugestoes[Number(v.slice(1))] : undefined;
      texto.value = sugestao?.texto ?? '';
      prazo.value = sugestao?.prazo ?? PRAZO_PADRAO;
    },
    { flush: 'sync' },
  );

  const lancar = computed(() => opcao.value !== '');
  const prazoNumero = computed(() => Number(prazo.value));
  // A validação é sobre o texto JÁ resolvido: as variáveis podem fazê-lo passar de 4000 caracteres.
  const textoResolvido = computed(() => resolverVariaveis(texto.value, dadosVariaveis()));
  const pendencia = computed(() => pendenciaGigs({ lancar: lancar.value, texto: textoResolvido.value, prazo: prazoNumero.value }));

  const previa = computed(() => {
    if (!lancar.value) return 'Nenhum GIGS será lançado.';
    const d = dadosVariaveis();
    const final = textoResolvido.value;
    const quando = prazoNumero.value > 0 ? `prazo de ${prazoNumero.value} dia(s) útil(eis)` : 'sem prazo';
    const falta = d.data && d.hora && d.tipo ? '' : ' (data, hora e tipo entram quando forem escolhidos)';
    return `(${final.length}/${LIMITES.textoGigs}) Será lançado: "${final}" · ${quando}${falta}`;
  });

  return reactive({
    opcao,
    texto,
    prazo,
    lancar,
    prazoNumero,
    textoResolvido,
    pendencia,
    previa,
    sugestoes: sugestoes.map((s, i) => ({ valor: `s${i}`, rotulo: s.texto.length > 60 ? `${s.texto.slice(0, 57)}…` : s.texto })),
    prazoMin: LIMITES.prazo.min,
    prazoMax: LIMITES.prazo.max,
  });
}

export type EstadoGigs = ReturnType<typeof useGigs>;
