// Gerador do site "custom": um único index.html autocontido (CSS + JS inline), com carrinho client-side.
// NÃO processa pagamento: o botão de compra chama window.checkoutHandler(itens), ponto de encaixe para checkout de terceiro.
import { esc } from '../core/ui.js';
import { rastreamentoDe, codigoHead, codigoCheckout, CHAVE_CONSENTIMENTO } from './rastreamento.js';

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

export function gerarSiteHTML({ cliente, produtos, conteudo: c = {}, config: cfg = {}, url = '' }) {
  const cor = cfg.corPrimaria || '#4f46e5';
  const rastro = rastreamentoDe(cliente); // Pixel do Meta / tag do Google Ads do cadastro (vazio = nenhum código)
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
  const dados = produtos.map((p) => ({ id: p.id, nome: p.nome, preco: Number(p.precoPromocional || p.preco || 0), foto: p.fotos?.[0]?.url || '', variacoes: p.variacoes || [] }));

  const card = (p) => {
    const foto = p.fotos?.[0]?.url;
    const vars = (p.variacoes || []).filter((v) => v.nome && v.valores?.length);
    return `<article class="card" data-cat="${esc(p.categoria)}">
      <div class="ph">${foto ? `<img src="${esc(foto)}" alt="${esc(p.nome)}" loading="lazy">` : '<span>sem foto</span>'}${p.precoPromocional ? '<b class="badge">OFERTA</b>' : ''}</div>
      <h3>${esc(p.nome)}</h3>
      <p class="preco">${p.precoPromocional ? `<s>${brl(p.preco)}</s> ${brl(p.precoPromocional)}` : brl(p.preco)}</p>
      ${vars.map((v) => `<select data-var="${esc(v.nome)}" aria-label="${esc(v.nome)}">${v.valores.map((x) => `<option>${esc(x)}</option>`).join('')}</select>`).join('')}
      <button class="btn" data-add="${esc(p.id)}">Adicionar ao carrinho</button></article>`;
  };
  const grade = (lista) => `<div class="grid">${lista.map(card).join('')}</div>`;

  return `<!doctype html>
<html lang="${esc(cliente.marca?.idioma || 'pt-BR')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(seo.titulo)}</title><meta name="description" content="${esc(seo.descricao)}">
<!-- Prévia do link ao compartilhar (WhatsApp, Facebook, Instagram, LinkedIn): Open Graph -->
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(cliente.nome)}"><meta property="og:locale" content="${esc(String(cliente.marca?.idioma || 'pt-BR').replace('-', '_'))}">
<meta property="og:title" content="${esc(seo.titulo)}"><meta property="og:description" content="${esc(seo.descricao)}">
${seo.imagem ? `<meta property="og:image" content="${esc(seo.imagem)}"><meta name="twitter:card" content="summary_large_image">` : '<!-- og:image: cadastre uma foto de produto (hospedada online) para o link aparecer com imagem. --><meta name="twitter:card" content="summary">'}
${seo.url ? `<meta property="og:url" content="${esc(seo.url)}"><link rel="canonical" href="${esc(seo.url)}">` : ''}
${head}<style>
:root{--cor:${esc(cor)};--fundo:${esc(fundo)};--txt:#1f2937;--suave:#f3f4f6}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--txt);background:var(--fundo)}
a{color:inherit}.wrap{max-width:1100px;margin:0 auto;padding:0 20px}
header{position:sticky;top:0;background:var(--fundo);border-bottom:1px solid #e5e7eb;z-index:20}header .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{font-weight:800;font-size:20px;text-decoration:none}nav a{margin-left:18px;text-decoration:none;font-size:14px}
.cartbtn{background:var(--cor);color:#fff;border:0;border-radius:999px;padding:8px 16px;cursor:pointer;font-weight:600}
.hero{background:linear-gradient(135deg,var(--cor),#111827);color:#fff;padding:80px 0;text-align:center}.hero h1{font-size:clamp(28px,5vw,48px);margin:0 0 12px}.hero p{font-size:18px;opacity:.9;max-width:600px;margin:0 auto 24px}
.hero a{display:inline-block;background:#fff;color:#111;padding:12px 28px;border-radius:999px;font-weight:700;text-decoration:none}
section{padding:48px 0}section h2{font-size:26px;margin:0 0 20px}.alt{background:var(--suave)}
.cats{display:flex;flex-wrap:wrap;gap:10px}.cats button{border:1px solid #d1d5db;background:#fff;border-radius:999px;padding:8px 18px;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}.card{background:#fff;border-radius:14px;padding:12px;box-shadow:0 1px 4px #0001}
.ph{position:relative;aspect-ratio:1;background:var(--suave);border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#9ca3af}.ph img{width:100%;height:100%;object-fit:cover}
.badge{position:absolute;top:8px;left:8px;background:#dc2626;color:#fff;font-size:11px;padding:3px 8px;border-radius:999px}
.card h3{font-size:15px;margin:10px 0 4px}.preco{margin:0 0 8px;font-weight:700}.preco s{color:#9ca3af;font-weight:400;margin-right:6px}
select{width:100%;margin-bottom:6px;padding:6px;border:1px solid #d1d5db;border-radius:8px}
.btn{width:100%;background:var(--cor);color:#fff;border:0;border-radius:10px;padding:10px;font-weight:600;cursor:pointer}
.story{max-width:720px;line-height:1.7;font-size:17px;white-space:pre-line}
.dep{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.dep blockquote{margin:0;background:#fff;padding:18px;border-radius:14px;box-shadow:0 1px 4px #0001}.dep cite{display:block;margin-top:8px;font-size:13px;color:#6b7280}
.dep-midia{width:100%;max-height:220px;object-fit:cover;border-radius:10px;margin-bottom:10px;background:#111}
.news form{display:flex;gap:8px;max-width:460px}.news input{flex:1;padding:10px;border:1px solid #d1d5db;border-radius:10px}.news button{background:var(--cor);color:#fff;border:0;border-radius:10px;padding:10px 18px;cursor:pointer}
footer{background:#111827;color:#d1d5db;padding:40px 0;font-size:14px}footer h4{color:#fff;margin:0 0 8px}footer .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px}footer p{white-space:pre-line;margin:0}
.zap{position:fixed;right:18px;bottom:18px;background:#25d366;color:#fff;border-radius:999px;padding:14px 18px;text-decoration:none;font-weight:700;z-index:30;box-shadow:0 4px 12px #0003}
#drawer{position:fixed;top:0;right:0;height:100%;width:min(380px,100%);background:#fff;box-shadow:-4px 0 20px #0003;transform:translateX(100%);transition:.25s;z-index:40;display:flex;flex-direction:column}
#drawer.open{transform:none}#drawer header{position:static;padding:16px;display:flex;justify-content:space-between}#itens{flex:1;overflow:auto;padding:0 16px}
.item{display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid #eee;font-size:14px}#rodape{padding:16px;border-top:1px solid #eee}
.nota{font-size:12px;color:#6b7280;margin-top:6px}
.faq{max-width:760px}.faq details{background:#fff;border-radius:12px;padding:14px 18px;margin-bottom:10px;box-shadow:0 1px 4px #0001}.faq summary{cursor:pointer;font-weight:600}.faq p{margin:10px 0 0;line-height:1.6;white-space:pre-line}
.selo{margin-top:10px;padding:10px;border:1px solid #e5e7eb;border-radius:10px;font-size:12px;color:#374151}.selo svg{width:18px;height:18px;flex:none}
.selo .l{display:flex;align-items:center;gap:6px}.selo .pags{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;color:#6b7280}
#cookies{position:fixed;left:12px;right:12px;bottom:12px;max-width:720px;margin:0 auto;background:#111827;color:#f9fafb;border-radius:14px;padding:14px 16px;z-index:50;box-shadow:0 6px 24px #0005;display:none;font-size:14px}
#cookies.on{display:flex;flex-wrap:wrap;align-items:center;gap:10px}#cookies p{margin:0;flex:1 1 260px}#cookies button{border:0;border-radius:999px;padding:8px 16px;font-weight:600;cursor:pointer}
#cookies .ok{background:var(--cor);color:#fff}#cookies .nao{background:#374151;color:#fff}.linkcookies{background:none;border:0;color:inherit;text-decoration:underline;cursor:pointer;padding:0;font:inherit}
</style></head><body>
<header><div class="wrap"><a class="logo" href="#topo">${esc(cliente.nome)}</a>
<nav><a href="#categorias">Categorias</a><a href="#vendidos">Mais vendidos</a>${promo.length ? '<a href="#sale">Sale</a>' : ''}<a href="#marca">A marca</a>${faq.length ? '<a href="#faq">Dúvidas</a>' : ''}</nav>
<button class="cartbtn" id="abrirCarrinho">Carrinho (<span id="qtd">0</span>)</button></div></header>

<div id="topo" class="hero"><div class="wrap"><h1>${esc(c.heroTitulo || cliente.nome)}</h1><p>${esc(c.heroSubtitulo || cliente.nicho)}</p><a href="#vendidos">${esc(c.heroCta || 'Ver produtos')}</a></div></div>

${categorias.length ? `<section id="categorias"><div class="wrap"><h2>Categorias</h2><div class="cats"><button data-filtro="">Todas</button>${categorias.map((x) => `<button data-filtro="${esc(x)}">${esc(x)}</button>`).join('')}</div></div></section>` : ''}
<section id="vendidos" class="alt"><div class="wrap"><h2>Mais vendidos</h2>${produtos.length ? grade(maisVendidos) : '<p>Cadastre produtos para exibi-los aqui.</p>'}</div></section>
${promo.length ? `<section id="sale"><div class="wrap"><h2>Sale</h2>${grade(promo)}</div></section>` : ''}
<section id="catalogo" class="${promo.length ? 'alt' : ''}"><div class="wrap"><h2>Catálogo completo</h2><div id="catalogoGrade">${grade(produtos)}</div></div></section>
${c.storytelling ? `<section id="marca"><div class="wrap"><h2>Nossa história</h2><div class="story">${esc(c.storytelling)}</div></div></section>` : '<span id="marca"></span>'}
${(c.depoimentos || []).length ? `<section class="alt"><div class="wrap"><h2>Quem já usa</h2><div class="dep">${c.depoimentos.map((d) => `<blockquote>${d.midiaUrl ? (d.midiaTipo === 'video' ? `<video src="${esc(d.midiaUrl)}" controls playsinline class="dep-midia"></video>` : `<img src="${esc(d.midiaUrl)}" alt="${esc(d.nome)}" class="dep-midia" loading="lazy">`) : ''}“${esc(d.texto)}”<cite>— ${esc(d.nome)}</cite></blockquote>`).join('')}</div>
<!-- ATENÇÃO: depoimentos escritos à mão (sem foto/vídeo anexado) podem ser MODELOS — troque por depoimentos reais antes de publicar. Os que têm foto/vídeo vieram de criativos aprovados no app. --></div></section>` : ''}
${faq.length ? `<section id="faq" class="alt"><div class="wrap faq"><h2>Perguntas frequentes</h2>${faq.map((f) => `<details><summary>${esc(f.p)}</summary><p>${esc(f.r)}</p></details>`).join('')}</div></section>` : ''}
<section class="news"><div class="wrap"><h2>${esc(c.newsletterTitulo || 'Receba novidades')}</h2><p>${esc(c.newsletterTexto || '')}</p>
<!-- PONTO DE ENCAIXE: ligue este formulário à sua ferramenta de e-mail (Mailchimp, Brevo, etc.). Hoje ele só mostra uma confirmação local. -->
<form id="news"><input type="email" required placeholder="Seu e-mail" aria-label="E-mail"><button>Quero receber</button></form><p class="nota" id="newsOk"></p></div></section>

<footer><div class="wrap"><div class="cols">
<div><h4>${esc(cliente.nome)}</h4><p>${esc(cliente.nicho)}</p></div>
<div><h4>Trocas e devoluções</h4><p>${esc(c.politicas?.trocas || 'Preencha a política de trocas.')}</p></div>
<div><h4>Envio</h4><p>${esc(c.politicas?.envio || 'Preencha a política de envio.')}</p></div>
<div><h4>Privacidade</h4><p>${esc(c.politicas?.privacidade || 'Preencha a política de privacidade.')}</p></div></div>
<p style="margin-top:24px">© ${new Date().getFullYear()} ${esc(cliente.nome)}. Todos os direitos reservados. · <button class="linkcookies" id="prefCookies">Preferências de cookies</button></p></div></footer>

<!-- Aviso de cookies (LGPD): aparece na 1ª visita; a escolha fica no navegador do visitante (localStorage). -->
<div id="cookies" role="dialog" aria-live="polite" aria-label="Aviso de cookies"><p>Usamos cookies e tecnologias parecidas para o carrinho funcionar${rastro.metaPixelId || rastro.googleAdsId ? ' e, se você aceitar, para medir anúncios (Meta/Google)' : ''}. Você pode mudar a escolha em "Preferências de cookies", no rodapé.</p>
<button class="nao" id="cookiesNao">Rejeitar</button><button class="ok" id="cookiesOk">Aceitar</button></div>

${zap ? `<a class="zap" href="https://wa.me/${zap}" target="_blank" rel="noopener">WhatsApp</a>` : '<!-- WhatsApp flutuante: informe o número em "Configurar loja" para exibir o botão. -->'}

<aside id="drawer" aria-label="Carrinho"><header><b>Seu carrinho</b><button id="fecharCarrinho" aria-label="Fechar">✕</button></header><div id="itens"></div>
<div id="rodape"><p><b>Total: <span id="total">R$ 0,00</span></b></p>
<!-- ============ PONTO DE ENCAIXE DO CHECKOUT ============
     O botão abaixo chama window.checkoutHandler(itens). Substitua a função (no final do arquivo) para redirecionar ao checkout
     de terceiro: Shopify Buy Button, Mercado Pago Checkout Pro ou Stripe Payment Links. Este site NÃO processa pagamentos. -->
<button class="btn" id="finalizar" data-checkout-slot>Finalizar compra</button><p class="nota">Pagamento feito no checkout seguro do provedor escolhido.</p>
<div class="selo" aria-label="Compra segura"><div class="l">${ICONE_CADEADO}<span><b>Compra segura</b> · pagamento processado em ambiente protegido</span></div>
${pagamentos.length ? `<div class="pags">${pagamentos.map((k) => `<span class="l">${ICONE_PAG[k]}${esc(FORMAS_PAGAMENTO.find(([x]) => x === k)[1])}</span>`).join('')}</div>` : ''}</div></div></aside>

<script>
const PRODUTOS=${json(dados)};
const brl=n=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let carrinho=[];try{carrinho=JSON.parse(localStorage.getItem('carrinho')||'[]')}catch(e){}
const salvar=()=>{try{localStorage.setItem('carrinho',JSON.stringify(carrinho))}catch(e){}};
function desenhar(){
  document.getElementById('qtd').textContent=carrinho.reduce((s,i)=>s+i.qtd,0);
  document.getElementById('itens').innerHTML=carrinho.length?carrinho.map((i,k)=>'<div class="item"><span>'+i.nome+(i.opcoes?' ('+i.opcoes+')':'')+' × '+i.qtd+'</span><span>'+brl(i.preco*i.qtd)+' <button data-rm="'+k+'" aria-label="Remover">✕</button></span></div>').join(''):'<p>Carrinho vazio.</p>';
  document.getElementById('total').textContent=brl(carrinho.reduce((s,i)=>s+i.preco*i.qtd,0));
}
document.addEventListener('click',e=>{
  const add=e.target.closest('[data-add]');
  if(add){const p=PRODUTOS.find(x=>x.id===add.dataset.add);if(!p)return;
    const opcoes=[...add.closest('.card').querySelectorAll('select')].map(s=>s.value).join(' / ');
    const ex=carrinho.find(i=>i.id===p.id&&i.opcoes===opcoes);ex?ex.qtd++:carrinho.push({id:p.id,nome:p.nome,preco:p.preco,opcoes,qtd:1});
    salvar();desenhar();document.getElementById('drawer').classList.add('open');}
  const rm=e.target.closest('[data-rm]');if(rm){carrinho.splice(+rm.dataset.rm,1);salvar();desenhar();}
  const f=e.target.closest('[data-filtro]');if(f){document.querySelectorAll('#catalogoGrade .card').forEach(c=>c.style.display=!f.dataset.filtro||c.dataset.cat===f.dataset.filtro?'':'none');document.getElementById('catalogo').scrollIntoView({behavior:'smooth'});}
});
document.getElementById('abrirCarrinho').onclick=()=>document.getElementById('drawer').classList.add('open');
document.getElementById('fecharCarrinho').onclick=()=>document.getElementById('drawer').classList.remove('open');
document.getElementById('news').onsubmit=e=>{e.preventDefault();document.getElementById('newsOk').textContent='Obrigado! (ligue este formulário à sua ferramenta de e-mail)';};
// >>> PONTO DE ENCAIXE: substitua para integrar o checkout de terceiro <<<
window.checkoutHandler=function(itens){
  alert('Checkout ainda não conectado. Veja o manual de handoff para ligar Shopify Buy Button, Mercado Pago ou Stripe.\\n\\nItens: '+itens.map(i=>i.nome+' × '+i.qtd).join(', '));
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
