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

/** Onde cada separador entra: depois de 7, 9, 13, 14 e 16 dígitos. */
const GRUPOS: [number, number, string][] = [
  [0, 7, ''],
  [7, 9, '-'],
  [9, 13, '.'],
  [13, 14, '.'],
  [14, 16, '.'],
  [16, 20, '.'],
];

/**
 * A máscara do número enquanto se digita (D99), no formato 0000000-00.0000.0.00.0000:
 * - o hífen digitado completa o sequencial com zeros à esquerda, como a busca do PJe faz
 *   ("369-" → "0000369-"; "55-53" → "0000055-53");
 * - os separadores seguintes entram sozinhos quando chega o dígito depois deles;
 * - número inteiro colado (formatado, com os 20 dígitos ou no meio de um texto) vira o número
 *   formatado.
 */
export function mascararNumero(texto: string): string {
  const inteiro = extrairNumeros(texto)[0];
  if (inteiro) return inteiro;
  const hifen = texto.indexOf('-');
  const antes = hifen >= 0 ? texto.slice(0, hifen).replace(/\D/g, '') : '';
  // O hífen só vale depois de algum dígito; o sequencial tem 7: menos, zeros à esquerda (mais, nada se perde).
  const comHifen = hifen >= 0 && antes.length > 0;
  const digitos = (comHifen ? antes.padStart(7, '0') + texto.slice(hifen + 1).replace(/\D/g, '') : texto.replace(/\D/g, '')).slice(0, 20);
  let saida = '';
  for (const [de, ate, separador] of GRUPOS) if (digitos.length > de) saida += separador + digitos.slice(de, ate);
  // "369-": o hífen digitado fica, para a pessoa seguir com o dígito verificador.
  return comHifen && digitos.length === 7 ? `${saida}-` : saida;
}
