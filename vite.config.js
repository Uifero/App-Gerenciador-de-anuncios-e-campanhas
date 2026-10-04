import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    // A chave da Anthropic fica só no servidor (server/index.js); o navegador fala com /api.
    proxy: { '/api': 'http://localhost:8787' },
  },
  // Os testes das regras do Firestore/Storage precisam do emulador: rodam à parte, com "npm run test:regras".
  test: { exclude: [...configDefaults.exclude, 'tests/regras/**'] },
});
