// Content script: roda em toda página `pjekz/*` dos TRTs (ver scripts/manifest.mjs).
// O PJe é uma SPA, então a troca de tela não recarrega a página: a URL é observada a cada segundo.

import { aoMudarArmazenado, enviarMensagem, lerArmazenado, type Armazenado } from './ext/api';
import { lerAmbiente, lerTela } from './pje/ambiente';
import { ProvaTecnica } from './prova/painel';
import { Fab, v1Presente } from './ui/fab';

const ambiente = lerAmbiente(location.href);

if (ambiente && !document.getElementById('audaid-v3-fab')) {
  const painel = new ProvaTecnica(ambiente);
  let estado: Armazenado | null = null;

  const fab = new Fab(
    () => {
      // Releitura na hora do clique: o aceite pode ter sido revogado em outra aba.
      if (estado?.aceite) painel.alternar();
    },
    () => void enviarMensagem({ tipo: 'abrir-termos' }),
  );

  const aplicarEstado = async () => {
    estado = await lerArmazenado(__AUDAID_DEV__);
    fab.aplicar(estado.opcoes, estado.aceite ? 'ativo' : 'sem-aceite');
    if (!estado.aceite) painel.fechar();
  };

  let ultimaUrl = '';
  const verificar = () => {
    fab.garantirNaPagina();
    painel.garantirNaPagina();
    fab.avisarV1(v1Presente());
    if (location.href === ultimaUrl) return;
    ultimaUrl = location.href;
    const tela = lerTela(location.pathname);
    const idProcesso = tela.tipo === 'processo' ? tela.idProcesso : null;
    painel.definirProcesso(idProcesso);
    // Na 3.0 o FAB só existe nas telas do Controle Individual (§2.2).
    fab.mostrar(idProcesso !== null);
  };

  aoMudarArmazenado(() => void aplicarEstado());
  void aplicarEstado().then(() => {
    verificar();
    setInterval(verificar, 1000);
  });
}
