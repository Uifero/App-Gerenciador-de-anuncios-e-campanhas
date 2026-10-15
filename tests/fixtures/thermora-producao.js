// Thermora como estava em produção quando o operador testou (pacote Shopify, nicho de suplemento): os dados vêm do que
// o operador relatou e dos prints dele (a leitura do Firestore de produção não está disponível nesta máquina). As frases
// dos casos a–j são as EXATAS que ele escreveu. Usado nos testes de tests/thermora-casos.test.js e no teste de navegador.
const DIA_PRINT = '12/10/2026';

/** Descrições que a IA escreveu para cada print (resumo da leitura), gravadas nas provas sociais com a data do print. */
export const DESCRICOES_PRINTS = [
  'Cliente envia foto comparativa e relata perda de 3 kg após uso do produto.',
  'Cliente relata que a roupa ficou larga, sinal de emagrecimento, com foto de antes e depois.',
  'Cliente relata ter conseguido vestir uma peça que não entrava há tempos, com foto de resultado.',
  'Cliente relata diminuição da compulsão alimentar, melhora intestinal e menos inchaço com o produto.',
  'Cliente relata diferença perceptível no corpo após uma semana de uso, com foto comparativa.',
];
/** OCR do cabeçalho do perfil do Instagram (leitura dos prints do Instagram), que virou a citação da seção. */
export const OCR_PERFIL = '471 seguidores, 213 a seguir, 36 publicações';

/** Frases do operador (casos a–j). */
export const FRASES = {
  a: 'montar os 5 principais motivos',
  b: "Mudar para 'Mais de 5mil pessoas compraram e aprovaram os produtos', em negrito só na primeira vez, apagar a outra",
  c: 'Aproximar os 5 motivos... colocar a foto do Thermora Metabolic no banner',
  d: "Tirar toda a parte onde diz 'Já comprou', deixar só as imagens",
  f1: 'Parcial: falta preencher (aba Produtos): benefícios / fórmula / ingredientes do Laranja Moro e do Thermora Metabolic Formula',
  f2: 'Não feito: Kits e ofertas: preços e kits não mencionados',
  g: 'Galeria de imagens grande abaixo da descrição: não mencionada (conferido pela IA)',
};

export const cliente = {
  id: 'thermora', nome: 'Thermora', nicho: 'suplemento termogênico', pais: 'BR',
  marca: {
    produtoSaude: true, negocio: 'cápsulas com cafeína e chá verde', tomDeVoz: 'amiga que indica',
    provasSociais: [...DESCRICOES_PRINTS.map((d) => `${d} (do print enviado em ${DIA_PRINT})`), OCR_PERFIL, 'Mais de 5000 clientes atendidas'].join('\n'),
  },
  dadosLoja: { razaoSocial: 'Thermora Suplementos LTDA', cnpj: '11.222.333/0001-81', email: 'contato@thermora.com.br' },
};

export const produtos = [
  { id: 'pTM', clienteId: 'thermora', nome: 'Thermora Metabolic Formula', preco: 147, variacoes: [], fotosMigradas: true, descricao: 'Cápsulas com cafeína anidra e chá verde. Pote com 60 cápsulas.' },
  { id: 'pLM', clienteId: 'thermora', nome: 'Laranja Moro', preco: 97, variacoes: [], fotosMigradas: true, descricao: '' },
];

const foto = (n, extra = {}) => ({ id: `m${n}`, clienteId: 'thermora', codigo: `F${n}`, url: `https://arquivos/thermora/f${n}.jpg`, nome: `f${n}.jpg`, nomeOriginal: `f${n}.jpg`, origem: 'envio', tipo: 'image/jpeg', criadoEm: `2026-10-0${1 + (n % 9)}T10:00:00Z`, ...extra });
// Galeria do produto: enviadas na aba Produtos (ligadas ao produto, SEM posição escolhida), na ordem do envio F31, F32, F33, F27, F28, F29.
const ENVIO_PRODUTO = ['F31', 'F32', 'F33', 'F27', 'F28', 'F29'];
const ligada = (cod) => ({ usos: { produtos: [{ id: 'pTM', ordem: ENVIO_PRODUTO.indexOf(cod) + 1, principal: cod === 'F31', por: 'manual' }] }, nomeOriginal: `thermora-metabolic-${cod.toLowerCase()}.jpg` });
const print = (n, i, extra = {}) => foto(n, { origem: 'prova_social', etiquetas: ['prova social'], descricao: DESCRICOES_PRINTS[i] || '', borrada: { url: `https://arquivos/thermora/f${n}-borrada.jpg` }, criadoEm: `2026-09-2${i}T10:00:00Z`, ...extra });

export const materiais = [
  foto(10), foto(11), foto(12), foto(15), foto(36), foto(40), foto(34), foto(99),
  ...ENVIO_PRODUTO.map((c) => foto(Number(c.slice(1)), ligada(c))),
  print(20, 0), print(23, 1), print(24, 2), print(25, 3), print(22, 4),
  print(26, 9, { descricao: 'Print do perfil do Instagram da marca', citacao: OCR_PERFIL }),
];

const ITENS = [
  { id: 'i1', secao: 's1', pedido: 'Banner com a F15', tipo: 'banner_fotos', params: { codigos: ['F15'] }, como: 'F15 no banner', status: 'pronto', aceito: true },
  { id: 'i2', secao: 's2', pedido: 'Galeria do produto f27/f28/f29/f33/f32/f31', tipo: 'produto_fotos', params: { codigos: ['F27', 'F28', 'F29', 'F33', 'F32', 'F31'], produtoId: 'pTM', produto: 'Thermora Metabolic Formula', principal: 'F27' }, como: 'nessa ordem, F27 principal', status: 'pronto', aceito: true },
  { id: 'i3', secao: 's2', pedido: 'Seções de fórmula, benefícios e modo de uso', tipo: 'secoes_produto', params: { secoes: ['formula', 'beneficios', 'modo_uso'] }, como: 'blocos na página do produto', status: 'pronto', aceito: true },
  { id: 'i4', secao: 's2', pedido: 'Kits e ofertas', tipo: 'outro', params: {}, como: 'kit com 3 potes do lado do pote único, com preço por pote', status: 'pronto', aceito: true },
  { id: 'i5', secao: 's2', pedido: 'Galeria de imagens grande abaixo da descrição', tipo: 'outro', params: {}, como: 'galeria grande logo abaixo da descrição do produto', status: 'pronto', aceito: true },
  { id: 'i6', secao: 's3', pedido: 'Depoimentos em prints', tipo: 'clientes_fotos', params: { codigos: ['F23', 'F26', 'F25', 'F20', 'F24'] }, como: 'nessa ordem, F23 primeiro', status: 'pronto', aceito: true },
  { id: 'i7', secao: 's4', pedido: 'Galeria da loja F36, F40', tipo: 'galeria_fotos', params: { codigos: ['F36', 'F40'] }, como: 'nessa ordem', status: 'pronto', aceito: true },
];
export const plano = { id: 'pl1', n: 3, secoes: [{ id: 's1', titulo: 'Banner', aplicada: true }, { id: 's2', titulo: 'Página do produto', aplicada: true }, { id: 's3', titulo: 'Depoimentos', aplicada: true }, { id: 's4', titulo: 'Galeria da loja', aplicada: true }], itens: ITENS, sugestoes: [] };

const MOTIVOS = ['Energia e disposição para o dia todo', 'Auxílio ao metabolismo', 'Fórmula com cafeína anidra e chá verde', 'Fácil de usar: duas cápsulas por dia', 'Mais de 5000 clientes satisfeitas'];
const pacote = {
  banners: [{ titulo: 'Sua rotina mais leve começa no café da manhã', subtitulo: 'Thermora, cápsulas com cafeína e chá verde para o seu dia a dia', cta: 'Quero o meu', uso: 'Banner principal' }],
  briefingTema: { estilo: 'Limpo, fundo branco', paletaSugerida: ['#5a6b3a', '#ffffff'], tipografia: '', secoesHome: ['Banner', '5 motivos', 'Quem já comprou', 'Produtos', 'Galeria', 'Sobre', 'Perguntas frequentes'], observacoes: 'Cor verde-oliva só nos botões.' },
  textosPagina: { sobre: 'A Thermora nasceu em 2021, na cozinha de casa.', faq: [{ p: 'Como eu tomo?', r: 'Duas cápsulas por dia, pela manhã, com água.' }] },
  descricoesProdutos: [{ produtoId: 'pTM', nome: 'Thermora Metabolic Formula', descricao: 'Cápsulas com cafeína anidra e chá verde. Pote com 60 cápsulas, rende 30 dias.', seoTitulo: 'Thermora', seoDescricao: 'Cápsulas' }],
  destaques: [{ itemId: 'tx1', titulo: '5 motivos para escolher a Thermora', linhas: MOTIVOS.map((t) => ({ texto: t, versao: 'original' })) }],
  // Cópias guardadas na última geração: as linhas das provas sociais viraram depoimento (o que o operador viu).
  depoimentos: [...DESCRICOES_PRINTS, OCR_PERFIL].map((t) => ({ nome: 'Clientes da loja', texto: t, origem: 'prova_texto' })),
  recursos: { paginaProduto: true, secoesProduto: ['formula', 'beneficios', 'modo_uso'] },
  visual: { ordem: ['banner', 'provas', 'produtos', 'confianca', 'depoimentos', 'sobre', 'galeria', 'faq'], ocultas: [], ajusteFotos: 'contain' },
};
const versao = (n) => ({ n, em: '2026-10-15T10:00:00Z', modo: 'pacote', resumo: `ajuste ${n}`, origem: 'ia', estado: { pacote } });
export const site = {
  id: 'siteT', clienteId: 'thermora', modo: 'pacote_plataforma', plataforma: 'shopify', plataformaConfirmada: true, tema: 'dawn',
  pacote, planos: [plano], planoAplicado: 'pl1', versoesAjuste: [versao(42), versao(43)], proximaVersao: 44,
};
