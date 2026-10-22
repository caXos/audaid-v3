// Texto e prazo do GIGS (D11, D29, D29b). O GIGS só aceita texto pronto: as variáveis são
// resolvidas aqui, com os dados da audiência designada.

import { LIMITES } from '../config/opcoes';

export interface DadosAudienciaGigs {
  /** AAAA-MM-DD */
  data: string;
  /** HH:MM */
  hora: string;
  tipo: string;
  sala: string;
}

/** "2026-10-20" → "20/10/2026". */
export function dataBr(data: string): string {
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a}`;
}

/** Formato padrão da D21: "20/10/2026, às 10h11". */
export function dataHoraPorExtenso(data: string, hora: string): string {
  return `${dataBr(data)}, às ${hora.replace(':', 'h')}`;
}

export function resolverVariaveis(texto: string, d: DadosAudienciaGigs): string {
  return texto
    .replace(/\{\s*data\s+e\s+hora\s*\}/gi, dataHoraPorExtenso(d.data, d.hora))
    .replace(/\{\s*data\s*\}/gi, dataBr(d.data))
    .replace(/\{\s*hora\s*\}/gi, d.hora)
    .replace(/\{\s*tipo\s*\}/gi, d.tipo)
    .replace(/\{\s*sala\s*\}/gi, d.sala);
}

export interface EscolhaGigs {
  /** `nenhum` = a opção vazia: não lança GIGS. */
  lancar: boolean;
  texto: string;
  prazo: number;
}

/** Pendência que impede o envio, ou `null` se está tudo certo. */
export function pendenciaGigs(e: EscolhaGigs): string | null {
  if (!e.lancar) return null;
  if (!e.texto.trim()) return 'Escreva o texto do GIGS (ou escolha a opção vazia para não lançar).';
  if (!Number.isInteger(e.prazo) || e.prazo < LIMITES.prazo.min || e.prazo > LIMITES.prazo.max) {
    return `O prazo do GIGS deve ser um número inteiro de ${LIMITES.prazo.min} a ${LIMITES.prazo.max} dias úteis.`;
  }
  return null;
}
