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
tokens dos links de aprovação. Ainda não há importação/restauração pela interface.

## Produção
`npm run build` e `npm start` (Express serve `dist/` + `/api`). Precisa de um host Node (Render, Railway, Cloud Run, VPS).
Firebase Hosting sozinho não roda o servidor de IA.

## Estrutura
- `src/core`: firebase, auth, storage (dados + arquivos), ui, ia (prompts), tema
- `src/modules`: uma responsabilidade por arquivo (clientes, onboarding, criativos, hooks, referencias, campanhas, resultados, produtos, sites,
  relatorios, dashboard, alertas, playbooks, duplicar, busca, custo, backup, aprovacao, configuracoes)
- `src/lib`: constantes, regras puras (metricas), geração de site, CSV, PDF
- `server/`: proxy autenticado para a Anthropic (modelo por tarefa, cache, custo, busca web)

Coleções Firestore: `gcc_configuracoes`, `gcc_clientes`, `gcc_criativos`, `gcc_hooks`, `gcc_referencias`, `gcc_campanhas`, `gcc_resultados`,
`gcc_produtos`, `gcc_sites`, `gcc_playbooks`, `gcc_uso_api`, `gcc_aprovacoes`, `gcc_aprovacao_respostas`.
Arquivos no Storage: `gcc/{clienteId}/...`.
