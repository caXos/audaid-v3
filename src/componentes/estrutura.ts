// Forma de uma resposta do PJe sem os valores: só chaves, tipos e tamanhos de lista. Serve para
// o diagnóstico confirmar uma resposta ainda sem captura sem levar nome de parte, CPF etc.

const PROFUNDIDADE_MAXIMA = 6;

export function estruturaSemDados(valor: unknown, profundidade = 0): unknown {
  if (valor === null) return 'null';
  if (Array.isArray(valor)) {
    if (!valor.length) return '[0]';
    if (profundidade >= PROFUNDIDADE_MAXIMA) return `[${valor.length}]`;
    return [`[${valor.length}]`, estruturaSemDados(valor[0], profundidade + 1)];
  }
  if (typeof valor === 'object') {
    if (profundidade >= PROFUNDIDADE_MAXIMA) return '{…}';
    const forma: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) forma[chave] = estruturaSemDados(v, profundidade + 1);
    return forma;
  }
  return typeof valor;
}
