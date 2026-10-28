// Números de processo num texto qualquer (tela 1 do Lote, D12): o formato CNJ
// (NNNNNNN-DD.AAAA.J.TR.OOOO) e os mesmos 20 dígitos sem pontuação.

const FORMATADO = /(?<!\d)\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}(?!\d)/g;
const SO_DIGITOS = /(?<!\d)\d{20}(?!\d)/g;

/** "00001015220265090001" → "0000101-52.2026.5.09.0001". */
export function formatarNumero(digitos: string): string {
  return `${digitos.slice(0, 7)}-${digitos.slice(7, 9)}.${digitos.slice(9, 13)}.${digitos.slice(13, 14)}.${digitos.slice(14, 16)}.${digitos.slice(16, 20)}`;
}

/**
 * Dígito verificador do número CNJ (Resolução CNJ 65/2008): NNNNNNN AAAA J TR OOOO DD, lidos como
 * um número só, dão resto 1 na divisão por 97. Feito por partes, porque 20 dígitos não cabem com
 * precisão num `number`.
 */
export function numeroValido(numero: string): boolean {
  const d = numero.replace(/\D/g, '');
  if (d.length !== 20) return false;
  let resto = 0;
  for (const c of d.slice(0, 7) + d.slice(9) + d.slice(7, 9)) resto = (resto * 10 + Number(c)) % 97;
  return resto === 1;
}

/** Os números do texto, já formatados, na ordem em que aparecem e sem repetir. */
export function extrairNumeros(texto: string): string[] {
  const achados: { posicao: number; numero: string }[] = [];
  for (const m of texto.matchAll(FORMATADO)) achados.push({ posicao: m.index, numero: m[0] });
  for (const m of texto.matchAll(SO_DIGITOS)) achados.push({ posicao: m.index, numero: formatarNumero(m[0]) });
  achados.sort((a, b) => a.posicao - b.posicao);
  // D12: duplicados saem em silêncio.
  return [...new Set(achados.map((a) => a.numero))];
}
