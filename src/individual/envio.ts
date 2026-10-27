// Envio do Controle Individual: confirmação no modo real, execução pelo executor da 3.0 e o que o
// cartão "Resultado" mostra (ResultadoIndividual.vue).

import { reactive } from 'vue';
import { ROTULO_ESTADO } from '../componentes/mensagens';
import { executarDesignacao, transportePje, type AcaoSugerida, type PedidoDesignacao, type RegistroPasso, type ResultadoExecucao } from '../fluxo/executor';
import type { EventoCalendario } from '../pje/api';
import { lerSessao } from '../pje/sessao';
import { classificarData } from '../regras/calendario';
import { dataBr } from '../regras/gigs';
import { formatarDataHora } from '../ui/dom';

export const TEXTO_ACAO: Record<AcaoSugerida, string> = {
  'escolher-outro-horario': 'Escolha outro horário, na pauta do dia ou digitando.',
  'redesignar-antiga': 'Redesigne a audiência antiga pela pauta do PJe, com os dados mostrados acima.',
  'gigs-audiencia-perdida': 'Ou registre um GIGS com os dados da audiência antiga, para não esquecer.',
};

/** O que o cartão "Resultado" mostra. */
export type TelaResultado =
  | { tipo: 'inicial' }
  | { tipo: 'orgao-mudou' }
  | { tipo: 'confirmando'; itens: string[] }
  | { tipo: 'cancelado' }
  | { tipo: 'executando'; passos: RegistroPasso[] }
  | { tipo: 'concluido'; resultado: ResultadoExecucao; gravouDeVerdade: boolean };

/** Resumo do que será gravado no PJe, para a confirmação do envio real. */
export function itensConfirmacao(p: PedidoDesignacao, descricaoTipo: string, sala: string, eventos: EventoCalendario[]): string[] {
  const quando = `${dataBr(p.data)} às ${p.hora}`;
  const itens: string[] = [
    p.antiga
      ? `Redesignar a audiência de ${formatarDataHora(p.antiga.dataInicio)} (${p.antiga.descricaoTipo}) para ${quando}.`
      : `Designar audiência em ${quando}.`,
    `Tipo: ${descricaoTipo} · ${sala}.`,
  ];
  if (p.juizoDigital && p.ehJulgamento) {
    itens.push('Retirar o Juízo 100% Digital antes e recolocá-lo depois (o PJe lança dois movimentos no processo).');
  }
  if (p.gigs) {
    itens.push(`Lançar GIGS "${p.gigs.texto}" ${p.gigs.prazo > 0 ? `com prazo de ${p.gigs.prazo} dia(s) útil(eis)` : 'sem prazo'}.`);
  }
  const aviso = classificarData(p.data, eventos);
  if (aviso.nivel === 'avisa') itens.push(`Atenção: ${aviso.avisos.join('; ')}.`);
  return itens;
}

/** Texto de "Copiar requisições", para comparar com as capturas. O corpo do 100% Digital (o processo inteiro) é resumido. */
export function textoParaCopiar(r: ResultadoExecucao, origem: string, simulando: boolean, hash: string | null, agora: Date = new Date()): string {
  const linhas = [
    `AudAid 3.0 · ${simulando ? 'SIMULAÇÃO' : 'REAL'} · ${agora.toLocaleString('pt-BR')}`,
    `Resultado: ${r.desfecho} · ${r.resumo}`,
    ...(hash ? [`Código desta execução: ${hash}`] : []),
    '',
  ];
  for (const p of r.passos) {
    linhas.push(`# ${p.titulo} [${ROTULO_ESTADO[p.estado]}]${p.detalhe ? ` ${p.detalhe}` : ''}${p.erro ? ` ERRO: ${p.erro.mensagem} (${p.erro.codigoErro ?? '—'})` : ''}`);
    if (p.requisicao) {
      linhas.push(`${p.requisicao.metodo} ${origem}${p.requisicao.caminho}`);
      const corpo = p.requisicao.corpo;
      if (corpo !== undefined) {
        if (p.requisicao.caminho.includes('alteracaoParcial')) {
          const c = corpo as Record<string, unknown>;
          linhas.push(`(corpo: o processo inteiro, ${Object.keys(c).length} campos, com juizoDigital = ${String(c['juizoDigital'])})`);
        } else {
          linhas.push(JSON.stringify(corpo));
        }
      }
    }
    linhas.push('');
  }
  return linhas.join('\n');
}

export interface ConfiguracaoEnvio {
  origem: string;
  /** Simulação ligada nas Opções (o transporte também respeita a trava de escrita). */
  simulacaoNasOpcoes: boolean;
  /** O que a tela mostra: simulação nas Opções OU escrita travada no código. */
  simulando: boolean;
  idOrgaoLogado: number;
  eventos: EventoCalendario[];
}

export interface DadosDoEnvio {
  pedido: PedidoDesignacao;
  descricaoTipo: string;
  nomeSala: string;
}

export function useEnvio(cfg: ConfiguracaoEnvio) {
  let responderConfirmacao: ((ok: boolean) => void) | null = null;
  let ultimoResultado: ResultadoExecucao | null = null;

  const estado = reactive({
    tela: { tipo: 'inicial' } as TelaResultado,
    executando: false,
    confirmando: false,
    /** `{hash}` usado na última execução, se o texto do GIGS o tinha (D44). */
    hashDaExecucao: null as string | null,
    /** "Agora não" no "Recarregar a página?". */
    recarregarDispensado: false,
    podeCopiar: false,
    rotuloCopiar: 'Copiar requisições',
    /** D52: URL e payload de cada passo só aparecem na simulação. */
    mostrarRequisicoes: cfg.simulando,
  });

  function confirmar(itens: string[]): Promise<boolean> {
    estado.confirmando = true;
    estado.tela = { tipo: 'confirmando', itens };
    return new Promise((resolver) => {
      responderConfirmacao = (ok) => {
        responderConfirmacao = null;
        estado.confirmando = false;
        if (!ok) estado.tela = { tipo: 'cancelado' };
        resolver(ok);
      };
    });
  }

  /**
   * Envia (ou simula). `aoConfirmar` roda depois da confirmação e antes de executar, e devolve o
   * `{hash}` desta execução, se houver (D44).
   */
  async function enviar(d: DadosDoEnvio, aoConfirmar: () => string | null): Promise<void> {
    // D5: o órgão é relido na hora da ação; se mudou em outra aba, para tudo.
    if (lerSessao(document.cookie).orgaoLogado?.id !== cfg.idOrgaoLogado) {
      estado.tela = { tipo: 'orgao-mudou' };
      return;
    }
    // Envio real: mostra antes o que será gravado e só segue com a confirmação explícita.
    if (!cfg.simulando && !(await confirmar(itensConfirmacao(d.pedido, d.descricaoTipo, d.nomeSala, cfg.eventos)))) return;

    estado.hashDaExecucao = aoConfirmar();
    estado.executando = true;
    estado.podeCopiar = false;
    estado.recarregarDispensado = false;
    estado.tela = { tipo: 'executando', passos: [] };
    const transporte = transportePje(cfg.origem, () => lerSessao(document.cookie).xsrfToken, cfg.simulacaoNasOpcoes);
    let resultado: ResultadoExecucao;
    try {
      resultado = await executarDesignacao(d.pedido, transporte, (passos) => {
        estado.tela = { tipo: 'executando', passos: [...passos] };
      });
    } catch (e) {
      // Erro inesperado no código: mostra e libera o botão, em vez de travar em "Executando…".
      resultado = {
        desfecho: 'falha',
        resumo: `Erro inesperado no AudAid: ${e instanceof Error ? e.message : String(e)}. Confira no PJe o estado do processo.`,
        passos: [],
        acoes: [],
      };
    }
    estado.executando = false;
    ultimoResultado = resultado;
    // §2.2, passo 6: a tela do PJe só mostra a audiência nova depois de recarregar.
    const gravouDeVerdade = !cfg.simulando && (resultado.desfecho === 'sucesso' || resultado.desfecho === 'parcial');
    estado.tela = { tipo: 'concluido', resultado, gravouDeVerdade };
    estado.podeCopiar = true;
  }

  /** Resposta da confirmação do envio real ("Confirmar e gravar" / "Cancelar"). */
  function responder(ok: boolean): void {
    responderConfirmacao?.(ok);
  }

  async function copiar(): Promise<void> {
    if (!ultimoResultado) return;
    const texto = textoParaCopiar(ultimoResultado, cfg.origem, cfg.simulando, estado.hashDaExecucao);
    try {
      await navigator.clipboard.writeText(texto);
      estado.rotuloCopiar = 'Copiado!';
    } catch {
      estado.rotuloCopiar = 'Não deu para copiar';
      console.info('[AudAid] Requisições:\n' + texto);
    }
    setTimeout(() => {
      estado.rotuloCopiar = 'Copiar requisições';
    }, 2000);
  }

  return { estado, enviar, responder, copiar };
}

export type Envio = ReturnType<typeof useEnvio>;
