// Executor da designação/redesignação do Controle Individual (§2.2 do blueprint).
//
// Passos: conferir data → conferir pauta → (retirar 100% Digital) → designar ou redesignar →
// (recolocar 100% Digital, SEMPRE) → (GIGS). Quem fala com o PJe é um Transporte: o real, o
// simulado ou o falso dos testes.

import { caminhos, type Audiencia, type EventoCalendario, type PautaDia } from '../pje/api';
import {
  caminhosEscrita,
  lerRetornaPrazo,
  payloadDesignar,
  payloadGigs,
  payloadJuizoDigital,
  payloadRedesignar,
} from '../pje/escrita';
import { CODIGO_HORARIO_OCUPADO, pjeEnviar, pjeGet, type ErroPje, type Resposta } from '../pje/http';
import { classificarData } from '../regras/calendario';
import { lerPauta, ocupanteDoMinuto } from '../regras/pauta';

/**
 * Trava da entrega 3: enquanto for `false`, NENHUMA requisição de escrita sai, mesmo com o modo
 * simulação desligado. A entrega 4 libera, depois da conferência dos payloads.
 */
export const ESCRITA_LIBERADA = false;

export interface Requisicao {
  metodo: 'GET' | 'POST' | 'PUT';
  /** Caminho relativo à origem do PJe. */
  caminho: string;
  corpo?: unknown;
}

export type RespostaTransporte =
  | { ok: true; status: number; dados: unknown; simulado?: boolean }
  | { ok: false; status: number; erro: ErroPje };

export interface Transporte {
  enviar(requisicao: Requisicao): Promise<RespostaTransporte>;
  /** Se as escritas são de mentira (simulação ou trava). */
  readonly simulando: boolean;
}

function adaptar(r: Resposta<unknown>): RespostaTransporte {
  return r.ok ? { ok: true, status: r.status, dados: r.dados } : { ok: false, status: r.status, erro: r.erro };
}

/**
 * Transporte do PJe: leituras sempre de verdade; escritas só se `simular` for falso E a trava
 * estiver liberada. O token XSRF é lido na hora de cada envio.
 */
export function transportePje(origem: string, lerXsrf: () => string | undefined, simular: boolean): Transporte {
  const simulando = simular || !ESCRITA_LIBERADA;
  return {
    simulando,
    async enviar(req) {
      const url = origem + req.caminho;
      if (req.metodo === 'GET') return adaptar(await pjeGet(url, { xsrfToken: lerXsrf() }));
      if (simulando) return { ok: true, status: 0, dados: null, simulado: true };
      return adaptar(await pjeEnviar(req.metodo, url, req.corpo, { xsrfToken: lerXsrf() }));
    },
  };
}

// ── Pedido e resultado ────────────────────────────────────────────────────────────────────

export interface AudienciaAntiga {
  id: number;
  /** "2026-10-20T10:10:00" */
  dataInicio: string;
  descricaoTipo: string;
  nomeSala: string;
}

export interface PedidoDesignacao {
  idProcesso: number;
  idOrgaoLogado: number;
  /** O objeto do GET do processo, inteiro: é o corpo do PUT do 100% Digital (D31d). */
  processoBruto: Record<string, unknown>;
  juizoDigital: boolean;
  /** Audiência do órgão logado que será substituída (redesignação, D32). */
  antiga?: AudienciaAntiga;
  idSala: number;
  /** AAAA-MM-DD */
  data: string;
  /** HH:MM */
  hora: string;
  idTipoAudiencia: number;
  ehJulgamento: boolean;
  /** Texto já com as variáveis resolvidas. */
  gigs?: { texto: string; prazo: number };
  eventos: EventoCalendario[];
  /** AAAA-MM-DD: início do prazo do GIGS. */
  hoje: string;
}

export type EstadoPasso = 'ok' | 'simulado' | 'aviso' | 'erro';

export interface RegistroPasso {
  titulo: string;
  estado: EstadoPasso;
  requisicao?: Requisicao;
  detalhe?: string;
  erro?: ErroPje;
}

export type AcaoSugerida = 'escolher-outro-horario' | 'redesignar-antiga' | 'gigs-audiencia-perdida';

export interface ResultadoExecucao {
  /** `parcial`: a audiência foi designada, mas algo depois dela falhou (100% Digital ou GIGS). */
  desfecho: 'sucesso' | 'simulado' | 'parcial' | 'falha';
  resumo: string;
  passos: RegistroPasso[];
  acoes: AcaoSugerida[];
}

// ── Execução ──────────────────────────────────────────────────────────────────────────────

const comecaEm = (a: { dataInicio?: string }, data: string, hora: string) =>
  typeof a.dataInicio === 'string' && a.dataInicio.startsWith(`${data}T${hora}`);

export async function executarDesignacao(
  p: PedidoDesignacao,
  t: Transporte,
  aoPasso?: (passos: RegistroPasso[]) => void,
): Promise<ResultadoExecucao> {
  const passos: RegistroPasso[] = [];
  const registrar = (r: RegistroPasso) => {
    passos.push(r);
    aoPasso?.([...passos]);
  };
  const falha = (resumo: string, acoes: AcaoSugerida[] = []): ResultadoExecucao => ({ desfecho: 'falha', resumo, passos, acoes });
  const estadoEscrita = (r: RespostaTransporte): EstadoPasso => (r.ok && r.simulado ? 'simulado' : 'ok');

  // 0. Data (D34, D34c): conferida de novo na hora do envio.
  const cls = classificarData(p.data, p.eventos);
  if (cls.nivel === 'bloqueia') {
    registrar({ titulo: 'Conferir a data', estado: 'erro', detalhe: `Data bloqueada: ${cls.bloqueios.join('; ')}.` });
    return falha('Data bloqueada pelo calendário do órgão. Nada foi alterado.');
  }
  registrar({
    titulo: 'Conferir a data',
    estado: cls.nivel === 'avisa' ? 'aviso' : 'ok',
    detalhe: cls.nivel === 'avisa' ? `Atenção: ${cls.avisos.join('; ')}.` : 'Dia útil, sem evento no calendário.',
  });

  // 1. Pauta do dia (D9, D28): ninguém pode começar no mesmo minuto.
  const reqPauta: Requisicao = { metodo: 'GET', caminho: caminhos.pautaDia(p.idSala, p.data) };
  const rPauta = await t.enviar(reqPauta);
  if (!rPauta.ok) {
    registrar({ titulo: 'Conferir a pauta do dia', estado: 'erro', requisicao: reqPauta, erro: rPauta.erro });
    return falha('Não foi possível conferir a pauta. Nada foi alterado.');
  }
  const ocupante = ocupanteDoMinuto(lerPauta(rPauta.dados as PautaDia), p.hora, p.idProcesso);
  if (ocupante) {
    registrar({
      titulo: 'Conferir a pauta do dia',
      estado: 'erro',
      requisicao: reqPauta,
      detalhe: `${p.hora} já está ocupado pelo processo ${ocupante.nrProcesso ?? ocupante.idProcesso}.`,
    });
    return falha('Horário ocupado. Nada foi alterado.', ['escolher-outro-horario']);
  }
  registrar({ titulo: 'Conferir a pauta do dia', estado: 'ok', requisicao: reqPauta, detalhe: `${p.hora} está livre na sala.` });

  // 2. Retirar o 100% Digital (D26): só para Julgamento em processo 100% Digital.
  const precisaAlternar = p.juizoDigital && p.ehJulgamento;
  if (precisaAlternar) {
    const req: Requisicao = { metodo: 'PUT', caminho: caminhosEscrita.juizoDigital(p.idProcesso), corpo: payloadJuizoDigital(p.processoBruto, false) };
    const r = await t.enviar(req);
    if (!r.ok) {
      registrar({ titulo: 'Retirar o Juízo 100% Digital', estado: 'erro', requisicao: req, erro: r.erro });
      return falha('Não foi possível retirar o Juízo 100% Digital. Nada foi alterado.');
    }
    registrar({ titulo: 'Retirar o Juízo 100% Digital', estado: estadoEscrita(r), requisicao: req });
  }

  // 3. Designar ou redesignar (D32).
  const dados = { idProcesso: p.idProcesso, idTipoAudiencia: p.idTipoAudiencia, idSalaFisica: p.idSala, data: p.data, hora: p.hora };
  const reqAud: Requisicao = p.antiga
    ? { metodo: 'PUT', caminho: caminhosEscrita.redesignar(), corpo: payloadRedesignar({ ...dados, idAudienciaAntiga: p.antiga.id }) }
    : { metodo: 'POST', caminho: caminhosEscrita.designar(), corpo: payloadDesignar(dados) };
  const tituloAud = p.antiga ? 'Redesignar a audiência' : 'Designar a audiência';
  const rAud = await t.enviar(reqAud);

  let designou = false;
  let resumoFalha = '';
  const acoes: AcaoSugerida[] = [];

  if (rAud.ok && rAud.simulado) {
    registrar({ titulo: tituloAud, estado: 'simulado', requisicao: reqAud });
    designou = true;
  } else if (rAud.ok && confereAudienciaNova(rAud.dados, p)) {
    registrar({ titulo: tituloAud, estado: 'ok', requisicao: reqAud, detalhe: `Audiência ${(rAud.dados as Audiencia).id} criada.` });
    designou = true;
  } else {
    // Falhou, ou o POST respondeu 200 devolvendo a audiência que já existia (D9b).
    const erro: ErroPje = rAud.ok
      ? { mensagem: 'O PJe respondeu sem designar: devolveu outra audiência (provavelmente a que já existia).' }
      : rAud.erro;
    registrar({ titulo: tituloAud, estado: 'erro', requisicao: reqAud, erro });

    // D32b: em vez de supor, reconsulta e decide pelo estado real.
    const reqLista: Requisicao = { metodo: 'GET', caminho: caminhos.audiencias(p.idProcesso) };
    const rLista = await t.enviar(reqLista);
    const diag = diagnosticarFalha(rLista.ok ? (rLista.dados as Audiencia[]) : undefined, p);
    registrar({ titulo: 'Conferir as audiências do processo depois da falha', estado: diag.estado, requisicao: reqLista, detalhe: diag.detalhe });
    designou = diag.designou;
    resumoFalha = diag.resumo;
    acoes.push(...diag.acoes);
    if (!designou && erro.codigoErro === CODIGO_HORARIO_OCUPADO) acoes.push('escolher-outro-horario');
  }

  // 4. Recolocar o 100% Digital: SEMPRE, mesmo se o passo 3 falhou (D26).
  let pendencia = '';
  if (precisaAlternar) {
    const req: Requisicao = { metodo: 'PUT', caminho: caminhosEscrita.juizoDigital(p.idProcesso), corpo: payloadJuizoDigital(p.processoBruto, true) };
    const r = await t.enviar(req);
    if (!r.ok) {
      pendencia = 'ATENÇÃO: o processo ficou SEM o Juízo 100% Digital. Recoloque pela tela Retificar do PJe.';
      registrar({ titulo: 'Recolocar o Juízo 100% Digital', estado: 'erro', requisicao: req, erro: r.erro, detalhe: pendencia });
    } else {
      registrar({ titulo: 'Recolocar o Juízo 100% Digital', estado: estadoEscrita(r), requisicao: req });
    }
  }

  if (!designou) return falha([resumoFalha || 'A audiência não foi designada.', pendencia].filter(Boolean).join(' '), acoes);

  // 5. GIGS (D29): só depois da audiência designada.
  if (p.gigs) {
    let prazo: { dataInicio: string; dataFim: string } | undefined;
    let gigsOk = true;
    if (p.gigs.prazo > 0) {
      const reqPrazo: Requisicao = { metodo: 'GET', caminho: caminhosEscrita.retornaPrazo(p.gigs.prazo, p.idOrgaoLogado, p.hoje) };
      const rPrazo = await t.enviar(reqPrazo);
      const dataFim = rPrazo.ok ? lerRetornaPrazo(rPrazo.dados) : undefined;
      if (!dataFim) {
        gigsOk = false;
        registrar({
          titulo: 'Calcular o prazo do GIGS',
          estado: 'erro',
          requisicao: reqPrazo,
          erro: rPrazo.ok ? { mensagem: 'Resposta do retorna-prazo sem data.' } : rPrazo.erro,
          detalhe: 'O GIGS não foi lançado. Lance pela tela do PJe.',
        });
      } else {
        prazo = { dataInicio: p.hoje, dataFim };
        registrar({ titulo: 'Calcular o prazo do GIGS', estado: 'ok', requisicao: reqPrazo, detalhe: `${p.gigs.prazo} dia(s) útil(eis): vence em ${dataFim}.` });
      }
    }
    if (gigsOk) {
      const req: Requisicao = { metodo: 'POST', caminho: caminhosEscrita.gigs(), corpo: payloadGigs({ idProcesso: p.idProcesso, texto: p.gigs.texto, prazo }) };
      const r = await t.enviar(req);
      if (!r.ok) {
        gigsOk = false;
        registrar({ titulo: 'Lançar o GIGS', estado: 'erro', requisicao: req, erro: r.erro, detalhe: 'O GIGS não foi lançado. Lance pela tela do PJe.' });
      } else {
        registrar({ titulo: 'Lançar o GIGS', estado: estadoEscrita(r), requisicao: req });
      }
    }
    if (!gigsOk) pendencia = [pendencia, 'O GIGS não foi lançado.'].filter(Boolean).join(' ');
  }

  if (t.simulando) {
    const resumo = `Simulação concluída: nada foi gravado no PJe.${pendencia ? ` Mas: ${pendencia}` : ''}`;
    return { desfecho: 'simulado', resumo, passos, acoes };
  }
  if (pendencia) return { desfecho: 'parcial', resumo: `Audiência ${p.antiga ? 'redesignada' : 'designada'}, mas: ${pendencia}`, passos, acoes };
  return { desfecho: 'sucesso', resumo: `Audiência ${p.antiga ? 'redesignada' : 'designada'} com sucesso.`, passos, acoes };
}

/** A resposta é mesmo a audiência nova (e não a antiga devolvida pelo PJe, D9b)? */
export function confereAudienciaNova(dados: unknown, p: Pick<PedidoDesignacao, 'data' | 'hora' | 'antiga'>): boolean {
  const a = dados as Partial<Audiencia> | null;
  if (!a || typeof a !== 'object' || !comecaEm(a, p.data, p.hora)) return false;
  return !p.antiga || a.id !== p.antiga.id;
}

interface Diagnostico {
  designou: boolean;
  estado: EstadoPasso;
  detalhe: string;
  resumo: string;
  acoes: AcaoSugerida[];
}

/** D32b: decide pelo estado real das audiências depois de uma falha. */
export function diagnosticarFalha(audiencias: Audiencia[] | undefined, p: Pick<PedidoDesignacao, 'data' | 'hora' | 'antiga' | 'idOrgaoLogado'>): Diagnostico {
  if (!audiencias) {
    return {
      designou: false,
      estado: 'erro',
      detalhe: 'Não foi possível reconsultar as audiências.',
      resumo: 'A audiência não foi designada, e não deu para conferir o estado do processo: confira no PJe.',
      acoes: [],
    };
  }
  const doOrgao = audiencias.filter((a) => a.salaFisica?.orgaoJulgador?.id === p.idOrgaoLogado);
  if (doOrgao.some((a) => comecaEm(a, p.data, p.hora) && a.id !== p.antiga?.id)) {
    return {
      designou: true,
      estado: 'ok',
      detalhe: 'A audiência nova está no processo: a designação deu certo, apesar da resposta.',
      resumo: '',
      acoes: [],
    };
  }
  if (!p.antiga) {
    return { designou: false, estado: 'aviso', detalhe: 'Nenhuma audiência nova: nada mudou no processo.', resumo: 'A audiência não foi designada. Nada mudou no processo.', acoes: [] };
  }
  if (audiencias.some((a) => a.id === p.antiga?.id)) {
    return { designou: false, estado: 'aviso', detalhe: 'A audiência antiga continua no processo: nada mudou.', resumo: 'A audiência não foi redesignada. A antiga continua valendo.', acoes: [] };
  }
  return {
    designou: false,
    estado: 'erro',
    detalhe: `A audiência antiga (${p.antiga.dataInicio.replace('T', ' ').slice(0, 16)}, ${p.antiga.descricaoTipo}, ${p.antiga.nomeSala}) NÃO está mais no processo, e a nova também não.`,
    resumo: 'O processo ficou SEM audiência. Redesigne a antiga ou registre um GIGS com os dados dela.',
    acoes: ['redesignar-antiga', 'gigs-audiencia-perdida'],
  };
}
