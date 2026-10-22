/**
 * Requisições ao PJe a partir do content script.
 *
 * No Chrome, o `fetch` do content script sai com a origem da página. No Firefox, ele sai com os
 * privilégios da extensão, e o equivalente "como a página" é `content.fetch`. A prova técnica
 * (entrega 1) compara as duas vias no Firefox antes de escolhermos uma (blueprint §6, item 14).
 */

export type Via = 'fetch' | 'content.fetch';

/** Formato de erro do PJe (D31d): `{ identificadorRequisicao, codigoErro, mensagem }`. */
export interface ErroPje {
  mensagem: string;
  codigoErro?: string;
  identificadorRequisicao?: string;
}

export type Resposta<T> =
  | { ok: true; status: number; ms: number; via: Via; dados: T }
  | { ok: false; status: number; ms: number; via: Via; erro: ErroPje };

export const CODIGO_HORARIO_OCUPADO = 'PJE-064';

export function interpretarErro(status: number, texto: string): ErroPje {
  try {
    const j: unknown = JSON.parse(texto);
    if (j && typeof j === 'object' && typeof (j as { mensagem?: unknown }).mensagem === 'string') {
      const o = j as Record<string, unknown>;
      return {
        mensagem: o['mensagem'] as string,
        codigoErro: typeof o['codigoErro'] === 'string' ? o['codigoErro'] : undefined,
        identificadorRequisicao:
          typeof o['identificadorRequisicao'] === 'string' ? o['identificadorRequisicao'] : undefined,
      };
    }
  } catch {
    // corpo não é JSON: cai no texto cru abaixo
  }
  const resumo = texto.trim().replace(/\s+/g, ' ').slice(0, 300);
  return { mensagem: resumo ? `HTTP ${status}: ${resumo}` : `HTTP ${status} sem corpo` };
}

type FuncaoFetch = (url: string, init?: RequestInit) => Promise<Response>;

interface GlobalFirefox {
  content?: { fetch?: FuncaoFetch };
  cloneInto?: <T>(obj: T, alvo: object) => T;
}

function fetchDaPagina(): FuncaoFetch | undefined {
  const g = globalThis as unknown as GlobalFirefox;
  const pagina = g.content;
  if (!pagina || typeof pagina.fetch !== 'function') return undefined;
  const f = pagina.fetch.bind(pagina);
  // O objeto de opções precisa ser clonado para o compartimento da página.
  return (url, init) => f(url, init && g.cloneInto ? g.cloneInto(init, pagina) : init);
}

/** Vias disponíveis neste navegador, na ordem de preferência. */
export function viasDisponiveis(): Via[] {
  return fetchDaPagina() ? ['content.fetch', 'fetch'] : ['fetch'];
}

export interface OpcoesGet {
  xsrfToken?: string;
  via?: Via;
}

export async function pjeGet<T>(url: string, opcoes: OpcoesGet = {}): Promise<Resposta<T>> {
  const via = opcoes.via ?? viasDisponiveis()[0] ?? 'fetch';
  const funcao: FuncaoFetch | undefined =
    via === 'content.fetch' ? fetchDaPagina() : (u, i) => globalThis.fetch(u, i);
  const inicio = performance.now();
  const tempo = () => Math.round(performance.now() - inicio);

  if (!funcao) {
    return { ok: false, status: 0, ms: 0, via, erro: { mensagem: `Via "${via}" indisponível neste navegador` } };
  }

  const headers: Record<string, string> = { Accept: 'application/json, text/plain, */*' };
  if (opcoes.xsrfToken) headers['X-XSRF-TOKEN'] = opcoes.xsrfToken;

  try {
    const resp = await funcao(url, { method: 'GET', credentials: 'include', headers });
    const texto = await resp.text();
    const ms = tempo();
    if (!resp.ok) return { ok: false, status: resp.status, ms, via, erro: interpretarErro(resp.status, texto) };
    try {
      return { ok: true, status: resp.status, ms, via, dados: JSON.parse(texto) as T };
    } catch {
      const pista = /<html/i.test(texto) ? ' (veio uma página HTML: a sessão pode ter expirado)' : '';
      return {
        ok: false,
        status: resp.status,
        ms,
        via,
        erro: { mensagem: `A resposta não é JSON${pista}` },
      };
    }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: tempo(),
      via,
      erro: { mensagem: `Falha de rede: ${e instanceof Error ? e.message : String(e)}` },
    };
  }
}
