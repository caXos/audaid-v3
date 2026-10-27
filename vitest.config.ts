import { defineConfig } from 'vitest/config';
import { pluginVue } from './scripts/vue.mjs';

// As capturas do PJe foram feitas no fuso de Brasília; a data que o PJe recebe (meia-noite local
// em ISO) depende do fuso, então os testes fixam o mesmo.
process.env.TZ = 'America/Sao_Paulo';

export default defineConfig({
  plugins: [pluginVue()],
  test: {
    include: ['tests/**/*.test.ts'],
    // Processa o <style> dos .vue, para os testes verem o CSS que vai para o Shadow DOM.
    css: { include: [/\.vue/] },
  },
});
