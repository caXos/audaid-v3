// Textos do Lote, puros e testados: nomes resumidos, dica dos advogados, avisos de horário, resumo
// do GIGS de cada item e a oferta do rascunho.

import type { Parte } from '../regras/partes';
import type { SinalHorario } from './pauta';

/**
 * Uma linha por polo (D61): só a primeira parte, e "(+X)" quando houver mais, com os demais nomes
 * no tooltip. Ex.: GLOBOAVES, DIPLOMATA, DIP FRANGO → "GLOBOAVES" + "(+2)".
 */
export function resumoPolo(partes: Parte[]): { nome: string; mais: number; outros: string } {
  return {
    nome: partes[0]?.nome ?? '—',
    mais: Math.max(0, partes.length - 1),
    outros: partes.slice(1).map((p) => p.nome).join('\n'),
  };
}

/** Conteúdo do `(?)`: cada parte com os advogados dela. */
export function dicaAdvogados(partes: Parte[]): string {
  return partes.map((p) => `${p.nome}: ${p.advogados.map((a) => a.nome).join(', ') || 'sem advogado'}`).join('\n');
}

/** Aviso da linha de cada audiência (D55). `null` = horário sem problema. */
export function avisoHorario(sinal: SinalHorario): string | null {
  switch (sinal) {
    case 'sobreposto':
      return 'Horário sobreposto a outra audiência do lote: dá para seguir, com confirmação.';
    case 'mesmo-minuto':
      return 'Outra audiência do lote começa no mesmo minuto: o PJe recusaria. Mude um dos inícios.';
    case 'apos-meia-noite':
      return 'Começa depois da meia-noite: diminua as durações ou adiante o início.';
    case 'ok':
      return null;
  }
}

/** "GIGS: Analisar · 2 d.u." no item; o texto completo fica no tooltip. */
export function resumoGigs(lancar: boolean, texto: string, prazo: number, tamanho = 38): string {
  if (!lancar) return 'Sem GIGS';
  const curto = texto.length > tamanho ? `${texto.slice(0, tamanho - 1)}…` : texto;
  return `GIGS: ${curto || '(sem texto)'} · ${prazo > 0 ? `${prazo} d.u.` : 'sem prazo'}`;
}

/** "Retomar rascunho de 28/10/2026, 09:30 (9 processos)" (D18). */
export function rotuloRascunho(salvoEm: string, processos: number): string {
  const d = new Date(salvoEm);
  const quando = Number.isNaN(d.getTime())
    ? ''
    : ` de ${d.toLocaleDateString('pt-BR')}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  return `Retomar rascunho${quando} (${processos} ${processos === 1 ? 'processo' : 'processos'})`;
}

/** A etapa no cabeçalho do Lote: as telas do §2.3 (o resumo provisório ocupa o lugar da tela 3). */
export function rotuloEtapa(tela: 'texto' | 'consultando' | 'pauta' | 'resumo'): string {
  switch (tela) {
    case 'texto':
    case 'consultando':
      return 'Etapa 1 - Lista de processos';
    case 'pauta':
      return 'Etapa 2 - Formulário';
    case 'resumo':
      return 'Etapa 3 - Conferência (provisória)';
  }
}
