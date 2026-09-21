import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    // A chave da Anthropic fica só no servidor (server/index.js); o navegador fala com /api.
    proxy: { '/api': 'http://localhost:8787' },
  },
});
