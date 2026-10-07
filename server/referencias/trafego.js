// Referência opcional para a IA: critérios de gestão de tráfego pago resumidos com palavras nossas a partir do squad
// "Traffic Masters" do Xquads (github.com/ohmyjahh/xquads-squads, licença MIT). Entra no contexto das tarefas marcadas com
// `trafego: true` em TAREFAS (server/index.js). Ficaram de fora, de propósito, os benchmarks numéricos do squad (CPM, CTR,
// CPA, ROAS médios): são em US$ e do mercado americano, e a IA não pode citá-los como dado do cliente nem do nicho.
// Os números daqui são regras práticas de manejo (prazos e percentuais de ajuste), não resultado esperado.

export const REFERENCIA_TRAFEGO = `REFERÊNCIA OPCIONAL — Critérios de gestão de tráfego (uma referência entre outras; use quando couber no cliente e no pedido, ignore quando não couber; nunca passa por cima dos dados reais e das fontes listadas no pedido, da regra de não inventar dados, da política de anúncios do Meta nem do perfil de marca). Os números abaixo são regras práticas de manejo, NÃO médias de mercado: nunca os apresente como benchmark nem compare o cliente com eles como se fossem dado.
- Leitura de dado: menos de ~7 dias ou poucas conversões = indício, não conclusão. Não desligue nem escale conjunto em aprendizado (nos primeiros ~3 dias, não mexa).
- Diagnóstico em cadeia: CTR baixo = gancho/criativo ou público errado; CTR bom e conversão baixa = página, oferta ou destino (site/WhatsApp); conversão boa e CPA alto = CPM, orçamento ou lance; alcance baixo = público estreito ou verba pequena.
- Fadiga: frequência subindo (em público frio, acima de ~3) com CTR caindo e CPA subindo pede criativo novo, não mais verba.
- Escala vertical: aumentar ~20% a cada 48–72 h só no que está estável na meta; se o CPA piorar mais de ~30% por 48 h, voltar um passo. Escala horizontal: duplicar o vencedor para públicos novos. Só escalar com rastreamento confiável e criativos de reserva prontos.
- Orçamento: mudar aos poucos, nunca tudo num dia; reduzir antes de desligar algo que dá lucro; decidir por margem, não só por faturamento.
- Classificar o que está no ar: vencedor (escalar), na meta (otimizar), abaixo da meta (corrigir ou pausar), sem volume nem função (desligar).
- Teste de criativo: mudar uma coisa por vez (mesmo gancho com outro visual, mesmo visual com outro gancho, mesma mensagem em outro formato).
- Funil: não pôr toda a verba em remarketing, porque o público quente esgota rápido.
- Cada recomendação: o que o dado mostra, por que importa e a ação concreta, em ordem de impacto.`;
