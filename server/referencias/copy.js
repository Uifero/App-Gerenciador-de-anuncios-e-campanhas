// Referência opcional para a IA: critérios de copy para anúncio resumidos com palavras nossas a partir do squad "Copy Squad"
// do Xquads (github.com/ohmyjahh/xquads-squads, licença MIT). Entra no contexto das tarefas marcadas com `copy: true` em
// TAREFAS (server/index.js). Ficou de fora, de propósito, o que bate com as REGRAS CRÍTICAS do app (src/core/ia.js): agitar a
// dor com drama, escassez/urgência fabricada e linguagem de venda direta. Consciência do público e narrativas já estão na
// referência Vortex; aqui só o complemento de escrita.

export const REFERENCIA_COPY = `REFERÊNCIA OPCIONAL — Critérios de copy para anúncio (uma referência entre outras; use quando couber no cliente e no pedido, ignore quando não couber; nunca passa por cima das REGRAS CRÍTICAS acima — tom orgânico, sem linguagem de venda óbvia, termos proibidos, não inventar dados —, da política de anúncios do Meta nem do perfil de marca; complementa a referência de metodologia, não a substitui). O formato de saída, as categorias e os campos pedidos no pedido sempre valem sobre esta referência.
- Escorregador: a função da primeira frase é fazer ler ou assistir a próxima, e assim por diante. Para público frio, nada de saudação, introdução ou nome da marca abrindo o texto.
- Gancho pela consciência: quem não sabe do problema = cena, história ou identidade, sem citar o produto; sabe do problema = nomear a dor com as palavras do próprio público (do perfil), exceto em produto de saúde/emagrecimento: aí dor sobre corpo, peso ou aparência (ex.: "barriga", "não consigo emagrecer") nunca vira gancho nem texto, porque o Meta proíbe anúncio que gere autoimagem negativa; use a dor permitida (cansaço, rotina, falta de disposição); conhece soluções = mostrar o mecanismo, por que esta funciona diferente; conhece o produto = prova real e resposta à objeção; pronto para comprar = oferta clara, só a que estiver ativa no perfil.
- Variar o tipo de gancho e o tamanho: pergunta, "como...", "por que...", novidade, lacuna de curiosidade, número específico, ordem direta.
- Específico vence adjetivo: cena, objeto, momento do dia, detalhe concreto. Número só se estiver no perfil.
- Benefício antes de característica: o que muda na vida da pessoa, com a característica como prova.
- Credibilidade: a promessa cabe no que o produto entrega e no que a prova disponível sustenta. Curiosidade que o texto não cumpre é isca, não gancho.
- Objeção: responder a principal objeção do perfil dentro do texto, sem soar defensivo.
- Urgência só se for real (oferta, prazo ou estoque que constem no perfil); nunca fabricada.
- Um anúncio, um objetivo, um CTA.
- Estruturas: PAS (problema, aprofundar a dor com empatia e sem drama, solução), AIDA, Antes-Depois-Ponte. No campo "framework" do JSON use só AIDA, PAS, 4Us, HRR ou livre.
- Autoteste: alguém pararia de rolar o feed por isso? Soa como uma pessoa falando?`;
