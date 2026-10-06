# Respostas gravadas da IA (fixtures)

Regra do CLAUDE.md: no máximo 1 chamada real por função nova ou alterada em cada fase; o resto usa estes arquivos ou IA simulada.

| Arquivo | O que é | Origem |
|---|---|---|
| `plano-thermora-real.json` | "Analisar meu pedido" (tarefa `plano_site`, Sonnet 5) com o texto real do operador | chamada real, 06/10/2026 |
| `pacote-thermora-real.json` | Geração do pacote (tarefa `pacote`, Sonnet 5) já lida pelo app | chamada real, 06/10/2026 (antes da correção que tira o texto bruto quando há plano) |
| `conferencia-thermora-real.json` | "Conferência do pedido" (tarefa `conferencia_site`, Haiku 4.5) | chamada real, 06/10/2026 |
| `plano-thermora.json` | Plano escrito à mão no mesmo formato, para os testes unitários | sem IA |
| `cli-limite.mjs` | CLI falsa: imprime o aviso de limite da assinatura e trava | sem IA |
| `api-falsa.mjs` | API da Anthropic falsa (stream SSE) para testar a reserva | sem IA |

## IA simulada no navegador
Com o app no modo demo, troque `window.fetch` para responder `POST /api/claude` com `{ trabalho: 'mock1' }` (202) e
`GET /api/claude/trabalho/mock1` com `{ pronto: true, status: 200, corpo: { texto, provedor: 'cli', uso } }`, usando o
`texto` de uma fixture. Para simular o limite da assinatura no servidor: `IA_CLI_BIN=tests/fixtures/ia/cli-limite.mjs`
com `ANTHROPIC_BASE_URL` apontando para a API falsa (ver `tests/servidor-limite.test.js`).
