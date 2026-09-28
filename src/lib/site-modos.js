// Consistência entre os dois modos de site do MESMO cliente: "custom" (site personalizado) e "pacote_plataforma"
// (Nuvemshop/Shopify). Os dois moram no mesmo documento de site: `conteudo`/`config` alimentam o site personalizado e
// `pacote` alimenta o pacote. Antes, cada modo era gerado do zero pela IA e podia sair com outro título, outra
// história e outra paleta — quebrando a prévia que o cliente já tinha aprovado.
// Regra: ao gerar um modo pela PRIMEIRA vez quando o outro já existe, a base (textos principais, cores, FAQ e
// depoimentos) vem do modo existente e é reaplicada por cima do que a IA escrever. Depois disso, cada modo pode ser
// editado à vontade; quando os dois divergem, a tela OFERECE sincronizar (nunca sincroniza sozinha).
// Imagens: as fotos do site e do CSV vêm do mesmo cadastro de produtos (já são as mesmas nos dois modos); as mídias
// de depoimento que vieram de criativos aprovados seguem junto com a base.
import { faqValida } from './sitegen.js';

const txt = (v) => String(v ?? '').trim();
const HEX = /^#[0-9a-f]{6}$/i;

export const temCustom = (site) => Boolean(txt(site?.conteudo?.heroTitulo) || txt(site?.conteudo?.storytelling) || txt(site?.conteudo?.heroSubtitulo));
export const temPacote = (site) => Boolean(site?.pacote && ((site.pacote.banners || []).length || txt(site.pacote.textosPagina?.sobre)));

/** Base compartilhada a partir do site personalizado. */
export function baseDoCustom(site) {
  const c = site?.conteudo || {}, cfg = site?.config || {};
  return {
    heroTitulo: txt(c.heroTitulo), heroSubtitulo: txt(c.heroSubtitulo), heroCta: txt(c.heroCta), storytelling: txt(c.storytelling),
    faq: faqValida(c.faq), cores: [cfg.corPrimaria, cfg.corFundo].filter((h) => HEX.test(h || '')),
    depoimentos: (c.depoimentos || []).filter((d) => txt(d?.texto)),
  };
}

/** Base compartilhada a partir do pacote (banner principal = 1º banner). */
export function baseDoPacote(site) {
  const p = site?.pacote || {}, b = (p.banners || [])[0] || {};
  return {
    heroTitulo: txt(b.titulo), heroSubtitulo: txt(b.subtitulo), heroCta: txt(b.cta), storytelling: txt(p.textosPagina?.sobre),
    faq: faqValida(p.textosPagina?.faq), cores: (p.briefingTema?.paletaSugerida || []).filter((h) => HEX.test(h || '')),
    depoimentos: (p.depoimentos || []).filter((d) => txt(d?.texto)),
  };
}

/** Reaplica a base no pacote gerado (só onde a base tem valor; o resto do que a IA escreveu fica). */
export function aplicarBaseNoPacote(pacote = {}, base = {}) {
  // O banner principal costuma vir em mais de um tamanho (desktop e mobile): todos os que repetem o título do 1º
  // banner são o mesmo banner e recebem o texto da base.
  const tituloAntigo = (pacote.banners || [])[0]?.titulo;
  const banners = (pacote.banners || []).map((b, i) => (base.heroTitulo && (i === 0 || (tituloAntigo && b.titulo === tituloAntigo))
    ? { ...b, titulo: base.heroTitulo, subtitulo: base.heroSubtitulo || b.subtitulo || '', cta: base.heroCta || b.cta || '' } : b));
  if (base.heroTitulo && !banners.length) banners.push({ uso: 'Banner principal da home', titulo: base.heroTitulo, subtitulo: base.heroSubtitulo || '', cta: base.heroCta || '' });
  const paleta = (pacote.briefingTema?.paletaSugerida || []).filter((h) => !(base.cores || []).some((c) => c.toLowerCase() === String(h).toLowerCase()));
  return {
    ...pacote,
    banners,
    briefingTema: { ...(pacote.briefingTema || {}), paletaSugerida: [...(base.cores || []), ...paleta] },
    textosPagina: { ...(pacote.textosPagina || {}), ...(base.storytelling ? { sobre: base.storytelling } : {}), ...(base.faq?.length ? { faq: base.faq } : {}) },
    ...(base.depoimentos?.length ? { depoimentos: base.depoimentos } : {}),
  };
}

/** Reaplica a base no conteúdo/config do site personalizado. A 1ª cor da paleta vira a cor principal. */
export function aplicarBaseNoCustom(conteudo = {}, config = {}, base = {}) {
  const c = { ...conteudo };
  for (const k of ['heroTitulo', 'heroSubtitulo', 'heroCta', 'storytelling']) if (base[k]) c[k] = base[k];
  if (base.faq?.length) c.faq = base.faq;
  if (base.depoimentos?.length) c.depoimentos = [...(c.depoimentos || []).filter((d) => d.origem !== 'criativo'), ...base.depoimentos.filter((d) => d.origem === 'criativo')];
  return { conteudo: c, config: { ...config, ...(base.cores?.[0] ? { corPrimaria: base.cores[0] } : {}) } };
}

const ROTULOS = { heroTitulo: 'título do banner', heroSubtitulo: 'subtítulo', heroCta: 'texto do botão', storytelling: 'história da marca', faq: 'perguntas frequentes', cor: 'cor principal' };

/**
 * Onde o site personalizado (formulário "Conteúdo da loja") e o pacote estão diferentes — só campos preenchidos no
 * formulário contam (campo vazio não "apaga" o pacote). [] quando não há pacote ou está tudo igual.
 */
export function divergencias(site) {
  if (!temPacote(site) || !temCustom(site)) return [];
  const a = baseDoCustom(site), b = baseDoPacote(site);
  const dif = ['heroTitulo', 'heroSubtitulo', 'heroCta', 'storytelling'].filter((k) => a[k] && a[k] !== b[k]);
  if (a.faq.length && JSON.stringify(a.faq) !== JSON.stringify(b.faq)) dif.push('faq');
  if (a.cores[0] && String(a.cores[0]).toLowerCase() !== String(b.cores[0] || '').toLowerCase()) dif.push('cor');
  return dif.map((k) => ROTULOS[k]);
}

/**
 * Qual base usar ao gerar `modo` agora: a do outro modo, se ele já foi gerado e este ainda não (1ª geração do segundo
 * modo). null = geração livre, como sempre foi.
 */
export function baseParaGerar(site, modo) {
  if (modo === 'custom') return temPacote(site) && !temCustom(site) ? baseDoPacote(site) : null;
  return temCustom(site) && !temPacote(site) ? baseDoCustom(site) : null;
}

export const AVISO_MODOS = 'Isso usa o mesmo texto, cores e imagens do seu site atual, mas o resultado final depende do tema da plataforma escolhida, então o visual pode não ficar pixel idêntico à prévia.';
