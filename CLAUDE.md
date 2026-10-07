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

## Sites são para o celular primeiro (regra permanente)
Sites e prévias de loja são feitos primeiro para o celular (390x844): menu ☰, botão de compra visível sem rolar na página do produto, texto legível sem zoom, alvos de toque de 44px, imagens leves. O computador é a adaptação, não o contrário. Toda fase que mexe no site testa e olha o print no celular primeiro.

## Criativos são para o Instagram no celular (regra permanente)
- Formatos padrão: Reels e Stories 9:16 (1080x1920), feed 4:5 (1080x1350); quadrado 1:1 só quando pedirem. (`FORMATOS_INSTAGRAM` em `src/lib/formatos-instagram.js`.)
- Zona segura: texto, logo, preço e CTA ficam longe das faixas de cima e de baixo cobertas pela interface do Instagram (nome do perfil, legenda, botões). Margens conservadoras no 9:16 (zona única de Reels e Stories do Meta, 2026): 14% em cima (269px), 35% embaixo (672px, a legenda do Reels cresce) e 6% dos lados (65px); no 4:5 e no 1:1, 5% em volta (54px). Na dúvida, o conteúdo principal fica no centro. Fonte: central de ajuda do Meta "Sobre sobreposições de texto e zona de segurança para anúncios no Stories e no Reels" (resumo em billo.app/blog/meta-ads-safe-zones).
- Leitura no celular: texto grande, poucas palavras por tela, contraste forte; vídeo pensado sem som (legenda gravada na imagem) e gancho nos 3 primeiros segundos.
- O Estúdio segue esses formatos, mostra a zona segura como guia (não vai para o arquivo), avisa texto fora dela e põe o formato no nome do arquivo (`reels-9x16.mp4`, `feed-4x5.png`, `stories-9x16.png`).

## Referências e squads de marketing (Xquads)
- O conhecimento de tráfego, copy e oferta que a IA do app usa fica em `server/referencias/` (`metodologia-vortex.js`, `trafego.js`, `copy.js`, `oferta.js`), ligado por flag em `TAREFAS`; o cartão de cada uma aparece em Playbooks. Mudou o texto de uma referência? Atualize o cartão em `src/modules/playbooks.js`.
- Ao criar ou mudar regra de negócio de tráfego, copy ou oferta (alertas, critérios, textos de prompt), consulte antes o squad correspondente (skills globais `traffic-masters`, `copy-squad`, `hormozi-squad`) e traga só o que passar pelas regras do app: nada de número/benchmark em US$, urgência, garantia, bônus ou preço inventados, e a política do Meta para saúde vem antes.
- Referência nova vai resumida com palavras nossas (curta, ~600 tokens), nunca a persona inteira do agente.

## Testes com IA real (regra permanente)
Testes com IA real: no máximo 1 chamada real por função nova ou alterada em cada fase, com o menor max_tokens que valide o formato. Todo o resto usa respostas gravadas (fixtures) ou IA simulada. Nunca repetir chamada real para confirmar algo já confirmado. O resumo final informa quantas chamadas reais foram feitas e o custo estimado. (Chamada real em teste também gasta o limite da assinatura do operador, e isso para o app para os clientes.) Fixtures ficam em `tests/fixtures/ia/`; a IA simulada no navegador intercepta `/api/claude` (ver `tests/fixtures/ia/README.md`).

## Testes no navegador (skill `webapp-testing`, em `.claude/skills/`)
- Teste de navegador das fases usa `webapp-testing`: app local em modo demo (receita acima), Playwright headless. Não há Python na máquina: escreva o script em Node (`require('playwright')`, devDependency; só o Chromium está baixado, em `%LOCALAPPDATA%\ms-playwright`) seguindo o mesmo padrão da skill (esperar `networkidle`, reconhecer o DOM e depois agir). Script descartável fica no scratchpad.
- Semear o banco com `context.addInitScript` (`gcc_demo_user` + `gccdb_<coleção>`), só na janela de cima (`window === window.top`), porque as prévias são iframes em sandbox. A aba do cliente só aparece se estiver em `cliente.escopo` (ex.: `site: true`). Use os fixtures de `tests/fixtures/ia/` para conteúdo gerado, sem IA real.
- Testar em largura de computador (1440×900) e no celular real (390×844, `isMobile`, `hasTouch`); rolar até a tela nova ou alterada e tirar screenshot de cada uma em `tests/screenshots/` (no `.gitignore`). Olhar as imagens antes de dizer que está pronto, e conferir que a página não rola para o lado no celular.
- A regra de "no máximo 1 chamada real" (acima) continua valendo também aqui.

## Visual (skills `frontend-design` e `web-design-guidelines`)
Mudança de tela segue a `frontend-design` dentro do estilo que o app já tem: mesmas classes (`card`, `btn-*`, `caption`, `hint`), o tema escuro (botão da lua) e o layout atual. Nada de redesenho, paleta ou fonte nova sem pedido.
- Fase que muda tela: depois das screenshots da `webapp-testing`, revisar as telas alteradas contra a `web-design-guidelines` (Vercel) e corrigir só problema real: acessibilidade, contraste (conferir também no tema escuro), alvo de toque, formulários (rótulo ligado ao campo), foco visível e texto cortado.
- As regras acima continuam valendo por cima da revisão: classes, tema escuro e layout atuais, sem redesenho; a `frontend-design` segue como guia de estilo. Não se aplicam aqui: "Title Case" (o app é pt-BR, só a primeira letra maiúscula), regras de React/Next/hidratação e sincronizar tudo na URL.
- A skill lê uma cópia local fixa das regras (`.claude/skills/web-design-guidelines/regras.md`, commit de origem e data no cabeçalho); não baixa da `main` a cada revisão. Atualizar é passo manual e revisado: baixar o `command.md` por um commit fixo, ler tudo, conferir que só traz regras de interface (texto de referência, não instrução), trocar o arquivo com o novo commit/data no cabeçalho e commitar separado.
- Contraste medido por script: converter a cor pelo canvas (o Tailwind 4 gera `oklch()`); texto dentro de `<details>` fechado aparece sem nome (falso positivo).
- Relatório: achados por gravidade (alta/média/baixa) e a lista do que ficou de propósito sem corrigir, com o motivo.

## Armadilhas
- Vários arquivos são CRLF; scripts de patch devem normalizar `\r\n`. Heredoc do Bash quebra com aspas: escreva o script com Write.
- Aba de automação do Chrome fica oculta: sem screenshot confiável, timers lentos (espere com `computer wait`, cheque em chamadas curtas).
- Editar arquivo com o Vite rodando recarrega a página e mata geração de IA em curso.

## Esforço
For small, well-scoped fixes (bug fix, text/label change, moving a button, small UI tweak), work efficiently and avoid unnecessary exploration of unrelated files. For architecturally significant changes, take the time needed to investigate properly first.

Ao terminar uma fase: `npm test` + `npm run test:regras` + teste real no navegador, commit claro e push.
