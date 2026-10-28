import { aceiteValido, normalizarOpcoes, type Aceite, type Opcoes } from '../config/opcoes';

/**
 * API de extensão. No Firefox, `browser`; no Chrome, `chrome`. Em MV3 as duas devolvem promessas,
 * e a forma é a mesma para o que usamos aqui.
 */
export const ext: typeof chrome = (globalThis as unknown as { browser?: typeof chrome }).browser ?? chrome;

const CHAVE_OPCOES = 'opcoes';
const CHAVE_ACEITE = 'aceite';

export interface Armazenado {
  opcoes: Opcoes;
  aceite: Aceite | null;
}

export async function lerArmazenado(desenvolvimento: boolean): Promise<Armazenado> {
  const dados = await ext.storage.local.get([CHAVE_OPCOES, CHAVE_ACEITE]);
  const aceite = dados[CHAVE_ACEITE];
  return {
    opcoes: normalizarOpcoes(dados[CHAVE_OPCOES], desenvolvimento),
    aceite: aceiteValido(aceite) ? aceite : null,
  };
}

export async function salvarOpcoes(opcoes: Opcoes): Promise<void> {
  await ext.storage.local.set({ [CHAVE_OPCOES]: opcoes });
}

export async function salvarAceite(aceite: Aceite | null): Promise<void> {
  if (aceite) await ext.storage.local.set({ [CHAVE_ACEITE]: aceite });
  else await ext.storage.local.remove(CHAVE_ACEITE);
}

/** Avisa quando opções ou aceite mudam (por exemplo, salvos na página de Opções). */
export function aoMudarArmazenado(callback: () => void): void {
  ext.storage.onChanged.addListener((mudancas, area) => {
    if (area === 'local' && (CHAVE_OPCOES in mudancas || CHAVE_ACEITE in mudancas)) callback();
  });
}

// ── Chaves avulsas (rascunho e topo do Lote, D18, D56) ─────────────────────────────────────

/** Leitura e gravação de uma chave. Injetado onde é usado, para os testes usarem memória. */
export interface Armazenamento {
  ler(chave: string): Promise<unknown>;
  gravar(chave: string, valor: unknown): Promise<void>;
  remover(chave: string): Promise<void>;
}

export const armazenamentoDaExtensao: Armazenamento = {
  async ler(chave) {
    return (await ext.storage.local.get(chave))[chave];
  },
  async gravar(chave, valor) {
    await ext.storage.local.set({ [chave]: valor });
  },
  async remover(chave) {
    await ext.storage.local.remove(chave);
  },
};

// ── Mensagens content script → background ──────────────────────────────────────────────────

export type Mensagem = { tipo: 'abrir-termos' } | { tipo: 'abrir-opcoes' };

export async function enviarMensagem(mensagem: Mensagem): Promise<void> {
  try {
    await ext.runtime.sendMessage(mensagem);
  } catch (e) {
    console.warn('[AudAid] Não foi possível falar com o background:', e);
  }
}
