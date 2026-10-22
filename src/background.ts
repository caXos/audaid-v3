// Background (service worker no Chrome, página de eventos no Firefox).
// - Na instalação, na atualização e na abertura do navegador: sem aceite válido, abre os termos (D22).
// - Clique no ícone da barra: abre as Opções (não há popup, D4d).
// - Mensagens do content script: abrir termos ou opções.

import { ext, lerArmazenado, type Mensagem } from './ext/api';

async function abrirTermosSeNecessario() {
  const { aceite } = await lerArmazenado(__AUDAID_DEV__);
  if (!aceite) await abrirTermos();
}

async function abrirTermos() {
  await ext.tabs.create({ url: ext.runtime.getURL('termos.html'), active: true });
}

ext.runtime.onInstalled.addListener(() => void abrirTermosSeNecessario());
ext.runtime.onStartup.addListener(() => void abrirTermosSeNecessario());

ext.action.onClicked.addListener(() => void ext.runtime.openOptionsPage());

ext.runtime.onMessage.addListener((mensagem: Mensagem) => {
  if (mensagem?.tipo === 'abrir-termos') void abrirTermos();
  if (mensagem?.tipo === 'abrir-opcoes') void ext.runtime.openOptionsPage();
  return false;
});
