# Gerenciador de Criativos e Campanhas

Primeira ferramenta do ecossistema de e-commerce: criativos, campanhas de tráfego pago e lojas/sites para clientes.
Vite + Tailwind + Firebase (Auth, Firestore, Storage) + Claude (via servidor próprio).

## Rodar localmente
```bash
npm install
cp .env.example .env      # preencha ANTHROPIC_API_KEY (o resto do Firebase já vem do projeto do Painel de Comissões)
npm run dev               # web em :5173 + servidor de IA em :8787
```
Login = usuário criado no Firebase Auth (Console > Authentication). Desative o cadastro de novos usuários lá.

### IA em desenvolvimento: assinatura primeiro, API depois
Com `IA_PROVEDOR=auto` (padrão), o servidor usa **sempre primeiro** a sua assinatura do Claude, chamando a CLI `claude -p` (sem custo por token;
precisa estar logado no Claude Code na máquina do servidor), e só recorre à API da Anthropic quando não dá para usar a assinatura (CLI ausente/sem login,
limite da assinatura, erro) **e** há `ANTHROPIC_API_KEY`. Depois de uma falha a CLI fica em pausa por alguns minutos (as chamadas vão direto à API).
O cabeçalho mostra "IA: assinatura" enquanto ela está em uso. Num servidor de produção sem o Claude logado, tudo cai para a API automaticamente.
Atenção: a assinatura é pessoal — confira os termos do seu plano antes de depender dela para atender outras pessoas. Diferenças no modo assinatura: mais lento
(10–60 s por chamada), sem prompt caching nem limite de tokens por operação, e o custo é registrado como US$ 0 (os tokens são registrados).
Para testar com a API simulada ou forçar a API: `IA_PROVEDOR=api`.

## Segurança (leia antes de publicar)
- **A chave da Anthropic nunca vai ao navegador.** O frontend chama `/api/claude`; `server/index.js` valida o ID token do
  Firebase (JWKS público do Google, sem credencial de admin) e só então chama a API. Defina `ADMIN_EMAIL` para aceitar só o administrador.
- **`firestore.rules` restringe `gcc_*` a usuário autenticado** (projeto Firebase próprio: `app-gerenciador-de-anuncios`).
  Publique com `firebase deploy --only firestore:rules,storage`.
- **Link de aprovação (público, sem login):** só funciona depois de publicar as regras. Elas abrem, para o público, apenas
  (1) a leitura do documento do link pelo token (nunca listagem, e só até expirar) e (2) a gravação da própria resposta
  (`aprovado`/`ajuste` + comentário de até 1000 caracteres) numa peça que pertence ao link. Nada mais é acessível. O token tem 192 bits aleatórios;
  dá para revogar a qualquer momento. **Essas regras não foram testadas contra o emulador do Firestore** (exige Java) — teste com um link real após o deploy.
- `VITE_DEMO_MODE`, `DEV_AUTH_BYPASS` e `ANTHROPIC_BASE_URL` são só para teste local; não os defina em produção
  (o bypass é ignorado com `NODE_ENV=production`, e o build de produção não deve ter `VITE_DEMO_MODE`).
- Nenhum processamento de pagamento: o site gerado só expõe `window.checkoutHandler` como ponto de encaixe.

## Custo de IA (Fase 3)
- **Modelo por tarefa** (`TAREFAS` em `server/index.js`): Haiku 4.5 para hooks, refino e checklist de qualidade; Sonnet 5 para criativos,
  campanha, busca/análise de mercado, site e playbooks. Troque pelas variáveis `ANTHROPIC_MODEL_LEVE` / `ANTHROPIC_MODEL_COMPLEXO`.
  Só o Sonnet recebe `thinking` adaptativo e `effort` (o Haiku 4.5 rejeita esses parâmetros).
- **Prompt caching:** regras + perfil de marca do cliente vão num bloco cacheado, sempre **antes** do que muda a cada chamada. O cache é por
  modelo (Haiku e Sonnet não compartilham) e a API só cacheia trechos acima do mínimo do modelo — perfis curtos podem não cachear.
  Confira o efeito real em "Custo de IA" do cliente (tokens lidos do cache).
- **Registro:** cada chamada grava tokens, modelo, cliente e custo estimado em `gcc_uso_api`. O custo é uma **estimativa** pela tabela de preços
  em `server/index.js` (confira com a fatura da Anthropic). Valores em US$; o equivalente em R$ usa a cotação de Configurações.
- **Limites:** tokens de saída por tipo de operação (Configurações > Custos e limites de IA), orçamento mensal global e por cliente
  (aviso a 80% no início; ao passar do limite, cada geração pede confirmação), variações por geração e reaproveitamento de buscas de mercado recentes.

## Publicar para o cliente abrir o link de aprovação
O link de aprovação abre a própria página do app (`#/aprovar/<token>`) e lê/grava direto no Firestore, então precisa de: (1) as **regras publicadas**
e (2) o **frontend em um endereço público** (o servidor de IA NÃO é necessário para o cliente, só para você gerar com IA). Defina `VITE_URL_PUBLICA` com esse endereço
antes de gerar links. Hospedagem: Netlify/Vercel/Cloudflare Pages (`npm run build`, pasta `dist`,
com as variáveis `VITE_FIREBASE_*`). Um túnel temporário (Cloudflare Tunnel/ngrok) também serve, mas só funciona com o seu computador ligado.
O site exportável do cliente é um arquivo HTML independente do app: hospede-o onde quiser (não precisa do painel no ar).

## Backup
"Exportar dados" (início = tudo; dentro do cliente = só ele) baixa um JSON. Não inclui os arquivos do Storage (só os links) nem os
tokens dos links de aprovação (por segurança). "Importar backup" (início) lê esse mesmo arquivo e grava cada documento de volta,
**por cima de qualquer um existente com o mesmo id** — é uma restauração, não uma mesclagem; use para recuperar de uma perda de
dados, não como rotina. As respostas de aprovação não são restauradas (o arquivo não guarda o token/id delas).

## Storage (upload de arquivo final e fotos de produto)
Enviar o arquivo final de um criativo ou fotos de produto usa o Firebase Storage do projeto, que **exige o plano Blaze**
(pago por uso; tem cota gratuita generosa, mas exige cartão cadastrado no projeto Firebase). Enquanto o Storage não estiver
ativado no console do projeto, o upload falha e a interface mostra um aviso explicando isso — o resto do app funciona
normalmente sem essas duas telas. Para ativar: Console do Firebase > Storage > "Vamos começar" (isso muda o projeto para o
plano Blaze) e depois `firebase deploy --only storage` para publicar `storage.rules`.

## Custo de IA: arquivamento mensal
`gcc_uso_api` guarda um documento por chamada de IA. Para não crescer para sempre, meses **fechados** (qualquer mês que não
seja o atual) são resumidos automaticamente num único documento em `gcc_uso_api_resumo` (total de tokens/custo, por cliente e
por tipo de operação) e os registros individuais daquele mês são apagados. Isso acontece sozinho, em segundo plano, na
primeira vez que o Início é aberto depois da virada do mês (cobre até 6 meses de atraso). O mês corrente nunca é fechado — o
card "Custo de IA" do início e do cliente continuam mostrando o gasto do mês em curso normalmente; o card do cliente soma o
total arquivado dos meses fechados ao total acumulado, mas sem o detalhe por operação desses meses (só o total).

## Produção
Hospedagem decidida: **VPS sempre ligado, processo mantido pelo PM2** (`npm run build` e depois `pm2 start server/index.js
--name gcc -- ` com `NODE_ENV=production`, ou um `ecosystem.config.js` do PM2 apontando pra isso). O Express serve `dist/` +
`/api` no mesmo processo. Firebase Hosting sozinho não roda o servidor de IA. Como o processo fica sempre no ar (sem
escalar a zero nem trocar de instância), os limitadores de taxa e os contadores de cota diária do Estúdio (em memória e em
`server/.uso-imagens.json`/`.uso-videos.json`) continuam funcionando como estão — não há necessidade de movê-los para o
Firestore nessa hospedagem.

## Estrutura
- `src/core`: firebase, auth, storage (dados + arquivos), ui, ia (prompts), tema
- `src/modules`: uma responsabilidade por arquivo (clientes, onboarding, criativos, hooks, referencias, campanhas, resultados, produtos, sites,
  relatorios, dashboard, alertas, playbooks, duplicar, busca, custo, backup, aprovacao, configuracoes, estudio)
- `src/lib`: constantes, regras puras (metricas), geração de site, CSV, PDF, exclusão em cascata (cascata.js), envio de arquivo com mensagem clara (uploads.js)
- `server/`: proxy autenticado para a Anthropic (modelo por tarefa, cache, custo, busca web), geração de imagem/vídeo por IA

Coleções Firestore: `gcc_configuracoes`, `gcc_clientes`, `gcc_criativos`, `gcc_hooks`, `gcc_referencias`, `gcc_campanhas`, `gcc_resultados`,
`gcc_produtos`, `gcc_sites`, `gcc_playbooks`, `gcc_uso_api`, `gcc_uso_api_resumo` (arquivo mensal, ver "Custo de IA: arquivamento mensal"),
`gcc_aprovacoes`, `gcc_aprovacao_respostas`.
Arquivos no Storage: `gcc/{clienteId}/...` (exige o plano Blaze — ver "Storage").

## Estúdio de peças (foto e vídeo prontos para a campanha)
No detalhe de cada criativo, **"Gerar foto e vídeo"** monta o material a partir do texto do criativo, direto no navegador (sem custo por peça):
- **Foto (PNG):** 3 templates (foto em tela cheia, foto + painel de cor, só texto) nos formatos 1:1, 4:5 e 9:16, com logo e cores da marca.
- **Vídeo (MP4):** a linha do tempo vem do roteiro ("Cena 1 (0-3s): … Voz: …"), com legendas animadas, fotos/vídeos em rodízio, música opcional e CTA final. A gravação é em tempo real e a aba precisa ficar visível. Se o navegador só gravar WebM, converta para MP4 (Meta/TikTok pedem MP4).
- Os arquivos são **baixados no computador** (não usam o Storage). As fotos de origem escolhidas no estúdio não ficam salvas.
- **Navegação (decisão, não esquecimento):** o Estúdio abre como modal de dentro do criativo, sem rota própria e fora do `escopo` do cliente — ele não guarda um histórico de peças no Firestore (é uma exportação pontual ligada a um criativo), então não segue o padrão de aba dos demais módulos. Ver comentário no topo de `src/modules/estudio.js`.
- **Prompts (assinatura):** "Sugerir prompts" faz o Claude escrever prompts de imagem e de vídeo para colar em geradores externos. O Claude não gera imagem nem vídeo.
- **Imagem por IA gratuita, em rodízio** (`server/imagens.js`): tenta os provedores na ordem de `IMAGEM_PROVEDORES` (só os que têm chave no `.env`); se um falhar ou passar do limite diário do app, usa o próximo. Cotas gratuitas mudam: confira nos sites.
  - **Cloudflare Workers AI** (10.000 "neurons"/dia gratuitos, dividido entre todos os modelos): crie conta em cloudflare.com, copie o *Account ID* e crie um API Token com permissão "Workers AI".
  - **Together AI** (modelo FLUX schnell gratuito, se ainda disponível): crie a chave em together.ai.
  - **Hugging Face** (crédito mensal muito pequeno): crie um token em huggingface.co/settings/tokens.
  - **OpenAI** é paga e nunca entra sozinha: só se listada em `IMAGEM_PROVEDORES`.
  - **Foto → vídeo com IA** (`server/videos.js`): "Animar com IA" dá movimento real a uma foto (clipe de ~5 s) usando o modelo LTX da **Pixazo** (gratuito na fase de prévia, sem cartão; limites e termos podem mudar, e o uso comercial depende dos termos deles). Crie a conta em pixazo.ai, gere a chave e coloque `PIXAZO_API_KEY` no `.env`. A Pixazo só aceita a foto por URL pública: o servidor a envia por 1 hora à hospedagem anônima litterbox.catbox.moe. **Use só fotos que o cliente autorizou.** Limite do app: `VIDEO_LIMITE_DIA` (padrão 10).
  - Vídeo 100% gerado por IA a partir de texto não tem opção gratuita por API; para isso use os prompts nas ferramentas com créditos diários no site (Kling, Veo/Flow etc.).
