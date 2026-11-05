// Estado da tela 4 do Lote (§2.3): a execução, pelo motor de execucao.ts. Os .vue só mostram.

import { computed, reactive, ref } from 'vue';
import { transportePje, type Transporte } from '../fluxo/executor';
import { linhasDosPassos } from '../fluxo/relatorio';
import { caminhos, type PautaDia } from '../pje/api';
import { lerSessao } from '../pje/sessao';
import { dataBr } from '../regras/gigs';
import { lerPauta } from '../regras/pauta';
import {
  estadoInicial,
  executarPendencias,
  minutoParaEncaixar,
  ROTULO_SITUACAO,
  situacaoDoItem,
  temPendencia,
  type EstadoItem,
  type ItemExecucao,
  type Situacao,
} from './execucao';

export interface ContextoExecucao {
  origem: string;
  /** O que a tela mostra: simulação nas Opções OU escrita travada no código. */
  simulando: boolean;
  /** Simulação ligada nas Opções (o transporte também respeita a trava de escrita). */
  simulacaoNasOpcoes: boolean;
  idOrgao: number;
  idSala: number;
  /** AAAA-MM-DD */
  data: string;
  nomeSala: string;
  hash: string;
  itens: ItemExecucao[];
  /** D70: fixa o item no minuto livre e devolve o item refeito (horário e GIGS novos). */
  encaixar(chave: string, minuto: number): ItemExecucao | null;
  /** A execução real começou: o rascunho é apagado (D69). */
  aoComecarReal(): void;
  /** Só nos testes. */
  transporte?: Transporte;
}

export interface LinhaExecucao {
  item: ItemExecucao;
  estado: EstadoItem;
  situacao: Situacao;
  resumo: string;
}

/** A contagem do fim: "3 OK, 1 com atenção, 1 falha, 2 mantidas". */
export function textoContagem(linhas: LinhaExecucao[], simulando: boolean): string {
  const n = (s: Situacao) => linhas.filter((l) => l.situacao === s).length;
  const partes = [
    simulando ? `${n('simulado')} simulada(s)` : `${n('ok')} OK`,
    n('atencao') ? `${n('atencao')} com atenção` : '',
    n('falha') ? `${n('falha')} com falha` : '',
    n('nao-executado') ? `${n('nao-executado')} não executada(s)` : '',
    n('mantida') ? `${n('mantida')} mantida(s)` : '',
  ].filter(Boolean);
  return partes.join(', ');
}

/** "Copiar relatório": o conteúdo completo, com as requisições, para suporte (D52). */
export function relatorioDoLote(linhas: LinhaExecucao[], c: Pick<ContextoExecucao, 'origem' | 'simulando' | 'hash' | 'data' | 'nomeSala'>, agora: Date = new Date()): string {
  const saida = [
    `AudAid 3.1 · Controle em Lote · ${c.simulando ? 'SIMULAÇÃO' : 'REAL'} · ${agora.toLocaleString('pt-BR')}`,
    `Lote ${c.hash} · ${dataBr(c.data)} · ${c.nomeSala}`,
    `Resultado: ${textoContagem(linhas, c.simulando)}`,
    '',
  ];
  for (const l of linhas) {
    saida.push(`## ${l.item.ordem}. ${l.item.chave} · ${l.item.hora} · ${l.item.descricaoTipo} · ${ROTULO_SITUACAO[l.situacao]} · ${l.resumo}`);
    saida.push(...linhasDosPassos(l.estado.passos, c.origem));
  }
  return saida.join('\n');
}

export function useExecucao(ctx: ContextoExecucao) {
  const itens = ref<ItemExecucao[]>(ctx.itens);
  const estados = reactive<Record<string, EstadoItem>>(Object.fromEntries(ctx.itens.map((i) => [i.chave, estadoInicial(i)])));
  const estado = reactive({
    executando: false,
    /** "Parar depois do processo atual" (D68). */
    pararPedido: false,
    sessaoExpirada: false,
    /** A última execução foi parada pelo usuário. */
    parada: false,
    erro: '',
    aviso: '',
    /** A execução já começou ao menos uma vez (não se volta às telas 2 e 3 depois do real). */
    comecou: false,
    rotuloCopiar: 'Copiar relatório',
  });
  const transporte = ctx.transporte ?? transportePje(ctx.origem, () => lerSessao(document.cookie).xsrfToken, ctx.simulacaoNasOpcoes);

  const linhas = computed<LinhaExecucao[]>(() =>
    itens.value.map((item) => {
      const e = estados[item.chave]!;
      return { item, estado: e, ...situacaoDoItem(e, ctx.simulando) };
    }),
  );
  /** Itens com alguma coisa por fazer. */
  const pendentes = computed(() => itens.value.filter((i) => temPendencia(estados[i.chave]!)).length);
  const feitos = computed(() => linhas.value.filter((l) => !['aguardando', 'executando', 'nao-executado'].includes(l.situacao)).length);
  const temFalha = computed(() => linhas.value.some((l) => l.situacao === 'falha' || (l.situacao === 'atencao' && l.estado.gigsTentado)));
  const temRestante = computed(() => linhas.value.some((l) => l.situacao === 'nao-executado' || l.situacao === 'aguardando' || (l.situacao === 'atencao' && !l.estado.gigsTentado)));
  /** Um botão só para as pendências: os restantes (D68) e as falhas (D17). */
  const rotuloContinuar = computed(() => {
    const n = pendentes.value;
    if (temRestante.value && temFalha.value) return `Executar os restantes e reprocessar as falhas (${n})`;
    return temRestante.value ? `Executar os restantes (${n})` : `Reprocessar falhas (${n})`;
  });

  async function rodar(quais?: Set<string>): Promise<void> {
    if (estado.executando) return;
    // D5: o órgão é relido na hora da ação; se mudou em outra aba, nada é feito.
    if (lerSessao(document.cookie).orgaoLogado?.id !== ctx.idOrgao) {
      estado.erro = 'Você trocou de órgão logado (ou a sessão expirou). Nada foi feito: volte ao órgão do lote e tente de novo.';
      return;
    }
    estado.erro = '';
    estado.aviso = '';
    if (!estado.comecou) {
      estado.comecou = true;
      if (!ctx.simulando) ctx.aoComecarReal();
    }
    estado.executando = true;
    estado.pararPedido = false;
    estado.sessaoExpirada = false;
    estado.parada = false;
    try {
      const fim = await executarPendencias(itens.value, estados, transporte, { pararPedido: () => estado.pararPedido }, quais);
      estado.sessaoExpirada = fim.sessaoExpirada;
      estado.parada = fim.parada;
      if (fim.erro) estado.erro = fim.erro;
    } catch (e) {
      // Erro inesperado no código: mostra e libera os botões, em vez de travar em "Executando…".
      estado.erro = `Erro inesperado no AudAid: ${e instanceof Error ? e.message : String(e)}. Confira no PJe o estado dos processos.`;
      for (const x of Object.values(estados)) x.executando = false;
    } finally {
      estado.executando = false;
      estado.pararPedido = false;
    }
  }

  /** D70: relê a pauta, fixa o processo no próximo minuto livre e tenta só ele. */
  async function encaixarEReprocessar(chave: string): Promise<void> {
    const item = itens.value.find((i) => i.chave === chave);
    if (!item || estado.executando) return;
    estado.aviso = '';
    const r = await transporte.enviar({ metodo: 'GET', caminho: caminhos.pautaDia(ctx.idSala, ctx.data) });
    if (!r.ok) {
      estado.aviso = `Não foi possível ler a pauta da sala: ${r.erro.mensagem}`;
      return;
    }
    const m = minutoParaEncaixar(item, itens.value, lerPauta(r.dados as PautaDia));
    if (m === null) {
      estado.aviso = 'Não há minuto livre depois deste até a meia-noite.';
      return;
    }
    const novo = ctx.encaixar(chave, m);
    if (!novo) return;
    itens.value = itens.value.map((i) => (i.chave === chave ? novo : i));
    await rodar(new Set([chave]));
  }

  async function copiar(): Promise<void> {
    const texto = relatorioDoLote(linhas.value, ctx);
    try {
      await navigator.clipboard.writeText(texto);
      estado.rotuloCopiar = 'Copiado!';
    } catch {
      estado.rotuloCopiar = 'Não deu para copiar';
      console.info('[AudAid] Relatório do lote:\n' + texto);
    }
    setTimeout(() => {
      estado.rotuloCopiar = 'Copiar relatório';
    }, 2000);
  }

  return reactive({
    simulando: ctx.simulando,
    hash: ctx.hash,
    data: ctx.data,
    nomeSala: ctx.nomeSala,
    origem: ctx.origem,
    itens,
    estado,
    linhas,
    pendentes,
    feitos,
    rotuloContinuar,
    /** Falhas que ainda não foram reprocessadas (D69: pergunta antes de fechar). */
    falhasPendentes: computed(() => linhas.value.filter((l) => l.situacao === 'falha' || l.situacao === 'atencao' || l.situacao === 'nao-executado').length),
    texto: computed(() => textoContagem(linhas.value, ctx.simulando)),
    iniciar: () => rodar(),
    continuar: () => rodar(),
    parar() {
      if (estado.executando) estado.pararPedido = true;
    },
    encaixarEReprocessar,
    copiar,
  });
}

export type EstadoExecucao = ReturnType<typeof useExecucao>;
