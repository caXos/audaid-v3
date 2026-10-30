// Estado da tela 2 do Lote (§2.3): topo, itens, horários calculados, pendências e as ações. As
// regras ficam em pauta.ts; os .vue só mostram. Criado dentro de um `effectScope` do estadoLote,
// porque sobrevive a "Voltar ao texto".
//
// Desde a entrega 5, a pauta do PJe já está aqui (rodada 15): escolhidos sala e dia, a pauta da
// sala é consultada, e a lista mostra as vagas (D73) e as audiências que já estavam no dia (D74),
// com os conflitos na própria linha (D78). Na tela 3, o plano fica sobre a pauta que a tela 2 viu:
// a pauta nova só serve para conferir, e nada muda sem um clique (D66).

import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { useGigs } from '../componentes/estadoGigs';
import { avaliarData, nomeSala, resumoPauta, type Mensagem } from '../componentes/mensagens';
import { usePautaDia } from '../componentes/pautaDia';
import type { SugestaoGigs } from '../config/opcoes';
import type { EventoCalendario, Sala, TipoAudiencia } from '../pje/api';
import { pendenciaGigs, resolverVariaveis, type DadosVariaveisGigs } from '../regras/gigs';
import { nomeDoConjunto, ordenarProcessos, type ConjuntoRegras } from '../regras/organizar';
import type { EntradaPauta } from '../regras/pauta';
import { avisoHorario } from './apresentacao';
import { conferir, type Achado, type ItemParaConferir } from './conferencia';
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
  montarPautaPje,
  moverItem,
  empurrarItens,
  novoIntervalo,
  paraHora,
  paraMinutos,
  removerSemRecalcularItens,
  reordenarItens,
  sincronizarFora,
  tipoDoItem,
  type AjustesItem,
  type CampoAjustavel,
  type GigsLote,
  type ItemLote,
  type LinhaPauta,
  type ModoHorarios,
  type PautaPje,
  type TipoDoItem,
  type Topo,
} from './pauta';
import { textoDoAchado } from './resolucoes';
import type { ProcessoDoLote } from './resolver';

export interface ContextoPauta {
  /** Origem do PJe, para consultar a pauta do dia da sala. */
  origem: string;
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
  /** Modo de horários e vagas deixadas livres (vêm do rascunho, D73). */
  horarios?: ModoHorarios;
  vagasLivres?: string[];
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
  /** Audiência de fora (D74): os dados dela vêm da pauta do dia. */
  fora?: EntradaPauta;
  /** Os conflitos com a pauta da sala (D28, D67), já na tela 2 (D78). */
  achados: Achado[];
  /** Horário em que este processo do lote já está nesta pauta, se estiver. */
  nestaPauta?: string;
  /** Mesmo dia, sala, horário e tipo que já tinha: a execução não faz nada com ele (D79). */
  semMudanca: boolean;
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

  // ── A pauta do PJe (rodada 15) ──

  const pd = usePautaDia(ctx.origem);
  const modoEscolhido = ref<ModoHorarios>(inicio.horarios ?? 'vagas');
  const vagasLivres = ref<string[]>(inicio.vagasLivres ?? []);
  /** Falso na tela 3: o plano fica sobre a pauta que a tela 2 viu. */
  const emEdicao = ref(true);
  /** Sala e dia válidos: a pauta é consultada. Data bloqueada não consulta. */
  const chavePauta = computed(() => (topo.idSala !== null && !avaliacaoData.value.pendencias.length ? `${topo.idSala}|${topo.data}` : ''));
  watch(
    chavePauta,
    (chave, anterior) => {
      // Trocar sala ou dia refaz o encaixe nas vagas (§2.3, decisões técnicas).
      if (anterior && chave !== anterior) vagasLivres.value = [];
      if (chave) pd.consultar(topo.idSala!, topo.data);
    },
    { immediate: true },
  );
  const daChave = computed(() => (chavePauta.value && pd.estado.value.chave === chavePauta.value ? pd.estado.value : undefined));
  /** A pauta mais recente da sala no dia; `undefined` sem sala e dia, enquanto consulta ou com erro. */
  const entradasPje = computed(() => daChave.value?.entradas);
  const pautaCarregando = computed(() => Boolean(chavePauta.value) && (!daChave.value || daChave.value.carregando));
  const erroPauta = computed(() => daChave.value?.erro);
  /** A pauta sobre a qual o plano é montado. Na tela 3, continua a da tela 2. */
  const plano = shallowRef<EntradaPauta[] | undefined>(undefined);
  watch(
    [entradasPje, emEdicao],
    ([e, ed]) => {
      if (ed) plano.value = e;
    },
    { immediate: true },
  );

  /** Os processos do lote, pelo id interno: os deles na pauta não são "de fora". */
  const doLote = computed(() => {
    const processos = ctx.processos();
    const m = new Map<number, string>();
    for (const i of itens.value) {
      const p = i.tipo === 'processo' ? processos.get(i.chave) : undefined;
      if (p) m.set(p.id, i.chave);
    }
    return m;
  });
  const audienciasDoPlano = computed(() => (plano.value ?? []).filter((e) => e.tipo === 'audiencia' && e.idProcesso !== undefined));
  /** Entrada da pauta de cada processo do lote que já está nela. */
  const nestaPauta = computed(() => new Map(audienciasDoPlano.value.filter((e) => doLote.value.has(e.idProcesso!)).map((e) => [e.idProcesso!, e])));
  /** As audiências de fora (D74), pela chave do item. */
  const deFora = computed(() => new Map(audienciasDoPlano.value.filter((e) => !doLote.value.has(e.idProcesso!)).map((e) => [`fora-${e.idProcesso}`, e])));
  watch(
    deFora,
    (mapa) => {
      const fora = [...mapa.values()].map((e) => ({ idProcesso: e.idProcesso!, hora: e.hora }));
      itens.value = sincronizarFora(itens.value, fora, topoCompleto.value);
    },
    { immediate: true },
  );

  const temVagaLivre = computed(() => Boolean(plano.value?.some((e) => e.tipo === 'vaga')));
  const pje = computed<PautaPje | undefined>(() => (plano.value ? montarPautaPje(plano.value, doLote.value, modoEscolhido.value, vagasLivres.value) : undefined));
  /** O modo que vale: "pelas vagas" só com vaga livre no dia (D73). */
  const modo = computed<ModoHorarios>(() => pje.value?.modo ?? 'sequencia');
  const intervalosOcultos = computed(() => (modo.value === 'vagas' ? itens.value.filter((i) => i.tipo === 'intervalo').length : 0));

  /** A linha de altura fixa do topo: a consulta e o resumo da pauta da sala. */
  const situacaoPje = computed<Mensagem>(() => {
    if (topo.idSala === null || !topo.data) return { classe: 'suave', texto: 'Escolha sala e dia: a pauta da sala é consultada na hora.' };
    if (!chavePauta.value) return { classe: 'suave', texto: 'Com a data bloqueada, a pauta não é consultada.' };
    if (erroPauta.value) return { classe: 'erro', texto: `${erroPauta.value} Os horários seguem em sequência; a tela 3 consulta de novo.` };
    if (!plano.value) return { classe: 'carregando', texto: 'Consultando a pauta do dia…' };
    const resumo = resumoPauta(plano.value);
    if (modo.value === 'vagas') return { classe: 'ok', texto: `${resumo} Os processos ocupam as vagas livres, na ordem da lista.` };
    if (temVagaLivre.value) return { classe: 'suave', texto: `${resumo} Em sequência, as vagas não aparecem na lista.` };
    return { classe: 'suave', texto: resumo };
  });

  // ── A lista ──

  const linhasBase = computed(() => calcularPauta(itens.value, topoCompleto.value, pje.value));
  /** O que a conferência confere: cada audiência do lote com o horário calculado (conferencia.ts). */
  const paraConferir = computed<ItemParaConferir[]>(() => {
    const processos = ctx.processos();
    return linhasBase.value.flatMap((l) => {
      const p = l.tipo === 'processo' ? processos.get(l.chave) : undefined;
      return p ? [{ chave: l.chave, idProcesso: p.id, inicio: l.inicio, duracao: l.duracao, antiga: p.antiga }] : [];
    });
  });
  /** Os conflitos com a pauta mais recente: na tela 2, a mesma do plano; na tela 3, a nova. */
  const achados = computed(() => (entradasPje.value ? conferir(paraConferir.value, entradasPje.value) : new Map<string, Achado[]>()));

  const linhas = computed<LinhaVista[]>(() => {
    const t = topoCompleto.value;
    const processos = ctx.processos();
    return linhasBase.value.map((linha) => {
      const item = linha.indice >= 0 ? itens.value[linha.indice] : undefined;
      const vazia = { linha, item, ajustado: false, achados: [], semMudanca: false };
      if (linha.tipo === 'vaga') return { ...vazia, avisos: [], bloqueios: [] };
      const avisos: string[] = [];
      const bloqueios: string[] = [];
      const horario = avisoHorario(linha.sinal);
      if (horario) (linha.sinal === 'sobreposto' ? avisos : bloqueios).push(horario);
      // Quem está numa vaga tem a duração dela (até o próximo horário), que não se escolhe.
      if (!linha.naVaga && !duracaoValida(linha.duracao)) bloqueios.push(`A duração deve ser de ${LIMITES_LOTE.duracao.min} a ${LIMITES_LOTE.duracao.max} minutos.`);
      if (linha.tipo === 'fora') return { ...vazia, fora: deFora.value.get(linha.chave), avisos: [...bloqueios, ...avisos], bloqueios };
      if (item?.tipo !== 'processo') return { ...vazia, avisos: [...bloqueios, ...avisos], bloqueios };

      const processo = processos.get(item.chave);
      if (!processo) return { ...vazia, ajustado: ajustado(item.ajustes), avisos, bloqueios: [...bloqueios, 'Processo não consultado.'] };
      const tipo = tipoDoItem(processo.processo, t, item.ajustes, ctx.tipos);
      if (tipo.pendencia) bloqueios.push(tipo.pendencia);
      const atual = nestaPauta.value.get(processo.id);
      // D79: no mesmo horário e com o mesmo tipo que já tinha, nada é feito (nem o GIGS).
      const semMudanca = Boolean(atual && paraMinutos(atual.hora) === linha.inicio && tipo.tipo && tipo.tipo.id === atual.idTipo);
      const valores = gigsDoItem(item.ajustes, t);
      const lancar = valores.opcao !== '' && !semMudanca;
      const texto = resolverVariaveis(valores.texto, {
        ...dadosComuns(),
        hora: paraHora(linha.inicio),
        tipo: tipo.tipo?.descricao,
        acao: processo.antiga ? 'redesignada' : 'designada',
      });
      // D46: o limite de 4000 vale para o texto de cada processo, já com as variáveis dele.
      const pendencia = pendenciaGigs({ lancar, texto, prazo: valores.prazo });
      if (pendencia) bloqueios.push(pendencia);
      if (linha.alemDasVagas) avisos.push('Além das vagas configuradas: segue depois da última, com a duração base.');
      // D78: os conflitos com a pauta da sala, na própria linha. A audiência existente já tem o selo.
      const doItem = (achados.value.get(item.chave) ?? []).filter((a) => a.tipo !== 'existente');
      return {
        linha,
        item,
        processo,
        tipo,
        gigs: { valores, lancar, texto, pendencia },
        ajustado: ajustado(item.ajustes),
        achados: doItem,
        nestaPauta: atual?.hora,
        semMudanca,
        avisos: [...bloqueios, ...doItem.map(textoDoAchado), ...avisos],
        bloqueios,
      };
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
      const quem = l.linha.tipo === 'processo' ? `Audiência ${l.linha.ordem}` : l.linha.tipo === 'fora' ? `Audiência já na pauta (${paraHora(l.linha.inicio)})` : 'Intervalo';
      // Sem tipo no topo, a mesma frase em cada item não ajuda: vira uma pendência só.
      for (const b of l.bloqueios) if (b !== 'Escolha o tipo de audiência.') lista.push(`${quem}: ${b}`);
    }
    if (linhas.value.some((l) => l.bloqueios.includes('Escolha o tipo de audiência.'))) lista.push('Escolha o tipo de audiência (no topo ou nos itens).');
    return lista;
  });

  const temSobreposicao = computed(() => linhas.value.some((l) => l.linha.sinal === 'sobreposto'));
  const indiceDe = (chave: string) => itens.value.findIndex((i) => i.chave === chave);
  const quantidade = computed(() => itens.value.filter((i) => i.tipo === 'processo').length);

  // ── Ações ──

  const trocarItem = (chave: string, f: (i: ItemLote) => ItemLote) => {
    itens.value = itens.value.map((i) => (i.chave === chave ? f(i) : i));
  };

  function ajustar<K extends CampoAjustavel>(chave: string, campo: K, valor: Topo[K] & AjustesItem[K]) {
    trocarItem(chave, (i) => (i.tipo === 'processo' ? { ...i, ajustes: definirAjuste(i.ajustes, campo, valor, topoCompleto.value) } : i));
  }

  /** Início editado: vira âncora (D55). Vazio tira a âncora. Pelas vagas, é o "Levar para a vaga" (D73). */
  function definirInicio(chave: string, hora: string) {
    trocarItem(chave, (i) => {
      if (i.tipo === 'fora') return i;
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

  /** Mover à mão (arrastar ou teclado): a dropdown volta para "Ordem manual" (D48e). */
  function mover(de: number, para: number) {
    const antes = itens.value;
    itens.value = moverItem(itens.value, de, para);
    if (itens.value !== antes) {
      arrastadaAMao.value = true;
      ordenacao.value = null;
    }
  }

  /**
   * Trocar de posição com o vizinho (D16). Pelas vagas, o vizinho é o processo anterior ou o
   * seguinte: as audiências de fora e os intervalos não têm vez nesse modo.
   */
  function trocarComVizinho(chave: string, passo: -1 | 1) {
    const i = indiceDe(chave);
    if (i < 0) return;
    let j = i + passo;
    if (modo.value === 'vagas') while (j >= 0 && j < itens.value.length && itens.value[j]!.tipo !== 'processo') j += passo;
    if (j >= 0 && j < itens.value.length) mover(i, j);
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
    mover,
    aplicarATodos(campo: CampoAjustavel) {
      itens.value = aplicarATodos(itens.value, campo);
    },
    remover(chave: string) {
      itens.value = itens.value.filter((i) => i.chave !== chave);
    },
    adicionarIntervalo() {
      if (modo.value === 'vagas') return;
      itens.value = [...itens.value, novoIntervalo(itens.value, topo.intervalo.duracao)];
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
    paraConferir,
    achados,
    // ── A pauta do PJe (D73, D74, D78) ──
    modoEscolhido,
    modo,
    temVagaLivre,
    vagasLivres,
    intervalosOcultos,
    situacaoPje,
    entradasPje,
    pautaCarregando,
    erroPauta,
    emEdicao,
    /** Consulta a pauta de novo ("Consultar de novo", na tela 3). */
    consultarPauta() {
      if (chavePauta.value) pd.consultar(topo.idSala!, topo.data, true);
    },
    escolherHorarios(m: ModoHorarios) {
      modoEscolhido.value = m;
    },
    /** "Deixar livre" (D73): a vaga é pulada, e quem foi levado para ela deixa de estar fixo nela. */
    deixarLivre(minuto: number) {
      const hora = paraHora(minuto);
      if (!vagasLivres.value.includes(hora)) vagasLivres.value = [...vagasLivres.value, hora];
      itens.value = itens.value.map((i) => {
        if (i.tipo !== 'processo' || i.ajustes.inicio !== hora) return i;
        const { inicio: _, ...ajustes } = i.ajustes;
        return { ...i, ajustes };
      });
    },
    usarVaga(minuto: number) {
      vagasLivres.value = vagasLivres.value.filter((h) => h !== paraHora(minuto));
    },
    /** A duração de uma audiência de fora só muda o desenho da pauta (D74). */
    definirDuracaoFora(chave: string, duracao: number) {
      trocarItem(chave, (i) => (i.tipo === 'fora' ? { ...i, duracao } : i));
    },
    // ── Resoluções dos conflitos (D28, D32, D65, D66), na tela 2 e na tela 3 ──
    /** "Encaixar 1 min depois": o item fica no minuto livre (vira âncora, D55). */
    encaixar(chave: string, minuto: number) {
      definirInicio(chave, paraHora(minuto));
    },
    /** "Empurrar" (D65): intervalo com a duração base, a partir do horário do processo de fora. */
    empurrar(chave: string, inicioDoOutro: number) {
      itens.value = empurrarItens(itens.value, chave, paraHora(inicioDoOutro), topo.duracao);
    },
    /** "Remover sem recalcular" (D32): o seguinte fica no horário em que estava. */
    removerSemRecalcular(chave: string) {
      const i = indiceDe(chave);
      const seguinte = linhas.value.find((l) => l.linha.indice === i + 1);
      itens.value = removerSemRecalcularItens(itens.value, chave, seguinte ? paraHora(seguinte.linha.inicio) : null);
    },
    /** Trocar de posição com o vizinho (D16); conta como mover à mão. */
    subir(chave: string) {
      trocarComVizinho(chave, -1);
    },
    descer(chave: string) {
      trocarComVizinho(chave, 1);
    },
    /** Aplica o conjunto (D48): os processos em cascata; os intervalos e as de fora no lugar (D48i, D74). */
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
    /**
     * O que vai para o rascunho (D18): sem nomes de partes, sem texto colado e sem as audiências de
     * fora, que vêm da pauta consultada de novo ao retomar.
     */
    paraRascunho(): { hash: string; topo: Topo; itens: ItemLote[]; ordenacao?: string; horarios: ModoHorarios; vagasLivres?: string[] } {
      return {
        hash,
        topo: topoCompleto.value,
        itens: itens.value.filter((i) => i.tipo !== 'fora'),
        ...(ordenacao.value ? { ordenacao: ordenacao.value } : {}),
        horarios: modoEscolhido.value,
        ...(vagasLivres.value.length ? { vagasLivres: vagasLivres.value } : {}),
      };
    },
  });
}

export type EstadoPauta = ReturnType<typeof usePauta>;
