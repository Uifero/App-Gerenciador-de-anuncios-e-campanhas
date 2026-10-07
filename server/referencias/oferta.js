// Referência opcional para a IA: critérios de oferta resumidos com palavras nossas a partir do squad "Hormozi Squad" do
// Xquads (github.com/ohmyjahh/xquads-squads, licença MIT). Entra no contexto das tarefas marcadas com `oferta: true` em
// TAREFAS (server/index.js). Ficou de fora, de propósito, a parte do método que CRIA elementos (bônus com "valor" em
// dinheiro, garantia nova, preço-âncora, escassez): o app não deixa a IA inventar preço, prazo, garantia nem número. Para
// o público final, a IA só organiza o que já existe; para o gestor, pode sugerir algo novo como sugestão a validar.

export const REFERENCIA_OFERTA = `REFERÊNCIA OPCIONAL — Critérios de oferta (uma referência entre outras; use quando couber no cliente e no pedido, ignore quando não couber; nunca passa por cima da regra de não inventar dados, da política de anúncios do Meta nem do perfil de marca). O formato de saída e os campos pedidos sempre valem sobre esta referência.
- REGRA DE OURO: em texto para o PÚBLICO FINAL (site, anúncio), use só preço, garantia, bônus, brinde, frete, prazo, troca e prova que existam no perfil, nos produtos ou no cadastro; nunca crie um. Em análise ou plano para o GESTOR, pode SUGERIR um elemento novo, sempre dito como sugestão a combinar com o cliente e sem número inventado (ex.: "avaliar oferecer troca grátis na primeira compra", nunca "garantia de 30 dias").
- Valor percebido = resultado desejado × confiança de que vai conseguir, dividido por tempo até o resultado × esforço. Para subir o valor sem baixar o preço: resultado concreto, nas palavras do público; confiança com prova real, garantia e política que já existam; mostrar o que encurta o tempo (entrega, uso imediato) e o que poupa esforço (fácil de usar, atendimento, troca).
- Diagnóstico: ver qual dos quatro está mais fraco e atacar esse primeiro. Ex.: clique bom e pouca venda com preço coerente costuma ser confiança baixa (prova, garantia ou troca pouco visíveis) ou esforço alto (frete, prazo, checkout, dúvida sem resposta).
- Cada objeção do perfil vira uma resposta na oferta ou na página (frete, prazo, troca, como usar, para quem não é).
- O que a pessoa leva fica claro item a item; só entra o que ajuda no resultado principal.
- Garantia: só a que o negócio já cumpre.
- Preço: justificar pelo resultado, não pelo concorrente. Desconto só com motivo real cadastrado; "de/por" só com preço cheio real cadastrado.
- Escassez e prazo: só os reais.
- "Para quem não é": usar só se for verdade para o produto; reduz arrependimento e troca.`;
