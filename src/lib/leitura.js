// Regras (sem tela, testáveis) da pergunta 0 da aba Site/Loja: leitura do SITE do próprio cliente (automática) e
// dos PRINTS do Instagram dele (a plataforma não permite leitura automática; a IA lê as imagens enviadas).
// Princípios: nada entra sem vir do que foi lido (a evidência da IA é conferida aqui); campo que a pessoa já
// preencheu à mão NUNCA é sobrescrito (vira sugestão para ela decidir); tudo que entra fica marcado com a origem
// (cliente.autoPreenchido / produto.origemAuto) até a pessoa confirmar ou editar.

export const CAMPOS_AUTO = [['tomDeVoz', 'Tom de voz'], ['usp', 'Diferencial (USP)'], ['provasSociais', 'Provas sociais'], ['estetica', 'Estética / paleta de cor']];
export const LEGENDA_PRINTS = 'O Instagram não permite leitura automática, por isso funciona por print: tire foto da bio, do grid de posts, e de 2-3 posts que representem bem a marca';
export const MAX_PRINTS = 6; // mesmo limite de imagens por chamada do servidor (diagnóstico)

/** Classifica o link: { tipo: 'instagram', usuario } | { tipo: 'site', url } | null. Aceita "@perfil" e link sem https. */
export function tipoLink(entrada) {
  const t = String(entrada || '').trim();
  if (!t) return null;
  const arroba = /^@([\w.]{1,30})$/.exec(t);
  if (arroba) return { tipo: 'instagram', usuario: arroba[1].toLowerCase(), url: `https://www.instagram.com/${arroba[1].toLowerCase()}/` };
  let u;
  try { u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am') {
    const usuario = u.pathname.split('/').filter(Boolean)[0];
    if (!usuario || !/^[\w.]{1,30}$/.test(usuario) || ['p', 'reel', 'reels', 'explore', 'stories', 'accounts'].includes(usuario.toLowerCase())) return null;
    return { tipo: 'instagram', usuario: usuario.toLowerCase(), url: `https://www.instagram.com/${usuario.toLowerCase()}/` };
  }
  u.hash = '';
  return { tipo: 'site', url: u.toString() };
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const cheio = (v) => Boolean(String(v ?? '').trim());

/** A evidência citada pela IA está mesmo no texto lido? (≥ 70% das palavras com 4+ letras aparecem no texto) */
export function evidenciaConfere(evidencia, texto) {
  const palavras = norm(evidencia).split(' ').filter((p) => p.length >= 4);
  if (!palavras.length) return false;
  const t = ` ${norm(texto)} `;
  return palavras.filter((p) => t.includes(` ${p} `) || t.includes(` ${p}`)).length / palavras.length >= 0.7;
}
/** O nome do produto aparece no texto lido? */
export const nomeNoTexto = (nome, texto) => cheio(nome) && ` ${norm(texto)} `.includes(` ${norm(nome)} `);

/**
 * Junta o que o servidor extraiu (`leitura`) com a interpretação da IA e devolve só o que tem base:
 * { resumo, campos: { tomDeVoz, usp, provasSociais }, produtos, descartados: [texto do que foi recusado] }.
 * `via`: 'pagina' (texto lido direto — evidência conferida) | 'busca' (site que bloqueou: vale o que a busca achou).
 */
export function sugestoesSite({ leitura = {}, interpretacao = {}, via = 'pagina' }) {
  const texto = [leitura.titulo, leitura.descricao, leitura.texto].filter(Boolean).join('\n');
  const campos = {}; const descartados = [];
  for (const [k, rotulo] of CAMPOS_AUTO) {
    const item = interpretacao[k];
    const valor = typeof item === 'string' ? item : item?.valor;
    if (!cheio(valor)) continue;
    if (via === 'pagina' && !evidenciaConfere(item?.evidencia, texto)) { descartados.push(`${rotulo}: a IA não mostrou um trecho do site que comprove`); continue; }
    campos[k] = String(valor).trim();
  }
  const produtos = [...(leitura.produtos || []).map((p) => ({ ...p, fonte: p.fonte || 'pagina' }))];
  for (const p of interpretacao.produtos || []) {
    if (!cheio(p?.nome) || produtos.some((x) => norm(x.nome) === norm(p.nome))) continue;
    if (via === 'pagina' && !nomeNoTexto(p.nome, texto)) { descartados.push(`Produto "${p.nome}": o nome não aparece no site`); continue; }
    const preco = Number(p.preco);
    produtos.push({ nome: String(p.nome).trim(), descricao: String(p.descricao || '').trim(), preco: Number.isFinite(preco) && preco > 0 ? preco : null, imagens: [], fonte: 'texto' });
  }
  return { resumo: cheio(interpretacao.resumo) ? String(interpretacao.resumo).trim() : '', campos, produtos: produtos.slice(0, 20), descartados };
}

/**
 * Prints do Instagram lidos pela IA. Só entra o que ela diz ter LIDO em um print que existe (número 1..total) e com
 * o trecho/descrição do que viu; sem print legível ou relevante, nada é preenchido e o motivo aparece na tela.
 * Resposta esperada: { legivel, motivo, resumo, imagens: [{ numero, conteudo, legivel }],
 *   tomDeVoz|usp|provasSociais|estetica: { valor, evidencia, imagem } | null, produtos: [{ nome, descricao, preco, imagem, evidencia }] }
 */
export function sugestoesPrints({ resposta = {}, total = 0 }) {
  const imgOk = (n) => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= total;
  const imagens = Array.from({ length: total }, (_, i) => {
    const it = (resposta.imagens || []).find((x) => Number(x?.numero) === i + 1) || {};
    return { numero: i + 1, legivel: it.legivel !== false && cheio(it.conteudo), conteudo: String(it.conteudo || 'a IA não descreveu esta imagem').trim() };
  });
  const campos = {}; const descartados = [];
  for (const [k, rotulo] of CAMPOS_AUTO) {
    const item = resposta[k];
    if (!cheio(item?.valor)) continue;
    if (!cheio(item?.evidencia) || !imgOk(item?.imagem)) { descartados.push(`${rotulo}: a IA não indicou em qual print viu isso`); continue; }
    campos[k] = String(item.valor).trim();
  }
  const produtos = [];
  for (const p of resposta.produtos || []) {
    if (!cheio(p?.nome)) continue;
    if (!imgOk(p.imagem) || !cheio(p.evidencia)) { descartados.push(`Produto "${p.nome}": sem o print onde aparece`); continue; }
    if (produtos.some((x) => norm(x.nome) === norm(p.nome))) continue;
    const preco = Number(p.preco);
    produtos.push({ nome: String(p.nome).trim(), descricao: String(p.descricao || '').trim(), preco: Number.isFinite(preco) && preco > 0 ? preco : null, imagens: [], fonte: `print ${p.imagem}` });
  }
  const algo = Object.keys(campos).length > 0 || produtos.length > 0;
  const encontrado = resposta.legivel !== false && algo;
  return {
    encontrado, campos: encontrado ? campos : {}, produtos: encontrado ? produtos : [], descartados, imagens,
    resumo: encontrado && cheio(resposta.resumo) ? String(resposta.resumo).trim() : '',
    observacao: encontrado ? '' : String(resposta.motivo || (algo ? '' : 'Os prints não mostram informação legível sobre a marca.')).trim(),
  };
}

/**
 * Aplica as sugestões ao cliente e ao catálogo. Campo vazio -> preenche e marca; campo já preenchido (à mão ou não)
 * com valor diferente -> vira conflito (a tela oferece "usar a sugestão"). Produto com nome já cadastrado não é repetido.
 * `meta` = { origem: 'site'|'instagram', url, em }.
 */
export function aplicarLeitura(cliente, produtosExistentes, sug, meta) {
  const marca = { ...(cliente.marca || {}) }; const auto = { ...(cliente.autoPreenchido || {}) };
  const preenchidos = []; const conflitos = [];
  for (const [k, v] of Object.entries(sug.campos || {})) {
    if (!cheio(marca[k])) { marca[k] = v; auto[k] = { ...meta }; preenchidos.push(k); }
    else if (norm(marca[k]) !== norm(v)) conflitos.push({ campo: k, atual: marca[k], sugerido: v });
  }
  const existentes = new Set(produtosExistentes.map((p) => norm(p.nome)));
  const novosProdutos = (sug.produtos || []).filter((p) => !existentes.has(norm(p.nome))).map((p) => ({
    nome: p.nome, descricao: p.descricao || '', preco: p.preco ?? null, categoria: '', variacoes: [], fotos: [], precoPromocional: null, destaque: false,
    origemAuto: { ...meta },
  }));
  return { patch: { marca, autoPreenchido: auto }, preenchidos, conflitos, novosProdutos };
}

/** Ao salvar o perfil à mão: a marca "automático" só continua nos campos que não mudaram. */
export function marcasQueContinuam(auto = {}, marcaAntes = {}, marcaDepois = {}) {
  return Object.fromEntries(Object.entries(auto || {}).filter(([k]) => norm(marcaAntes?.[k]) === norm(marcaDepois?.[k]) && cheio(marcaDepois?.[k])));
}

/** Texto da etiqueta discreta ao lado do campo. */
export const textoMarca = (m) => `preenchido automaticamente do ${m?.origem === 'instagram' ? 'Instagram' : 'site'}, confirme ou edite`;
