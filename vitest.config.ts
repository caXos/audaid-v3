import { defineConfig } from 'vitest/config';

// As capturas do PJe foram feitas no fuso de Brasília; a data que o PJe recebe (meia-noite local
// em ISO) depende do fuso, então os testes fixam o mesmo.
process.env.TZ = 'America/Sao_Paulo';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
