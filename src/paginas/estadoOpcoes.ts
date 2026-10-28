// Estado da página de Opções (§2.6), em Vue desde a 3.1 (D50a). Salva sozinho, 0,4 s depois da
// última mudança. A API da extensão é injetada (src/paginas/opcoes.ts), para os testes usarem
// uma falsa (tests/opcoes.dom.test.ts).

import { nextTick, onBeforeUnmount, reactive, ref, toRaw, watch } from 'vue';
import { normalizarOpcoes, opcoesPadrao, type Aceite, type Opcoes } from '../config/opcoes';

export interface ApiOpcoes {
  ler(): Promise<{ opcoes: Opcoes; aceite: Aceite | null }>;
  salvarOpcoes(opcoes: Opcoes): Promise<void>;
  salvarAceite(aceite: Aceite | null): Promise<void>;
  /** Avisa quando opções ou aceite mudam fora daqui (outra aba de Opções, aceite nos termos). */
  aoMudar(callback: () => void): void;
  abrirTermos(): void;
}

export const ESPERA_SALVAR_MS = 400;

/** Um pedaço de texto de um item da confirmação; `negrito` destaca o que muda. */
export interface Trecho {
  texto: string;
  negrito?: boolean;
}

/** Revogar aceite, restaurar padrão: o que a confirmação mostra (DialogoConfirmacao.vue). */
export interface PedidoConfirmacao {
  titulo: string;
  itens: Trecho[][];
  botaoPerigo: string;
}

const copia = (o: Opcoes): Opcoes => JSON.parse(JSON.stringify(o)) as Opcoes;

export function useOpcoes(api: ApiOpcoes, desenvolvimento: boolean) {
  /** O formulário. `null` até a primeira leitura. */
  const opcoes = ref<Opcoes | null>(null);
  const aceite = ref<Aceite | null>(null);
  const salvo = ref('');
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let vivo = true;
  onBeforeUnmount(() => {
    vivo = false;
    clearTimeout(temporizador);
  });

  async function carregar(recarregarFormulario: boolean) {
    const lido = await api.ler();
    if (!vivo) return;
    if (recarregarFormulario) opcoes.value = copia(lido.opcoes);
    aceite.value = lido.aceite;
  }

  /** O que vai para o armazenamento passa pela mesma normalização da leitura. */
  async function salvar() {
    clearTimeout(temporizador);
    if (!opcoes.value) return;
    await api.salvarOpcoes(normalizarOpcoes(copia(toRaw(opcoes.value)), desenvolvimento));
    salvo.value = `Salvo às ${new Date().toLocaleTimeString('pt-BR')}.`;
  }

  function mudou() {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => void salvar(), ESPERA_SALVAR_MS);
  }
  // Mudança num campo (o mesmo objeto) salva; trocar o objeto inteiro (leitura, restaurar) não.
  watch(
    opcoes,
    (novo, antigo) => {
      if (novo && novo === antigo) mudou();
    },
    { deep: true },
  );

  async function restaurar() {
    clearTimeout(temporizador);
    const padrao = opcoesPadrao(desenvolvimento);
    opcoes.value = copia(padrao);
    await api.salvarOpcoes(padrao);
    await nextTick();
    salvo.value = 'Opções padrão restauradas.';
  }

  // Mudanças vindas de fora atualizam só a situação dos termos, para não atropelar o que está
  // sendo digitado aqui.
  api.aoMudar(() => void carregar(false));
  void carregar(true);

  return reactive({
    desenvolvimento,
    opcoes,
    aceite,
    salvo,
    mudou,
    salvar,
    restaurar,
    revogarAceite: () => api.salvarAceite(null),
    abrirTermos: () => api.abrirTermos(),
  });
}

export type EstadoOpcoes = ReturnType<typeof useOpcoes>;
