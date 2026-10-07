# CLAUDE.md

Responda em português do Brasil.

## Comandos (npm)
- `npm test` (vitest) · `npm run build` (vite) · `npm run dev` (web + servidor de IA :8787)
- `npm run test:regras`: regras do Firestore/Storage no emulador local (projeto `demo-`, sem produção; precisa de Java 21+, usa `~/.jdk/` se não houver no PATH). Rodar sempre que mexer em `firestore.rules`/`storage.rules` e ao fechar fase.
- Backup real para teste fica em `backup-teste/` (no `.gitignore`, nunca commitar); `tests/restauracao.test.js` restaura e audita no modo demo, só contagens.
- Teste local sem Firebase: `VITE_DEMO_MODE=1 npx vite --port 5199 --strictPort` + `DEV_AUTH_BYPASS=1 node server/index.js`; no navegador `localStorage.gcc_demo_user='1'`, dados em `gccdb_<coleção>`.

## Restrições que não mudam
- IA: sempre a assinatura (CLI `claude -p`) primeiro; API só como reserva (`IA_PROVEDOR=auto`).
- Vídeo é só no navegador (ffmpeg.wasm, carregado sob demanda). Nada de FFmpeg no servidor nem Cloud Run.
- Produção = VM + PM2. Mudou `server/` (tarefa nova ou flag em `TAREFAS`)? Avisar: `git pull`, `npm run build` e **`pm2 restart`**.
- Site gerado de cliente nunca é hospedado na VM nem no Firebase do painel.
- Toda função de IA tem caminho manual sem IA; a IA não inventa dado, número, preço nem depoimento.
- `semRaciocinio` em `TAREFAS` só onde foi medido sem perda de qualidade (ver comentário lá).
- Nunca definir `VITE_DEMO_MODE`/`DEV_AUTH_BYPASS` em produção.
- Depois de qualquer geração ou leitura, o resultado fica visível sem o operador procurar: rolar até ele, destacar, status que não some, erro que não some. (Use `mostrarResultado` e `ocupado`/`toast(…, 'erro')` de `src/core/ui.js`.)

## Testes com IA real (regra permanente)
Testes com IA real: no máximo 1 chamada real por função nova ou alterada em cada fase, com o menor max_tokens que valide o formato. Todo o resto usa respostas gravadas (fixtures) ou IA simulada. Nunca repetir chamada real para confirmar algo já confirmado. O resumo final informa quantas chamadas reais foram feitas e o custo estimado. (Chamada real em teste também gasta o limite da assinatura do operador, e isso para o app para os clientes.) Fixtures ficam em `tests/fixtures/ia/`; a IA simulada no navegador intercepta `/api/claude` (ver `tests/fixtures/ia/README.md`).

## Testes no navegador (skill `webapp-testing`, em `.claude/skills/`)
- Teste de navegador das fases usa `webapp-testing`: app local em modo demo (receita acima), Playwright headless. Não há Python na máquina: escreva o script em Node (`require('playwright')`, devDependency; só o Chromium está baixado, em `%LOCALAPPDATA%\ms-playwright`) seguindo o mesmo padrão da skill (esperar `networkidle`, reconhecer o DOM e depois agir). Script descartável fica no scratchpad.
- Semear o banco com `context.addInitScript` (`gcc_demo_user` + `gccdb_<coleção>`), só na janela de cima (`window === window.top`), porque as prévias são iframes em sandbox. A aba do cliente só aparece se estiver em `cliente.escopo` (ex.: `site: true`). Use os fixtures de `tests/fixtures/ia/` para conteúdo gerado, sem IA real.
- Testar em largura de computador (1440×900) e no celular real (390×844, `isMobile`, `hasTouch`); rolar até a tela nova ou alterada e tirar screenshot de cada uma em `tests/screenshots/` (no `.gitignore`). Olhar as imagens antes de dizer que está pronto, e conferir que a página não rola para o lado no celular.
- A regra de "no máximo 1 chamada real" (acima) continua valendo também aqui.

## Visual (skill `frontend-design`)
Mudança de tela segue a `frontend-design` dentro do estilo que o app já tem: mesmas classes (`card`, `btn-*`, `caption`, `hint`), o tema escuro (botão da lua) e o layout atual. Nada de redesenho, paleta ou fonte nova sem pedido.

## Armadilhas
- Vários arquivos são CRLF; scripts de patch devem normalizar `\r\n`. Heredoc do Bash quebra com aspas: escreva o script com Write.
- Aba de automação do Chrome fica oculta: sem screenshot confiável, timers lentos (espere com `computer wait`, cheque em chamadas curtas).
- Editar arquivo com o Vite rodando recarrega a página e mata geração de IA em curso.

## Esforço
For small, well-scoped fixes (bug fix, text/label change, moving a button, small UI tweak), work efficiently and avoid unnecessary exploration of unrelated files. For architecturally significant changes, take the time needed to investigate properly first.

Ao terminar uma fase: `npm test` + `npm run test:regras` + teste real no navegador, commit claro e push.
