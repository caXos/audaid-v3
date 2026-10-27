// O que o Controle Individual lê do PJe ao abrir: processo, audiências, tipos, salas e calendário
// do órgão logado (§2.2).

import type { Ambiente } from '../pje/ambiente';
import { caminhos, type Audiencia, type EventoCalendario, type Processo, type Sala, type TipoAudiencia } from '../pje/api';
import { pjeGet, type Resposta } from '../pje/http';
import { lerSessao } from '../pje/sessao';

export interface Dados {
  processoBruto: Record<string, unknown>;
  processo: Processo;
  audiencias: Audiencia[];
  tipos: TipoAudiencia[];
  salas: Sala[];
  eventos: EventoCalendario[];
  idOrgaoLogado: number;
  descricaoOrgaoLogado: string;
  /** Nome do usuário (JWT), para `{usuario}`/`{eu}` no GIGS (D43). */
  nomeUsuario?: string;
  /** Audiência do órgão logado que seria substituída (D32). */
  antiga?: Audiencia;
}

export type Carregamento = { ok: true; dados: Dados } | { ok: false; mensagem: string };

export async function carregarDados(ambiente: Ambiente, idProcesso: number): Promise<Carregamento> {
  const sessao = lerSessao(document.cookie);
  if (!sessao.orgaoLogado) {
    return {
      ok: false,
      mensagem: 'Não foi possível identificar o órgão em que você está logado (o token do PJe não está legível). Recarregue o PJe e tente de novo.',
    };
  }
  const oj = sessao.orgaoLogado;
  const get = <T>(c: string) => pjeGet<T>(ambiente.origem + c, { xsrfToken: lerSessao(document.cookie).xsrfToken });

  const [rProc, rAud, rTipos, rSalas, rCal] = await Promise.all([
    get<Record<string, unknown>>(caminhos.processo(idProcesso)),
    get<Audiencia[]>(caminhos.audiencias(idProcesso)),
    get<TipoAudiencia[]>(caminhos.tiposAudiencia()),
    get<Sala[]>(caminhos.salas(oj.id)),
    get<EventoCalendario[]>(caminhos.calendario(oj.id)),
  ]);

  if (!rProc.ok || !rAud.ok || !rTipos.ok || !rSalas.ok || !rCal.ok) {
    const falhas = (
      [
        ['dados do processo', rProc],
        ['audiências', rAud],
        ['tipos de audiência', rTipos],
        ['salas', rSalas],
        ['calendário', rCal],
      ] as [string, Resposta<unknown>][]
    ).filter(([, r]) => !r.ok);
    return {
      ok: false,
      mensagem: `Não foi possível carregar: ${falhas.map(([n, r]) => `${n} (${r.ok ? '' : r.erro.mensagem})`).join('; ')}. Recarregue o PJe e tente de novo.`,
    };
  }

  const processo = rProc.dados as unknown as Processo;
  const audiencias = [...rAud.dados].sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
  return {
    ok: true,
    dados: {
      processoBruto: rProc.dados,
      processo,
      audiencias,
      tipos: rTipos.dados,
      salas: rSalas.dados,
      eventos: rCal.dados,
      idOrgaoLogado: oj.id,
      descricaoOrgaoLogado: oj.descricao,
      nomeUsuario: sessao.nomeUsuario,
      antiga: audiencias.find((a) => a.salaFisica?.orgaoJulgador?.id === oj.id && a.status === 'Designada'),
    },
  };
}
