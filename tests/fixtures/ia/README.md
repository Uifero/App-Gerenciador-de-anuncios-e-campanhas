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
| `criativos-thermora-regra-saude-real.json` | "Gerar criativos" (tarefa `criativos`), Thermora, com a `REGRA_SAUDE` contra autoimagem negativa: nenhum gancho de corpo/peso | chamada real, 07/10/2026 |
| `otimizacao-thermora-real.json` | "Plano de otimização" (tarefa `otimizacao_anuncio`), Thermora com 1 semana fictícia de WhatsApp x site: usa as referências de tráfego e oferta | chamada real, 07/10/2026 |
| `ganchos-criativo-moda-real.json` | "Gerar criativos" (tarefa `criativos`, Sonnet 5) com a biblioteca de ganchos, loja de moda, 3 variações: modelos 47, 68 e 5, sem colchete e sem repetir | chamada real, 08/10/2026 |
| `ganchos-thermora-asterisco-real.json` | "Gerar criativos" (tarefa `criativos`), Thermora com o modelo 37 (*) escolhido à mão: virou experiência de rotina, sem resultado no corpo | chamada real, 08/10/2026 |
| `especialista-thermora-real.json` | Especialistas: "Copy de resposta direta" (tarefa `especialista_copy`, Sonnet 5, limite 2500) sobre o criativo do modelo de gancho 37 da Thermora; marcou o relato de 30 dias como falta de dado | chamada real, 08/10/2026 |
| `criativos-thermora-sem-efeito-real.json` | "Gerar criativos" (tarefa `criativos`, Sonnet 5), Thermora com a `REGRA_SAUDE` nova (sem efeito no corpo nem condição de quem assiste), perfil citando "mais energia e metabolismo acelerado" de propósito: as 3 variações usam só composição real e rotina | chamada real, 08/10/2026 |
| `ideias-thermora-real.json` | "Criar criativos", passo 2 "Gerar ideias" (tarefa `criativos`, Sonnet 5, limite 3000), Thermora, Thermora Caps, destino WhatsApp, 2 ideias (modelos 73 e 19); o `formato` veio em texto livre ("Reels 9:16, …", "Estático 4:5 em carrossel") | chamada real, 08/10/2026 |
| `reescrita-especialista-thermora-real.json` | "Aplicar" da ação de gancho do especialista de copy (tarefa `refino`, Haiku 4.5, limite 2000) sobre o criativo acima: mudou só o gancho e recusou inventar o "30 dias" | chamada real, 08/10/2026 |
| `especialista-copy-acoes-thermora.json` | Consulta do especialista de copy no formato novo (ações com `tipo`/`campo`), a partir de `especialista-thermora-real.json` + 1 ação de campanha e 1 de WhatsApp | escrita à mão |
| `especialista-ganchos-peca-thermora.json` | "Ganchos e retenção em vídeo" sobre uma peça da Galeria (ações de gancho e CTA) | escrita à mão |
| `reescrita-peca-thermora.json` | Reescrita do gancho/CTA para o teste de "Aplicar" numa peça | escrita à mão |
| `reescrita-saude-thermora.json` | Reescrita que cria promessa de efeito no corpo (teste do bloqueio de saúde ao aplicar) | escrita à mão |
| `recomendacao-moda.json` | Recomendação escrita à mão (teste 60/40 e citações inventadas, para testar a conferência) | sem IA |
| `simulador-navegador.js` | IA simulada no navegador com as fixtures acima: `await import('/tests/fixtures/ia/simulador-navegador.js')` no console (modo demo) | sem IA |
| `cli-limite.mjs` | CLI falsa: imprime o aviso de limite da assinatura e trava | sem IA |
| `api-falsa.mjs` | API da Anthropic falsa (stream SSE) para testar a reserva | sem IA |

## IA simulada no navegador
Com o app no modo demo, troque `window.fetch` para responder `POST /api/claude` com `{ trabalho: 'mock1' }` (202) e
`GET /api/claude/trabalho/mock1` com `{ pronto: true, status: 200, corpo: { texto, provedor: 'cli', uso } }`, usando o
`texto` de uma fixture. Para simular o limite da assinatura no servidor: `IA_CLI_BIN=tests/fixtures/ia/cli-limite.mjs`
com `ANTHROPIC_BASE_URL` apontando para a API falsa (ver `tests/servidor-limite.test.js`).
