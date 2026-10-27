// Estado do formulário do Controle Individual (§2.2): junta sala, data, horário, tipo composto e
// GIGS, calcula as pendências e monta o pedido para o executor. FormularioIndividual.vue só mostra.

import { computed, reactive, ref, watch } from 'vue';
import { useGigs } from '../componentes/estadoGigs';
import { useTipoComposto } from '../componentes/estadoTipo';
import { avaliarData, avaliarHorario, nomeSala } from '../componentes/mensagens';
import { usePautaDia } from '../componentes/pautaDia';
import type { Opcoes } from '../config/opcoes';
import type { PedidoDesignacao } from '../fluxo/executor';
import type { Ambiente } from '../pje/ambiente';
import { hoje } from '../regras/calendario';
import { dataBr, gerarHash, type DadosVariaveisGigs } from '../regras/gigs';
import type { Dados } from './dados';
import { useEnvio, type DadosDoEnvio } from './envio';

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

export function useFormulario(ambiente: Ambiente, d: Dados, opcoes: Opcoes, simulando: boolean) {
  // Sala: a da audiência antiga, se for do órgão; senão, a primeira (como um <select> sem escolha).
  const salaAntiga = d.antiga?.salaFisica?.id;
  const salaInicial = salaAntiga !== undefined && d.salas.some((s) => s.id === salaAntiga) ? salaAntiga : d.salas[0]?.id;
  const salaId = ref(salaInicial === undefined ? '' : String(salaInicial));
  const data = ref('');
  const hora = ref('');

  const sala = computed(() => d.salas.find((s) => String(s.id) === salaId.value));
  const dataValida = computed(() => (DATA.test(data.value) ? data.value : null));
  const horaValida = computed(() => (HORA.test(hora.value) ? hora.value : null));

  const tipo = useTipoComposto(
    { juizoDigital: Boolean(d.processo.juizoDigital), siglaClasse: d.processo.classeJudicial?.sigla, faseProcessual: d.processo.faseProcessual },
    d.tipos,
    d.antiga?.tipo?.descricao,
  );

  /** Código desta execução (D44); renovado depois de cada envio. */
  const hash = ref(gerarHash());

  /** Valores das variáveis do GIGS agora (D43). O que ainda não foi escolhido fica de fora. */
  const dadosVariaveis = (): DadosVariaveisGigs => ({
    data: dataValida.value ?? undefined,
    hora: horaValida.value ?? undefined,
    tipo: tipo.resolvido?.tipo?.descricao,
    sala: sala.value ? nomeSala(sala.value) : undefined,
    acao: d.antiga ? 'redesignada' : 'designada',
    usuario: d.nomeUsuario,
    orgao: d.descricaoOrgaoLogado,
    hash: hash.value,
  });
  const gigs = useGigs(opcoes.gigs.sugestoes, dadosVariaveis);

  // Pauta do dia (D28, D33): consultada assim que sala e data estão escolhidas.
  const pauta = usePautaDia(ambiente.origem);
  watch(
    [sala, dataValida],
    ([s, dt]) => {
      if (s && dt) pauta.consultar(s.id, dt);
    },
    { immediate: true },
  );
  const entradas = computed(() => (sala.value && dataValida.value ? pauta.estado.value.entradas : undefined));

  const avaliacaoData = computed(() => avaliarData(dataValida.value, d.eventos));
  const avaliacaoHora = computed(() =>
    avaliarHorario(
      horaValida.value,
      { escolhidas: Boolean(sala.value && dataValida.value), entradas: entradas.value, erro: pauta.estado.value.erro },
      d.processo.id,
    ),
  );

  const tituloPauta = computed(() =>
    sala.value && dataValida.value ? `Pauta do dia · ${nomeSala(sala.value)} · ${dataBr(dataValida.value)}` : 'Pauta do dia',
  );

  // 100% Digital (D26)
  const avisoDigital = computed(() =>
    d.processo.juizoDigital
      ? tipo.base === 'Julgamento'
        ? 'Processo 100% Digital: o AudAid vai retirar o Juízo 100% Digital, designar o Julgamento e recolocar (o PJe não aceita Julgamento em processo 100% Digital).'
        : 'Processo 100% Digital.'
      : '',
  );

  const envio = useEnvio({
    origem: ambiente.origem,
    simulacaoNasOpcoes: opcoes.simulacao,
    simulando,
    idOrgaoLogado: d.idOrgaoLogado,
    eventos: d.eventos,
  });

  // Na ordem em que aparecem na tela.
  const pendencias = computed(() =>
    [
      ...(sala.value ? [] : ['Escolha a sala.']),
      ...avaliacaoData.value.pendencias,
      ...avaliacaoHora.value.pendencias,
      tipo.pendencia,
      gigs.pendencia,
    ].filter((p): p is string => Boolean(p)),
  );

  const rotuloEnviar = computed(() =>
    envio.estado.executando
      ? 'Executando…'
      : simulando
        ? `Simular ${d.antiga ? 'redesignação' : 'designação'}`
        : d.antiga
          ? 'Redesignar'
          : 'Designar',
  );
  const podeEnviar = computed(() => !envio.estado.executando && !envio.estado.confirmando && pendencias.value.length === 0);

  function dadosDoEnvio(): DadosDoEnvio | null {
    const s = sala.value;
    const dt = dataValida.value;
    const hr = horaValida.value;
    const t = tipo.resolvido?.tipo;
    if (!s || !dt || !hr || !t) return null;
    const pedido: PedidoDesignacao = {
      idProcesso: d.processo.id,
      idOrgaoLogado: d.idOrgaoLogado,
      processoBruto: d.processoBruto,
      juizoDigital: Boolean(d.processo.juizoDigital),
      antiga: d.antiga
        ? {
            id: d.antiga.id,
            dataInicio: d.antiga.dataInicio,
            descricaoTipo: d.antiga.tipo?.descricao ?? '?',
            nomeSala: d.antiga.salaFisica?.nome ?? '?',
          }
        : undefined,
      idSala: s.id,
      data: dt,
      hora: hr,
      idTipoAudiencia: t.id,
      ehJulgamento: tipo.base === 'Julgamento',
      gigs: gigs.lancar ? { texto: gigs.textoResolvido, prazo: gigs.prazoNumero } : undefined,
      eventos: d.eventos,
      hoje: hoje(),
    };
    return { pedido, descricaoTipo: t.descricao, nomeSala: nomeSala(s) };
  }

  async function enviar(): Promise<void> {
    const dados = dadosDoEnvio();
    if (!dados) return;
    await envio.enviar(dados, () => {
      // D44: o hash desta execução é o da prévia; depois do envio, outro para o próximo.
      const usado = gigs.lancar && /\{\s*hash\s*\}/i.test(gigs.texto) ? hash.value : null;
      hash.value = gerarHash();
      return usado;
    });
  }

  return reactive({
    salas: d.salas,
    eventos: d.eventos,
    idProcesso: d.processo.id,
    redesignacao: Boolean(d.antiga),
    salaId,
    data,
    hora,
    tipo,
    gigs,
    dadosVariaveis,
    avaliacaoData,
    avaliacaoHora,
    entradas,
    erroPauta: computed(() => pauta.estado.value.erro),
    tituloPauta,
    avisoDigital,
    pendencias,
    rotuloEnviar,
    podeEnviar,
    envio,
    enviar,
  });
}

export type Formulario = ReturnType<typeof useFormulario>;
