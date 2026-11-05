// Estado do Controle em Lote (§2.3): tela 1 (texto), tela 2 (pauta), tela 3 (conferência) e tela 4
// (execução). Guarda o rascunho (D18) e o topo lembrado (D56). Os .vue só mostram; o padrão é o de
// src/individual/formulario.ts.

import { computed, effectScope, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue';
import { nomeSala } from '../componentes/mensagens';
import type { SugestaoGigs } from '../config/opcoes';
import { ESCRITA_LIBERADA, type Transporte } from '../fluxo/executor';
import type { ConjuntoRegras } from '../regras/organizar';
import type { Armazenamento } from '../ext/api';
import type { Ambiente } from '../pje/ambiente';
import { caminhos, type EventoCalendario, type Sala, type TipoAudiencia } from '../pje/api';
import { pjeGet, type Resposta } from '../pje/http';
import { lerSessao, type OrgaoLogado } from '../pje/sessao';
import { hoje } from '../regras/calendario';
import { gerarHash } from '../regras/gigs';
import { extrairNumeros } from '../regras/numeros';
import { rotuloRascunho } from './apresentacao';
import { useExecucao, type EstadoExecucao } from './estadoExecucao';
import { usePauta, type EstadoPauta } from './estadoPauta';
import { montarPedidos, resumoDoLote, type ContextoPedidos } from './execucao';
import { chaveRascunho, chaveTopo, lerRascunho, mesclarItens, normalizarTopo, type ItemLote, type Rascunho, type Topo } from './pauta';
import { resolverLista, type Leitor, type NaoIncluido, type ProcessoDoLote } from './resolver';

export type TelaLote = 'texto' | 'consultando' | 'pauta' | 'conferencia' | 'execucao';

/** Espera antes de gravar o rascunho, para não gravar a cada tecla. */
export const ESPERA_RASCUNHO_MS = 500;

interface DadosDoOrgao {
  tipos: TipoAudiencia[];
  salas: Sala[];
  eventos: EventoCalendario[];
}

export function useLote(
  ambiente: Ambiente,
  versao: string,
  sugestoes: SugestaoGigs[],
  conjuntos: ConjuntoRegras[],
  armazenamento: Armazenamento,
  /** O modo simulação das Opções (D39). */
  simulacao: boolean,
  /** Só nos testes: o transporte da execução. */
  transporteDosTestes?: Transporte,
) {
  // D39: simulação nas Opções OU escrita travada no código, como no Individual.
  const simulando = simulacao || !ESCRITA_LIBERADA;
  // D5: o órgão é o logado ao abrir o lote, e é relido na hora de consultar.
  const sessao = lerSessao(document.cookie);
  const orgao: OrgaoLogado | null = sessao.orgaoLogado ?? null;
  const tela = ref<TelaLote>('texto');
  const texto = ref('');
  const numeros = computed(() => extrairNumeros(texto.value));
  const progresso = reactive({ feitos: 0, total: 0 });
  const naoIncluidos = shallowRef<NaoIncluido[]>([]);
  const processos = shallowRef(new Map<string, ProcessoDoLote>());
  const pauta = shallowRef<EstadoPauta | null>(null);
  const aviso = ref('');
  /** Rascunho salvo e ainda não retomado nem descartado (D18). */
  const rascunho = shallowRef<Rascunho | null>(null);
  /** Pede confirmação no "Continuar" quando há horário sobreposto (amarelo, D55). */
  const confirmandoSobreposicao = ref(false);
  const execucao = shallowRef<EstadoExecucao | null>(null);
  /** D69: a execução real apaga o rascunho e para de gravá-lo. */
  let rascunhoAtivo = true;

  let dadosOrgao: DadosDoOrgao | null = null;
  let topoLembrado: Topo | null = null;
  let vivo = true;
  // A pauta e a gravação do rascunho vivem neste escopo, que acaba junto com o lote.
  const escopo = effectScope();
  onBeforeUnmount(() => {
    vivo = false;
    escopo.stop();
  });

  const ler: Leitor = <T>(caminho: string): Promise<Resposta<T>> =>
    pjeGet<T>(ambiente.origem + caminho, { xsrfToken: lerSessao(document.cookie).xsrfToken });

  if (orgao) {
    void armazenamento.ler(chaveRascunho(orgao.id)).then((bruto) => {
      if (vivo && !pauta.value) rascunho.value = lerRascunho(bruto, orgao.id);
    });
    void armazenamento.ler(chaveTopo(orgao.id)).then((bruto) => {
      topoLembrado = bruto === undefined ? null : normalizarTopo(bruto);
    });
  }

  const rotuloRetomar = computed(() =>
    rascunho.value ? rotuloRascunho(rascunho.value.salvoEm, rascunho.value.itens.filter((i) => i.tipo === 'processo').length) : '',
  );

  async function carregarOrgao(idOrgao: number): Promise<DadosDoOrgao | string> {
    if (dadosOrgao) return dadosOrgao;
    const [rTipos, rSalas, rCal] = await Promise.all([
      ler<TipoAudiencia[]>(caminhos.tiposAudiencia()),
      ler<Sala[]>(caminhos.salas(idOrgao)),
      ler<EventoCalendario[]>(caminhos.calendario(idOrgao)),
    ]);
    if (!rTipos.ok || !rSalas.ok || !rCal.ok) {
      const falhas = (
        [
          ['tipos de audiência', rTipos],
          ['salas', rSalas],
          ['calendário', rCal],
        ] as [string, Resposta<unknown>][]
      )
        .filter(([, r]) => !r.ok)
        .map(([n, r]) => `${n} (${r.ok ? '' : r.erro.mensagem})`);
      return `Não foi possível carregar: ${falhas.join('; ')}. Tente de novo.`;
    }
    dadosOrgao = { tipos: rTipos.dados, salas: rSalas.dados, eventos: rCal.dados };
    return dadosOrgao;
  }

  /** Consulta os números e monta (ou atualiza) a pauta. `base` = itens do rascunho retomado. */
  async function consultar(lista: string[], base?: Rascunho): Promise<void> {
    if (!orgao || !lista.length || tela.value === 'consultando') return;
    if (lerSessao(document.cookie).orgaoLogado?.id !== orgao.id) {
      aviso.value = 'Você trocou de órgão logado (ou a sessão expirou). Feche e abra o AudAid de novo.';
      return;
    }
    aviso.value = '';
    progresso.feitos = 0;
    progresso.total = lista.length;
    tela.value = 'consultando';
    const [r, d] = await Promise.all([
      resolverLista(lista, { ler, idOrgaoLogado: orgao.id }, (n) => {
        progresso.feitos = n;
      }),
      carregarOrgao(orgao.id),
    ]);
    if (!vivo) return;
    if (typeof d === 'string') {
      aviso.value = d;
      tela.value = 'texto';
      return;
    }
    processos.value = new Map(r.incluidos.map((p) => [p.numero, p]));
    naoIncluidos.value = r.naoIncluidos;
    const incluidos = r.incluidos.map((p) => p.numero);
    if (pauta.value && !base) {
      pauta.value.mesclar(incluidos);
    } else {
      const itens: ItemLote[] = mesclarItens(base?.itens ?? [], incluidos);
      const topo = base?.topo ?? { ...(topoLembrado ?? normalizarTopo(undefined)), data: '' };
      const inicio = { topo, itens, hash: base?.hash ?? gerarHash(), ordenacao: base?.ordenacao, horarios: base?.horarios, vagasLivres: base?.vagasLivres };
      pauta.value = escopo.run(() => criarPauta(orgao, d, inicio)) ?? null;
    }
    rascunho.value = null;
    tela.value = 'pauta';
  }

  function criarPauta(o: OrgaoLogado, d: DadosDoOrgao, inicio: Parameters<typeof usePauta>[1]): EstadoPauta {
    const p = usePauta(
      {
        origem: ambiente.origem,
        descricaoOrgao: o.descricao,
        nomeUsuario: sessao.nomeUsuario,
        tipos: d.tipos,
        salas: d.salas,
        eventos: d.eventos,
        sugestoes,
        conjuntos,
        processos: () => processos.value,
      },
      inicio,
    );
    // Nas telas 3 e 4, o plano fica sobre a pauta que a tela 2 viu (D66, D78).
    watch(tela, (t) => {
      p.emEdicao = t !== 'conferencia' && t !== 'execucao';
    });
    // D18 e D56: grava o rascunho e o topo a cada mudança, depois de uma pequena espera.
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    watch(
      () => JSON.stringify(p.paraRascunho()),
      () => {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => {
          const { topo, ...resto } = p.paraRascunho();
          const r: Rascunho = { versao: 1, idOrgao: o.id, salvoEm: new Date().toISOString(), topo, ...resto };
          if (rascunhoAtivo) void armazenamento.gravar(chaveRascunho(o.id), JSON.parse(JSON.stringify(r)));
          // O dia nunca é lembrado (D56).
          void armazenamento.gravar(chaveTopo(o.id), JSON.parse(JSON.stringify({ ...topo, data: '' })));
        }, ESPERA_RASCUNHO_MS);
      },
      { immediate: true },
    );
    return p;
  }

  async function continuar(): Promise<void> {
    await consultar(numeros.value);
  }

  /** Retoma o rascunho: consulta os processos de novo e aplica os ajustes guardados (D18). */
  async function retomarRascunho(): Promise<void> {
    const r = rascunho.value;
    if (!r) return;
    const lista = r.itens.filter((i) => i.tipo === 'processo').map((i) => i.chave);
    texto.value = lista.join('\n');
    await consultar(lista, r);
  }

  async function descartarRascunho(): Promise<void> {
    if (!orgao) return;
    rascunho.value = null;
    await armazenamento.remover(chaveRascunho(orgao.id));
  }

  /** Tela 2 → tela 3. Com pendência não segue; com sobreposição, pede confirmação (D55). */
  function avancar(confirmado = false): void {
    const p = pauta.value;
    if (!p || p.pendencias.length) return;
    if (p.temSobreposicao && !confirmado) {
      confirmandoSobreposicao.value = true;
      return;
    }
    confirmandoSobreposicao.value = false;
    tela.value = 'conferencia';
  }

  // ── Tela 4: a execução ──

  function contextoPedidos(p: EstadoPauta): ContextoPedidos | null {
    if (!orgao || !dadosOrgao || p.topo.idSala === null || !p.topo.data) return null;
    return { idOrgao: orgao.id, idSala: p.topo.idSala, data: p.topo.data, eventos: dadosOrgao.eventos, hoje: hoje() };
  }

  /** A confirmação no fim da tela 3 (D71, D78), com a pauta consultada de novo. */
  const resumoExecucao = computed(() => {
    const p = pauta.value;
    const c = p && contextoPedidos(p);
    return p && c ? resumoDoLote(montarPedidos(p.linhas, c), p.entradasPje ?? []) : null;
  });

  /** "Simular a execução" ou "Gravar N audiências no PJe", no fim da tela 3. */
  function iniciarExecucao(): void {
    const p = pauta.value;
    const c = p && contextoPedidos(p);
    if (!p || !c || !orgao || execucao.value?.estado.executando) return;
    const sala = p.salas.find((s) => s.id === c.idSala);
    const ex = escopo.run(() =>
      useExecucao({
        origem: ambiente.origem,
        simulando,
        simulacaoNasOpcoes: simulacao,
        idOrgao: orgao.id,
        idSala: c.idSala,
        data: c.data,
        nomeSala: sala ? nomeSala(sala) : String(c.idSala),
        hash: p.hash,
        itens: montarPedidos(p.linhas, c),
        // D70: o item fica fixo no minuto livre, e a pauta refaz o horário e o GIGS dele.
        encaixar(chave, minuto) {
          p.encaixar(chave, minuto);
          const c2 = contextoPedidos(p);
          return c2 ? (montarPedidos(p.linhas, c2).find((i) => i.chave === chave) ?? null) : null;
        },
        aoComecarReal() {
          rascunhoAtivo = false;
          rascunho.value = null;
          void armazenamento.remover(chaveRascunho(orgao.id));
        },
        transporte: transporteDosTestes,
      }),
    );
    if (!ex) return;
    execucao.value = ex;
    tela.value = 'execucao';
    void ex.iniciar();
  }

  return reactive({
    versao,
    origem: ambiente.origem,
    simulando,
    orgao,
    tela,
    texto,
    numeros,
    progresso,
    naoIncluidos,
    pauta,
    aviso,
    rascunho,
    rotuloRetomar,
    confirmandoSobreposicao,
    continuar,
    retomarRascunho,
    descartarRascunho,
    avancar,
    cancelarConfirmacao() {
      confirmandoSobreposicao.value = false;
    },
    /** Volta à tela 1 com o texto que foi colado; a pauta montada continua guardada. */
    voltarAoTexto() {
      confirmandoSobreposicao.value = false;
      tela.value = 'texto';
    },
    voltarAPauta() {
      tela.value = 'pauta';
    },
    execucao,
    resumoExecucao,
    iniciarExecucao,
    /** Só depois de uma simulação: nada foi gravado, então dá para voltar e ajustar. */
    voltarAConferencia() {
      if (!simulando || execucao.value?.estado.executando) return;
      execucao.value = null;
      tela.value = 'conferencia';
    },
    /** Durante a execução, o "×" fica desabilitado (D68). */
    executando: computed(() => Boolean(execucao.value?.estado.executando)),
    /** D69: fechar depois do envio real com pendências pede confirmação. */
    pendenciasAoFechar: computed(() => (!simulando && execucao.value?.estado.comecou ? execucao.value.falhasPendentes : 0)),
  });
}

export type EstadoLote = ReturnType<typeof useLote>;
