# Respostas gravadas da IA (fixtures)

Regra do CLAUDE.md: no máximo 1 chamada real por função nova ou alterada em cada fase; o resto usa estes arquivos ou IA simulada.

| Arquivo | O que é | Origem |
|---|---|---|
| `plano-thermora-real.json` | "Analisar meu pedido" (tarefa `plano_site`, Sonnet 5) com o texto real do operador | chamada real, 06/10/2026 |
| `pacote-thermora-real.json` | Geração do pacote (tarefa `pacote`, Sonnet 5) já lida pelo app | chamada real, 06/10/2026 (antes da correção que tira o texto bruto quando há plano) |
| `conferencia-thermora-real.json` | "Conferência do pedido" (tarefa `conferencia_site`, Haiku 4.5) | chamada real, 06/10/2026 |
| `plano-thermora.json` | Plano escrito à mão no mesmo formato, para os testes unitários | sem IA |
| `extracao-anuncio-real.json` | "Preencher os campos pelo texto" (tarefa `extracao_anuncio`, Haiku 4.5), cliente só WhatsApp | chamada real, 07/10/2026 |
| `palavras-nicho-real.json` | Palavras da Biblioteca de Anúncios (tarefa `palavras_nicho`, Haiku 4.5), moda feminina | chamada real, 07/10/2026 |
| `pesquisa-nicho-real.json` | Pesquisa web do nicho (tarefa `pesquisa_nicho`, Sonnet 5): a única busca web real concluída na fase | chamada real, 07/10/2026 |
| `resumo-documento-real.json` | Resumo de documento de referência (tarefa `resumo_documento`, Sonnet 5) | chamada real, 07/10/2026 |
| `recomendacao-anuncio-real.json` | "Analisar e recomendar" (tarefa `recomendacao_anuncio`, Sonnet 5), cliente só WhatsApp | chamada real, 07/10/2026 |
| `leitura-prints-real.json` | Leitura de 3 prints (tarefa `leitura_resultados`, Sonnet 5): WhatsApp, site e conversa com dado pessoal; a IA fechou a lista cedo (caso de `juntarItensSoltos`) | chamada real, 07/10/2026 |
| `otimizacao-anuncio-real.json` | "Plano de otimização" WhatsApp x Site (tarefa `otimizacao_anuncio`, Sonnet 5) | chamada real, 07/10/2026 |
| `criativos-thermora-antes-depois-real.json` | "Gerar criativos" (tarefa `criativos`, Sonnet 5), Thermora: o mesmo pedido sem (antes) e com (depois) as referências de tráfego/copy/oferta | chamadas reais, 07/10/2026 |
| `recomendacao-thermora-antes-depois-real.json` | "Analisar e recomendar" (tarefa `recomendacao_anuncio`, Sonnet 5), Thermora sem dados: mesmo pedido, antes e depois das referências | chamadas reais, 07/10/2026 |
| `recomendacao-moda.json` | Recomendação escrita à mão (teste 60/40 e citações inventadas, para testar a conferência) | sem IA |
| `simulador-navegador.js` | IA simulada no navegador com as fixtures acima: `await import('/tests/fixtures/ia/simulador-navegador.js')` no console (modo demo) | sem IA |
| `cli-limite.mjs` | CLI falsa: imprime o aviso de limite da assinatura e trava | sem IA |
| `api-falsa.mjs` | API da Anthropic falsa (stream SSE) para testar a reserva | sem IA |

## IA simulada no navegador
Com o app no modo demo, troque `window.fetch` para responder `POST /api/claude` com `{ trabalho: 'mock1' }` (202) e
`GET /api/claude/trabalho/mock1` com `{ pronto: true, status: 200, corpo: { texto, provedor: 'cli', uso } }`, usando o
`texto` de uma fixture. Para simular o limite da assinatura no servidor: `IA_CLI_BIN=tests/fixtures/ia/cli-limite.mjs`
com `ANTHROPIC_BASE_URL` apontando para a API falsa (ver `tests/servidor-limite.test.js`).
