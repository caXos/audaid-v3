import type { PautaDia, PoloPauta } from '../pje/api';

/** A primeira parte de um polo e se há mais, como a pauta do dia traz (D74). */
export interface PoloResumo {
  nome: string;
  varios: boolean;
}

export interface EntradaPauta {
  /** "HH:MM" */
  hora: string;
  /** Vaga = horário pré-configurado na sala, sem processo. Conta como livre (D33). */
  tipo: 'audiencia' | 'vaga';
  idProcesso?: number;
  nrProcesso?: string;
  descricaoTipo?: string;
  idTipo?: number;
  poloAtivo?: PoloResumo;
  poloPassivo?: PoloResumo;
}

const lerPolo = (p: PoloPauta | undefined): PoloResumo | undefined =>
  typeof p?.nome === 'string' && p.nome ? { nome: p.nome, varios: Boolean(p.representaVarios) } : undefined;

/**
 * Normaliza a pauta do dia. Só o horário de início importa: o `horaFinal` dessa resposta é
 * derivado da entrada seguinte e não representa duração (D28, §6 item 9).
 */
export function lerPauta(pauta: Partial<PautaDia> | null | undefined): EntradaPauta[] {
  // Dia sem audiência nem vaga: o PJe responde só `{ "dia": "…" }`, sem `pautasDoDia`.
  const lista = Array.isArray(pauta?.pautasDoDia) ? pauta.pautasDoDia : [];
  return lista
    .filter((p) => p?.pautaAudienciaHorario?.horaInicial)
    .map((p) => {
      const e: EntradaPauta = {
        hora: (p.pautaAudienciaHorario?.horaInicial ?? '').slice(0, 5),
        tipo: p.idProcesso == null ? 'vaga' : 'audiencia',
        idProcesso: p.idProcesso,
        nrProcesso: p.nrProcesso,
        descricaoTipo: p.tipo?.descricao,
      };
      if (typeof p.tipo?.id === 'number') e.idTipo = p.tipo.id;
      const ativo = lerPolo(p.poloAtivo);
      const passivo = lerPolo(p.poloPassivo);
      if (ativo) e.poloAtivo = ativo;
      if (passivo) e.poloPassivo = passivo;
      return e;
    })
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
