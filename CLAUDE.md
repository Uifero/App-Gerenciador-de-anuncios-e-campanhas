# CLAUDE.md

Responda em português do Brasil.

## Comandos (npm)
- `npm test` (vitest) · `npm run build` (vite) · `npm run dev` (web + servidor de IA :8787)
- Teste local sem Firebase: `VITE_DEMO_MODE=1 npx vite --port 5199 --strictPort` + `DEV_AUTH_BYPASS=1 node server/index.js`; no navegador `localStorage.gcc_demo_user='1'`, dados em `gccdb_<coleção>`.

## Restrições que não mudam
- IA: sempre a assinatura (CLI `claude -p`) primeiro; API só como reserva (`IA_PROVEDOR=auto`).
- Vídeo é só no navegador (ffmpeg.wasm, carregado sob demanda). Nada de FFmpeg no servidor nem Cloud Run.
- Produção = VM + PM2. Mudou `server/` (tarefa nova ou flag em `TAREFAS`)? Avisar: `git pull`, `npm run build` e **`pm2 restart`**.
- Site gerado de cliente nunca é hospedado na VM nem no Firebase do painel.
- Toda função de IA tem caminho manual sem IA; a IA não inventa dado, número, preço nem depoimento.
- `semRaciocinio` em `TAREFAS` só onde foi medido sem perda de qualidade (ver comentário lá).
- Nunca definir `VITE_DEMO_MODE`/`DEV_AUTH_BYPASS` em produção.

## Armadilhas
- Vários arquivos são CRLF; scripts de patch devem normalizar `\r\n`. Heredoc do Bash quebra com aspas: escreva o script com Write.
- Aba de automação do Chrome fica oculta: sem screenshot confiável, timers lentos (espere com `computer wait`, cheque em chamadas curtas).
- Editar arquivo com o Vite rodando recarrega a página e mata geração de IA em curso.

## Esforço
For small, well-scoped fixes (bug fix, text/label change, moving a button, small UI tweak), work efficiently and avoid unnecessary exploration of unrelated files. For architecturally significant changes, take the time needed to investigate properly first.

Ao terminar uma fase: `npm test` + teste real no navegador, commit claro e push.
