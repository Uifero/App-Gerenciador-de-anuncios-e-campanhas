// "Modelos de Prompt": biblioteca fixa (sem banco) de padrões testados para editar ou gerar foto de produto/criativo.
// Cada modelo: categoria, título, "envie" (o que anexar na IA de imagem), "resultado" (o que sai), o prompt base em
// INGLÊS (as IAs de imagem entendem melhor) com marcadores entre colchetes, e a tradução em português — a mesma
// convenção do "Sugerir prompts" do Estúdio. Tudo aqui é puro (sem DOM, sem IA) para dar para testar.
//
// Marcadores: os de TEXTO QUE APARECE NA IMAGEM (nome do produto, preço, chamada, pergunta) ficam iguais nos dois
// idiomas — a imagem sai em português; os DESCRITIVOS (cor, diferencial, uso…) podem ter um valor em inglês para o
// prompt e outro em português para a tradução (preenchimento com IA). No preenchimento manual, o mesmo valor vale
// para os dois.

export const CATEGORIAS_MODELO = [
  ['limpeza', 'Limpeza e padronização', 'Deixa a foto que o cliente mandou pronta para catálogo.'],
  ['premium', 'Estética premium', 'Transforma a foto em imagem de marca cara, sem mudar o produto.'],
  ['contexto', 'Contexto e uso', 'Mostra o produto sendo usado, no tamanho real ou arrumado para vitrine.'],
  ['anuncio', 'Anúncio e conversão', 'Peças prontas para Stories, feed e oferta.'],
];

/** Marcador -> como explicar o campo na tela, e se é texto que APARECE na imagem (fica em português nos dois idiomas). */
export const MARCADORES = {
  '[NOME DO PRODUTO]': { dica: 'Nome do produto, como está no catálogo', naImagem: true },
  '[COR DE DESTAQUE]': { dica: 'Cor da marca para os destaques (nome da cor e, se souber, o código #)', naImagem: false },
  '[DIFERENCIAL]': { dica: 'O que o produto tem de único (ex.: "tecido que não amassa")', naImagem: false },
  '[CHAMADA PARA AÇÃO]': { dica: 'Texto do botão (ex.: "Compre agora")', naImagem: true },
  '[PREÇO DE]': { dica: 'Preço antigo, que aparece riscado (ex.: R$ 129,90)', naImagem: true },
  '[PREÇO POR]': { dica: 'Preço novo, em destaque (ex.: R$ 89,90)', naImagem: true },
  '[EX.: PERGUNTA-GANCHO]': { dica: 'Pergunta curta de duas linhas que dá vontade (ex.: "Já sentiu o cheiro de casa limpa o dia todo?")', naImagem: true },
  '[OUTROS PRODUTOS DA MESMA COLEÇÃO]': { dica: 'Produtos da mesma linha cujas fotos já estão no padrão (ex.: "as velas Lavanda e Baunilha")', naImagem: false },
  '[USO DO PRODUTO]': { dica: 'Onde e como o produto é usado no dia a dia (ex.: "sala de estar à noite")', naImagem: false },
};

const m = (id, categoria, titulo, envie, resultado, en, pt) => ({ id, categoria, titulo, envie, resultado, en, pt });

export const MODELOS_PROMPT = [
  // ---------- Limpeza e padronização ----------
  m('fundo-branco', 'limpeza', 'Fundo branco de catálogo', 'Uma foto do produto (pode ser de celular).', 'Foto do produto em fundo branco infinito, pronta para a loja virtual.',
    'Clean product photo of [NOME DO PRODUTO] on a seamless white background, soft even studio lighting, subtle contact shadow, centered three-quarter angle, sharp focus, accurate color, ready for an online store listing.',
    'Foto limpa de [NOME DO PRODUTO] em fundo branco infinito, luz de estúdio suave e uniforme, sombra de contato sutil, centralizado em ângulo de três quartos, foco nítido, cor fiel, pronta para o anúncio da loja virtual.'),
  m('limpar-amadora', 'limpeza', 'Limpar foto amadora', 'A foto amadora do produto, do jeito que o cliente mandou.', 'A mesma foto, sem bagunça, mãos ou embalagem, com luz e cor corrigidas.',
    "Clean up this product photo of [NOME DO PRODUTO]: remove the cluttered background, hands, packaging and any object that isn't the product itself, correct exposure and color to look natural. Do not alter the product's shape, quantity or color.",
    'Limpe esta foto de [NOME DO PRODUTO]: tire o fundo bagunçado, mãos, embalagem e qualquer objeto que não seja o próprio produto, corrija exposição e cor para parecer natural. Não altere o formato, a quantidade nem a cor do produto.'),
  m('padronizar-linha', 'limpeza', 'Padronizar linha de produtos', 'A foto do produto novo + 1 ou 2 fotos da coleção que já estão no padrão.', 'Foto do produto novo com o mesmo fundo, luz e enquadramento do resto do catálogo.',
    'Photograph [NOME DO PRODUTO] following the exact same background, lighting angle and framing already used for [OUTROS PRODUTOS DA MESMA COLEÇÃO], so every image in the catalog looks consistent.',
    'Fotografe [NOME DO PRODUTO] seguindo exatamente o mesmo fundo, ângulo de luz e enquadramento já usados em [OUTROS PRODUTOS DA MESMA COLEÇÃO], para todas as imagens do catálogo ficarem consistentes.'),
  // ---------- Estética premium ----------
  m('fundo-neutro', 'premium', 'Fundo neutro premium', 'Uma foto do produto.', 'Foto de produto com cara de marca cara: fundo de pedra clara ou linho, luz de estúdio.',
    'Premium product shot of [NOME DO PRODUTO] on a warm neutral backdrop (light stone or linen texture), soft directional studio light, gentle shadow, elegant minimal styling, high-end e-commerce look.',
    'Foto premium de [NOME DO PRODUTO] em fundo neutro e quente (textura de pedra clara ou linho), luz de estúdio suave e direcionada, sombra delicada, composição elegante e minimalista, visual de e-commerce de alto padrão.'),
  m('textura-macro', 'premium', 'Textura em macro', 'Uma foto do produto com o material bem visível.', 'Close extremo do material/textura, mostrando a qualidade (ótimo para destacar o diferencial).',
    "Extreme close-up on the material and texture of [NOME DO PRODUTO], highlighting [DIFERENCIAL], shallow depth of field, soft directional light revealing surface detail, neutral background.",
    'Close extremo no material e na textura de [NOME DO PRODUTO], destacando [DIFERENCIAL], pouca profundidade de campo, luz suave e direcionada revelando os detalhes da superfície, fundo neutro.'),
  m('hero-campanha', 'premium', 'Foto hero de campanha', 'A foto crua do produto.', 'Foto principal de campanha, cinematográfica, com o produto intacto e sem texto.',
    'Transform this raw product photo of [NOME DO PRODUTO] into a cinematic hero shot. Keep the product exactly as is (shape, color, quantity), soft directional light like late afternoon sun, a softly blurred clean background, rich but natural colors, no text overlay.',
    'Transforme esta foto crua de [NOME DO PRODUTO] numa foto principal cinematográfica. Mantenha o produto exatamente como é (formato, cor, quantidade), luz suave e direcionada como sol de fim de tarde, fundo limpo levemente desfocado, cores ricas mas naturais, sem texto por cima.'),
  // ---------- Contexto e uso ----------
  m('lifestyle', 'contexto', 'Foto lifestyle', 'Uma foto do produto.', 'O mesmo produto sendo usado num ambiente real do dia a dia.',
    'Show the same product, [NOME DO PRODUTO], being used naturally in a real, everyday setting matching its use case ([USO DO PRODUTO]), soft natural light, realistic atmosphere, product clearly visible and unaltered.',
    'Mostre o mesmo produto, [NOME DO PRODUTO], sendo usado com naturalidade num ambiente real do dia a dia de acordo com o uso ([USO DO PRODUTO]), luz natural suave, atmosfera realista, produto bem visível e sem alterações.'),
  m('unboxing', 'contexto', 'Unboxing', 'Uma foto do produto e, se tiver, da embalagem.', 'Mãos abrindo a embalagem, de cima ou em três quartos, com sensação de unboxing real.',
    "Top-down or three-quarter shot of hands opening the packaging of [NOME DO PRODUTO] on a clean surface, warm soft light, visible branding, genuine unboxing feel.",
    'Foto de cima ou em três quartos de mãos abrindo a embalagem de [NOME DO PRODUTO] sobre uma superfície limpa, luz quente e suave, marca visível, sensação de unboxing de verdade.'),
  m('tamanho', 'contexto', 'Comparação de tamanho', 'Uma foto do produto.', 'O produto ao lado de uma mão ou de um celular, para mostrar o tamanho real.',
    'Show [NOME DO PRODUTO] next to a familiar size reference (an adult hand or a standard smartphone), clean background, so the viewer judges the real size at a glance.',
    'Mostre [NOME DO PRODUTO] ao lado de uma referência de tamanho conhecida (a mão de um adulto ou um celular comum), fundo limpo, para quem vê entender o tamanho real num relance.'),
  m('flat-lay', 'contexto', 'Flat-lay de moda', 'A foto da peça (roupa ou acessório).', 'Peça fotografada de cima, arrumada sobre superfície neutra, pronta para loja.',
    'Clean flat-lay photo of [NOME DO PRODUTO] on a soft neutral surface, even diffused lighting, realistic fabric texture, balanced styling, e-commerce ready color accuracy.',
    'Foto flat-lay (de cima) de [NOME DO PRODUTO] sobre uma superfície neutra e suave, luz difusa e uniforme, textura de tecido realista, composição equilibrada, cor fiel pronta para e-commerce.'),
  m('comida', 'contexto', 'Comida ou bebida apetitosa', 'A foto crua da comida ou bebida.', 'Foto comercial que dá fome/sede, com o produto igualzinho e sem texto.',
    'Transform this raw food or drink photo of [NOME DO PRODUTO] into an appetizing commercial shot. Keep the product exactly the same, add fresh natural lighting that makes it look appealing, clean uncluttered background, no added text.',
    'Transforme esta foto crua de comida ou bebida ([NOME DO PRODUTO]) numa foto comercial apetitosa. Mantenha o produto exatamente igual, com luz natural e fresca que o deixe convidativo, fundo limpo e sem bagunça, sem texto adicionado.'),
  // ---------- Anúncio e conversão ----------
  m('capa-stories', 'anuncio', 'Capa para Stories/Reels', 'Uma foto do produto.', 'Imagem vertical 9:16 com o produto grande e espaço para um título curto no topo.',
    'Vertical 9:16 cover image of [NOME DO PRODUTO], product large and centered, short bold headline space at the top, clean uncluttered background, mobile-first composition.',
    'Imagem de capa vertical 9:16 de [NOME DO PRODUTO], produto grande e centralizado, espaço para um título curto e forte no topo, fundo limpo, composição pensada para o celular.'),
  m('resposta-rapida', 'anuncio', 'Anúncio de resposta rápida', 'Uma foto do produto.', 'Imagem de anúncio com contraste forte, feita para parar a rolagem do feed.',
    'Ad-ready image of [NOME DO PRODUTO], high scroll-stopping contrast, product sharply in focus against a simple background, clear negative space for a short headline, optimized to grab attention in a crowded feed.',
    'Imagem pronta para anúncio de [NOME DO PRODUTO], contraste forte que faz parar a rolagem, produto em foco nítido sobre fundo simples, espaço vazio para um título curto, feita para chamar atenção num feed cheio.'),
  m('oferta-de-por', 'anuncio', 'Oferta com preço De/Por', 'Uma foto do produto (o fundo pode ser simples).', 'Arte de promoção vertical 4:5 com preço antigo riscado, preço novo em destaque e selo "só hoje".',
    'Create a promotional graphic from this photo of [NOME DO PRODUTO]: product large and true to the original photo, the old price shown small and crossed out as [PREÇO DE], the new price shown large in [COR DE DESTAQUE] as [PREÇO POR], a small urgency badge like "só hoje", clean layout with no extra stars or explosions, vertical 4:5 format.',
    'Crie uma arte de promoção a partir desta foto de [NOME DO PRODUTO]: produto grande e fiel à foto original, o preço antigo pequeno e riscado como [PREÇO DE], o preço novo grande em [COR DE DESTAQUE] como [PREÇO POR], um pequeno selo de urgência como "só hoje", layout limpo sem estrelinhas nem explosões, formato vertical 4:5.'),
  m('pergunta-gancho', 'anuncio', 'Anúncio com pergunta-gancho', 'Uma foto do produto.', 'Anúncio com uma pergunta que dá vontade no topo, o produto em close e um botão embaixo.',
    'Create a social ad from this photo: a short two-line question that creates craving at the top in bold sans-serif type ("[EX.: PERGUNTA-GANCHO]"), the product name "[NOME DO PRODUTO]" highlighted in [COR DE DESTAQUE], product in close-up on a natural surface, soft daylight, a clean button at the bottom with "[CHAMADA PARA AÇÃO]".',
    'Crie um anúncio para redes sociais a partir desta foto: uma pergunta curta, em duas linhas, que dá vontade, no topo, em letra sem serifa e negrito ("[EX.: PERGUNTA-GANCHO]"), o nome do produto "[NOME DO PRODUTO]" em destaque em [COR DE DESTAQUE], produto em close sobre uma superfície natural, luz do dia suave, um botão limpo embaixo com "[CHAMADA PARA AÇÃO]".'),
];

export const modeloPorId = (id) => MODELOS_PROMPT.find((x) => x.id === id) || null;
export const modelosDaCategoria = (cat) => MODELOS_PROMPT.filter((x) => x.categoria === cat);

/** Marcadores do modelo, na ordem em que aparecem (sem repetir). */
export function marcadoresDe(modelo) {
  const achados = `${modelo.en} ${modelo.pt}`.match(/\[[^\]]+\]/g) || [];
  return [...new Set(achados)];
}

/**
 * Troca os marcadores pelos valores. `valores[marcador]` pode ser texto (vale para os dois idiomas) ou { en, pt }.
 * Marcador sem valor fica como está, entre colchetes — a tela mostra o que falta.
 */
export function preencherModelo(modelo, valores = {}) {
  const val = (k, idioma) => { const v = valores[k]; return String((v && typeof v === 'object' ? v[idioma] || v.pt || v.en : v) ?? '').trim(); };
  const trocar = (texto, idioma) => texto.replace(/\[[^\]]+\]/g, (k) => val(k, idioma) || k);
  const faltam = marcadoresDe(modelo).filter((k) => !val(k, 'en') && !val(k, 'pt'));
  return { en: trocar(modelo.en, 'en'), pt: trocar(modelo.pt, 'pt'), faltam };
}

/** Moeda em texto de imagem (R$ 89,90). */
const reais = (v) => (Number(v) > 0 ? `R$ ${Number(v).toFixed(2).replace('.', ',')}` : '');

/**
 * Preenchimento SEM IA, a partir do cadastro: produto escolhido (nome, preços), diferencial do perfil de marca,
 * cor da marca (a do Estúdio ou a do site) e o CTA do criativo, quando houver. Só preenche o que tem dado; o resto a
 * pessoa digita.
 */
export function valoresDoCadastro({ cliente, produto = null, produtos = [], corMarca = '', criativo = null } = {}) {
  const v = {};
  const mk = cliente?.marca || {};
  if (produto?.nome) v['[NOME DO PRODUTO]'] = produto.nome;
  if (produto) {
    const promo = Number(produto.precoPromocional) > 0 && Number(produto.precoPromocional) < Number(produto.preco);
    if (promo) { v['[PREÇO DE]'] = reais(produto.preco); v['[PREÇO POR]'] = reais(produto.precoPromocional); }
    else if (Number(produto.preco) > 0) v['[PREÇO POR]'] = reais(produto.preco);
  }
  if (mk.usp) v['[DIFERENCIAL]'] = mk.usp;
  if (corMarca) v['[COR DE DESTAQUE]'] = corMarca;
  if (criativo?.cta) v['[CHAMADA PARA AÇÃO]'] = criativo.cta;
  const outros = produtos.filter((p) => p.id !== produto?.id).slice(0, 3).map((p) => p.nome).filter(Boolean);
  if (outros.length) v['[OUTROS PRODUTOS DA MESMA COLEÇÃO]'] = outros.join(', ');
  return v;
}

/**
 * Confere o preenchimento vindo da IA: só aceita marcadores que o modelo tem, valores de texto não vazios (ou {en,pt});
 * texto que aparece na imagem fica igual nos dois idiomas (usa o "pt" — a imagem sai em português).
 */
export function valoresDaIa(modelo, resposta) {
  const brutos = resposta?.valores && typeof resposta.valores === 'object' ? resposta.valores : resposta || {};
  const out = {};
  for (const k of marcadoresDe(modelo)) {
    const b = brutos[k] ?? brutos[k.slice(1, -1)];
    if (b == null) continue;
    const en = String(typeof b === 'object' ? b.en ?? '' : b).trim().slice(0, 200);
    const pt = String(typeof b === 'object' ? b.pt ?? '' : b).trim().slice(0, 200);
    if (!en && !pt) continue;
    out[k] = MARCADORES[k]?.naImagem ? (pt || en) : { en: en || pt, pt: pt || en };
  }
  return out;
}
