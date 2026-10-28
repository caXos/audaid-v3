// Textos do Lote, puros e testados: nomes resumidos, dica dos advogados e o diagnóstico.

import type { Parte } from '../regras/partes';
import type { ResultadoResolucao } from './resolver';

/** "Ana; Bruno e mais 3": a lista inteira fica no tooltip. */
export function resumoNomes(partes: Parte[], visiveis = 2): string {
  if (!partes.length) return '—';
  const nomes = partes.slice(0, visiveis).map((p) => p.nome).join('; ');
  return partes.length > visiveis ? `${nomes} e mais ${partes.length - visiveis}` : nomes;
}

/** Conteúdo do `(?)`: cada parte com os advogados dela. */
export function dicaAdvogados(partes: Parte[]): string {
  return partes.map((p) => `${p.nome}: ${p.advogados.map((a) => a.nome).join(', ') || 'sem advogado'}`).join('\n');
}

/**
 * "Copiar diagnóstico" (entrega 1): contagens, motivos e a forma da busca por número. Sem nomes e
 * sem números de processo, para poder ser enviado ao autor sem expor dado de ninguém.
 */
export function textoDiagnostico(r: ResultadoResolucao, reconhecidos: number, versao: string, agora: Date = new Date()): string {
  const motivos = new Map<string, number>();
  for (const n of r.naoIncluidos) {
    // "tramita em outro órgão: X" agrupa pelo começo; o nome do órgão não é dado pessoal, mas basta o tipo.
    const tipo = n.motivo.split(':')[0]!;
    motivos.set(tipo, (motivos.get(tipo) ?? 0) + 1);
  }
  const linhas = [
    `AudAid ${versao} · Lote, tela 1 · ${agora.toLocaleString('pt-BR')}`,
    `Números reconhecidos: ${reconhecidos} · incluídos: ${r.incluidos.length} · não incluídos: ${r.naoIncluidos.length}`,
    ...[...motivos].map(([motivo, n]) => `- ${motivo}: ${n}`),
    '',
    'Busca por número (processos?numero=), forma da resposta sem os valores:',
  ];
  for (const a of r.amostrasBusca) {
    linhas.push(`HTTP ${a.status}${a.mensagemErro ? ` · ${a.mensagemErro}` : ''}`);
    if (a.estrutura !== null) linhas.push(JSON.stringify(a.estrutura, null, 1));
  }
  return linhas.join('\n');
}
