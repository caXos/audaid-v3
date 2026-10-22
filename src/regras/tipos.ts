import type { TipoAudiencia } from '../pje/api';

/**
 * Descrições que o modelo composto (D6) monta, herdadas do `mapaTipos` da v2. Na v3 o ID nunca é
 * fixo: ele é resolvido procurando estas descrições em `dominio/tiposaudiencias`.
 */
export const DESCRICOES_CONHECIDAS = [
  'Conciliação em Conhecimento',
  'Conciliação em Conhecimento - Semana Nacional de Conciliação',
  'Conciliação em Conhecimento por videoconferência',
  'Conciliação em Conhecimento por videoconferência - Semana Nacional de Conciliação',
  'Conciliação em Execução',
  'Conciliação em Execução - Semana Nacional de Conciliação',
  'Conciliação em Execução - Semana Nacional de Execução',
  'Conciliação em Execução por videoconferência',
  'Conciliação em Execução por videoconferência - Semana Nacional de Conciliação',
  'Conciliação em Execução por videoconferência - Semana Nacional de Execução',
  'Encerramento de instrução',
  'Encerramento de instrução por videoconferência',
  'Inicial',
  'Inicial (rito sumaríssimo)',
  'Inicial por videoconferência',
  'Inicial por videoconferência (rito sumaríssimo)',
  'Inquirição de testemunha por videoconferência (juízo deprecado)',
  'Inquirição de testemunha (juízo deprecado)',
  'Instrução',
  'Instrução (rito sumaríssimo)',
  'Instrução por videoconferência',
  'Instrução por videoconferência (rito sumaríssimo)',
  'Julgamento',
  'Una',
  'Una (rito sumaríssimo)',
  'Una por videoconferência',
  'Una por videoconferência (rito sumaríssimo)',
] as const;

/** Compara descrições ignorando maiúsculas, acentos e espaços duplicados (há um "testemunha  por"). */
export function normalizarDescricao(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function resolverTipo(descricao: string, tipos: TipoAudiencia[]): TipoAudiencia | undefined {
  const alvo = normalizarDescricao(descricao);
  return tipos.find((t) => normalizarDescricao(t.descricao) === alvo);
}

export function conferirTiposConhecidos(tipos: TipoAudiencia[]): { encontradas: number; faltando: string[] } {
  const faltando = DESCRICOES_CONHECIDAS.filter((d) => !resolverTipo(d, tipos));
  return { encontradas: DESCRICOES_CONHECIDAS.length - faltando.length, faltando };
}
