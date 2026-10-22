// Content script: roda em toda página `pjekz/*` dos TRTs (ver scripts/manifest.mjs).
// O PJe é uma SPA, então a troca de tela não recarrega a página: a URL é observada a cada segundo.

import { lerAmbiente, lerTela } from './pje/ambiente';
import { ProvaTecnica } from './prova/painel';

const ambiente = lerAmbiente(location.href);

if (ambiente && !document.getElementById('audaid-v3')) {
  const prova = new ProvaTecnica(ambiente);
  let ultimaUrl = '';

  const verificar = () => {
    prova.garantirNaPagina();
    if (location.href === ultimaUrl) return;
    ultimaUrl = location.href;
    const tela = lerTela(location.pathname);
    prova.definirProcesso(tela.tipo === 'processo' ? tela.idProcesso : null);
  };

  verificar();
  setInterval(verificar, 1000);
}
