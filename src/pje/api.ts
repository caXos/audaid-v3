// Endpoints de leitura (blueprint §3). Todos relativos à origem do ambiente.

export const caminhos = {
  processo: (id: number) => `/pje-comum-api/api/processos/id/${id}`,
  /** Número CNJ → id interno (tela 1 do Lote). Responde só o id, um número solto (teste de 27/10/2026). */
  processoPorNumero: (numero: string) => `/pje-comum-api/api/processos?numero=${encodeURIComponent(numero)}`,
  partes: (id: number) => `/pje-comum-api/api/processos/id/${id}/partes`,
  audiencias: (id: number) => `/pje-comum-api/api/processos/id/${id}/audiencias?status=M`,
  tiposAudiencia: () => `/pje-comum-api/api/dominio/tiposaudiencias`,
  salas: (idOrgao: number) => `/pje-comum-api/api/salasaudiencias?idOrgaoJulgador=${idOrgao}`,
  pautaDia: (idSala: number, data: string) =>
    `/pje-comum-api/api/pautasaudiencias/classificacoes/dia?idSalaAudiencia=${idSala}&data=${data}`,
  calendario: (idOrgao: number) => `/pje-comum-api/api/calendarioeventos?oj=${idOrgao}`,
};

export interface OrgaoJulgador {
  id: number;
  descricao: string;
  sigla?: string;
}

export interface Processo {
  id: number;
  numero: string;
  classeJudicial?: { sigla?: string; descricao?: string };
  orgaoJulgador?: OrgaoJulgador;
  juizoDigital?: boolean;
  faseProcessual?: string;
}

export interface TipoAudienciaResumo {
  id: number;
  descricao: string;
}

export interface Audiencia {
  id: number;
  dataInicio: string;
  dataFim?: string;
  status: string;
  tipo?: TipoAudienciaResumo;
  salaFisica?: { id: number; nome: string; orgaoJulgador?: OrgaoJulgador };
}

export interface TipoAudiencia {
  id: number;
  descricao: string;
  codigo?: string;
  isVirtual?: boolean;
}

export interface Sala {
  id: number;
  nome?: string;
  descricao?: string;
}

export interface EventoCalendario {
  id: number;
  descricao: string;
  abrangencia?: string;
  dataInicio: string;
  dataFim?: string;
  feriado?: boolean;
  judiciario?: boolean;
  suspendePrazo?: boolean;
  suspendeAudiencia?: boolean;
  suspendeInicioFimPrazo?: boolean;
}

export interface ItemPauta {
  idProcesso?: number;
  nrProcesso?: string;
  status?: string;
  tipo?: TipoAudienciaResumo;
  pautaAudienciaHorario?: { id?: number; horaInicial: string; horaFinal: string };
  bloqueado?: boolean;
  data?: string;
}

export interface PautaDia {
  dia: string;
  pautasDoDia: ItemPauta[];
}

/** Representante de uma parte (advogado, procurador…), como em `processos/id/{id}/partes`. */
export interface RepresentanteBruto {
  nome?: string;
  /** "ADVOGADO", … */
  tipo?: string;
  /** "Ativo", … */
  situacao?: string;
  idPessoa?: number;
  numeroOab?: string;
}

/** Parte do processo, como em `processos/id/{id}/partes` (captura de 19/10/2026). */
export interface ParteBruta {
  nome?: string;
  /** "AUTOR", "RÉU", "PERITO"… */
  tipo?: string;
  /** "Ativo", … */
  situacao?: string;
  /** Posição no polo, a partir de 1. */
  ordem?: number;
  idPessoa?: number;
  representantes?: RepresentanteBruto[];
}

export interface RespostaPartes {
  ATIVO?: ParteBruta[];
  PASSIVO?: ParteBruta[];
  TERCEIROS?: ParteBruta[];
}
