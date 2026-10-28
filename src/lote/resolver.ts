// Tela 1 do Lote (D12, D27): de cada número, o processo, as partes e os advogados. O que não
// resolve vai para "Não incluídos", com o motivo, sem impedir de seguir. Nada é gravado.

import { estruturaSemDados } from '../componentes/estrutura';
import { caminhos, type Processo, type RespostaPartes } from '../pje/api';
import type { Resposta } from '../pje/http';
import { numeroValido } from '../regras/numeros';
import { lerPartes, type PartesDoProcesso } from '../regras/partes';

/** Leitura no PJe, relativa à origem. Injetada para os testes usarem um PJe falso. */
export type Leitor = <T>(caminho: string) => Promise<Resposta<T>>;

export interface ProcessoDoLote {
  numero: string;
  id: number;
  processo: Processo;
  /** O GET do processo como veio (o 100% Digital precisa dele inteiro, D31d). */
  processoBruto: Record<string, unknown>;
  partes: PartesDoProcesso;
}

export interface NaoIncluido {
  numero: string;
  motivo: string;
}

/** Para o diagnóstico: como a busca por número respondeu, sem os valores. */
export interface AmostraBusca {
  status: number;
  estrutura: unknown;
  /** Mensagem do PJe, quando a busca falhou (texto do sistema, sem dados de parte). */
  mensagemErro?: string;
}

export interface ResultadoResolucao {
  incluidos: ProcessoDoLote[];
  naoIncluidos: NaoIncluido[];
  /** A primeira resposta de cada status da busca por número (a resposta ainda não tem captura). */
  amostrasBusca: AmostraBusca[];
}

/** Processos consultados ao mesmo tempo: o bastante para não demorar, sem sobrecarregar o PJe. */
export const CONSULTAS_SIMULTANEAS = 4;

type Desfecho = { tipo: 'incluido'; processo: ProcessoDoLote } | { tipo: 'nao-incluido'; motivo: string };

const ehObjeto = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * O id interno a partir da resposta da busca por número. No teste real da entrega 1 (27/10/2026),
 * o PJe respondeu **só o id**, um número solto. A leitura continua defensiva (lista, objeto ou
 * página como `resultado`/`content`), e o id é sempre conferido depois pelo número do processo.
 * `null` = nenhum processo com esse número.
 */
export function idDaBusca(dados: unknown, numero: string): number | null {
  if (typeof dados === 'number') return Number.isInteger(dados) && dados > 0 ? dados : null;
  let itens: unknown[] = [];
  if (Array.isArray(dados)) itens = dados;
  else if (ehObjeto(dados)) {
    const lista = ['resultado', 'content', 'itens', 'items', 'processos', 'dados'].map((c) => dados[c]).find(Array.isArray);
    itens = lista ?? [dados];
  }
  const candidatos = itens.filter(ehObjeto).filter((i) => typeof i['id'] === 'number');
  const mesmoNumero = candidatos.find((i) => i['numero'] === numero || i['numeroProcesso'] === numero);
  const escolhido = mesmoNumero ?? (candidatos.length === 1 ? candidatos[0] : undefined);
  return escolhido ? (escolhido['id'] as number) : null;
}

function motivoDoErro(r: Extract<Resposta<unknown>, { ok: false }>, oQue: string): string {
  if (r.status === 401 || r.status === 403) return `sem acesso a este processo (HTTP ${r.status})`;
  if (r.status === 404) return 'não encontrado no PJe';
  return `erro ao consultar ${oQue}: ${r.erro.mensagem}`;
}

async function resolverUm(numero: string, ler: Leitor, idOrgaoLogado: number, amostras: Map<number, AmostraBusca>): Promise<Desfecho> {
  // Número com o dígito verificador errado nem vai ao PJe.
  if (!numeroValido(numero)) return { tipo: 'nao-incluido', motivo: 'número inválido (o dígito verificador não confere)' };
  const busca = await ler<unknown>(caminhos.processoPorNumero(numero));
  if (!amostras.has(busca.status)) {
    amostras.set(
      busca.status,
      busca.ok ? { status: busca.status, estrutura: estruturaSemDados(busca.dados) } : { status: busca.status, estrutura: null, mensagemErro: busca.erro.mensagem },
    );
  }
  if (!busca.ok) return { tipo: 'nao-incluido', motivo: motivoDoErro(busca, 'o número') };
  const id = idDaBusca(busca.dados, numero);
  if (id === null) return { tipo: 'nao-incluido', motivo: 'não encontrado no PJe' };

  const [rProc, rPartes] = await Promise.all([
    ler<Record<string, unknown>>(caminhos.processo(id)),
    ler<RespostaPartes>(caminhos.partes(id)),
  ]);
  if (!rProc.ok) return { tipo: 'nao-incluido', motivo: motivoDoErro(rProc, 'o processo') };
  const processo = rProc.dados as unknown as Processo;
  // O id veio da busca: só segue se o processo lido é mesmo o do número pedido.
  if (typeof processo.numero === 'string' && processo.numero !== numero) {
    return { tipo: 'nao-incluido', motivo: `a busca por número devolveu outro processo: ${processo.numero}` };
  }
  // D27, sem exceção: enquanto o processo não está no órgão logado, não há como mexer nas audiências.
  const orgao = processo.orgaoJulgador;
  if (orgao?.id !== idOrgaoLogado) {
    return { tipo: 'nao-incluido', motivo: `tramita em outro órgão: ${orgao?.descricao ?? 'órgão não informado'}` };
  }
  if (!rPartes.ok) return { tipo: 'nao-incluido', motivo: motivoDoErro(rPartes, 'as partes') };
  return {
    tipo: 'incluido',
    processo: { numero, id, processo, processoBruto: rProc.dados, partes: lerPartes(rPartes.dados) },
  };
}

/**
 * Resolve a lista, até `CONSULTAS_SIMULTANEAS` processos por vez. O resultado sai na ordem dos
 * números; `aoProgredir` recebe quantos já terminaram.
 */
export async function resolverLista(
  numeros: string[],
  deps: { ler: Leitor; idOrgaoLogado: number },
  aoProgredir: (concluidos: number) => void = () => {},
): Promise<ResultadoResolucao> {
  const desfechos: Desfecho[] = new Array(numeros.length);
  const amostras = new Map<number, AmostraBusca>();
  let proximo = 0;
  let concluidos = 0;

  const trabalhador = async () => {
    while (proximo < numeros.length) {
      const i = proximo++;
      const numero = numeros[i]!;
      try {
        desfechos[i] = await resolverUm(numero, deps.ler, deps.idOrgaoLogado, amostras);
      } catch (e) {
        desfechos[i] = { tipo: 'nao-incluido', motivo: `erro inesperado: ${e instanceof Error ? e.message : String(e)}` };
      }
      aoProgredir(++concluidos);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONSULTAS_SIMULTANEAS, numeros.length) }, trabalhador));

  const incluidos: ProcessoDoLote[] = [];
  const naoIncluidos: NaoIncluido[] = [];
  desfechos.forEach((d, i) => {
    if (d.tipo === 'incluido') incluidos.push(d.processo);
    else naoIncluidos.push({ numero: numeros[i]!, motivo: d.motivo });
  });
  return {
    incluidos,
    naoIncluidos,
    amostrasBusca: [...amostras.values()],
  };
}
