// As leituras da Pauta (3.2, §2.7), com um leitor injetado (os testes usam um PJe falso). Nada aqui
// grava no PJe. As leituras novas (perfis, AUD4) vêm da v1 e são lidas de forma defensiva até a
// prova técnica (D86b) confirmar a forma de cada resposta.

import { lerPartes } from '../regras/partes';
import { dicaAdvogados } from '../lote/apresentacao';
import { caminhos, type EventoCalendario, type PautaDia, type RespostaPartes, type Sala } from '../pje/api';
import type { Resposta } from '../pje/http';
import { lerPauta, type EntradaPauta } from '../regras/pauta';
import { FilaDeLeitura } from './fila';
import { lerOrgaosDoTribunal, orgaosDosPerfis } from './forma';
import { cidadeDoNome, codigoDoOrgao, ordenarOrgaos, type OrgaoPauta } from './orgaos';

/** Leitura no PJe, relativa à origem. `bearer` manda o `access_token` como Authorization (AUD4). */
export type LeitorPauta = <T>(caminho: string, opcoes?: { bearer?: boolean }) => Promise<Resposta<T>>;

export function resumo(r: Resposta<unknown>): string {
  return r.ok ? `${r.status} em ${r.ms} ms` : `ERRO ${r.status || 'rede'} em ${r.ms} ms: ${r.erro.mensagem}`;
}

/** AUD4: primeiro só com os cookies; se não vier JSON válido, de novo com o token como Bearer. */
export async function lerAud4<T>(ler: LeitorPauta, caminho: string): Promise<{ r: Resposta<T>; linhas: string[] }> {
  const soCookies = await ler<T>(caminho);
  if (soCookies.ok) return { r: soCookies, linhas: [`só com os cookies: ${resumo(soCookies)}`] };
  const comBearer = await ler<T>(caminho, { bearer: true });
  return { r: comBearer, linhas: [`só com os cookies: ${resumo(soCookies)}`, `com o token (Bearer): ${resumo(comBearer)}`] };
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export interface OrgaosDaPauta {
  orgaos: OrgaoPauta[];
  /** O que não deu para ler, em uma frase para o usuário. */
  avisos: string[];
}

/**
 * Os órgãos da Pauta (D87, D87b): os dos perfis (ou só o logado, se os perfis não vierem), sem os
 * que não têm sala e sem os ocultos nas Opções, menos o logado, que aparece sempre. As salas de
 * cada órgão vêm junto, até 4 consultas ao mesmo tempo.
 */
export async function carregarOrgaos(
  ler: LeitorPauta,
  logado: { id: number; descricao: string },
  ocultos: number[],
  fila = new FilaDeLeitura(),
): Promise<OrgaosDaPauta> {
  const avisos: string[] = [];
  const rPerfis = await ler<unknown>(caminhos.perfis());
  const dosPerfis = rPerfis.ok ? orgaosDosPerfis(rPerfis.dados) : [];
  if (!rPerfis.ok || !dosPerfis.length) avisos.push('Não foi possível ler os seus perfis no PJe: a Pauta mostra só o órgão logado.');
  const ids = [logado.id, ...dosPerfis.map((o) => o.id).filter((id) => id !== logado.id && !ocultos.includes(id))];

  // A cidade e a sigla vêm do AUD4. Sem ele, a cidade sai do fim do nome.
  const { r: rOj } = ids.length > 1 ? await lerAud4<unknown>(ler, caminhos.orgaosDoTribunal()) : { r: null };
  const tribunal = rOj?.ok ? lerOrgaosDoTribunal(rOj.dados) : [];

  const orgaos = await Promise.all(
    ids.map((id) =>
      fila.executar(async (): Promise<OrgaoPauta | null> => {
        const rSalas = await ler<Sala[]>(caminhos.salas(id));
        const salas = rSalas.ok && Array.isArray(rSalas.dados) ? rSalas.dados : [];
        const logadoAqui = id === logado.id;
        // D87b: órgão sem sala fica de fora; o logado fica, com o aviso na própria tela.
        if (!salas.length && !logadoAqui) return null;
        const doPerfil = dosPerfis.find((o) => o.id === id);
        const doTribunal = tribunal.find((t) => t.id === id);
        const naSala = ehObjeto((salas[0] as unknown as { orgaoJulgador?: unknown } | undefined)?.orgaoJulgador)
          ? ((salas[0] as unknown as { orgaoJulgador: Record<string, unknown> }).orgaoJulgador)
          : {};
        const nome = doTribunal?.nome ?? texto(naSala['descricao']) ?? doPerfil?.descricao ?? (logadoAqui ? logado.descricao : `Órgão ${id}`);
        const sigla = texto(naSala['sigla']) ?? doTribunal?.sigla;
        const codigo = codigoDoOrgao(naSala['codigoOrigem']);
        const cidade = doTribunal?.municipio ?? cidadeDoNome(nome);
        return {
          id,
          nome,
          ...(sigla ? { sigla } : {}),
          ...(codigo ? { codigo } : {}),
          ...(cidade ? { cidade } : {}),
          logado: logadoAqui,
          salas: salas.map((s) => ({ id: s.id, nome: (s.nome ?? s.descricao ?? `Sala ${s.id}`).trim() })),
        };
      }),
    ),
  );
  return { orgaos: ordenarOrgaos(orgaos.filter((o): o is OrgaoPauta => o !== null)), avisos };
}

/**
 * O mês da sala (D92): dia do mês → código ("S" = sem pauta, ver `temConteudo`). Forma confirmada na
 * prova técnica de 06/11/2026: `[{ dia: nº, tipo: "C"|"F"|"R"|"S"|"V"|"Z" }]`, um item por dia.
 */
export async function carregarMes(ler: LeitorPauta, idSala: number, chaveMes: string): Promise<Map<number, string>> {
  const [ano, mes] = chaveMes.split('-').map(Number);
  const r = await ler<unknown>(caminhos.pautaMes(idSala, ano!, mes!));
  if (!r.ok) throw new Error(r.erro.mensagem);
  const codigos = new Map<number, string>();
  if (Array.isArray(r.dados)) {
    for (const e of r.dados) if (ehObjeto(e) && typeof e['dia'] === 'number' && typeof e['tipo'] === 'string') codigos.set(e['dia'], e['tipo']);
  }
  return codigos;
}

/** Uma audiência de "Todas as salas" (D92b): o que o AUD4 traz, sem partes, vagas nem 100% Digital. */
export interface AudienciaDoOrgao extends EntradaPauta {
  sala: string;
}

/**
 * "Todas as salas" (D92b): as audiências do órgão inteiro de `inicio` a `fim`, numa consulta só
 * (`audpje/pautas`), por dia. Forma confirmada na prova técnica de 06/11/2026: `{ numeroProcesso,
 * idProcesso, siglaClasseJudicial, tipoAudiencia, dataAudiencia, idSala, nomeSala, … }`.
 */
export async function carregarAudienciasDoOrgao(ler: LeitorPauta, idOrgao: number, inicio: string, fim: string): Promise<Map<string, AudienciaDoOrgao[]>> {
  const { r } = await lerAud4<unknown>(ler, caminhos.pautasDoOrgao(idOrgao, inicio, fim));
  if (!r.ok) throw new Error(r.erro.mensagem);
  const porDia = new Map<string, AudienciaDoOrgao[]>();
  for (const a of Array.isArray(r.dados) ? r.dados : []) {
    if (!ehObjeto(a)) continue;
    const quando = texto(a['dataAudiencia']);
    const dia = quando?.slice(0, 10);
    if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
    const idProcesso = typeof a['idProcesso'] === 'number' ? a['idProcesso'] : undefined;
    const numero = texto(a['numeroProcesso']);
    const tipo = texto(a['tipoAudiencia']);
    const classe = texto(a['siglaClasseJudicial']);
    const linha: AudienciaDoOrgao = {
      hora: /T(\d{2}:\d{2})/.exec(quando ?? '')?.[1] ?? '--:--',
      tipo: 'audiencia',
      sala: texto(a['nomeSala']) ?? (typeof a['idSala'] === 'number' ? `Sala ${a['idSala']}` : '?'),
      ...(idProcesso !== undefined ? { idProcesso } : {}),
      ...(numero ? { nrProcesso: numero } : {}),
      ...(tipo ? { descricaoTipo: tipo } : {}),
      // O AUD4 não diz se o processo é 100% Digital (D92b).
      ...(classe ? { processo: { juizoDigital: false, classeSigla: classe } } : {}),
    };
    porDia.set(dia, [...(porDia.get(dia) ?? []), linha]);
  }
  for (const linhas of porDia.values()) linhas.sort((a, b) => a.hora.localeCompare(b.hora) || a.sala.localeCompare(b.sala));
  return porDia;
}

/** A pauta de uma sala num dia, já normalizada (vagas e audiências, pela hora). */
export async function carregarDia(ler: LeitorPauta, idSala: number, dia: string): Promise<EntradaPauta[]> {
  const r = await ler<PautaDia>(caminhos.pautaDia(idSala, dia));
  if (!r.ok) throw new Error(r.erro.mensagem);
  return lerPauta(r.dados);
}

/** O calendário do órgão (feriados e suspensões, D34). Se não vier, os dias ficam sem aviso. */
export async function carregarCalendario(ler: LeitorPauta, idOrgao: number): Promise<EventoCalendario[]> {
  const r = await ler<EventoCalendario[]>(caminhos.calendario(idOrgao));
  return r.ok && Array.isArray(r.dados) ? r.dados : [];
}

/** O "(?)" da linha (D61, D92): os advogados de cada parte, lidos só quando pedidos. */
export async function carregarAdvogados(ler: LeitorPauta, idProcesso: number): Promise<string> {
  const r = await ler<RespostaPartes>(caminhos.partes(idProcesso));
  if (!r.ok) return r.status === 401 || r.status === 403 ? 'Sem acesso às partes deste processo.' : `Erro ao ler as partes: ${r.erro.mensagem}`;
  const partes = lerPartes(r.dados);
  return dicaAdvogados([...partes.autores, ...partes.reus]) || 'Sem partes ativas.';
}
