import type { PautaDia } from '../pje/api';

export interface EntradaPauta {
  /** "HH:MM" */
  hora: string;
  /** Vaga = horário pré-configurado na sala, sem processo. Conta como livre (D33). */
  tipo: 'audiencia' | 'vaga';
  idProcesso?: number;
  nrProcesso?: string;
  descricaoTipo?: string;
}

/**
 * Normaliza a pauta do dia. Só o horário de início importa: o `horaFinal` dessa resposta é
 * derivado da entrada seguinte e não representa duração (D28, §6 item 9).
 */
export function lerPauta(pauta: PautaDia): EntradaPauta[] {
  return pauta.pautasDoDia
    .filter((p) => p.pautaAudienciaHorario?.horaInicial)
    .map((p) => ({
      hora: (p.pautaAudienciaHorario?.horaInicial ?? '').slice(0, 5),
      tipo: p.idProcesso == null ? ('vaga' as const) : ('audiencia' as const),
      idProcesso: p.idProcesso,
      nrProcesso: p.nrProcesso,
      descricaoTipo: p.tipo?.descricao,
    }))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}

/**
 * Audiência que já começa no mesmo minuto, se houver: é o conflito "vermelho", que o PJe recusa
 * com PJE-064 (D28). Vagas nunca conflitam. `ignorarProcesso` serve para a redesignação, em que o
 * próprio processo pode estar na pauta.
 */
export function ocupanteDoMinuto(
  entradas: EntradaPauta[],
  hora: string,
  ignorarProcesso?: number,
): EntradaPauta | undefined {
  return entradas.find(
    (e) => e.tipo === 'audiencia' && e.hora === hora && e.idProcesso !== ignorarProcesso,
  );
}
