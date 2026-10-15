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

// ---------- nomes do próprio cliente nunca contam ----------
// "Thermora Metabolic Formula" é o nome do produto, não promessa: o nome da marca e dos produtos (cadastro do cliente e
// coleção de produtos, lembrados quando a lista é lida em core/storage.js) sai do texto antes da conferência. Só o que
// está em volta conta ("acelera o metabolismo"). Vale para criativo e site.
const nomesLembrados = new Map();
/** Guarda os nomes dos produtos de cada cliente (chamado ao listar a coleção de produtos). */
export function lembrarNomesProtegidos(produtos = []) {
  for (const p of produtos) {
    if (!p?.clienteId || !String(p.nome || '').trim()) continue;
    const s = nomesLembrados.get(p.clienteId) || new Set();
    s.add(String(p.nome).trim()); nomesLembrados.set(p.clienteId, s);
  }
}
/** Esquece os nomes lembrados (testes). */
export const esquecerNomesProtegidos = () => nomesLembrados.clear();
/**
 * Nomes que não contam como alegação: nome do cliente/marca e dos produtos. Sem o cliente (conferências do plano do
 * site), valem os nomes de produto já lembrados: nome de produto nunca é promessa, seja de quem for.
 */
export function nomesProtegidos(cliente, produtos = []) {
  const m = cliente?.marca || {};
  const lembrados = cliente?.id ? nomesLembrados.get(cliente.id) || [] : [...nomesLembrados.values()].flatMap((s) => [...s]);
  return [...new Set([cliente?.nome, m.nome, m.nomeMarca, ...(Array.isArray(cliente?.produtos) ? cliente.produtos.map((p) => p?.nome) : []),
    ...lembrados, ...produtos.map((p) => p?.nome)].map((n) => String(n || '').trim()).filter((n) => n.length >= 3))];
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Troca por espaços (mesmo tamanho) cada nome protegido e cada começo dele com 2+ palavras ("Thermora Metabolic"). */
export function mascararNomes(texto, nomes = []) {
  const t = String(texto || '');
  if (!nomes.length) return t;
  const orig = [...t];
  const norm = semAcento(t);
  for (const n of nomes) {
    const pal = semAcento(n).split(/\s+/).filter(Boolean);
    const variantes = pal.length > 1 ? pal.map((_, i) => pal.slice(0, i + 1)).filter((v) => v.length >= 2) : [pal];
    for (const v of variantes.reverse()) {
      for (const m of norm.matchAll(new RegExp(`(?<![a-z0-9])${v.map(escRe).join('\\s+')}(?![a-z0-9])`, 'g'))) {
        for (let i = m.index; i < m.index + m[0].length; i++) orig[i] = ' ';
      }
    }
  }
  return orig.join('');
}

/**
 * Trechos de criativo que ferem a política: kg/cm de resultado, antes e depois, promessa de efeito no corpo
 * (metabolismo, energia, disposição, queima, apetite…) e condição de quem assiste ("sem energia", "seu corpo").
 * Devolve a lista sem repetição, em minúsculas.
 */
export function achadosSaude(texto, cliente = null, produtos = []) {
  const t = mascararNomes(texto, nomesProtegidos(cliente, produtos));
  const norm = semAcento(t), orig = [...t];
  const fisico = [...norm.matchAll(RE_FISICO)].map((m) => orig.slice(m.index, m.index + m[0].length).join(''));
  return [...new Set([...RE_ACHADOS.flatMap((re) => t.match(re) || []), ...fisico].map((x) => x.toLowerCase().replace(/\s+/g, ' ').trim()))];
}

// ---------- site: TODO texto que aparece (banner, destaques, depoimentos, citações, títulos, FAQ, descrições) ----------
// No site o operador pode manter a alegação ("Entendi e quero manter no site"), mas o app sempre avisa. Além do que vale
// para anúncio, o site avisa resultado no corpo contado por cliente: medidas, emagrecimento, roupa larga, compulsão,
// inchaço, intestino, "corpo", "resultado". Marca "[PREENCHER: …]" (texto a preencher pelo cliente) nunca conta.
const RE_PREENCHER = /\[\s*PREENCHER\s*:[^\]]*\]/gi;
export const semMarcasPreencher = (t) => String(t || '').replace(RE_PREENCHER, ' ');
const CORPO_SITE = String.raw`\bmedidas?\b|\bemagrec\w*|\broupas? (?:(?:ficou|ficaram|esta|estao|mais) )?(?:larga|largas|folgada|folgadas)\b|\bcompuls\w*|\binchac\w*|\bintestin\w*|\bcorpo\b|\bresultados?\b|\bfoto (?:de )?antes\b|\bantes e depois\b|\bperd(?:i|eu|a|er) (?:de )?peso\b|\bbarriga\b|\bgordura\w*`;
const RE_CORPO_SITE = new RegExp(CORPO_SITE, 'g');
/** Achados de saúde num texto do SITE (o que vale para anúncio + resultado no corpo contado por cliente). */
export function achadosSaudeSite(texto, cliente = null, produtos = []) {
  const t = mascararNomes(semMarcasPreencher(texto), nomesProtegidos(cliente, produtos));
  const norm = semAcento(t), orig = [...t];
  const corpo = [...norm.matchAll(RE_CORPO_SITE)].map((m) => orig.slice(m.index, m.index + m[0].length).join('').toLowerCase().replace(/\s+/g, ' ').trim());
  return [...new Set([...achadosSaude(t), ...corpo])];
}

/**
 * Explicação longa da alegação de saúde num texto de anúncio (cliente de saúde), ou ''. Não bloqueia nada (o salvar usa
 * alertaSaude, só aviso); diz o que o Meta proíbe
 * (só as categorias encontradas), o trecho e o que pode no lugar.
 */
export function motivoSaude(texto, cliente) {
  if (!ehProdutoSaude(cliente)) return '';
  const achados = achadosSaude(texto, cliente);
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

// ---------- criativos: alegação de saúde é só informação (decisão do operador) ----------
// Nada é bloqueado nem pede confirmação no salvar de criativo: depois de salvar aparece uma nota amarela e o cartão ganha
// o selo "Risco Meta". O operador vê no Gerenciador de Anúncios se o Meta reprovar. A IA continua sem escrever alegação
// (REGRA_SAUDE e os filtros da geração não mudam).
const RE_RISCO_ALTO = /\d\s*(?:kg|quilo|kilo|cm|cent)|medida|antes|emagre|\bcorpo\b/i;
// Trecho de cada achado com até duas palavras antes, na mesma frase ("acelera o metabolismo"); trechos que se
// encostam viram um só ("acelera o metabolismo e queima gordura").
function trechosDe(texto, achados) {
  const norm = semAcento(String(texto || '')), orig = [...String(texto || '')];
  const faixas = [];
  for (const a of achados) {
    const i = norm.indexOf(semAcento(a));
    if (i < 0) continue;
    const antes = norm.slice(0, i);
    const corte = Math.max(...['.', '!', '?', ';', ':', '\n', '"', '(', ')', ','].map((c) => antes.lastIndexOf(c))) + 1;
    faixas.push([corte + /(?:\S+\s+){0,2}$/.exec(antes.slice(corte)).index, i + a.length]);
  }
  const juntas = [];
  for (const [a, b] of faixas.sort((x, y) => x[0] - y[0])) {
    const u = juntas[juntas.length - 1];
    if (u && a <= u[1] + 1) u[1] = Math.max(u[1], b); else juntas.push([a, b]);
  }
  return [...new Set(juntas.map(([a, b]) => orig.slice(a, b).join('').replace(/\s+/g, ' ').trim().toLowerCase()))];
}
/** Alegação de saúde num texto de criativo: null ou { trechos, altoRisco, nota }. Só em cliente de saúde. */
export function alertaSaude(texto, cliente, produtos = []) {
  if (!ehProdutoSaude(cliente, produtos)) return null;
  const achados = achadosSaude(texto, cliente, produtos);
  if (!achados.length) return null;
  const trechos = trechosDe(mascararNomes(texto, nomesProtegidos(cliente, produtos)), achados);
  const altoRisco = achados.some((a) => RE_RISCO_ALTO.test(semAcento(a)));
  const nota = `Aviso: este texto tem alegação de saúde (${trechos.map((t) => `"${t}"`).join(', ')}). O Meta pode reprovar o anúncio.${altoRisco ? ' Risco alto; reprovações repetidas podem restringir a conta de anúncios.' : ''}`;
  return { trechos, altoRisco, nota };
}
/** Texto do criativo (gancho + texto + CTA). */
export const textoDoCriativo = (c) => [c?.hook, c?.copy, c?.cta].filter(Boolean).join(' ');
/** Selo "Risco Meta" (só informação): toque mostra os trechos. '' quando não há alegação. */
export function seloRiscoMeta(texto, cliente) {
  const a = alertaSaude(texto, cliente);
  if (!a) return '';
  const e = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<details class="inline-block align-middle" data-risco-meta><summary class="tag tag-warn cursor-pointer list-none py-1" title="Toque para ver os trechos">Risco Meta</summary><span class="mt-1 block rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800" data-risco-trechos>${e(a.nota)}</span></details>`;
}

// ---------- textos do site reaproveitados em anúncio ----------
// No SITE o operador pode manter alegação de efeito (com aviso; lib/textos-site.js). Quando esse mesmo texto aparece num
// criativo, vale o aviso "Risco Meta" (não bloqueia); a "Versão segura" do texto é a troca oferecida.
// cliente.alegacoesSite = [{ texto, segura, alegacao: [..], fonte }] (gravado ao aplicar o plano do site).
export const MOTIVO_ANUNCIO_SITE = 'Texto mantido no site: em anúncio, a política do Meta para saúde e suplementos pode reprovar.';
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
