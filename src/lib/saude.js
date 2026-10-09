// Produto de saúde / emagrecimento / forma do corpo: a política de anúncios do Meta proíbe antes e depois e resultado
// de peso/medida nesses anúncios, MESMO com prova real. O perfil de marca tem a chave "Produto de saúde/emagrecimento"
// (marca.produtoSaude: true/false); sem a pessoa ter escolhido, o app detecta pelo nicho, pelo negócio e pelos produtos.
// Vale só para CRIATIVOS: o site pode mostrar os depoimentos reais como estão.

export const AVISO_META_SAUDE = 'Política do Meta: antes e depois, resultados de peso e promessa de efeito no corpo são proibidos em anúncios deste tipo de produto';

const RE_SAUDE = /emagrec|perd(?:er|a) (?:de )?peso|\bpeso\b|gordura|queima|termog[eê]nic|dieta|detox|celulite|barriga|sa[uú]de|suplement|col[aá]geno|ch[aá] verde|obesi|apetite|metabolismo|massa magra/i;

/** O texto do cadastro sugere saúde/emagrecimento? (só a detecção automática, sem a escolha da pessoa) */
export function detectarProdutoSaude(cliente, produtos = []) {
  const m = cliente?.marca || {};
  const texto = [cliente?.nicho, m.negocio, m.usp, ...produtos.map((p) => `${p?.nome || ''} ${p?.categoria || ''}`)].filter(Boolean).join(' ');
  return RE_SAUDE.test(texto);
}

/** Vale a regra? A escolha explícita do perfil manda; sem escolha, a detecção automática. */
export function ehProdutoSaude(cliente, produtos = []) {
  const v = cliente?.marca?.produtoSaude;
  return typeof v === 'boolean' ? v : detectarProdutoSaude(cliente, produtos);
}

/** Regra extra para a IA (só nos clientes de saúde/emagrecimento). */
export const REGRA_SAUDE = `PRODUTO DE SAÚDE/EMAGRECIMENTO (${AVISO_META_SAUDE}): em anúncios, NUNCA use comparação de antes e depois, números de kg ou cm perdidos, nem promessa de resultado no corpo, mesmo que exista prova real no perfil. Também NUNCA use texto que provoque autoimagem negativa (o Meta proíbe): a dor sobre corpo, peso ou aparência ("a barriga continua aí", "não consigo emagrecer", "cansada do seu corpo") não vira gancho, ângulo nem copy, mesmo sendo as palavras reais do público. Suplemento não pode prometer efeito no organismo: NUNCA diga nem insinue efeito no metabolismo, energia, disposição, queima de gordura, apetite, digestão ou qualquer função do corpo (nem "tem esse efeito", "pra ter energia"), mesmo que o perfil ou o produto liste esses benefícios. E NUNCA fale da condição de saúde de quem assiste ("você está cansado", "sem energia", "seu corpo pede", "seu metabolismo"). Permitido: a composição real (nome dos ativos, número de cápsulas, preço, oferta ativa), a rotina e a experiência de uso sem prometer efeito, como é usar, número de clientes atendidos.`;

// kg/cm com número ("perdi 3 kg", "-5cm", "3 quilos") e a ideia de antes e depois.
const RE_ACHADOS = [
  /\b\d+(?:[.,]\d+)?\s*(?:kg|quilos?|kilos?|cm|cent[ií]metros?)\b/gi,
  /\bantes\s*(?:e|x|\/|&|vs\.?)\s*depois\b/gi,
];

// Promessa de efeito no corpo e condição de quem assiste. Roda no texto SEM acento (mesmo tamanho do original, para
// devolver o trecho como foi escrito). Alternativas mais longas primeiro, para "sem energia" sair inteiro.
const CONDICAO = String.raw`\bs(?:eu|ua)s? (?:corpo|metabolismo|organismo|intestino|digestao|barriga|fome|apetite|energia|disposicao|saude|cansaco|ansiedade|figado)\b|\bsem (?:energia|disposicao|pique|animo|forcas?)\b|\bcansad[oa]s?\b|\bcansaco\b|\bdesanim\w*`;
const EFEITO = String.raw`\bmetabol\w*|\befeitos?\b|\bqueim\w*(?: (?:de )?(?:gordura|calorias?))?|\bgordura\w*|\bemagre\w*|\bapetite\b|\bsaciedade\b|\bfome\b|\benergi\w*|\bdispost[oa]s?\b|\bdisposicao\b|\bdigest\w*|\bintestin\w*|\binchac\w*|\bdesinch\w*|\bretencao de liquidos?\b|\bimunidade\b|\bhormon\w*|\bglicemi\w*|\bdetox\w*`;
const RE_CONDICAO = new RegExp(`^(?:${CONDICAO})$`);
const RE_FISICO = new RegExp(`${CONDICAO}|${EFEITO}`, 'g');
const semAcento = (t) => [...t].map((c) => c.normalize('NFD')[0]).join('').toLowerCase();

/**
 * Trechos de criativo que ferem a política: kg/cm de resultado, antes e depois, promessa de efeito no corpo
 * (metabolismo, energia, disposição, queima, apetite…) e condição de quem assiste ("sem energia", "seu corpo").
 * Devolve a lista sem repetição, em minúsculas.
 */
export function achadosSaude(texto) {
  const t = String(texto || '');
  const norm = semAcento(t), orig = [...t];
  const fisico = [...norm.matchAll(RE_FISICO)].map((m) => orig.slice(m.index, m.index + m[0].length).join(''));
  return [...new Set([...RE_ACHADOS.flatMap((re) => t.match(re) || []), ...fisico].map((x) => x.toLowerCase().replace(/\s+/g, ' ').trim()))];
}

/**
 * Motivo em palavras simples que impede aprovar/enviar o texto num cliente de saúde, ou ''. Diz o que o Meta proíbe
 * (só as categorias encontradas), o trecho e o que pode no lugar.
 */
export function motivoSaude(texto, cliente) {
  if (!ehProdutoSaude(cliente)) return '';
  const achados = achadosSaude(texto);
  if (!achados.length) return '';
  const corpo = achados.some((a) => RE_ACHADOS.some((re) => new RegExp(re.source, 'i').test(a)));
  const condicao = achados.some((a) => RE_CONDICAO.test(semAcento(a)));
  const efeito = achados.some((a) => !RE_ACHADOS.some((re) => new RegExp(re.source, 'i').test(a)) && !RE_CONDICAO.test(semAcento(a)));
  const proibe = [corpo && 'resultado no corpo (peso, medidas, antes e depois)', efeito && 'promessa de efeito no organismo (metabolismo, energia, disposição, queima de gordura, apetite)', condicao && 'falar da condição de quem assiste ("sem energia", "seu corpo pede")'].filter(Boolean);
  const base = `produto de saúde: o Meta proíbe ${proibe.join(', ')}; trecho: ${achados.map((a) => `"${a}"`).join(', ')}. Remova isso e use a composição real (ativos, cápsulas, preço, oferta) ou a rotina de uso, sem prometer efeito`;
  const doSite = textosDoSiteNoAnuncio(texto, cliente).filter((l) => l.alegacao.length);
  if (!doSite.length) return base;
  const seguras = doSite.filter((l) => l.segura).map((l) => `"${l.segura}"`);
  return `${MOTIVO_ANUNCIO_SITE} ${base}${seguras.length ? `. Versão segura para usar no lugar: ${seguras.join('; ')}` : ''}`;
}

// ---------- textos do site reaproveitados em anúncio ----------
// No SITE o operador pode manter alegação de efeito (com aviso; lib/textos-site.js). Quando esse mesmo texto aparece num
// criativo, o bloqueio de sempre vale e o motivo diz de onde veio; a "Versão segura" do texto é a troca oferecida.
// cliente.alegacoesSite = [{ texto, segura, alegacao: [..], fonte }] (gravado ao aplicar o plano do site).
export const MOTIVO_ANUNCIO_SITE = 'Permitido no site, mas bloqueado em anúncio: política do Meta para saúde e suplementos.';
const chaveTexto = (t) => semAcento(String(t || '')).replace(/[^a-z0-9]+/g, ' ').trim();
/** Textos do site (mantidos pelo operador) que aparecem neste texto de anúncio. */
export function textosDoSiteNoAnuncio(texto, cliente) {
  const t = ` ${chaveTexto(texto)} `;
  return (Array.isArray(cliente?.alegacoesSite) ? cliente.alegacoesSite : [])
    .filter((l) => { const k = chaveTexto(l?.texto); return k.length >= 12 && t.includes(` ${k} `); })
    .map((l) => ({ texto: String(l.texto), segura: String(l.segura || ''), alegacao: Array.isArray(l.alegacao) ? l.alegacao : [], fonte: l.fonte || null }));
}
/** Troca cada texto do site com alegação pela versão segura dele (sem versão segura, fica como está). */
export function trocarPelaSegura(texto, cliente) {
  let out = String(texto || '');
  for (const l of textosDoSiteNoAnuncio(out, cliente).filter((x) => x.alegacao.length && x.segura)) {
    const i = semAcento(out).indexOf(semAcento(l.texto));
    if (i >= 0) out = out.slice(0, i) + l.segura + out.slice(i + l.texto.length);
  }
  return out;
}
