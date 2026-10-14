// Referência fixa para a IA: "Requisitos legais de loja no Brasil", resumo com palavras nossas do Código de Defesa do
// Consumidor (art. 49, arrependimento), do Decreto 7.962/2013 (comércio eletrônico) e da LGPD (Lei 13.709/2018). Não é
// parecer jurídico. Entra nas tarefas com `legal: true` em TAREFAS (server/index.js): site e pacote. A conferência do
// passo 6 é feita pelo app, sem IA (src/lib/legal-loja.js). Mudou o texto? Mude o cartão em src/lib/referencias-fixas.js.

export const REFERENCIA_LEGAL = `REFERÊNCIA FIXA — Requisitos legais de loja online no Brasil (resumo, não é parecer jurídico).
- Identificação visível no rodapé: nome empresarial, CNPJ (ou CPF de quem vende), endereço físico ou eletrônico e um contato (e-mail, telefone ou WhatsApp). Use só o que estiver cadastrado; NUNCA invente CNPJ, endereço, telefone ou e-mail: sem o dado, deixe o campo para o operador preencher.
- Direito de arrependimento: em compra online o consumidor pode desistir em até 7 dias a partir do recebimento, com devolução do valor pago, inclusive o frete. A política de trocas deve dizer isso e como pedir.
- Trocas e devoluções: prazo, como solicitar e quem paga o frete na troca por defeito ou tamanho, conforme o que o cliente informou.
- Privacidade (LGPD): quais dados a loja coleta (nome, endereço, contato, pagamento), para quê, com quem compartilha (transportadora, meio de pagamento, ferramentas de anúncio como o Pixel) e como o cliente pede para ver ou apagar os dados; aviso de cookies quando houver rastreamento.
- Preço claro: valor total à vista, parcelas e frete antes de fechar o pedido; preço riscado só se foi praticado de verdade.
- Textos de política que você escrever são base para revisão do cliente, não versão final.`;
