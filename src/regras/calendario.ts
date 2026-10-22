import type { EventoCalendario } from '../pje/api';

export type NivelData = 'livre' | 'avisa' | 'bloqueia';

export interface ClassificacaoData {
  nivel: NivelData;
  bloqueios: string[];
  avisos: string[];
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** 0 = domingo … 6 = sábado. Calculado em UTC para não depender do fuso da máquina. */
export function diaDaSemana(data: string): number {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a ?? 0, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/**
 * Regra de data do blueprint (D34, D34b, D34c):
 * - bloqueia: fim de semana; feriado; suspensão de audiência; suspensão de **expediente**;
 * - avisa: evento só com suspensão de prazo (nesses dias há audiência normalmente);
 * - eventos de vários dias valem para o intervalo inteiro.
 */
export function classificarData(data: string, eventos: EventoCalendario[]): ClassificacaoData {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error(`Data inválida: ${data}`);

  const bloqueios: string[] = [];
  const avisos: string[] = [];

  const dia = diaDaSemana(data);
  if (dia === 0) bloqueios.push('Domingo');
  if (dia === 6) bloqueios.push('Sábado');

  for (const ev of eventos) {
    const fim = ev.dataFim || ev.dataInicio;
    if (data < ev.dataInicio || data > fim) continue;
    const nome = ev.descricao.trim();
    if (ev.feriado || ev.suspendeAudiencia || semAcento(nome).includes('expediente')) {
      bloqueios.push(nome);
    } else {
      avisos.push(nome);
    }
  }

  const nivel: NivelData = bloqueios.length ? 'bloqueia' : avisos.length ? 'avisa' : 'livre';
  return { nivel, bloqueios, avisos };
}

/** Data local de hoje no formato do PJe (AAAA-MM-DD). */
export function hoje(agora: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}
