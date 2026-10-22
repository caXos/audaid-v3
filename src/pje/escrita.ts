// URLs e payloads de ESCRITA no PJe, espelhando as capturas reais (blueprint §3):
// - designar:   redesigna/request_1 (POST)
// - redesignar: redesigna/request_2 (PUT)
// - 100% Digital: hars/d31d (PUT com o processo inteiro)
// - GIGS: hars/*gigs* (POST)
// Tudo puro: quem envia é o executor (src/fluxo/executor.ts).

export const caminhosEscrita = {
  designar: () => '/pje-comum-api/api/pautasaudiencias/audiencias',
  redesignar: () => '/pje-comum-api/api/pautasaudiencias/audiencias/redesignacao',
  juizoDigital: (idProcesso: number) =>
    `/pje-comum-api/api/processos/${idProcesso}?alteracaoParcial=true&lancaMovimentoJuizoDigital=true`,
  gigs: () => '/pje-gigs-api/api/atividade',
  /** Leitura auxiliar do GIGS: data final de um prazo em dias úteis, pelo calendário do órgão. */
  retornaPrazo: (dias: number, idOrgao: number, dataInicio: string) =>
    `/pje-gigs-api/api/atividade/retorna-prazo/${dias}?idOj=${idOrgao}&dataInicio=${dataInicio}`,
};

/**
 * Data no formato que a tela do PJe envia: meia-noite LOCAL em ISO.
 * Em Brasília (UTC−3), "2026-10-20" → "2026-10-20T03:00:00.000Z".
 */
export function dataParaPje(data: string): string {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(a ?? 0, (m ?? 1) - 1, d ?? 1).toISOString();
}

/** `horarioFinal` é sempre o início + 1 minuto (D7). */
export function somarUmMinuto(hora: string): string {
  const [h, m] = hora.split(':').map(Number);
  const total = ((h ?? 0) * 60 + (m ?? 0) + 1) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export interface DadosDesignacao {
  idProcesso: number;
  idTipoAudiencia: number;
  idSalaFisica: number;
  /** AAAA-MM-DD */
  data: string;
  /** HH:MM */
  hora: string;
}

export function payloadDesignar(d: DadosDesignacao, validarHorario = true) {
  return {
    considerarIntersticio: true,
    buscarProximoHorarioVago: false,
    validarHorario,
    idTipoAudiencia: d.idTipoAudiencia,
    data: dataParaPje(d.data),
    horarioInicial: d.hora,
    horarioFinal: somarUmMinuto(d.hora),
    idProcesso: d.idProcesso,
    idSalaFisica: d.idSalaFisica,
  };
}

/** Redesignação (D32): troca a audiência antiga pela nova numa requisição só. */
export function payloadRedesignar(d: DadosDesignacao & { idAudienciaAntiga: number }) {
  return {
    considerarIntersticio: true,
    idProcessoAudiencia: d.idAudienciaAntiga,
    data: dataParaPje(d.data),
    horarioInicial: d.hora,
    horarioFinal: somarUmMinuto(d.hora),
    idProcesso: d.idProcesso,
    idSalaFisica: d.idSalaFisica,
    idTipoAudiencia: d.idTipoAudiencia,
    buscarProximoHorarioVago: false,
    marcarNovoHorario: false,
  };
}

/** 100% Digital (D26, D31d): o objeto do GET do processo, inteiro, só com `juizoDigital` trocado. */
export function payloadJuizoDigital(processoBruto: Record<string, unknown>, juizoDigital: boolean) {
  return { ...processoBruto, juizoDigital };
}

export const TIPO_ATIVIDADE_PRAZO = { id: 24, descricao: 'Prazo', descricaoConsulta: 'PRAZO' } as const;

export interface DadosGigs {
  idProcesso: number;
  texto: string;
  /** Com prazo, as duas datas (AAAA-MM-DD); sem prazo (0), nenhuma. */
  prazo?: { dataInicio: string; dataFim: string };
}

export function payloadGigs(d: DadosGigs) {
  return {
    tipoAtividade: { ...TIPO_ATIVIDADE_PRAZO },
    ...(d.prazo ? { dataInicioPrazo: d.prazo.dataInicio, dataPrazo: d.prazo.dataFim } : {}),
    observacao: d.texto,
    destaque: false,
    tipoDiaPrazo: 'U',
    // O PJe envia o id do processo como texto neste endpoint.
    idProcesso: String(d.idProcesso),
  };
}

/** Resposta do `retorna-prazo`: `{ "DATA": "2026-10-20T00:00:00" }` → "2026-10-20". */
export function lerRetornaPrazo(dados: unknown): string | undefined {
  const data = (dados as { DATA?: unknown } | null)?.DATA;
  return typeof data === 'string' && /^\d{4}-\d{2}-\d{2}/.test(data) ? data.slice(0, 10) : undefined;
}
