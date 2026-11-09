import type { PautaDia, PoloPauta } from '../pje/api';

/**
 * D80: o horário cai na grade das vagas do dia? O passo é a diferença mais comum entre os horários
 * do dia (vagas e audiências), contado desde o primeiro. Um encaixe (10:11 numa grade de 10 em 10)
 * fica fora. Com menos de dois horários, não há grade.
 */
export function naGradeDoDia(minuto: number, minutosDoDia: number[]): boolean {
  const m = [...new Set(minutosDoDia)].sort((a, b) => a - b);
  if (m.length < 2) return false;
  const contagem = new Map<number, number>();
  for (let i = 1; i < m.length; i++) {
    const d = m[i]! - m[i - 1]!;
    contagem.set(d, (contagem.get(d) ?? 0) + 1);
  }
  const passo = [...contagem].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
  return passo > 0 && (minuto - m[0]!) % passo === 0;
}

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
  /** O id da audiência (`pautaAudienciaHorario.id`): o cancelamento usa este (D89e). A vaga não tem. */
  idAudiencia?: number;
  nrProcesso?: string;
  descricaoTipo?: string;
  idTipo?: number;
  poloAtivo?: PoloResumo;
  poloPassivo?: PoloResumo;
  segredo?: boolean;
  /** O processo como a pauta o traz (D81): o órgão em que tramita, o 100% Digital, a classe, a fase. */
  processo?: ProcessoNaPauta;
}

export interface ProcessoNaPauta {
  orgaoId?: number;
  orgaoDescricao?: string;
  juizoDigital: boolean;
  faseProcessual?: string;
  classeSigla?: string;
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
      if (e.tipo === 'audiencia' && typeof p.pautaAudienciaHorario?.id === 'number') e.idAudiencia = p.pautaAudienciaHorario.id;
      const ativo = lerPolo(p.poloAtivo);
      const passivo = lerPolo(p.poloPassivo);
      if (ativo) e.poloAtivo = ativo;
      if (passivo) e.poloPassivo = passivo;
      if (typeof p.segredoJustica === 'boolean') e.segredo = p.segredoJustica;
      const pr = p.processo;
      if (pr && typeof pr === 'object') {
        e.processo = { juizoDigital: Boolean(pr.juizoDigital) };
        if (typeof pr.orgaoJulgador?.id === 'number') e.processo.orgaoId = pr.orgaoJulgador.id;
        if (typeof pr.orgaoJulgador?.descricao === 'string') e.processo.orgaoDescricao = pr.orgaoJulgador.descricao;
        if (typeof pr.faseProcessual === 'string') e.processo.faseProcessual = pr.faseProcessual;
        if (typeof pr.classeJudicial?.sigla === 'string') e.processo.classeSigla = pr.classeJudicial.sigla;
      }
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
