// Entrega 0 da 3.2: a prova técnica da Pauta, SÓ DE LEITURA (D86b). Nada aqui grava no PJe.
// Responde, para o órgão logado e para outro órgão do usuário:
// - os perfis dizem quais são os órgãos do usuário (`token/perfis`, D87b)?
// - o AUD4 lista os órgãos com a cidade (`audpje/oj`), chamado de uma página `pjekz/*`?
// - as salas, o calendário, o mês e a pauta do dia de OUTRO órgão respondem, com a sessão do logado?
// - o que o mês da sala diz de cada dia (para pular os dias sem pauta, D92)?
// - o `audpje/pautas` traz o órgão inteiro num período (para "Todas as salas", D92)?
// O relatório leva a forma das respostas (campos e tipos), sem nomes de partes e sem tokens.

import { caminhos, type EventoCalendario, type ItemPauta, type PautaDia, type Sala } from '../pje/api';
import type { Resposta } from '../pje/http';
import { lerAud4, resumo, type LeitorPauta } from './dados';
import { diaDaSemana } from '../regras/calendario';
import { formatarData } from '../ui/dom';
import {
  camposSimples,
  entradaDoDia,
  formaDe,
  lerOrgaosDoTribunal,
  orgaosDosPerfis,
  proximosDiasUteis,
  somarDias,
  type OrgaoDoPerfil,
  type OrgaoDoTribunal,
} from './forma';

export type EstadoPasso = 'ok' | 'aviso' | 'erro';

export interface PassoDiagnostico {
  chave: string;
  titulo: string;
  estado: EstadoPasso;
  linhas: string[];
}

export type { LeitorPauta };

/** Quantos dias úteis da pauta do dia são lidos por órgão, a partir de hoje. */
export const DIAS_LIDOS = 8;
/** O período pedido ao `audpje/pautas`, em dias corridos a partir de hoje. */
export const PERIODO_AUD4 = 30;

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const ehObjeto = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export interface ResultadoGeral {
  passos: PassoDiagnostico[];
  /** Os órgãos dos perfis, já com o nome do `audpje/oj` quando o perfil não o traz. */
  orgaos: OrgaoDoPerfil[];
  tribunal: OrgaoDoTribunal[];
}

/** Perfis e órgãos do tribunal: uma vez por diagnóstico. */
export async function diagnosticoGeral(ler: LeitorPauta, idLogado: number): Promise<ResultadoGeral> {
  const passos: PassoDiagnostico[] = [];

  const rPerfis = await ler<unknown>(caminhos.perfis());
  let orgaos: OrgaoDoPerfil[] = [];
  if (rPerfis.ok) {
    orgaos = orgaosDosPerfis(rPerfis.dados);
    const temLogado = orgaos.some((o) => o.id === idLogado);
    passos.push({
      chave: 'perfis',
      titulo: 'Perfis do usuário (token/perfis)',
      estado: orgaos.length > 1 && temLogado ? 'ok' : 'aviso',
      linhas: [
        resumo(rPerfis),
        `forma: ${formaDe(rPerfis.dados)}`,
        `${orgaos.length} órgão(s) distinto(s): ${orgaos.map((o) => o.id).join(', ') || 'nenhum'}`,
        `inclui o órgão logado (${idLogado}): ${temLogado ? 'sim' : 'NÃO'}`,
      ],
    });
  } else {
    passos.push({ chave: 'perfis', titulo: 'Perfis do usuário (token/perfis)', estado: 'erro', linhas: [resumo(rPerfis)] });
  }

  const { r: rOj, linhas } = await lerAud4<unknown>(ler, caminhos.orgaosDoTribunal());
  let tribunal: OrgaoDoTribunal[] = [];
  if (rOj.ok) {
    tribunal = lerOrgaosDoTribunal(rOj.dados);
    const doTribunal = (id: number) => tribunal.find((t) => t.id === id);
    passos.push({
      chave: 'oj',
      titulo: 'Órgãos do tribunal, com a cidade (AUD4: audpje/oj)',
      estado: tribunal.length ? 'ok' : 'aviso',
      linhas: [
        ...linhas,
        `${tribunal.length} órgão(s) · forma: ${formaDe(rOj.dados)}`,
        ...orgaos.map((o) => `órgão ${o.id}: ${doTribunal(o.id)?.sigla ?? '?'} · cidade: ${doTribunal(o.id)?.municipio ?? '?'}`),
      ],
    });
  } else {
    passos.push({ chave: 'oj', titulo: 'Órgãos do tribunal, com a cidade (AUD4: audpje/oj)', estado: 'erro', linhas });
  }

  // O nome do órgão, para escolher o "outro": do perfil ou, se ele não trouxer, do AUD4.
  orgaos = orgaos.map((o) => {
    const t = tribunal.find((x) => x.id === o.id);
    return o.descricao || !t ? o : { ...o, descricao: t.nome };
  });
  return { passos, orgaos, tribunal };
}

/** Os campos do órgão na sala (`codigoOrigem`, `sigla`, `cejusc`…), que são públicos (D87b). */
function codigosDoOrgao(salas: Sala[]): string | undefined {
  const oj = (salas[0] as unknown as { orgaoJulgador?: unknown } | undefined)?.orgaoJulgador;
  if (!ehObjeto(oj)) return undefined;
  const campo = (k: string) => (oj[k] === undefined ? '?' : String(oj[k]));
  return `id=${campo('id')} · sigla=${campo('sigla')} · codigoOrigem=${campo('codigoOrigem')} · cejusc=${campo('cejusc')}`;
}

function linhaDoDia(dia: string, r: Resposta<PautaDia>, idOrgao: number, mes: unknown): { linha: string; outroOrgao: boolean } {
  const rotulo = `${SEMANA[diaDaSemana(dia)]} ${formatarData(dia).slice(0, 5)}`;
  const doMes = mes === undefined ? '' : ` · o mês diz ${camposSimples(entradaDoDia(mes, dia))}`;
  if (!r.ok) return { linha: `${rotulo}: ${resumo(r)}${doMes}`, outroOrgao: false };
  const itens: ItemPauta[] = Array.isArray(r.dados?.pautasDoDia) ? r.dados.pautasDoDia : [];
  const audiencias = itens.filter((i) => i.idProcesso);
  const orgaos = [...new Set(audiencias.map((a) => a.processo?.orgaoJulgador?.id).filter((id): id is number => typeof id === 'number'))];
  const outroOrgao = orgaos.some((id) => id !== idOrgao);
  const deQuem = orgaos.length ? ` · órgão dos processos: ${orgaos.join(', ')}${outroOrgao ? ' (DIFERENTE do pedido)' : ''}` : '';
  return {
    linha: `${rotulo}: ${resumo(r)} · ${itens.length} entrada(s): ${audiencias.length} audiência(s), ${itens.length - audiencias.length} vaga(s)${deQuem}${doMes}`,
    outroOrgao,
  };
}

/**
 * Salas, calendário, mês, pauta do dia e `audpje/pautas` de um órgão. `emitir` recebe cada passo
 * assim que ele termina; `ativo` falso interrompe (o diagnóstico foi fechado ou recomeçado).
 */
export async function diagnosticoOrgao(
  ler: LeitorPauta,
  orgao: { id: number; rotulo: string },
  hojeIso: string,
  emitir: (p: PassoDiagnostico) => void,
  ativo: () => boolean = () => true,
): Promise<void> {
  const { id, rotulo } = orgao;
  const chave = (k: string) => `${id}-${k}`;

  // Salas
  const rSalas = await ler<Sala[]>(caminhos.salas(id));
  if (!ativo()) return;
  const salas: Sala[] = rSalas.ok && Array.isArray(rSalas.dados) ? rSalas.dados : [];
  if (!rSalas.ok) {
    emitir({ chave: chave('salas'), titulo: `${rotulo}: salas`, estado: 'erro', linhas: [resumo(rSalas)] });
    return;
  }
  const idsDasSalas = [...new Set(salas.map((s) => (s as unknown as { orgaoJulgador?: { id?: unknown } }).orgaoJulgador?.id))];
  const dizOrgao = idsDasSalas.every((v) => typeof v === 'number');
  const sohDeste = dizOrgao && idsDasSalas.every((v) => v === id);
  const codigos = codigosDoOrgao(salas);
  emitir({
    chave: chave('salas'),
    titulo: `${rotulo}: salas`,
    estado: salas.length && (!dizOrgao || sohDeste) ? 'ok' : 'aviso',
    linhas: [
      `${resumo(rSalas)} · ${salas.length} sala(s): ${salas.map((s) => s.id).join(', ') || 'nenhuma'}`,
      `forma: ${formaDe(rSalas.dados)}`,
      !salas.length
        ? 'sem salas'
        : !dizOrgao
          ? 'as salas não dizem de que órgão são'
          : sohDeste
            ? 'as salas são deste órgão: sim'
            : `as salas são deste órgão: NÃO (vieram de ${idsDasSalas.join(', ')})`,
      ...(codigos ? [`órgão nas salas: ${codigos}`] : []),
    ],
  });
  const sala = salas[0];
  if (!sala) return;

  // Calendário
  const rCal = await ler<EventoCalendario[]>(caminhos.calendario(id));
  if (!ativo()) return;
  emitir({
    chave: chave('calendario'),
    titulo: `${rotulo}: calendário`,
    estado: rCal.ok ? 'ok' : 'erro',
    linhas: [rCal.ok ? `${resumo(rCal)} · ${Array.isArray(rCal.dados) ? rCal.dados.length : '?'} evento(s)` : resumo(rCal)],
  });

  // O mês da sala, para cada mês dos dias lidos
  const dias = proximosDiasUteis(hojeIso, DIAS_LIDOS);
  const meses = [...new Set(dias.map((d) => d.slice(0, 7)))];
  const dadosDoMes = new Map<string, unknown>();
  const linhasMes: string[] = [];
  let mesOk = true;
  for (const am of meses) {
    const [ano, mes] = am.split('-').map(Number);
    const r = await ler<unknown>(caminhos.pautaMes(sala.id, ano!, mes!));
    if (!ativo()) return;
    if (r.ok) dadosDoMes.set(am, r.dados);
    else mesOk = false;
    linhasMes.push(`${am} (sala ${sala.id}): ${resumo(r)}${r.ok ? ` · forma: ${formaDe(r.dados)}` : ''}`);
  }
  emitir({ chave: chave('mes'), titulo: `${rotulo}: o mês da sala (classificacoes?idSala=&ano=&mes=)`, estado: mesOk ? 'ok' : 'erro', linhas: linhasMes });

  // A pauta de cada dia, ao lado do que o mês diz dele
  const linhasDias: string[] = [];
  let algumOk = false;
  let deOutroOrgao = false;
  for (const dia of dias) {
    const r = await ler<PautaDia>(caminhos.pautaDia(sala.id, dia));
    if (!ativo()) return;
    algumOk ||= r.ok;
    const { linha, outroOrgao } = linhaDoDia(dia, r, id, dadosDoMes.get(dia.slice(0, 7)));
    deOutroOrgao ||= outroOrgao;
    linhasDias.push(linha);
  }
  emitir({
    chave: chave('dias'),
    titulo: `${rotulo}: pauta do dia, sala ${sala.id} (classificacoes/dia)`,
    estado: !algumOk ? 'erro' : deOutroOrgao ? 'aviso' : 'ok',
    linhas: linhasDias,
  });

  // O órgão inteiro num período (AUD4)
  const fim = somarDias(hojeIso, PERIODO_AUD4);
  const { r: rPer, linhas } = await lerAud4<unknown>(ler, caminhos.pautasDoOrgao(id, hojeIso, fim));
  if (!ativo()) return;
  const n = rPer.ok ? (Array.isArray(rPer.dados) ? String(rPer.dados.length) : 'não é lista') : '';
  emitir({
    chave: chave('aud4'),
    titulo: `${rotulo}: audiências do órgão de ${formatarData(hojeIso)} a ${formatarData(fim)} (AUD4: audpje/pautas)`,
    estado: rPer.ok ? 'ok' : 'erro',
    linhas: [...linhas, ...(rPer.ok ? [`itens: ${n} · forma: ${formaDe(rPer.dados)}`] : [])],
  });
}

/** O relatório em texto, para copiar e devolver. */
export function textoDoRelatorio(cabecalho: string[], passos: PassoDiagnostico[]): string {
  const rotulo: Record<EstadoPasso, string> = { ok: 'OK', aviso: 'ATENÇÃO', erro: 'ERRO' };
  return [...cabecalho, ...passos.flatMap((p) => ['', `## ${p.titulo} [${rotulo[p.estado]}]`, ...p.linhas.map((l) => `- ${l}`)])].join('\n');
}
