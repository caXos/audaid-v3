// Content script: roda em toda página `pjekz/*` dos TRTs (ver scripts/manifest.mjs).
// O PJe é uma SPA, então a troca de tela não recarrega a página: a URL é observada a cada segundo.

import { aoMudarArmazenado, armazenamentoDaExtensao, enviarMensagem, lerArmazenado, type Armazenado } from './ext/api';
import { ControleIndividual } from './individual/painel';
import { ControleLote } from './lote/ControleLote';
import { lerAmbiente, lerTela } from './pje/ambiente';
import { ProvaTecnica } from './prova/painel';
import { Fab, v1Presente } from './ui/fab';

const ambiente = lerAmbiente(location.href);

if (ambiente && !document.getElementById('audaid-v3-fab')) {
  const diagnostico = new ProvaTecnica(ambiente);
  const lote = new ControleLote(ambiente, __AUDAID_VERSAO__, armazenamentoDaExtensao);
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
      if (diagnostico.aberto) {
        diagnostico.fechar();
        return;
      }
      // D1: no processo, o Individual; fora dele, direto o lote.
      if (idProcesso !== null) individual.alternar(estado.opcoes);
      else lote.abrir(estado.opcoes);
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
    }
  };

  let ultimaUrl = '';
  const verificar = () => {
    fab.garantirNaPagina();
    individual.garantirNaPagina();
    diagnostico.garantirNaPagina();
    lote.garantirNaPagina();
    fab.avisarV1(v1Presente());
    if (location.href === ultimaUrl) return;
    ultimaUrl = location.href;
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
