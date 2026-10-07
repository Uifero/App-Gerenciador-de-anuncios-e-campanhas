// Gerador do site "custom": um único index.html autocontido (CSS + JS inline), com carrinho client-side.
// NÃO processa pagamento: o botão de compra chama window.checkoutHandler(itens), ponto de encaixe para checkout de terceiro.
import { esc } from '../core/ui.js';
import { rastreamentoDe, codigoHead, codigoCheckout, CHAVE_CONSENTIMENTO, textoAvisoCookies } from './rastreamento.js';
import { normalizarLayout, tituloBloco } from './site-blocos.js';
import { produtosComFotos, imagemDoLugar, fotosDoUso, slidesDoBanner } from './fotos-site.js';
import { medidasDe, posicaoCss } from './medidas-site.js';
import { carrosselHtml, carrosselCss } from './carrossel.js';
import { depoimentosVivos } from './prova-social.js';
import { textoSobre, corLegivel } from './contraste.js';
import { normalizarRecursos, SECOES_PRODUTO, textoSecaoProduto, sugeridoPara, reais } from './recursos-loja.js';

/** Formas de pagamento que o selo "compra segura" pode mostrar (ícones genéricos desenhados aqui, sem logo de bandeira). */
export const FORMAS_PAGAMENTO = [['cartao', 'Cartão de crédito'], ['pix', 'Pix'], ['boleto', 'Boleto']];
export const PAGAMENTOS_PADRAO = ['cartao', 'pix'];
const ICONE_PAG = {
  cartao: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 10h20" stroke="currentColor" stroke-width="2"/></svg>',
  pix: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 9-9 9-9-9z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 12h8" stroke="currentColor" stroke-width="2"/></svg>',
  boleto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v14M7 5v14M9 5v14M12 5v14M15 5v14M17 5v14M20 5v14" stroke="currentColor" stroke-width="1.6"/></svg>',
};
const ICONE_CADEADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V7a4 4 0 018 0v4" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

/** FAQ que vai para o site: só pares com pergunta E resposta (sem objeções cadastradas, a IA devolve [] e a seção some). */
export const faqValida = (faq) => (Array.isArray(faq) ? faq : []).map((f) => ({ p: String(f?.p || '').trim(), r: String(f?.r || '').trim() })).filter((f) => f.p && f.r);

const corta = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
/**
 * SEO e prévia de compartilhamento (WhatsApp/redes) a partir do que já existe: nome, banner, diferencial, nicho e a
 * 1ª foto de produto. og:image só com endereço público (http/https): foto em data URL não serve para o WhatsApp.
 */
export function metaSeo({ cliente, produtos = [], conteudo: c = {}, url = '' }) {
  const titulo = corta(c.heroTitulo && c.heroTitulo !== cliente.nome ? `${cliente.nome} — ${c.heroTitulo}` : `${cliente.nome}${cliente.nicho ? ' — ' + cliente.nicho : ''}`, 70);
  const descricao = corta(c.heroSubtitulo || cliente.marca?.usp || c.storytelling || cliente.nicho || cliente.nome, 160);
  const foto = produtos.map((p) => p.fotos?.[0]?.url).find((u) => /^https?:\/\//i.test(u || '')) || '';
  return { titulo, descricao, imagem: foto, url: /^https?:\/\//i.test(url || '') ? url : '' };
}

const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * `logoUrl`: endereço do logo no cabeçalho (padrão: o logo salvo do cliente; no .zip, o arquivo que vai na pasta). Sem logo, o nome em texto.
 * `provas`: prints reais de clientes (lib/visual-site.js printsDoCliente: a cópia borrada quando houver) para a seção "Clientes reais".
 */
export function gerarSiteHTML({ cliente, produtos: produtosBase, conteudo: c = {}, config: cfg = {}, url = '', layout: layoutBruto = null, logoUrl = cliente?.logoArquivo?.url || '', provas = [], materiais = [] }) {
  // Ordem, blocos ocultos, títulos, variações e imagens ("Ajustar este site", lib/site-blocos.js). Sem layout = padrão de sempre.
  const L = normalizarLayout(layoutBruto || {});
  // "Usar em" das fotos dos Materiais (lib/fotos-site.js): fotos dos produtos, banner, história e galeria. O seletor vence a
  // escolha direta (ajustes rápidos), que vence o texto "Como eu quero o site".
  const produtos = produtosComFotos(produtosBase || [], materiais);
  // Banner: carrossel com as fotos de "Usar em" (ou a imagem única dos ajustes rápidos, como nos sites de antes).
  const slides = slidesDoBanner(materiais, L.imagens.hero);
  const med = medidasDe(null);
  for (const [bloco, uso] of [['hero', 'banner'], ['marca', 'sobre']]) { const img = imagemDoLugar(materiais, uso, L.imagens[bloco]); if (img) L.imagens[bloco] = img; }
  const galeria = fotosDoUso(materiais, 'galeria');
  const visivel = (k) => !L.ocultos.includes(k);
  const cor = cfg.corPrimaria || '#4f46e5';
  const rastro = rastreamentoDe(cliente); // Pixel do Meta / Google Ads / Hotjar / Tawk.to do cadastro (vazio = nenhum código)
  const pixel = codigoHead(rastro);
  const head = pixel ? `${pixel}\n` : '';
  const fundo = cfg.corFundo || '#ffffff';
  const zap = String(cfg.whatsapp || '').replace(/\D/g, '');
  const categorias = [...new Set(produtos.map((p) => p.categoria).filter(Boolean))];
  const maisVendidos = (produtos.filter((p) => p.destaque).length ? produtos.filter((p) => p.destaque) : produtos).slice(0, 4);
  const promo = produtos.filter((p) => p.precoPromocional);
  const faq = faqValida(c.faq);
  const seo = metaSeo({ cliente, produtos, conteudo: c, url });
  const pagamentos = (Array.isArray(cfg.pagamentos) ? cfg.pagamentos : PAGAMENTOS_PADRAO).filter((k) => ICONE_PAG[k]);
  // Recursos pedidos no plano (lib/plano-site.js): frete grátis, botão grande, página do produto, "Compre junto".
  const R = normalizarRecursos(cfg.recursos);
  const junto = (p) => (R.compreJunto && produtos.length > 1 ? sugeridoPara(p.id, produtos, R) : null);
  const dados = produtos.map((p) => ({ id: p.id, nome: p.nome, preco: Number(p.precoPromocional || p.preco || 0), foto: p.fotos?.[0]?.url || '', variacoes: p.variacoes || [], junto: junto(p)?.id || null }));

  const card = (p) => {
    const foto = p.fotos?.[0]?.url;
    const vars = (p.variacoes || []).filter((v) => v.nome && v.valores?.length);
    return `<article class="card" data-cat="${esc(p.categoria)}">
      <div class="ph">${foto ? `<img src="${esc(foto)}" alt="${esc(p.nome)}" width="600" height="600" loading="lazy"${p.fotos[0].foco && L.ajusteFotos !== 'contain' ? ` style="object-position:${posicaoCss(p.fotos[0].foco)}"` : ''}>` : '<span>sem foto</span>'}${p.precoPromocional ? '<b class="badge">OFERTA</b>' : ''}</div>
      <h3>${esc(p.nome)}</h3>
      <p class="preco">${!Number(p.preco) ? 'Preço sob consulta' : p.precoPromocional ? `<s>${brl(p.preco)}</s> ${brl(p.precoPromocional)}` : brl(p.preco)}</p>
      ${vars.map((v) => `<select data-var="${esc(v.nome)}" aria-label="${esc(v.nome)}">${v.valores.map((x) => `<option>${esc(x)}</option>`).join('')}</select>`).join('')}
      ${Number(p.preco) ? `<button class="btn" data-add="${esc(p.id)}">Adicionar ao carrinho</button>` : '<!-- sem preço cadastrado: sem botão de compra -->'}${R.paginaProduto ? `<a class="ver" href="#p-${esc(p.id)}">Ver detalhes</a>` : ''}</article>`;
  };
  // Página do produto (aparece pelo :target, sem script): todas as fotos, descrição, seções e "Compre junto".
  const paginaProduto = (p) => {
    const vars = (p.variacoes || []).filter((v) => v.nome && v.valores?.length);
    const sug = R.compreJunto?.onde === 'produto' ? junto(p) : null;
    return `<section id="p-${esc(p.id)}" class="pdp-pagina"><div class="wrap"><a href="#catalogo" class="ver">&larr; Voltar</a><div class="pdp card">
      <div class="pdp-fotos">${(p.fotos || []).map((f) => `<img src="${esc(f.url)}" alt="${esc(p.nome)}" width="800" height="800" loading="lazy">`).join('') || '<span>sem foto</span>'}</div>
      <div><h2>${esc(p.nome)}</h2><p class="preco">${!Number(p.preco) ? 'Preço sob consulta' : p.precoPromocional ? `<s>${brl(p.preco)}</s> ${brl(p.precoPromocional)}` : brl(p.preco)}</p>${R.freteGratis ? `<p class="frete-pdp">Frete grátis acima de ${esc(reais(R.freteGratis.valor))}</p>` : ''}
        ${vars.map((v) => `<select data-var="${esc(v.nome)}" aria-label="${esc(v.nome)}">${v.valores.map((x) => `<option>${esc(x)}</option>`).join('')}</select>`).join('')}
        ${Number(p.preco) ? `<button class="btn" data-add="${esc(p.id)}">Adicionar ao carrinho</button>` : ''}
        ${p.descricao ? `<div class="story">${esc(p.descricao)}</div>` : ''}
        ${R.secoesProduto.map((k) => (textoSecaoProduto(p, k) ? `<details class="secao-prod" open><summary>${esc(SECOES_PRODUTO[k])}</summary><p>${esc(textoSecaoProduto(p, k))}</p></details>` : '')).join('')}
        ${sug ? `<div class="junto card"><b>Compre junto</b><p>+ ${esc(sug.nome)} · ${Number(sug.preco) ? brl(sug.precoPromocional || sug.preco) : 'sob consulta'}</p>${Number(sug.preco) ? `<button class="btn" data-add="${esc(sug.id)}">Adicionar ${esc(sug.nome)}</button>` : ''}</div>` : ''}</div></div></div></section>`;
  };
  const grade = (lista, bloco) => { const n = L.variacoes[bloco]?.colunas; return `<div class="grid${n ? ` cols${n}` : ''}">${lista.map(card).join('')}</div>`; };
  // Depoimentos lidos da fonte (perfil de marca, prints com a cópia borrada), não da cópia da última geração.
  const deps = depoimentosVivos({ cliente, materiais, guardados: c.depoimentos || [], provasOcultas: c.provasOcultas || [] }).filter((d) => !L.depoimentosOcultos.includes(d.texto));
  const alturaHero = { curto: '40px', alto: '140px' }[L.variacoes.hero?.altura] || '';
  const imgMarca = L.imagens.marca?.url;

  const destinoCta = visivel('vendidos') ? '#vendidos' : '#catalogo';
  const prints = (provas || []).filter((p) => p?.url);
  const blocoHTML = {
    // Prints reais de clientes: toque/clique abre a imagem inteira (legível no celular). Nunca editamos o conteúdo do print.
    provas: () => (prints.length ? `<section id="clientes-reais" class="provas"><div class="wrap"><h2>${esc(tituloBloco(L, 'provas'))}</h2><div class="prints">${prints.map((p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener" title="Toque para ampliar"><img src="${esc(p.url)}" alt="${p.foto ? 'Foto de cliente real' : 'Print de cliente real'}${p.legenda ? ` (${esc(p.legenda)})` : ''}" loading="lazy"${p.foto ? ` class="foto-cliente" style="object-position:${posicaoCss(p.foco)}"` : ''}></a>`).join('')}</div><p class="dica-print">Toque no print para ampliar.</p></div></section>` : ''),
    hero: () => { const texto = `<h1>${esc(c.heroTitulo || cliente.nome)}</h1><p>${esc(c.heroSubtitulo || cliente.nicho)}</p><a href="${destinoCta}">${esc(c.heroCta || 'Ver produtos')}</a>`;
      return slides.length ? `<div id="topo" class="hero com-carrossel">${carrosselHtml({ slides, medida: med.banner, conteudo: texto, id: 'bn', alt: cliente.nome })}</div>`
        : `<div id="topo" class="hero"${alturaHero ? ` style="padding:${alturaHero} 0;"` : ''}><div class="wrap">${texto}</div></div>`; },
    categorias: () => (categorias.length && visivel('catalogo') ? `<section id="categorias"><div class="wrap"><h2>${esc(tituloBloco(L, 'categorias'))}</h2><div class="cats"><button data-filtro="">Todas</button>${categorias.map((x) => `<button data-filtro="${esc(x)}">${esc(x)}</button>`).join('')}</div></div></section>` : ''),
    vendidos: () => `<section id="vendidos" class="alt"><div class="wrap"><h2>${esc(tituloBloco(L, 'vendidos'))}</h2>${produtos.length ? grade(maisVendidos, 'vendidos') : '<p>Cadastre produtos para exibi-los aqui.</p>'}</div></section>`,
    sale: () => (promo.length ? `<section id="sale"><div class="wrap"><h2>${esc(tituloBloco(L, 'sale'))}</h2>${grade(promo, 'sale')}</div></section>` : ''),
    catalogo: () => `<section id="catalogo" class="${promo.length ? 'alt' : ''}"><div class="wrap"><h2>${esc(tituloBloco(L, 'catalogo'))}</h2><div id="catalogoGrade">${grade(produtos, 'catalogo')}</div></div></section>`,
    marca: () => (c.storytelling ? `<section id="marca"><div class="wrap"><h2>${esc(tituloBloco(L, 'marca'))}</h2>${imgMarca ? `<img class="story-img" src="${esc(imgMarca)}" alt="${esc(cliente.nome)}" loading="lazy" style="object-position:${posicaoCss(L.imagens.marca.foco)}">` : ''}<div class="story">${esc(c.storytelling)}</div></div></section>` : '<span id="marca"></span>'),
    galeria: () => (galeria.length ? `<section id="galeria"><div class="wrap"><h2>${esc(tituloBloco(L, 'galeria'))}</h2><div class="galeria">${galeria.map((f) => `<img src="${esc(f.url)}" alt="${esc(cliente.nome)}" loading="lazy" style="object-position:${posicaoCss(f.foco)}">`).join('')}</div></div></section>` : ''),
    depoimentos: () => (deps.length ? `<section class="alt"><div class="wrap"><h2>${esc(tituloBloco(L, 'depoimentos'))}</h2><div class="dep">${deps.map((d) => `<blockquote>${d.midiaUrl ? (d.midiaTipo === 'video' ? `<video src="${esc(d.midiaUrl)}" controls playsinline class="dep-midia"></video>` : `<img src="${esc(d.midiaUrl)}" alt="${esc(d.origem === 'prova_social' ? 'Print de avaliação real de cliente' : d.nome)}" class="dep-midia${d.origem === 'prova_social' ? ' dep-print' : ''}" loading="lazy">`) : ''}${d.exibir === 'print' ? '' : `“${esc(d.texto)}”`}<cite>— ${esc(d.nome)}</cite></blockquote>`).join('')}</div>
<!-- ATENÇÃO: depoimentos escritos à mão (sem foto/vídeo anexado) podem ser MODELOS — troque por depoimentos reais antes de publicar. Os que têm foto/vídeo vieram de criativos aprovados ou de prints de avaliação reais (com dados pessoais cobertos) guardados no app. --></div></section>` : ''),
    faq: () => (faq.length ? `<section id="faq" class="alt"><div class="wrap faq"><h2>${esc(tituloBloco(L, 'faq'))}</h2>${faq.map((f) => `<details><summary>${esc(f.p)}</summary><p>${esc(f.r)}</p></details>`).join('')}</div></section>` : ''),
    newsletter: () => `<section class="news"><div class="wrap"><h2>${esc(c.newsletterTitulo || 'Receba novidades')}</h2><p>${esc(c.newsletterTexto || '')}</p>
<!-- PONTO DE ENCAIXE: ligue este formulário à sua ferramenta de e-mail (Mailchimp, Brevo, etc.). Hoje ele só mostra uma confirmação local. -->
<form id="news"><input type="email" required placeholder="Seu e-mail" aria-label="E-mail"><button>Quero receber</button></form><p class="nota" id="newsOk"></p></div></section>`,
  };

  return `<!doctype html>
<html lang="${esc(cliente.marca?.idioma || 'pt-BR')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(seo.titulo)}</title><meta name="description" content="${esc(seo.descricao)}">
<!-- Prévia do link ao compartilhar (WhatsApp, Facebook, Instagram, LinkedIn): Open Graph -->
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(cliente.nome)}"><meta property="og:locale" content="${esc(String(cliente.marca?.idioma || 'pt-BR').replace('-', '_'))}">
<meta property="og:title" content="${esc(seo.titulo)}"><meta property="og:description" content="${esc(seo.descricao)}">
${seo.imagem ? `<meta property="og:image" content="${esc(seo.imagem)}"><meta name="twitter:card" content="summary_large_image">` : '<!-- og:image: cadastre uma foto de produto (hospedada online) para o link aparecer com imagem. --><meta name="twitter:card" content="summary">'}
${seo.url ? `<meta property="og:url" content="${esc(seo.url)}"><link rel="canonical" href="${esc(seo.url)}">` : ''}
${head}<style>
:root{--cor:${esc(cor)};--fundo:${esc(fundo)};--txt:#1f2937;--suave:#f3f4f6;--sobre-cor:${textoSobre(cor)};--cor-texto:${corLegivel(cor, /^#[\da-f]{3,6}$/i.test(fundo) ? fundo : '#ffffff')}}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--txt);background:var(--fundo)}
a{color:inherit}.wrap{max-width:1100px;margin:0 auto;padding:0 20px}
header{position:sticky;top:0;background:var(--fundo);border-bottom:1px solid #e5e7eb;z-index:20}header .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{font-weight:800;font-size:20px;text-decoration:none}.logo img{display:block;max-height:44px;max-width:180px;width:auto}nav a{margin-left:18px;text-decoration:none;font-size:14px}
.cartbtn{background:var(--cor);color:var(--sobre-cor);border:0;border-radius:999px;padding:8px 16px;cursor:pointer;font-weight:600}
.hero{background:linear-gradient(135deg,var(--cor),#111827);color:#fff;padding:80px 0;text-align:center}.hero h1{font-size:clamp(28px,5vw,48px);margin:0 0 12px}.hero p{font-size:18px;opacity:.9;max-width:600px;margin:0 auto 24px}
.hero a{display:inline-block;background:#fff;color:#111;padding:12px 28px;border-radius:999px;font-weight:700;text-decoration:none}
section{padding:48px 0}section h2{font-size:26px;margin:0 0 20px}.alt{background:var(--suave)}
.cats{display:flex;flex-wrap:wrap;gap:10px}.cats button{border:1px solid #d1d5db;background:#fff;border-radius:999px;padding:8px 18px;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}.card{background:#fff;border-radius:14px;padding:12px;box-shadow:0 1px 4px #0001}
.ph{position:relative;aspect-ratio:1;background:var(--suave);border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#4b5563}.ph img{width:100%;height:100%;object-fit:${L.ajusteFotos === 'contain' ? 'contain' : 'cover'}}
.prints{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px}.prints a{flex:0 0 auto;scroll-snap-align:start}.prints img{height:min(420px,70vh);aspect-ratio:${med.clientes.desktop.l}/${med.clientes.desktop.a};max-width:80vw;width:auto;object-fit:contain;border-radius:12px;border:1px solid #0001;background:#fff;display:block}.dica-print{font-size:13px;color:#6b7280;margin:8px 0 0}.prints img.foto-cliente{object-fit:cover}
.galeria{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}.galeria img{width:100%;aspect-ratio:${med.galeria.desktop.l}/${med.galeria.desktop.a};object-fit:cover;border-radius:12px;display:block}
.badge{position:absolute;top:8px;left:8px;background:#dc2626;color:#fff;font-size:11px;padding:3px 8px;border-radius:999px}
.card h3{font-size:15px;margin:10px 0 4px}.preco{margin:0 0 8px;font-weight:700}.preco s{color:#6b7280;font-weight:400;margin-right:6px}
select{width:100%;margin-bottom:6px;padding:6px;border:1px solid #d1d5db;border-radius:8px}
.btn{width:100%;background:var(--cor);color:var(--sobre-cor);border:0;border-radius:10px;padding:10px;font-weight:600;cursor:pointer}
.story{max-width:720px;line-height:1.7;font-size:17px;white-space:pre-line}
.dep{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.dep blockquote{margin:0;background:#fff;padding:18px;border-radius:14px;box-shadow:0 1px 4px #0001}.dep cite{display:block;margin-top:8px;font-size:13px;color:#6b7280}
.dep-midia{width:100%;max-height:220px;object-fit:cover;border-radius:10px;margin-bottom:10px;background:#111}.dep-print{max-height:420px;object-fit:contain;background:#fff;border:1px solid #0001}
.news form{display:flex;gap:8px;max-width:460px}.news input{flex:1;padding:10px;border:1px solid #d1d5db;border-radius:10px}.news button{background:var(--cor);color:var(--sobre-cor);border:0;border-radius:10px;padding:10px 18px;cursor:pointer}
footer{background:#111827;color:#d1d5db;padding:40px 0;font-size:14px}footer h4{color:#fff;margin:0 0 8px}footer .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px}footer p{white-space:pre-line;margin:0}
.zap{position:fixed;right:18px;bottom:18px;background:#25d366;color:#fff;border-radius:999px;padding:14px 18px;text-decoration:none;font-weight:700;z-index:30;box-shadow:0 4px 12px #0003}
#drawer{position:fixed;top:0;right:0;height:100%;width:min(380px,100%);background:#fff;box-shadow:-4px 0 20px #0003;transform:translateX(100%);transition:.25s;z-index:40;display:flex;flex-direction:column}
#drawer.open{transform:none}#drawer header{position:static;padding:16px;display:flex;justify-content:space-between}#itens{flex:1;overflow:auto;padding:0 16px}
.item{display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid #eee;font-size:14px}#rodape{padding:16px;border-top:1px solid #eee}
.nota{font-size:12px;color:#6b7280;margin-top:6px}
.barra-frete{background:var(--cor);color:var(--sobre-cor);text-align:center;font-size:14px;font-weight:600;padding:8px 12px}.frete-pdp{color:var(--cor-texto);font-weight:600;margin:0 0 10px}
.menu-toggle{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}.hamb{display:none}
@media(max-width:640px){header .wrap{flex-wrap:wrap;height:auto;min-height:56px;gap:8px;justify-content:flex-start}.hamb{display:flex;align-items:center;justify-content:center;width:44px;height:44px;margin-left:-10px;cursor:pointer}.menu-toggle:focus-visible+.hamb{outline:2px solid var(--txt);border-radius:8px}
.logo{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}nav{display:none;order:3;flex-basis:100%;flex-direction:column;padding-bottom:6px}.menu-toggle:checked~nav{display:flex}nav a{margin:0;padding:12px 2px;border-top:1px solid #f3f4f6;font-size:15px}
.btn,.cartbtn,.news button,.cats button,#cookies button,.ver{min-height:44px}.ver{display:inline-flex;align-items:center}}
.ver{display:inline-block;margin-top:8px;font-size:14px}.pdp-pagina{display:none;padding:32px 0}.pdp-pagina:target{display:block}.pdp{display:grid;grid-template-columns:1fr 1fr;gap:24px}@media(max-width:640px){.pdp{grid-template-columns:1fr}}
.pdp-fotos{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.pdp-fotos img{width:100%;height:auto;aspect-ratio:1;object-fit:${L.ajusteFotos === 'contain' ? 'contain' : 'cover'};border-radius:10px;background:var(--suave)}.pdp-fotos img:first-child{grid-column:1/-1}
.secao-prod{margin-top:12px;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px}.secao-prod summary{cursor:pointer;font-weight:600}.secao-prod p{white-space:pre-line;line-height:1.6;margin:8px 0 0}
.junto{margin-top:16px;border:2px dashed var(--cor)}.junto p{margin:6px 0}.pags-rodape{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}.pags-rodape svg{width:18px;height:18px}
${R.botaoGrande ? '.btn{padding:16px;font-size:18px;border-radius:12px}' : ''}
.grid.cols2{grid-template-columns:repeat(2,1fr)}.grid.cols3{grid-template-columns:repeat(3,1fr)}.grid.cols4{grid-template-columns:repeat(4,1fr)}@media(max-width:640px){.grid.cols3,.grid.cols4{grid-template-columns:repeat(2,1fr)}}
.story-img{width:100%;max-width:720px;aspect-ratio:${med.sobre.desktop.l}/${med.sobre.desktop.a};object-fit:cover;border-radius:14px;margin-bottom:16px}@media(max-width:640px){.story-img{aspect-ratio:${med.sobre.mobile.l}/${med.sobre.mobile.a}}}
.hero.com-carrossel{padding:0;background:#111}.car-texto h1{font-size:clamp(28px,5vw,48px);margin:0 0 12px}.car-texto p{font-size:18px;opacity:.95;max-width:600px;margin:0 auto 24px}.car-texto a{display:inline-block;background:#fff;color:#111;padding:12px 28px;border-radius:999px;font-weight:700;text-decoration:none}
${slides.length ? carrosselCss({ n: slides.length, id: 'bn' }) : ''}
.faq{max-width:760px}.faq details{background:#fff;border-radius:12px;padding:14px 18px;margin-bottom:10px;box-shadow:0 1px 4px #0001}.faq summary{cursor:pointer;font-weight:600}.faq p{margin:10px 0 0;line-height:1.6;white-space:pre-line}
.selo{margin-top:10px;padding:10px;border:1px solid #e5e7eb;border-radius:10px;font-size:12px;color:#374151}.selo svg{width:18px;height:18px;flex:none}
.selo .l{display:flex;align-items:center;gap:6px}.selo .pags{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;color:#6b7280}
#cookies{position:fixed;left:12px;right:12px;bottom:12px;max-width:720px;margin:0 auto;background:#111827;color:#f9fafb;border-radius:14px;padding:14px 16px;z-index:50;box-shadow:0 6px 24px #0005;display:none;font-size:14px}
#cookies.on{display:flex;flex-wrap:wrap;align-items:center;gap:10px}#cookies p{margin:0;flex:1 1 260px}#cookies button{border:0;border-radius:999px;padding:8px 16px;font-weight:600;cursor:pointer}
#cookies .ok{background:var(--cor);color:var(--sobre-cor)}#cookies .nao{background:#374151;color:#fff}.linkcookies{background:none;border:0;color:inherit;text-decoration:underline;cursor:pointer;padding:0;font:inherit}
</style></head><body>
${R.freteGratis ? `<div class="barra-frete">Frete grátis acima de ${esc(reais(R.freteGratis.valor))}</div>` : ''}
<header><div class="wrap"><input type="checkbox" id="menu-site" class="menu-toggle" aria-label="Abrir o menu"><label for="menu-site" class="hamb" title="Menu"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></label><a class="logo" href="#topo">${logoUrl ? `<img src="${esc(logoUrl)}" alt="${esc(cliente.nome)}">` : esc(cliente.nome)}</a>
<nav>${visivel('categorias') ? '<a href="#categorias">Categorias</a>' : ''}${visivel('vendidos') ? '<a href="#vendidos">Mais vendidos</a>' : ''}${promo.length && visivel('sale') ? '<a href="#sale">Sale</a>' : ''}${visivel('marca') ? '<a href="#marca">A marca</a>' : ''}${faq.length && visivel('faq') ? '<a href="#faq">Dúvidas</a>' : ''}</nav>
<button class="cartbtn" id="abrirCarrinho">Carrinho (<span id="qtd">0</span>)</button></div></header>

${L.ordem.filter(visivel).map((k) => blocoHTML[k]()).filter(Boolean).join('\n')}

${R.paginaProduto ? produtos.map(paginaProduto).join('') : ''}
<footer><div class="wrap"><div class="cols">
<div><h4>${esc(cliente.nome)}</h4><p>${esc(cliente.nicho)}</p>${R.pagamentos.length ? `<div class="pags-rodape">${pagamentos.map((k) => `<span class="l">${ICONE_PAG[k]}${esc(FORMAS_PAGAMENTO.find(([x]) => x === k)[1])}</span>`).join('')}</div>` : ''}</div>
<div><h4>Trocas e devoluções</h4><p>${esc(c.politicas?.trocas || 'Preencha a política de trocas.')}</p></div>
<div><h4>Envio</h4><p>${esc(c.politicas?.envio || 'Preencha a política de envio.')}</p></div>
<div><h4>Privacidade</h4><p>${esc(c.politicas?.privacidade || 'Preencha a política de privacidade.')}</p></div></div>
<p style="margin-top:24px">© ${new Date().getFullYear()} ${esc(cliente.nome)}. Todos os direitos reservados. · <button class="linkcookies" id="prefCookies">Preferências de cookies</button></p></div></footer>

<!-- Aviso de cookies (LGPD): aparece na 1ª visita; a escolha fica no navegador do visitante (localStorage). -->
<div id="cookies" role="dialog" aria-live="polite" aria-label="Aviso de cookies"><p>${esc(textoAvisoCookies(rastro))}</p>
<button class="nao" id="cookiesNao">Rejeitar</button><button class="ok" id="cookiesOk">Aceitar</button></div>

${zap ? `<a class="zap" href="https://wa.me/${zap}" target="_blank" rel="noopener">WhatsApp</a>` : '<!-- WhatsApp flutuante: informe o número em "Configurar loja" para exibir o botão. -->'}

<aside id="drawer" aria-label="Carrinho"><header><b>Seu carrinho</b><button id="fecharCarrinho" aria-label="Fechar">✕</button></header><div id="itens"></div>
<div id="rodape"><div id="juntoCarrinho"></div><p id="faltaFrete" class="nota"></p><p><b>Total: <span id="total">R$ 0,00</span></b></p>
<!-- ============ PONTO DE ENCAIXE DO CHECKOUT ============
     O botão abaixo chama window.checkoutHandler(itens). Substitua a função (no final do arquivo) para redirecionar ao checkout
     de terceiro: Shopify Buy Button, Mercado Pago Checkout Pro ou Stripe Payment Links. Este site NÃO processa pagamentos. -->
<button class="btn" id="finalizar" data-checkout-slot>Finalizar compra</button><p class="nota">Pagamento feito no checkout seguro do provedor escolhido.</p>
<div class="selo" aria-label="Compra segura"><div class="l">${ICONE_CADEADO}<span><b>Compra segura</b> · pagamento processado em ambiente protegido</span></div>
${pagamentos.length ? `<div class="pags">${pagamentos.map((k) => `<span class="l">${ICONE_PAG[k]}${esc(FORMAS_PAGAMENTO.find(([x]) => x === k)[1])}</span>`).join('')}</div>` : ''}</div></div></aside>

<script>
const PRODUTOS=${json(dados)};
document.querySelectorAll('nav a').forEach(a=>a.addEventListener('click',()=>{const m=document.getElementById('menu-site');if(m)m.checked=false}));
const brl=n=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let carrinho=[];try{carrinho=JSON.parse(localStorage.getItem('carrinho')||'[]')}catch(e){}
const salvar=()=>{try{localStorage.setItem('carrinho',JSON.stringify(carrinho))}catch(e){}};
function desenhar(){
  document.getElementById('qtd').textContent=carrinho.reduce((s,i)=>s+i.qtd,0);
  document.getElementById('itens').innerHTML=carrinho.length?carrinho.map((i,k)=>'<div class="item"><span>'+i.nome+(i.opcoes?' ('+i.opcoes+')':'')+' × '+i.qtd+'</span><span>'+brl(i.preco*i.qtd)+' <button data-rm="'+k+'" aria-label="Remover">✕</button></span></div>').join(''):'<p>Carrinho vazio.</p>';
  const tot=carrinho.reduce((s,i)=>s+i.preco*i.qtd,0);document.getElementById('total').textContent=brl(tot);
  ${R.freteGratis ? `document.getElementById('faltaFrete').textContent=carrinho.length?(tot>=${R.freteGratis.valor}?'Você ganhou frete grátis!':'Faltam '+brl(${R.freteGratis.valor}-tot)+' para o frete grátis.'):'';` : ''}
  ${R.compreJunto?.onde === 'carrinho' ? `const j=carrinho.map(i=>PRODUTOS.find(p=>p.id===i.id)).filter(Boolean).map(p=>PRODUTOS.find(x=>x.id===p.junto)).find(x=>x&&x.preco&&!carrinho.some(i=>i.id===x.id));document.getElementById('juntoCarrinho').innerHTML=j?'<div class="card junto"><b>Compre junto</b><p>+ '+j.nome+' · '+brl(j.preco)+'</p><button class="btn" data-add="'+j.id+'">Adicionar</button></div>':'';` : ''}
}
document.addEventListener('click',e=>{
  // Âncoras (#catalogo, #p-<produto>) ficam dentro da página, inclusive na prévia do painel (iframe srcdoc).
  const anc=e.target.closest('a[href^="#"]');if(anc&&anc.getAttribute('href').length>1){e.preventDefault();location.hash=anc.getAttribute('href');const alvo=document.getElementById(anc.getAttribute('href').slice(1));if(alvo)alvo.scrollIntoView();}
  const add=e.target.closest('[data-add]');
  if(add){const p=PRODUTOS.find(x=>x.id===add.dataset.add);if(!p)return;
    const opcoes=[...add.closest('.card').querySelectorAll('select')].map(s=>s.value).join(' / ');
    const ex=carrinho.find(i=>i.id===p.id&&i.opcoes===opcoes);ex?ex.qtd++:carrinho.push({id:p.id,nome:p.nome,preco:p.preco,opcoes,qtd:1});
    salvar();desenhar();document.getElementById('drawer').classList.add('open');}
  const rm=e.target.closest('[data-rm]');if(rm){carrinho.splice(+rm.dataset.rm,1);salvar();desenhar();}
  const f=e.target.closest('[data-filtro]');if(f){document.querySelectorAll('#catalogoGrade .card').forEach(c=>c.style.display=!f.dataset.filtro||c.dataset.cat===f.dataset.filtro?'':'none');var cg=document.getElementById('catalogo');if(cg)cg.scrollIntoView({behavior:'smooth'});}
});
document.getElementById('abrirCarrinho').onclick=()=>document.getElementById('drawer').classList.add('open');
document.getElementById('fecharCarrinho').onclick=()=>document.getElementById('drawer').classList.remove('open');
if(document.getElementById('news'))document.getElementById('news').onsubmit=e=>{e.preventDefault();document.getElementById('newsOk').textContent='Obrigado! (ligue este formulário à sua ferramenta de e-mail)';};
// >>> PONTO DE ENCAIXE: substitua para integrar o checkout de terceiro <<<
window.checkoutHandler=function(itens){
  alert('O pagamento desta loja ainda não foi ligado (seção 3 do manual de entrega: Mercado Pago, Stripe ou Shopify).\\n\\nItens: '+itens.map(i=>i.nome+' × '+i.qtd).join(', '));
};
${codigoCheckout(rastro)}
// Consentimento de cookies: sem escolha guardada, mostra o banner; "Aceitar" carrega o Pixel/tag (se houver).
(function(){
  var K=${JSON.stringify(CHAVE_CONSENTIMENTO)},b=document.getElementById('cookies'),esc=null;
  try{esc=localStorage.getItem(K)}catch(e){}
  if(esc!=='aceito'&&esc!=='rejeitado')b.classList.add('on');
  function guardar(v){try{localStorage.setItem(K,v)}catch(e){}b.classList.remove('on');if(v==='aceito'&&window.carregarRastreamento)window.carregarRastreamento();}
  document.getElementById('cookiesOk').onclick=function(){guardar('aceito')};
  document.getElementById('cookiesNao').onclick=function(){guardar('rejeitado')};
  document.getElementById('prefCookies').onclick=function(){b.classList.add('on')};
})();
document.getElementById('finalizar').onclick=()=>{if(!carrinho.length)return;rastrearCheckout(carrinho);window.checkoutHandler(carrinho);};
desenhar();
</script></body></html>`;
}
