/** Lê um cookie pelo nome, sem diferenciar maiúsculas (o PJe usa "Xsrf-Token"). */
export function lerCookie(cookieString: string, nome: string): string | undefined {
  const alvo = nome.toLowerCase();
  for (const parte of cookieString.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim().toLowerCase() !== alvo) continue;
    const valor = parte.slice(i + 1).trim();
    try {
      return decodeURIComponent(valor);
    } catch {
      return valor;
    }
  }
  return undefined;
}

/** Decodifica o payload de um JWT (sem validar assinatura: só lemos o que o próprio PJe nos deu). */
export function decodificarJwt(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const binario = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    const obj: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface OrgaoLogado {
  id: number;
  descricao: string;
}

export interface Sessao {
  xsrfToken?: string;
  /** Se o `access_token` aparece em `document.cookie` (isto é, não é HttpOnly). */
  accessTokenLegivel: boolean;
  /** Órgão em que o usuário está logado agora (D5). Ler sempre na hora da ação. */
  orgaoLogado?: OrgaoLogado;
  expiraEm?: Date;
}

export function lerSessao(cookieString: string): Sessao {
  const accessToken = lerCookie(cookieString, 'access_token');
  const sessao: Sessao = {
    xsrfToken: lerCookie(cookieString, 'xsrf-token'),
    accessTokenLegivel: Boolean(accessToken),
  };
  if (!accessToken) return sessao;

  const payload = decodificarJwt(accessToken);
  const oj = payload?.['orgaoJulgador'] as { id?: unknown; descricao?: unknown } | undefined;
  if (oj && typeof oj.id === 'number') {
    sessao.orgaoLogado = { id: oj.id, descricao: String(oj.descricao ?? '').trim() };
  }
  const exp = payload?.['exp'];
  if (typeof exp === 'number') sessao.expiraEm = new Date(exp * 1000);
  return sessao;
}
