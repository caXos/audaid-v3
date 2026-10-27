// Textos das linhas de mensagem do formulário (§5, layout estável: só o texto muda). Puro, para o
// Individual e o Lote usarem os mesmos textos e regras.

import type { EstadoPasso } from '../fluxo/executor';
import type { EventoCalendario, Sala } from '../pje/api';
import { classificarData, hoje } from '../regras/calendario';
import { ocupanteDoMinuto, type EntradaPauta } from '../regras/pauta';

export type ClasseMensagem = 'suave' | 'ok' | 'avisa' | 'bloqueia' | 'erro' | 'carregando';

export interface Mensagem {
  classe: ClasseMensagem;
  texto: string;
}

/** Mensagem da linha + o que ela impede de enviar. */
export interface Avaliacao {
  msg: Mensagem;
  pendencias: string[];
}

export const nomeSala = (s: Sala) => s.nome ?? s.descricao ?? String(s.id);

export function resumoPauta(entradas: EntradaPauta[]): string {
  if (!entradas.length) return 'Pauta do dia vazia nesta sala.';
  const vagas = entradas.filter((e) => e.tipo === 'vaga').length;
  return `Pauta do dia: ${entradas.length - vagas} audiência(s), ${vagas} vaga(s).`;
}

/** Data (D34, D34c): bloqueio do calendário do órgão, aviso de prazo suspenso, data no passado. */
export function avaliarData(data: string | null, eventos: EventoCalendario[], dataDeHoje: string = hoje()): Avaliacao {
  if (!data) return { msg: { classe: 'suave', texto: '' }, pendencias: ['Escolha a data.'] };
  const c = classificarData(data, eventos);
  if (c.nivel === 'bloqueia') {
    return {
      msg: { classe: 'bloqueia', texto: `Data bloqueada: ${c.bloqueios.join('; ')}.` },
      pendencias: ['A data está bloqueada pelo calendário do órgão.'],
    };
  }
  if (c.nivel === 'avisa') return { msg: { classe: 'avisa', texto: `Atenção: ${c.avisos.join('; ')}. Dá para designar.` }, pendencias: [] };
  if (data < dataDeHoje) return { msg: { classe: 'avisa', texto: 'Data no passado.' }, pendencias: [] };
  return { msg: { classe: 'ok', texto: 'Dia útil, sem evento no calendário.' }, pendencias: [] };
}

export interface SituacaoPauta {
  /** Sala e data escolhidas (sem elas, a pauta nem é consultada). */
  escolhidas: boolean;
  entradas?: EntradaPauta[];
  erro?: string;
}

/** Horário (D28, D33): conferência na pauta do dia; vaga conta como livre. */
export function avaliarHorario(hora: string | null, pauta: SituacaoPauta, idProcesso: number): Avaliacao {
  const pendencias: string[] = hora ? [] : ['Escolha o horário.'];
  const msg = (classe: ClasseMensagem, texto: string, pendencia?: string): Avaliacao => ({
    msg: { classe, texto },
    pendencias: pendencia ? [...pendencias, pendencia] : pendencias,
  });
  const { entradas } = pauta;
  if (!pauta.escolhidas) return msg('suave', 'Escolha sala e data: a pauta do dia é consultada na hora.');
  if (pauta.erro) return msg('erro', pauta.erro, 'Não foi possível conferir a pauta.');
  if (!entradas) return msg('carregando', 'Consultando a pauta do dia…', 'Aguarde a consulta da pauta.');
  if (!hora) return msg('suave', `${resumoPauta(entradas)} Escolha o horário na pauta ou digite.`);
  const ocupante = ocupanteDoMinuto(entradas, hora, idProcesso);
  if (ocupante) {
    return msg(
      'erro',
      `${hora} já está ocupado pelo processo ${ocupante.nrProcesso ?? ocupante.idProcesso}: o PJe recusaria (PJE-064). Escolha outro horário na pauta ou digite outro.`,
      'O horário está ocupado.',
    );
  }
  if (entradas.some((e) => e.tipo === 'vaga' && e.hora === hora)) return msg('ok', `${hora}: vaga configurada na sala, pode usar.`);
  return msg('ok', `${hora} está livre na sala. ${resumoPauta(entradas)}`);
}

/** Selo de cada passo da execução. */
export const ROTULO_ESTADO: Record<EstadoPasso, string> = {
  ok: 'OK',
  simulado: 'SIMULADO',
  aviso: 'ATENÇÃO',
  erro: 'ERRO',
};
