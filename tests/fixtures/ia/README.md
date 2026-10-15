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
| `plano-thermora-motivos-real.json` | "Analisar meu pedido" (tarefa `plano_site`, Sonnet 5, maxTokens 10000) com os "5 motivos" da Thermora: plano + as 3 versões de cada texto no MESMO pedido; a IA devolveu a "melhorada" igual ao original (o app trata como sem versão) e a "segura" vazia nas alegações | chamada real, 09/10/2026 |
| `plano-thermora-motivos.json` | O mesmo plano com versões melhorada/segura distintas, para os testes a–e (unitários e navegador) | escrita à mão a partir da real |
| `sugerir-textos-thermora.json` | "Sugerir de novo" de um item de texto (tarefa `plano_site`) | escrita à mão |
| `pacote-thermora-qualidade-real.json` | "Gerar site" da Thermora (tarefa `pacote`, Sonnet 5) com as referências de loja sem cara de IA, página de produto e requisitos legais | chamada real, 14/10/2026 |
| `ideias-thermora-qualidade-real.json` | "Criar criativos", passo 2 (tarefa `criativos`, Sonnet 5), 4 ideias com estilo orgânico, roteiro por formato (`roteiro`) e políticas por nicho | chamada real, 14/10/2026 |
| `recomendacao-thermora-qualidade-real.json` | "Analisar e recomendar" (tarefa `recomendacao_anuncio`, Sonnet 5) com pouco dado (3 dias, 2 vendas) e a LEITURA DOS DADOS do app: "Dados insuficientes para decidir", `decisao` e `mudaSe` | chamada real, 14/10/2026 |
| `ajuste-cliches-moda.json` | "Cara de IA" > Corrigir: reescrita dos clichês pela proposta de "Ajustar este site" | escrita à mão |
| `refino-natural-thermora.json` | "Parece anúncio?" > Aplicar as sugestões numa ideia com cara de vitrine | escrita à mão |
| `plano-modelo-secoes.json` | "Analisar meu pedido" com o modelo pronto preenchido em parte (S1, S2, S3, S6): FAQ vazia da IA e um preço inventado no "não sei" (o app tira) | escrita à mão |
| `ajuste-secao-thermora-real.json` | Ajuste por seção (tarefa `ajuste_secao`, Haiku 4.5) a partir da sugestão da Conferência "Não feito" do subtítulo do banner: só a seção hero enviada, devolveu só a operação dela | chamada real, 14/10/2026 |
| `ajuste-entender-thermora-real.json` | "Entendi assim" do texto livre "troca a F12 pela F28 na galeria do produto" (tarefa `ajuste_entender`, Haiku 4.5): só a seção produto | chamada real, 14/10/2026 |
| `ajuste-secao-galeria-thermora.json` | Troca F12 → F28 na galeria do Thermora (operações de foto) | escrita à mão |
| `ajuste-entender-duas-secoes.json` / `ajuste-secao-duas-secoes.json` | Pedido em duas seções (banner + FAQ), com uma operação fora delas (a F5 na galeria, que o app recusa) e uma alegação de saúde | escrita à mão |
| `ajuste-entender-ambiguo.json` | "muda a foto": pergunta com duas opções | escrita à mão |
| `conferencia-ajuste-thermora.json` | "Conferir de novo" com o motivo reescrito pela IA (a sugestão ignorada não volta) | escrita à mão |
| `apontar-outro-thermora-real.json` | "Apontar no site" > "Outro: escrever" no subtítulo do banner (tarefa `ajuste_secao`, Haiku 4.5): só a seção hero + o id do elemento; devolveu só a operação do subtítulo | chamada real, 15/10/2026 |
| `print-mapeamento-thermora-real.json` | "Anexar print" (tarefa `ajuste_entender_print`, Haiku 4.5 com visão): print da página do produto com um círculo + "tira isso daqui"; o círculo do teste caiu no botão "Adicionar ao carrinho" e a IA ligou a marca ao `produto.botao` (certo para a imagem) | chamada real, 15/10/2026 |
| `print-ambiguo-thermora.json` / `print-referencia-thermora.json` / `ajuste-secao-referencia-thermora.json` | Print ambíguo ("Você marcou o selo de frete ou o preço?") e print de outro site (só a ideia de layout) | escrita à mão |
| `animacao-thermora-real.json` | Biblioteca de animações: "Preencher os textos com IA" (tarefa `animacao`, Haiku 4.5, limite 900) no preset "Foto com zoom lento + legenda falada" pela ideia "Rotina" da Thermora | chamada real, 14/10/2026 |
| `simulador-navegador.js` | IA simulada no navegador com as fixtures acima: `await import('/tests/fixtures/ia/simulador-navegador.js')` no console (modo demo) | sem IA |
| `cli-limite.mjs` | CLI falsa: imprime o aviso de limite da assinatura e trava | sem IA |
| `api-falsa.mjs` | API da Anthropic falsa (stream SSE) para testar a reserva | sem IA |
| `plano-thermora-secoes-real.json` | "Analisar meu pedido" por seção (tarefa `plano_site`, Sonnet 5, maxTokens 16000) com `tests/fixtures/pedido-site-thermora-longo.md` (~11.400 caracteres: "###", "**...:**", "***", listas "F23, F26..." e "f27/f28/...", F99 inexistente, F27 x F41 no seletor): 20 seções, ignorado vazio, ordem certa, F99 marcado, F27/F41 e F29 como perguntas; 14.386 tokens de saída em 93 s | chamada real, 14/10/2026 |
| `plano-thermora-secoes.json` | O mesmo pedido no formato por seção, escrito à mão (testes unitários e IA simulada no navegador) | escrita à mão |
| `plano-secao-thermora.json` | "Corrigir" de uma seção (tarefa `plano_secao`, Haiku): a página do produto relida com a correção do operador | escrita à mão |

## IA simulada no navegador
Com o app no modo demo, troque `window.fetch` para responder `POST /api/claude` com `{ trabalho: 'mock1' }` (202) e
`GET /api/claude/trabalho/mock1` com `{ pronto: true, status: 200, corpo: { texto, provedor: 'cli', uso } }`, usando o
`texto` de uma fixture. Para simular o limite da assinatura no servidor: `IA_CLI_BIN=tests/fixtures/ia/cli-limite.mjs`
com `ANTHROPIC_BASE_URL` apontando para a API falsa (ver `tests/servidor-limite.test.js`).
