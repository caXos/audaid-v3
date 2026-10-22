// Endpoints de leitura usados na 3.0 (blueprint §3). Todos relativos à origem do ambiente.

export const caminhos = {
  processo: (id: number) => `/pje-comum-api/api/processos/id/${id}`,
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
