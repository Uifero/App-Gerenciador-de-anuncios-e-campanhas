// Testes das regras (firestore.rules e storage.rules) no emulador local. Rodar com "npm run test:regras",
// que sobe o emulador, roda isto e desliga (scripts/testar-regras.mjs). Nunca acessa o projeto de produção.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/regras/**/*.test.js'],
    environment: 'node',
    fileParallelism: false, // um emulador só para os dois arquivos
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
