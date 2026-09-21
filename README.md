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

## Segurança (leia antes de publicar)
- **A chave da Anthropic nunca vai ao navegador.** O frontend chama `/api/claude`; `server/index.js` valida o ID token do
  Firebase (JWKS público do Google, sem credencial de admin) e só então chama a API. Defina `ADMIN_EMAIL` para aceitar só o administrador.
- **`firestore.rules` PRESERVA a regra aberta do Painel de Comissões** (`painelComissoes`) e restringe `gcc_*` a usuário autenticado.
  Publique com `firebase deploy --only firestore:rules,storage` — cuidado: se você editar as regras do painel, faça-o neste mesmo arquivo,
  pois um deploy sobrescreve todas as regras do projeto.
- `VITE_DEMO_MODE`, `DEV_AUTH_BYPASS` e `ANTHROPIC_BASE_URL` são só para teste local; não os defina em produção
  (o bypass é ignorado com `NODE_ENV=production`, e o build de produção não deve ter `VITE_DEMO_MODE`).
- Nenhum processamento de pagamento: o site gerado só expõe `window.checkoutHandler` como ponto de encaixe.

## Produção
`npm run build` e `npm start` (Express serve `dist/` + `/api`). Precisa de um host Node (Render, Railway, Cloud Run, VPS).
Firebase Hosting sozinho não roda o servidor de IA.

## Estrutura
- `src/core`: firebase, auth, storage (dados + arquivos), ui, ia (prompts)
- `src/modules`: uma responsabilidade por arquivo (clientes, criativos, hooks, referencias, campanhas, resultados, produtos, sites, relatorios, dashboard, configuracoes)
- `src/lib`: constantes, geração de site, CSV, PDF
- `server/`: proxy autenticado para a Anthropic (com busca web)

Coleções Firestore: `gcc_configuracoes`, `gcc_clientes`, `gcc_criativos`, `gcc_hooks`, `gcc_referencias`, `gcc_campanhas`, `gcc_resultados`, `gcc_produtos`, `gcc_sites`.
Arquivos no Storage: `gcc/{clienteId}/...`.
