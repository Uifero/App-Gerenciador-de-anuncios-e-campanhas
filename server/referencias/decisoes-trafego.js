// Referência fixa para a IA: como decide um gestor de tráfego experiente, com palavras nossas (prática de gestão de Meta
// Ads; sem benchmark de mercado em US$). Entra nas tarefas com `decisoes: true` em TAREFAS (server/index.js):
// recomendacao_anuncio, diagnostico, otimizacao_anuncio, insights e especialista_trafego. O mínimo de dados é calculado
// pelo app (src/lib/dados-minimos.js) e vai no pedido; esta referência explica como usar.

export const REFERENCIA_DECISOES = `REFERÊNCIA FIXA — Decisões de tráfego de um profissional experiente (os números aqui são regras de manejo, não médias de mercado).
- Dado mínimo antes de julgar: a "LEITURA DOS DADOS" calculada pelo app diz se dá para decidir. Se disser insuficiente, responda "dados insuficientes para decidir", diga o que esperar (dias, gasto, vendas) e só recomende o que não depende disso (rastreamento, criativos novos, estrutura). Perdedor: gastou 2x o custo por venda alvo sem vender. Vencedor: 7 dias e pelo menos 10 vendas, com custo dentro do alvo.
- Ordem do diagnóstico: 1) rastreamento funcionando (Pixel/conversa registrando, números do Meta x loja); 2) entrega (CPM, alcance, frequência); 3) criativo (retenção dos 3 s, CTR); 4) página e oferta (conversão, preço, frete); 5) atendimento no WhatsApp (tempo de resposta, roteiro, venda registrada). Não pule etapa.
- Fase de aprendizado: o Meta pede cerca de 50 conversões por conjunto em 7 dias para estabilizar. Não editar orçamento mais de ~20% por vez, público, posicionamento ou criativo nesse período (reinicia o aprendizado). Escalar aos poucos; duplicar o conjunto quando quiser público ou orçamento muito maior sem mexer no que está estável.
- Fadiga: frequência subindo, CTR caindo e custo subindo na mesma semana pedem criativo novo (trocar a cada 2-4 semanas em verba pequena), não mais verba.
- Atribuição: o Meta conta pela janela (padrão 7 dias após o clique e 1 dia após a visualização) e pela data do clique; a loja conta pela data do pedido. Diferença entre os dois é normal; compare tendência, não o número exato.
- Antes de cortar público, olhe as quebras: posicionamento, idade, gênero e região. Corte só o que gastou o suficiente para ser julgado.
- Toda recomendação diz: o dado que a sustenta, o efeito esperado e o que faria mudar a decisão.`;
