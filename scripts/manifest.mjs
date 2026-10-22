// Gera o manifest.json de cada navegador a partir de uma base comum.
// Os hosts são os 24 TRTs × 3 ambientes (produção, homologação, treinamento).

const AMBIENTES = ['pje', 'pje-homologacao', 'pje-treinamento'];
const TRTS = Array.from({ length: 24 }, (_, i) => i + 1);

const hosts = AMBIENTES.flatMap((amb) => TRTS.map((n) => `https://${amb}.trt${n}.jus.br`));

/** ID permanente da extensão no Firefox (D36: ID novo, independente da v1). */
export const GECKO_ID = 'audaid@caxos.github.io';

export const TAMANHOS_ICONE = [16, 32, 48, 128];

function base(versao) {
  return {
    manifest_version: 3,
    name: 'AudAid',
    version: versao,
    description:
      'Assistente para assistentes de audiência dos TRTs que usam o PJe. Faz requisições ao PJe em nome do usuário, com a sessão dele.',
    author: 'Jorge Henrique Bueno Gomez',
    permissions: ['storage'],
    host_permissions: hosts.map((h) => `${h}/*`),
    content_scripts: [
      {
        matches: hosts.map((h) => `${h}/pjekz/*`),
        js: ['content.js'],
        run_at: 'document_idle',
      },
    ],
    options_ui: { page: 'opcoes.html', open_in_tab: true },
  };
}

export function manifestChrome(versao) {
  const icones = Object.fromEntries(TAMANHOS_ICONE.map((t) => [t, `icons/audaid-${t}.png`]));
  return {
    ...base(versao),
    icons: icones,
    action: { default_title: 'AudAid: opções', default_icon: icones },
    background: { service_worker: 'background.js' },
    minimum_chrome_version: '120',
  };
}

export function manifestFirefox(versao) {
  const icones = { 48: 'icons/audaid.svg', 96: 'icons/audaid.svg' };
  return {
    ...base(versao),
    icons: icones,
    action: { default_title: 'AudAid: opções', default_icon: icones },
    background: { scripts: ['background.js'] },
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        strict_min_version: '128.0',
        // A extensão não envia dados a nenhum servidor além do próprio PJe.
        data_collection_permissions: { required: ['none'] },
      },
    },
  };
}
