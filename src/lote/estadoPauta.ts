// Estado da tela 2 do Lote (§2.3): topo, itens, horários calculados, pendências e as ações. As
// regras ficam em pauta.ts; os .vue só mostram. Criado dentro de um `effectScope` do estadoLote,
// porque sobrevive a "Voltar ao texto".

import { computed, reactive, ref } from 'vue';
import { useGigs } from '../componentes/estadoGigs';
import { avaliarData, nomeSala } from '../componentes/mensagens';
import type { SugestaoGigs } from '../config/opcoes';
import type { EventoCalendario, Sala, TipoAudiencia } from '../pje/api';
import { pendenciaGigs, resolverVariaveis, type DadosVariaveisGigs } from '../regras/gigs';
import { nomeDoConjunto, ordenarProcessos, type ConjuntoRegras } from '../regras/organizar';
import { avisoHorario } from './apresentacao';
import {
  ajustado,
  aplicarATodos,
  calcularPauta,
  definirAjuste,
  duracaoValida,
  gigsDoItem,
  horaValida,
  LIMITES_LOTE,
  mesclarItens,
  moverItem,
  novoIntervalo,
  paraHora,
  reordenarItens,
  tipoDoItem,
  type AjustesItem,
  type CampoAjustavel,
  type GigsLote,
  type ItemLote,
  type LinhaPauta,
  type TipoDoItem,
  type Topo,
} from './pauta';
import type { ProcessoDoLote } from './resolver';

export interface ContextoPauta {
  descricaoOrgao: string;
  nomeUsuario?: string;
  tipos: TipoAudiencia[];
  salas: Sala[];
  eventos: EventoCalendario[];
  sugestoes: SugestaoGigs[];
  /** Conjuntos do Auto organizar, das Opções (D48). */
  conjuntos: ConjuntoRegras[];
  /** Os processos consultados na tela 1, pelo número. */
  processos: () => Map<string, ProcessoDoLote>;
}

export interface InicioPauta {
  topo: Topo;
  itens: ItemLote[];
  hash: string;
  /** Conjunto aplicado por último (vem do rascunho, D18). */
  ordenacao?: string;
}

/** Uma linha da lista como a tela mostra: o horário calculado e, nos processos, o resto. */
export interface LinhaVista {
  linha: LinhaPauta;
  item?: ItemLote;
  processo?: ProcessoDoLote;
  tipo?: TipoDoItem;
  gigs?: { valores: GigsLote; lancar: boolean; texto: string; pendencia: string | null };
  ajustado: boolean;
  /** Tudo o que a linha avisa, com os bloqueios primeiro. */
  avisos: string[];
  /** Os avisos que impedem de continuar. */
  bloqueios: string[];
}

export function usePauta(ctx: ContextoPauta, inicio: InicioPauta) {
  const salaInicial = ctx.salas.some((s) => s.id === inicio.topo.idSala) ? inicio.topo.idSala : (ctx.salas[0]?.id ?? null);
  // O GIGS do topo mora em `gigsTopo` (o mesmo estado do Individual); o resto, aqui.
  const { gigs: _gigs, ...semGigs } = inicio.topo;
  const topo = reactive({ ...semGigs, idSala: salaInicial, intervalo: { ...inicio.topo.intervalo } });
  const itens = ref<ItemLote[]>(inicio.itens);
  const hash = inicio.hash;
  // Auto organizar (D48e): o conjunto aplicado (null = "Ordem manual") e se a lista foi arrastada
  // à mão depois disso; nesse caso, aplicar outro conjunto pede confirmação.
  const conjuntos = ctx.conjuntos.map((conjunto) => ({ nome: nomeDoConjunto(conjunto), conjunto }));
  const ordenacao = ref<string | null>(conjuntos.some((c) => c.nome === inicio.ordenacao) ? inicio.ordenacao! : null);
  const arrastadaAMao = ref(false);

  const sala = computed(() => ctx.salas.find((s) => s.id === topo.idSala));
  /** O `CampoSala` trabalha com texto. */
  const salaId = computed({
    get: () => (topo.idSala === null ? '' : String(topo.idSala)),
    set: (v: string) => {
      topo.idSala = v ? Number(v) : null;
    },
  });

  const dadosComuns = (): DadosVariaveisGigs => ({
    data: topo.data || undefined,
    sala: sala.value ? nomeSala(sala.value) : undefined,
    usuario: ctx.nomeUsuario,
    orgao: ctx.descricaoOrgao,
    hash,
  });
  // GIGS do topo: hora, tipo e ação variam por processo e ficam como estão na prévia do topo.
  const gigsTopo = useGigs(ctx.sugestoes, dadosComuns, inicio.topo.gigs);

  const topoCompleto = computed<Topo>(() => ({
    ...topo,
    intervalo: { ...topo.intervalo },
    gigs: { opcao: gigsTopo.opcao, texto: gigsTopo.texto, prazo: gigsTopo.prazoNumero },
  }));

  const avaliacaoData = computed(() => avaliarData(topo.data || null, ctx.eventos));

  const linhas = computed<LinhaVista[]>(() => {
    const t = topoCompleto.value;
    const processos = ctx.processos();
    return calcularPauta(itens.value, t).map((linha) => {
      const item = linha.indice >= 0 ? itens.value[linha.indice] : undefined;
      const avisos: string[] = [];
      const bloqueios: string[] = [];
      const horario = avisoHorario(linha.sinal);
      if (horario) (linha.sinal === 'sobreposto' ? avisos : bloqueios).push(horario);
      if (!duracaoValida(linha.duracao)) bloqueios.push(`A duração deve ser de ${LIMITES_LOTE.duracao.min} a ${LIMITES_LOTE.duracao.max} minutos.`);
      if (item?.tipo !== 'processo') return { linha, item, ajustado: false, avisos: [...bloqueios, ...avisos], bloqueios };

      const processo = processos.get(item.chave);
      if (!processo) return { linha, item, ajustado: ajustado(item.ajustes), avisos, bloqueios: [...bloqueios, 'Processo não consultado.'] };
      const tipo = tipoDoItem(processo.processo, t, item.ajustes, ctx.tipos);
      if (tipo.pendencia) bloqueios.push(tipo.pendencia);
      const valores = gigsDoItem(item.ajustes, t);
      const lancar = valores.opcao !== '';
      const texto = resolverVariaveis(valores.texto, {
        ...dadosComuns(),
        hora: paraHora(linha.inicio),
        tipo: tipo.tipo?.descricao,
        acao: processo.antiga ? 'redesignada' : 'designada',
      });
      // D46: o limite de 4000 vale para o texto de cada processo, já com as variáveis dele.
      const pendencia = pendenciaGigs({ lancar, texto, prazo: valores.prazo });
      if (pendencia) bloqueios.push(pendencia);
      return { linha, item, processo, tipo, gigs: { valores, lancar, texto, pendencia }, ajustado: ajustado(item.ajustes), avisos: [...bloqueios, ...avisos], bloqueios };
    });
  });

  const pendencias = computed(() => {
    const lista: string[] = [...avaliacaoData.value.pendencias];
    if (!sala.value) lista.push('Escolha a sala.');
    if (!horaValida(topo.inicio)) lista.push('Escolha o horário de início da primeira audiência.');
    if (!duracaoValida(topo.duracao)) lista.push(`A duração base deve ser de ${LIMITES_LOTE.duracao.min} a ${LIMITES_LOTE.duracao.max} minutos.`);
    if (!duracaoValida(topo.intervalo.duracao)) lista.push('A duração do intervalo deve ser de 1 a 600 minutos.');
    if (!Number.isInteger(topo.intervalo.aCada) || topo.intervalo.aCada < LIMITES_LOTE.aCada.min || topo.intervalo.aCada > LIMITES_LOTE.aCada.max) {
      lista.push(`"A cada" deve ser de ${LIMITES_LOTE.aCada.min} a ${LIMITES_LOTE.aCada.max} audiências.`);
    }
    if (gigsTopo.lancar && !gigsTopo.texto.trim()) lista.push('Escreva o texto do GIGS do topo (ou escolha a opção vazia).');
    if (!itens.value.some((i) => i.tipo === 'processo')) lista.push('A lista não tem processos.');
    for (const l of linhas.value) {
      const quem = l.linha.tipo === 'processo' ? `Audiência ${l.linha.ordem}` : 'Intervalo';
      // Sem tipo no topo, a mesma frase em cada item não ajuda: vira uma pendência só.
      for (const b of l.bloqueios) if (b !== 'Escolha o tipo de audiência.') lista.push(`${quem}: ${b}`);
    }
    if (linhas.value.some((l) => l.bloqueios.includes('Escolha o tipo de audiência.'))) lista.push('Escolha o tipo de audiência (no topo ou nos itens).');
    return lista;
  });

  const temSobreposicao = computed(() => linhas.value.some((l) => l.linha.sinal === 'sobreposto'));
  const quantidade = computed(() => itens.value.filter((i) => i.tipo === 'processo').length);

  // ── Ações ──

  const trocarItem = (chave: string, f: (i: ItemLote) => ItemLote) => {
    itens.value = itens.value.map((i) => (i.chave === chave ? f(i) : i));
  };

  function ajustar<K extends CampoAjustavel>(chave: string, campo: K, valor: Topo[K] & AjustesItem[K]) {
    trocarItem(chave, (i) => (i.tipo === 'processo' ? { ...i, ajustes: definirAjuste(i.ajustes, campo, valor, topoCompleto.value) } : i));
  }

  /** Início editado: vira âncora (D55). Vazio tira a âncora. */
  function definirInicio(chave: string, hora: string) {
    trocarItem(chave, (i) => {
      if (i.tipo === 'intervalo') {
        const { inicio: _, ...resto } = i;
        return horaValida(hora) ? { ...resto, inicio: hora } : resto;
      }
      const { inicio: _, ...ajustes } = i.ajustes;
      return { ...i, ajustes: horaValida(hora) ? { ...ajustes, inicio: hora } : ajustes };
    });
  }

  function definirDuracaoIntervalo(chave: string, duracao: number) {
    trocarItem(chave, (i) => (i.tipo === 'intervalo' ? { ...i, duracao } : i));
  }

  function voltarAoPadrao(chave: string) {
    trocarItem(chave, (i) => (i.tipo === 'processo' ? { ...i, ajustes: {} } : i));
  }

  return reactive({
    hash,
    salas: ctx.salas,
    sugestoes: ctx.sugestoes,
    topo,
    salaId,
    gigsTopo,
    topoCompleto,
    avaliacaoData,
    itens,
    linhas,
    pendencias,
    temSobreposicao,
    quantidade,
    dadosComuns,
    ajustar,
    definirInicio,
    definirDuracaoIntervalo,
    voltarAoPadrao,
    aplicarATodos(campo: CampoAjustavel) {
      itens.value = aplicarATodos(itens.value, campo);
    },
    remover(chave: string) {
      itens.value = itens.value.filter((i) => i.chave !== chave);
    },
    adicionarIntervalo() {
      itens.value = [...itens.value, novoIntervalo(itens.value, topo.intervalo.duracao)];
    },
    /** Mover à mão (arrastar ou teclado): a dropdown volta para "Ordem manual" (D48e). */
    mover(de: number, para: number) {
      const antes = itens.value;
      itens.value = moverItem(itens.value, de, para);
      if (itens.value !== antes) {
        arrastadaAMao.value = true;
        ordenacao.value = null;
      }
    },
    /** Continuar de novo a partir do texto (ver `mesclarItens`). Quem entra no fim desfaz a ordenação. */
    mesclar(numeros: string[]) {
      const ja = new Set(itens.value.map((i) => i.chave));
      itens.value = mesclarItens(itens.value, numeros);
      if (numeros.some((n) => !ja.has(n))) ordenacao.value = null;
    },
    conjuntos,
    ordenacao,
    arrastadaAMao,
    /** Aplica o conjunto (D48): os processos em cascata; os intervalos manuais no lugar (D48i). */
    aplicarOrdenacao(nome: string) {
      const escolhido = conjuntos.find((c) => c.nome === nome);
      if (!escolhido) return;
      const processos = ctx.processos();
      const presentes = itens.value
        .filter((i) => i.tipo === 'processo')
        .map((i) => processos.get(i.chave))
        .filter((p) => p !== undefined)
        .map((p) => ({ chave: p.numero, numero: p.numero, partes: p.partes, juizoDigital: Boolean(p.processo.juizoDigital) }));
      itens.value = reordenarItens(itens.value, ordenarProcessos(presentes, escolhido.conjunto).map((p) => p.chave));
      ordenacao.value = nome;
      arrastadaAMao.value = false;
    },
    /** "Ordem manual" escolhida na dropdown: não mexe na lista. */
    ordemManual() {
      ordenacao.value = null;
    },
    /** O que vai para o rascunho (D18): sem nomes de partes, sem texto colado. */
    paraRascunho(): { hash: string; topo: Topo; itens: ItemLote[]; ordenacao?: string } {
      return { hash, topo: topoCompleto.value, itens: itens.value, ...(ordenacao.value ? { ordenacao: ordenacao.value } : {}) };
    },
  });
}

export type EstadoPauta = ReturnType<typeof usePauta>;
