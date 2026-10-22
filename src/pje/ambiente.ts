export type NomeAmbiente = 'pje' | 'pje-homologacao' | 'pje-treinamento';

export interface Ambiente {
  ambiente: NomeAmbiente;
  /** Ex.: "trt9". */
  tribunal: string;
  numeroTrt: number;
  /** Ex.: "https://pje.trt9.jus.br". Todas as requisições são same-origin a partir daqui. */
  origem: string;
}

const PADRAO_HOST = /^(pje|pje-homologacao|pje-treinamento)\.trt(\d{1,2})\.jus\.br$/i;

/** Lê ambiente e tribunal da URL atual; `null` se não for uma página do PJe de um TRT. */
export function lerAmbiente(url: string): Ambiente | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const m = PADRAO_HOST.exec(u.hostname);
  if (!m || !m[1] || !m[2]) return null;
  const numeroTrt = Number(m[2]);
  if (numeroTrt < 1 || numeroTrt > 24) return null;
  return {
    ambiente: m[1].toLowerCase() as NomeAmbiente,
    tribunal: `trt${numeroTrt}`,
    numeroTrt,
    origem: `https://${u.hostname.toLowerCase()}`,
  };
}

export type TelaPje =
  | { tipo: 'processo'; idProcesso: number; aba: 'detalhe' | 'audiencias-sessoes' }
  | { tipo: 'outra' };

/** Identifica as telas do Controle Individual (§2.2 do blueprint). */
export function lerTela(pathname: string): TelaPje {
  const m = /^\/pjekz\/processo\/(\d+)\/(detalhe|audiencias-sessoes)(?:\/|$)/.exec(pathname);
  if (!m || !m[1] || !m[2]) return { tipo: 'outra' };
  return { tipo: 'processo', idProcesso: Number(m[1]), aba: m[2] as 'detalhe' | 'audiencias-sessoes' };
}
