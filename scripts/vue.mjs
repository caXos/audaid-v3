// O mesmo plugin do Vue no build (scripts/build.mjs) e nos testes (vitest.config.ts).
//
// `customElement: true` NÃO cria custom elements (o Chrome nem os oferece aos content scripts).
// O efeito que interessa é outro: o <style> de cada .vue vira texto, na propriedade `styles` do
// componente, em vez de ir para o <head> do PJe. src/componentes/montar.ts injeta esse texto no
// Shadow DOM do painel (D50b).

import vue from '@vitejs/plugin-vue';

export const pluginVue = () => vue({ features: { customElement: true } });
