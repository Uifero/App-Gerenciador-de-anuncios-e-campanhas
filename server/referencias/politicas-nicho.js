// Referência fixa para a IA: políticas de anúncio do Meta por nicho além de saúde, resumo com palavras nossas dos Padrões
// de Publicidade do Meta (atributos pessoais, produtos para menores, preço/sorteio) e do CDC/Conar. A regra de saúde
// continua em src/lib/saude.js (REGRA_SAUDE), que bloqueia; aqui é orientação para a IA não escrever o problema.
// Entra nas tarefas com `politicas: true` em TAREFAS (server/index.js): criativos, refino, hooks e especialista_copy.

export const REFERENCIA_POLITICAS = `REFERÊNCIA FIXA — Políticas de anúncio por nicho (Meta), além da regra de saúde, que continua valendo e vem antes.
- Atributos pessoais: nunca afirmar ou insinuar algo sobre quem vê ("você está acima do peso?", "você tem acne?", "sendo mãe solo...", idade, religião, renda, saúde, orientação). Fale da situação ou do produto, não da pessoa.
- Moda: sem corpo idealizado como promessa ("fica magra", "esconde a barriga"); tamanhos e caimento descritos com medidas reais; foto de modelo não pode sugerir resultado no corpo.
- Cosméticos: sem "antes e depois", sem "elimina", "cura", "rejuvenesce X anos"; efeito só como sensação ou uso ("textura leve", "fácil de espalhar") e o que estiver no rótulo.
- Produtos infantis: falar com o adulto, nunca pedir à criança que compre ou peça aos pais; segurança e idade indicada só como no rótulo/certificação.
- Preço riscado (de/por) só se o preço antigo foi praticado de verdade; desconto em % só se estiver cadastrado; sem "grátis" com condição escondida.
- Sorteios e brindes: só se o cliente tiver um ativo, com regras claras; o Meta não pode aparecer como organizador; sem "marque 3 amigos" como condição.
- Na dúvida, escreva a versão neutra e diga ao gestor o que conferir.`;
