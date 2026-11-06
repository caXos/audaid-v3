// Content script: roda em toda página `pjekz/*` dos TRTs (ver scripts/manifest.mjs).
// O PJe é uma SPA, então a troca de tela não recarrega a página: a URL é observada a cada segundo.

import type { OrgaoConhecido } from './config/opcoes';
import { aoMudarArmazenado, armazenamentoDaExtensao, enviarMensagem, lerArmazenado, salvarOpcoes, type Armazenado } from './ext/api';
import { ControleIndividual } from './individual/painel';
import { ControleLote } from './lote/ControleLote';
import { ControlePauta } from './pauta/ControlePauta';
import { lerAmbiente, lerTela } from './pje/ambiente';
import { ProvaTecnica } from './prova/painel';
import { Fab, v1Presente } from './ui/fab';

const ambiente = lerAmbiente(location.href);

/**
 * D87b: as Opções não leem o PJe, então a Pauta guarda os órgãos que mostrou, para a lista do
 * "Ocultar da Pauta". Os que já estavam ficam (um órgão oculto não aparece mais na Pauta, mas
 * precisa continuar na lista para poder voltar).
 */
async function guardarOrgaosConhecidos(orgaos: OrgaoConhecido[]) {
  const atual = await lerArmazenado(__AUDAID_DEV__);
  const antes = atual.opcoes.pauta.orgaos;
  const porId = new Map(antes.map((o) => [o.id, o]));
  for (const o of orgaos) porId.set(o.id, o);
  const lista = [...porId.values()];
  if (JSON.stringify(lista) === JSON.stringify(antes)) return;
  await salvarOpcoes({ ...atual.opcoes, pauta: { ...atual.opcoes.pauta, orgaos: lista } });
}

if (ambiente && !document.getElementById('audaid-v3-fab')) {
  const diagnostico = new ProvaTecnica(ambiente);
  const lote = new ControleLote(ambiente, __AUDAID_VERSAO__, armazenamentoDaExtensao);
  const pauta = new ControlePauta(ambiente, __AUDAID_VERSAO__, armazenamentoDaExtensao, (orgaos) => void guardarOrgaosConhecidos(orgaos));
  const individual = new ControleIndividual(
    ambiente,
    () => {
      // O link "Diagnóstico" troca o painel do Individual pelo de diagnóstico (só leitura).
      individual.fechar();
      diagnostico.alternar();
    },
    () => {
      // D1: dentro do processo, o lote abre pelo link do Individual.
      individual.fechar();
      if (estado?.aceite) lote.abrir(estado.opcoes);
    },
    (foco) => {
      // D88: "Abrir a pauta" no Individual, no dia da próxima audiência do processo (D90).
      individual.fechar();
      if (estado?.aceite) pauta.abrir(estado.opcoes, foco);
    },
  );
  let estado: Armazenado | null = null;
  let idProcesso: number | null = null;

  const fab = new Fab(
    () => {
      if (!estado?.aceite) return;
      if (lote.aberto) {
        lote.fechar();
        return;
      }
      if (pauta.aberto) {
        pauta.fechar();
        return;
      }
      if (diagnostico.aberto) {
        diagnostico.fechar();
        return;
      }
      // D1: no processo, o Individual. D88: fora dele, um menu com a Pauta e o Lote.
      if (idProcesso !== null) {
        individual.alternar(estado.opcoes);
        return;
      }
      fab.alternarMenu([
        {
          rotulo: 'Pauta',
          titulo: 'A pauta dos seus órgãos, salas e dias',
          acao: () => {
            if (estado?.aceite) pauta.abrir(estado.opcoes);
          },
        },
        {
          rotulo: 'Controle em Lote',
          titulo: 'Montar a pauta de um dia inteiro',
          acao: () => {
            if (estado?.aceite) lote.abrir(estado.opcoes);
          },
        },
      ]);
    },
    () => void enviarMensagem({ tipo: 'abrir-termos' }),
  );

  const aplicarEstado = async () => {
    estado = await lerArmazenado(__AUDAID_DEV__);
    fab.aplicar(estado.opcoes, estado.aceite ? 'ativo' : 'sem-aceite');
    if (!estado.aceite) {
      individual.fechar();
      diagnostico.fechar();
      lote.fechar();
      pauta.fechar();
    }
  };

  let ultimaUrl = '';
  const verificar = () => {
    fab.garantirNaPagina();
    individual.garantirNaPagina();
    diagnostico.garantirNaPagina();
    lote.garantirNaPagina();
    pauta.garantirNaPagina();
    fab.avisarV1(v1Presente());
    if (location.href === ultimaUrl) return;
    ultimaUrl = location.href;
    fab.fecharMenu();
    const tela = lerTela(location.pathname);
    idProcesso = tela.tipo === 'processo' ? tela.idProcesso : null;
    individual.definirProcesso(idProcesso);
    diagnostico.definirProcesso(idProcesso);
    // Desde a 3.1, o FAB aparece em toda página `pjekz/*` (D1). O lote não fecha ao navegar.
    fab.mostrar(true);
  };

  aoMudarArmazenado(() => void aplicarEstado());
  void aplicarEstado().then(() => {
    verificar();
    setInterval(verificar, 1000);
  });
}
