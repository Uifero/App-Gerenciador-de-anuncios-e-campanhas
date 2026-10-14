// "Parece anúncio?" (Frente 2): nota de 0 a 100 de quanto uma ideia de criativo ou uma peça do Estúdio parece anúncio
// (0 = parece post de pessoa real, 100 = anúncio de vitrine), com os motivos e sugestões concretas para ficar natural.
// Puro e sem IA: os mesmos critérios da referência que a IA recebe (server/referencias/estilo-organico.js). Aplicar as
// sugestões no texto usa a reescrita de sempre (refinarCriativo) e passa por "Atual × Com a mudança" antes de salvar.

const txt = (v) => String(v ?? '').trim();
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const palavras = (s) => txt(s).split(/\s+/).filter(Boolean);

/** Estruturas da referência de roteiros (o campo "roteiro" das ideias usa estes ids). */
export const ROTEIROS = [['ugc', 'UGC (depoimento)'], ['unboxing', 'Unboxing'], ['rotina', 'Rotina / uso real'], ['3motivos', '3 motivos'], ['problema_solucao', 'Problema e solução'], ['react', 'React'], ['bastidores', 'Bastidores'], ['comparacao', 'Comparação']];
export const nomeRoteiro = (id) => (ROTEIROS.find(([k]) => k === id) || [])[1] || '';

/** Palavras de venda que denunciam anúncio (sem acento, minúsculas). */
export const PALAVRAS_VENDA = ['compre agora', 'compre já', 'compre hoje', 'imperdível', 'garanta já', 'garanta o seu', 'garanta a sua', 'últimas unidades', 'promoção', 'oferta', 'clique no link', 'clique aqui', 'aproveite', 'só hoje', 'por tempo limitado', 'desconto', 'frete grátis', 'não perca', 'adquira', 'corra'];
const PRIMEIRA_PESSOA = /\b(eu|meu|minha|meus|minhas|comigo|aqui em casa|a gente|testei|uso|usei|comprei)\b/;
const EMOJI = /\p{Extended_Pictographic}/gu;
const UM_EMOJI = /\p{Extended_Pictographic}/u;

export const FAIXAS = [[0, 'Parece post', 'tag-ok'], [30, 'Meio anúncio', 'tag-warn'], [60, 'Parece anúncio', 'tag-bad']];
export const faixaDe = (nota) => [...FAIXAS].reverse().find(([min]) => nota >= min);

/**
 * Nota e motivos. item = { hook, copy, cta, formato } (ideia/criativo) e, para peça, `peca` = { tipo, config }.
 * Devolve { nota, faixa, motivos: [{ id, texto, peso, sugestao, onde: 'texto'|'peca' }] }.
 */
export function pareceAnuncio(item = {}, { cliente = {}, peca = null } = {}) {
  const motivos = [];
  const add = (id, peso, texto, sugestao, onde = 'texto') => motivos.push({ id, peso, texto, sugestao, onde });
  const cfg = peca?.config || {};
  const hook = txt(peca ? cfg.hook || item.hook : item.hook), copy = txt(item.copy), cta = txt(peca ? cfg.cta || item.cta : item.cta);
  const tudo = norm(`${hook} ${copy} ${cta}`);
  const venda = PALAVRAS_VENDA.filter((p) => new RegExp(`\\b${norm(p)}\\b`).test(tudo));
  if (venda.length) add('venda', Math.min(30, 15 + venda.length * 5), `Palavras de venda: ${venda.map((p) => `"${p}"`).join(', ')}.`, 'Tire as palavras de venda e troque o CTA por um convite ("me chama no WhatsApp", "o link tá no perfil").');
  const marca = txt(cliente.nome);
  const hookN = norm(hook);
  if ((marca && marca.length > 2 && hookN.includes(norm(marca))) || /r\$\s?\d|\d+\s?%|\bdesconto\b|\bpreco\b/.test(hookN)) add('marca-cedo', 20, 'Marca ou preço logo no gancho.', 'Comece pela cena ou pela dúvida; a marca e o preço vão para o fim, de leve.');
  const nHook = palavras(hook).length;
  if (nHook > 12) add('texto-gancho', 15, `Gancho com ${nHook} palavras: na tela, ninguém lê isso em 3 segundos.`, 'Deixe o gancho com até 8 palavras; o resto vai falado ou na legenda.');
  const video = /video|reels|ugc|9:16|stories/.test(norm(item.formato || peca?.tipo || ''));
  if (!peca && !video && copy.length > 600) add('texto-longo', 10, `Texto com ${copy.length} caracteres para uma imagem.`, 'Imagem pede pouco texto: guarde o detalhe para a legenda do post.');
  if (video && copy && !PRIMEIRA_PESSOA.test(norm(copy))) add('terceira-pessoa', 10, 'Roteiro sem ninguém falando em primeira pessoa.', 'Escreva como alguém contando ("eu uso de manhã", "aqui em casa"), não como narrador de comercial.');
  const exclam = (`${hook} ${copy} ${cta}`.match(/!/g) || []).length, emojis = (`${hook} ${copy} ${cta}`.match(EMOJI) || []).length;
  if (exclam >= 2 || emojis > 1 || UM_EMOJI.test(hook)) add('enfeite', 10, `${exclam ? `${exclam} exclamação(ões)` : ''}${exclam && emojis ? ' e ' : ''}${emojis ? `${emojis} emoji(s)` : ''}${UM_EMOJI.test(hook) ? ' (emoji no gancho)' : ''}.`, 'No máximo 1 emoji e nenhum no gancho; troque as exclamações por ponto.');
  const caixaAlta = palavras(`${hook} ${cta}`).filter((w) => w.length > 2 && /[A-ZÀ-Ý]/.test(w) && w === w.toUpperCase()).length;
  if (caixaAlta >= 3) add('caixa-alta', 10, 'Palavras em CAIXA ALTA no gancho/CTA.', 'Escreva normal: caixa alta grita "anúncio".');
  if (peca) {
    if (['cartao', 'texto'].includes(cfg.template)) add('moldura', 20, cfg.template === 'texto' ? 'Peça só de texto, sem foto real.' : 'Painel de cor em volta da foto (moldura de anúncio).', 'Use "Foto em tela cheia" com uma foto real do produto em uso.', 'peca');
    if (cfg.temLogo && peca.tipo === 'video' && cfg.logoNoFim === false) add('logo-cedo', 15, 'Logo aparece desde o primeiro segundo do vídeo.', 'Marque "Logo só na última cena" no Estúdio.', 'peca');
    if (cfg.temLogo && peca.tipo !== 'video') add('logo-imagem', 10, 'Logo na imagem.', 'Post real raramente tem logo: tire ou deixe só no perfil.', 'peca');
    const nTela = palavras(`${cfg.hook || ''} ${cfg.cta || ''}`).length;
    if (peca.tipo !== 'video' && nTela > 16) add('texto-tela', 15, `${nTela} palavras escritas na imagem.`, 'Até ~10 palavras na imagem; o resto vai na legenda.', 'peca');
  }
  const nota = Math.min(100, motivos.reduce((s, m) => s + m.peso, 0));
  return { nota, faixa: faixaDe(nota), motivos };
}

/** Instrução da reescrita: só os motivos de texto, sem inventar nada (vai para refinarCriativo). */
export function instrucaoNatural(r) {
  const deTexto = (r?.motivos || []).filter((m) => m.onde === 'texto');
  if (!deTexto.length) return '';
  return `Deixe este criativo com cara de post de pessoa real, mudando SÓ o necessário para resolver: ${deTexto.map((m) => `${m.texto} ${m.sugestao}`).join(' ')} Mantenha o ângulo, o produto e o modelo de gancho; não acrescente dado, número, preço, prazo, garantia nem depoimento; a regra de saúde continua valendo.`;
}

/** Config da peça refeita "mais natural" no Estúdio (só o que é visual; o texto passa pela reescrita). */
export const configNatural = (config = {}) => ({ ...config, template: ['cartao', 'texto'].includes(config.template) ? 'destaque' : config.template, logoNoFim: true });
