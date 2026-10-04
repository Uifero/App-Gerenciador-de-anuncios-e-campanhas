// Pacote Nuvemshop/Shopify: (1) o que colocar em cada lugar da plataforma, com o caminho de menu do manual de entrega,
// e (2) uma PRÉVIA com cara de loja (tema neutro) para o operador e para o link de aprovação.
// A prévia é só HTML + CSS, SEM NENHUM script (o <base href="about:srcdoc"> mantém as âncoras dentro do iframe; sem ele,
// "#produto-1" iria para o endereço do painel): não tem carrinho nem checkout funcionando, não carrega Pixel, Google Ads,
// Hotjar, Tawk.to nem qualquer rastreador, e é noindex/nofollow. A navegação (home <-> página do produto) é por âncora.
import { comTextosDoPacote } from './csv.js';
import { normalizarVisual, nomeSecaoLoja, AJUSTES_FOTO } from './visual-site.js';
import { produtosComFotos, imagemDoLugar, fotosDoUso, rotuloFoto } from './fotos-site.js';

const txt = (v) => String(v ?? '').trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HEX = /^#[0-9a-f]{6}$/i;
const moeda = (n) => (Number(n) > 0 ? `R$ ${Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}` : '');

export const LEGENDA_PREVIA_PACOTE = 'Prévia aproximada. O visual final depende do tema escolhido na Nuvemshop/Shopify; textos, fotos, preços e ordem das seções são os que vão para a loja.';
export const TEXTO_COMPRA_DESATIVADA = 'Prévia, compra desativada';

/** Junta o que vai para a loja: textos do pacote, conteúdo/políticas do formulário, produtos reais (com SEO do pacote), logo e cores. */
/** `provas` = prints reais de clientes (lib/visual-site.js printsDoCliente), já na cópia borrada quando houver. */
/** `materiais` = Materiais do cliente com o "Usar em" de cada foto (lib/fotos-site.js): banner, fotos dos produtos, Sobre e Galeria. */
export function dadosDoPacote({ cliente = {}, site = {}, produtos = [], provas = [], materiais = [] }) {
  const p = site.pacote || {}, c = site.conteudo || {};
  const visual = normalizarVisual(p.visual);
  const banner = imagemDoLugar(materiais, 'banner', visual.banner); // escolha em "Usar em" > ajustes rápidos > texto
  if (banner) visual.banner = banner;
  else if (visual.banner) { const m = materiais.find((x) => x.id === visual.banner.materialId); if (m?.codigo) visual.banner = { ...visual.banner, codigo: m.codigo }; }
  const paleta = (p.briefingTema?.paletaSugerida || []).filter((h) => HEX.test(h || ''));
  const cor = paleta[0] || (HEX.test(site.config?.corPrimaria || '') ? site.config.corPrimaria : '#111827');
  const banners = (p.banners || []).filter((b) => txt(b?.titulo));
  return {
    visual,
    sobreImagens: fotosDoUso(materiais, 'sobre'),
    galeria: fotosDoUso(materiais, 'galeria'),
    provas: (provas || []).filter((x) => x?.url),
    plataforma: site.plataforma === 'shopify' ? 'shopify' : 'nuvemshop',
    nomeLoja: txt(cliente.nome) || 'Loja',
    logoUrl: cliente.logoArquivo?.url || '',
    cor, paleta,
    tipografia: txt(p.briefingTema?.tipografia),
    banner: banners[0] || { titulo: txt(c.heroTitulo), subtitulo: txt(c.heroSubtitulo), cta: txt(c.heroCta) },
    banners,
    secoesHome: (p.briefingTema?.secoesHome || []).map(txt).filter(Boolean),
    sobre: txt(p.textosPagina?.sobre) || txt(c.storytelling),
    faq: (p.textosPagina?.faq || []).filter((f) => txt(f?.p) && txt(f?.r)),
    politicas: { trocas: txt(c.politicas?.trocas), envio: txt(c.politicas?.envio), privacidade: txt(c.politicas?.privacidade) },
    depoimentos: (p.depoimentos?.length ? p.depoimentos : c.depoimentos || []).filter((d) => txt(d?.texto)),
    produtos: comTextosDoPacote(produtosComFotos(produtos, materiais), p).filter((x) => txt(x?.nome)).map((x) => ({
      nome: txt(x.nome), descricao: txt(x.descricao), preco: Number(x.preco) || null, precoPromocional: Number(x.precoPromocional) || null,
      variacoes: (x.variacoes || []).filter((v) => v?.nome && v.valores?.length), fotos: (x.fotos || []).map((f) => f?.url).filter(Boolean),
      arquivos: (x.fotos || []).filter((f) => f?.url).map((f) => ({ url: f.url, nome: f.nome || 'foto', codigo: f.codigo || '' })),
      seoTitulo: txt(x.seoTitulo), seoDescricao: txt(x.seoDescricao), categoria: txt(x.categoria),
    })),
  };
}

// Caminhos de menu: as mesmas instruções do manual de entrega (sites.js, manualPacote).
const CAMINHOS = {
  shopify: {
    loja: 'Na criação da conta da Shopify (nome da loja); depois, nas configurações da loja',
    logo: 'Loja virtual > Temas > Personalizar (cabeçalho do tema)',
    banner: 'Loja virtual > Temas: bloco de imagem/slideshow da home',
    cores: 'Loja virtual > Temas: aplique a paleta e a tipografia do briefing',
    produtos: 'Produtos > Importar (o CSV já leva estes textos); para conferir, abra o produto em Produtos',
    paginas: 'Crie as páginas Sobre e FAQ com os textos abaixo (manual, passo 3)',
    politicas: 'Configurações > Políticas',
    fotos: 'Loja virtual > Temas > Personalizar (configurações de produto/coleção do tema)',
    fotosAjuda: { contain: 'Procure "Proporção da imagem" e escolha "Adaptar à imagem"/"Original". Se o tema não tiver essa opção, não há equivalente: envie as fotos já no formato quadrado com fundo branco.', cover: 'Procure "Proporção da imagem" e escolha "Quadrado" (preencher/cortar). É o padrão da maioria dos temas.' },
    secoes: 'Loja virtual > Temas > Personalizar: arraste as seções da página inicial nesta ordem; oculte as que não entram',
    provas: 'Loja virtual > Temas > Personalizar > Adicionar seção: "Imagem com texto", "Galeria" ou "Slideshow" (o nome varia com o tema) e suba os prints',
  },
  nuvemshop: {
    loja: 'Na criação da conta da Nuvemshop (nome da loja); depois, nas configurações da loja',
    logo: 'Design > Personalizar (logo no cabeçalho do tema)',
    banner: 'Design > Personalizar: carrossel/banner principal',
    cores: 'Design > Personalizar: aplique a paleta e a tipografia do briefing',
    produtos: 'Produtos > Importar/Exportar (o CSV já leva estes textos); para conferir, abra o produto em Produtos',
    paginas: 'Crie as páginas Sobre e FAQ com os textos abaixo (manual, passo 3)',
    politicas: 'Cadastre as políticas de trocas, envio e privacidade (manual, passo 3)',
    fotos: 'Design > Personalizar (lista de produtos / página de produto do tema)',
    fotosAjuda: { contain: 'Procure o formato das fotos e escolha a proporção original/sem corte. Se o tema não tiver essa opção, não há equivalente: envie as fotos já no formato quadrado com fundo branco.', cover: 'Procure o formato das fotos e escolha quadrado (preencher). É o padrão da maioria dos temas.' },
    secoes: 'Design > Personalizar: arraste as seções da página inicial nesta ordem; desative as que não entram',
    provas: 'Design > Personalizar: adicione um bloco de banners/imagens na página inicial (o nome varia com o tema) e suba os prints',
  },
};

const variacoesTexto = (vs = []) => vs.map((v) => `${v.nome}: ${v.valores.join(', ')}`).join(' · ');
/** "1. F5 — frente.jpg (principal)" / "2. foto da aba Produtos — x.jpg": código + nome original de cada arquivo, um por linha. */
const listaArquivos = (lista = [], produto = false) => lista.filter((x) => x?.url).map((x, i) => `${i + 1}. ${x.codigo ? `${x.codigo} — ` : produto ? 'foto da aba Produtos — ' : ''}${x.nome || 'imagem'}${produto && i === 0 ? ' (principal)' : ''}`).join('\n');

/**
 * "O que colocar na plataforma": [{ id, titulo, caminho, itens: [{ rotulo, valor, tipo? }] }]. Item vazio fica de fora;
 * grupo sem nenhum item também (nada de campo em branco para copiar).
 */
export function gruposPlataforma(d) {
  const cam = CAMINHOS[d.plataforma] || CAMINHOS.nuvemshop;
  const item = (rotulo, valor, tipo) => (txt(valor) ? { rotulo, valor: txt(valor), ...(tipo ? { tipo } : {}) } : null);
  const g = (id, titulo, caminho, itens) => ({ id, titulo, caminho, itens: itens.filter(Boolean) });
  const grupos = [
    g('loja', 'Nome da loja', cam.loja, [item('Nome da loja', d.nomeLoja)]),
    g('logo', 'Logo', cam.logo, [d.logoUrl ? item('Arquivo do logo (baixe em "Baixar pacote")', d.logoUrl, 'imagem') : item('Logo', 'Sem logo salvo: envie na pergunta 9 ou no painel "Material para montar o site".')]),
    g('banner', 'Banner', cam.banner, (d.banners.length ? d.banners : [d.banner]).flatMap((b, i) => [
      item(`${b.uso || `Banner ${i + 1}`}: título`, b.titulo), item(`${b.uso || `Banner ${i + 1}`}: subtítulo`, b.subtitulo), item(`${b.uso || `Banner ${i + 1}`}: botão`, b.cta)])),
    g('home', 'Textos da home', cam.cores, [item('Ordem das seções da home', d.secoesHome.join(' > ')), item('Texto "Sobre a marca" (bloco de texto da home)', d.sobre)]),
    ...d.produtos.map((x, i) => g(`produto-${i}`, `Produto: ${x.nome}`, cam.produtos, [
      item('Título', x.nome), item('Descrição', x.descricao), item('Preço', moeda(x.preco)), item('Preço promocional', moeda(x.precoPromocional)),
      item('Variações', variacoesTexto(x.variacoes)), item('Título para SEO', x.seoTitulo), item('Descrição para SEO', x.seoDescricao),
      item('Fotos, nesta ordem (pasta produtos/ do .zip "Imagens por lugar")', listaArquivos(x.arquivos, true))])),
    g('paginas', 'Páginas institucionais', cam.paginas, [item('Página "Sobre"', d.sobre), item('Página "Perguntas frequentes"', d.faq.map((f) => `${f.p}\n${f.r}`).join('\n\n'))]),
    g('politicas', 'Políticas', cam.politicas, [item('Trocas e devoluções', d.politicas.trocas), item('Envio', d.politicas.envio), item('Privacidade', d.politicas.privacidade)]),
    g('cores', 'Cores e tipografia', cam.cores, [item('Paleta (cor principal primeiro)', d.paleta.join(', ') || d.cor), item('Tipografia', d.tipografia)]),
    // Escolhas feitas na prévia (painel "Site gerado" / "Ajustar este site"): o que fazer no tema para a loja ficar igual.
    g('visual-banner', 'Imagem do banner (escolhida na prévia)', cam.banner, d.visual.banner ? [item('Imagem para subir no banner (baixe em "Baixar pacote")', d.visual.banner.url, 'imagem'), item('Arquivo (pasta banner/ do .zip "Imagens por lugar")', rotuloFoto(d.visual.banner))] : []),
    g('visual-fotos', 'Fotos dos produtos (como aparecem)', cam.fotos, [item('Escolha na prévia', `${AJUSTES_FOTO[d.visual.ajusteFotos]}: ${d.visual.ajusteFotos === 'contain' ? 'a foto aparece inteira, sem cortar' : 'a foto preenche o quadro (as bordas podem ser cortadas)'}`),
      item('No tema', cam.fotosAjuda[d.visual.ajusteFotos])]),
    g('visual-secoes', 'Ordem das seções da home (como aprovado na prévia)', cam.secoes, [item('Ordem', d.visual.ordem.filter((k) => !d.visual.ocultas.includes(k)).map(nomeSecaoLoja).join(' > ')), item('Não colocar na home', d.visual.ocultas.map(nomeSecaoLoja).join(', '))]),
    g('provas', 'Clientes reais (prints)', cam.provas, d.provas.length ? [item('Prints para subir', `${d.provas.length} imagem(ns): baixe em "Baixar pacote" (Prints de clientes ou pasta clientes-reais/ do .zip "Imagens por lugar"). São as cópias com dados pessoais borrados quando você borrou.`), item('Arquivos', listaArquivos(d.provas)), item('Onde na home', `${d.visual.ocultas.includes('provas') ? 'Oculta na prévia: não colocar.' : `Posição ${d.visual.ordem.filter((k) => !d.visual.ocultas.includes(k)).indexOf('provas') + 1} da home (como na prévia).`}`)] : []),
    g('fotos-sobre', 'Imagem do "Sobre a marca"', cam.paginas, [item('Arquivos (pasta sobre/ do .zip "Imagens por lugar")', listaArquivos(d.sobreImagens))]),
    g('fotos-galeria', 'Galeria de fotos', cam.provas, [item('Arquivos (pasta galeria/ do .zip "Imagens por lugar")', listaArquivos(d.galeria))]),
  ];
  return grupos.filter((x) => x.itens.length);
}

/** HTML completo da prévia (documento próprio, para o iframe isolado). Sem script nenhum. */
export function gerarPreviaLojaHTML(d) {
  const cor = HEX.test(d.cor) ? d.cor : '#111827';
  const fonte = /^[A-Za-zÀ-ÿ ]{2,40}$/.test(d.tipografia.split(/[,;(]/)[0].trim()) ? d.tipografia.split(/[,;(]/)[0].trim() : ''; // só nome simples de fonte
  const preco = (x) => (x.precoPromocional && x.preco && x.precoPromocional < x.preco
    ? `<span class="de">${esc(moeda(x.preco))}</span> <b>${esc(moeda(x.precoPromocional))}</b>` : x.preco || x.precoPromocional ? `<b>${esc(moeda(x.preco || x.precoPromocional))}</b>` : '<b>Sob consulta</b>');
  const foto = (x, cls = '') => (x.fotos[0] ? `<img src="${esc(x.fotos[0])}" alt="${esc(x.nome)}" class="${cls}">` : `<div class="semfoto ${cls}">sem foto</div>`);
  const marca = d.logoUrl ? `<img src="${esc(d.logoUrl)}" alt="${esc(d.nomeLoja)}" class="logo">` : `<span class="nome">${esc(d.nomeLoja)}</span>`;
  const cabecalho = `<header><div class="wrap"><a href="#inicio" class="marca">${marca}</a><nav><a href="#inicio">Início</a><a href="#produtos">Produtos</a>${d.sobre ? '<a href="#sobre">Sobre</a>' : ''}${d.faq.length ? '<a href="#faq">Dúvidas</a>' : ''}</nav><span class="sacola" title="${esc(TEXTO_COMPRA_DESATIVADA)}">Carrinho (0)</span></div></header>`;
  const rodape = `<footer><div class="wrap"><div>${marca}</div><div><b>Institucional</b>${d.sobre ? '<a href="#sobre">Sobre</a>' : ''}${d.faq.length ? '<a href="#faq">Perguntas frequentes</a>' : ''}${d.politicas.trocas ? '<span>Trocas e devoluções</span>' : ''}${d.politicas.envio ? '<span>Envio</span>' : ''}${d.politicas.privacidade ? '<span>Privacidade</span>' : ''}</div><div><b>Compra segura</b><span>Pagamento e frete configurados na plataforma</span></div></div><p class="aviso">${esc(LEGENDA_PREVIA_PACOTE)}</p></footer>`;
  const paginasProduto = d.produtos.map((x, i) => `<section id="produto-${i}" class="pagina"><div class="wrap"><a href="#produtos" class="voltar">&larr; Voltar aos produtos</a>
    <div class="pdp"><div class="galeria">${foto(x, 'principal')}${x.fotos.length > 1 ? `<div class="miniaturas">${x.fotos.slice(1, 5).map((u) => `<img src="${esc(u)}" alt="">`).join('')}</div>` : ''}</div>
    <div><h1>${esc(x.nome)}</h1><p class="preco">${preco(x)}</p>
      ${x.variacoes.map((v) => `<div class="var"><span>${esc(v.nome)}</span><div>${v.valores.map((val) => `<span class="chip">${esc(val)}</span>`).join('')}</div></div>`).join('')}
      <button type="button" class="comprar" disabled data-compra-desativada>${esc(TEXTO_COMPRA_DESATIVADA)}</button>
      ${x.descricao ? `<div class="desc">${esc(x.descricao).replace(/\n/g, '<br>')}</div>` : ''}</div></div></div></section>`).join('');
  const grade = d.produtos.length ? d.produtos.map((x, i) => `<a class="card" href="#produto-${i}">${foto(x)}<span class="nomep">${esc(x.nome)}</span><span class="preco">${preco(x)}</span></a>`).join('') : '<p>Nenhum produto cadastrado.</p>';
  const V = d.visual;
  const lightbox = d.provas.map((p, i) => `<div id="print-${i}" class="lightbox"><a href="#clientes-reais" class="fechar" aria-label="Fechar">×</a><img src="${esc(p.url)}" alt="Print de cliente real"></div>`).join('');
  const secao = {
    banner: () => `<div class="banner${V.banner ? ' com-img' : ''}"${V.banner ? ` style="background-image:linear-gradient(#0007,#0007),url('${esc(V.banner.url)}')"` : ''}><div class="wrap"><h1>${esc(d.banner.titulo || d.nomeLoja)}</h1>${d.banner.subtitulo ? `<p>${esc(d.banner.subtitulo)}</p>` : ''}${d.banner.cta ? `<a href="#produtos" class="cta">${esc(d.banner.cta)}</a>` : ''}</div></div>`,
    provas: () => (d.provas.length ? `<div class="wrap"><h2 id="clientes-reais">Clientes reais</h2><div class="prints">${d.provas.map((p, i) => `<a href="#print-${i}" title="Toque para ampliar"><img src="${esc(p.url)}" alt="Print de cliente real" loading="lazy"></a>`).join('')}</div><p class="dica">Toque no print para ampliar.</p></div>` : ''),
    produtos: () => `<div class="wrap"><h2 id="produtos">Produtos</h2><div class="grade">${grade}</div></div>`,
    confianca: () => `<div class="wrap"><div class="confianca"><div><b>Compra segura</b><span>Pagamento pela plataforma</span></div><div><b>Entrega</b><span>${esc(d.politicas.envio ? d.politicas.envio.slice(0, 90) : 'Frete calculado no carrinho')}</span></div><div><b>Trocas</b><span>${esc(d.politicas.trocas ? d.politicas.trocas.slice(0, 90) : 'Política de trocas da loja')}</span></div></div></div>`,
    depoimentos: () => (d.depoimentos.length ? `<div class="wrap"><h2>Quem já comprou</h2><div class="depos">${d.depoimentos.slice(0, 6).map((x) => `<blockquote>“${esc(x.texto)}”<cite>${esc(x.nome || 'Cliente')}</cite></blockquote>`).join('')}</div></div>` : ''),
    galeria: () => ((d.galeria || []).length ? `<div class="wrap"><h2 id="galeria">Galeria</h2><div class="galeria-fotos">${d.galeria.map((f) => `<img src="${esc(f.url)}" alt="" loading="lazy">`).join('')}</div></div>` : ''),
    sobre: () => (d.sobre ? `<div class="wrap"><h2 id="sobre">Sobre a marca</h2>${(d.sobreImagens || [])[0] ? `<img class="sobre-img" src="${esc(d.sobreImagens[0].url)}" alt="" loading="lazy">` : ''}<p class="sobre">${esc(d.sobre).replace(/\n/g, '<br>')}</p></div>` : ''),
    faq: () => (d.faq.length ? `<div class="wrap"><h2 id="faq">Perguntas frequentes</h2>${d.faq.map((f) => `<details><summary>${esc(f.p)}</summary><p>${esc(f.r)}</p></details>`).join('')}</div>` : ''),
  };
  const home = `<section id="inicio" class="home">${V.ordem.filter((k) => !V.ocultas.includes(k)).map((k) => secao[k]()).join('')}</section>`;
  // Página de produto: aparece pelo :target; a home some enquanto um produto está aberto.
  const css = `*{box-sizing:border-box}body{margin:0;font-family:${fonte ? `"${fonte}",` : ''}system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111827;background:#fff}
a{color:inherit}.wrap{max-width:1100px;margin:0 auto;padding:0 16px}
header{border-bottom:1px solid #e5e7eb;position:sticky;top:0;background:#fff;z-index:2}header .wrap{display:flex;align-items:center;gap:16px;min-height:64px;flex-wrap:wrap}
.marca{text-decoration:none;display:flex;align-items:center}.logo{max-height:44px;max-width:160px;display:block}.nome{font-weight:800;font-size:20px}
nav{display:flex;gap:16px;flex:1;flex-wrap:wrap}nav a{text-decoration:none;font-size:14px}.sacola{font-size:13px;border:1px solid #d1d5db;border-radius:999px;padding:6px 12px;color:#6b7280}
.banner{background:${cor};color:#fff;padding:56px 0;text-align:center}.banner h1{margin:0 0 8px;font-size:clamp(24px,4vw,40px)}.banner p{margin:0 0 18px;opacity:.92}
.cta{display:inline-block;background:#fff;color:${cor};padding:12px 22px;border-radius:6px;font-weight:700;text-decoration:none}
h2{margin:36px 0 14px;font-size:22px}.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}
.card{text-decoration:none;display:flex;flex-direction:column;gap:6px}.card img,.card .semfoto{width:100%;aspect-ratio:1;object-fit:${V.ajusteFotos};border-radius:6px;background:#f3f4f6}
.semfoto{display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:13px}.nomep{font-size:14px}.preco b{color:${cor}}.de{text-decoration:line-through;color:#9ca3af;font-size:13px}
.confianca{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:32px}.confianca div{border:1px solid #e5e7eb;border-radius:6px;padding:12px;display:flex;flex-direction:column;gap:4px;font-size:13px}
.depos{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}blockquote{margin:0;border:1px solid #e5e7eb;border-radius:6px;padding:12px;font-size:14px}cite{display:block;margin-top:6px;color:#6b7280;font-style:normal;font-size:12px}
.sobre{line-height:1.6}details{border-bottom:1px solid #e5e7eb;padding:10px 0}summary{cursor:pointer;font-weight:600}
.pagina{display:none;padding:20px 0 40px}.pagina:target{display:block}.pagina:target~.home{display:none}.voltar{font-size:14px}
.pdp{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:14px}.principal{width:100%;aspect-ratio:1;object-fit:${V.ajusteFotos};border-radius:8px;background:#f3f4f6}
.miniaturas{display:flex;gap:8px;margin-top:8px}.miniaturas img{width:64px;height:64px;object-fit:${V.ajusteFotos};border-radius:4px}
.pdp h1{margin:0 0 8px;font-size:26px}.pdp .preco{font-size:22px;margin:0 0 16px}.var{margin:10px 0}.var>span{font-size:13px;color:#6b7280;display:block;margin-bottom:6px}
.chip{display:inline-block;border:1px solid #d1d5db;border-radius:4px;padding:6px 10px;margin:0 6px 6px 0;font-size:13px}
.comprar{width:100%;margin:16px 0;padding:14px;border:0;border-radius:6px;background:#9ca3af;color:#fff;font-weight:700;font-size:15px;cursor:not-allowed}
.desc{line-height:1.6;font-size:15px}footer{margin-top:48px;border-top:1px solid #e5e7eb;background:#f9fafb;padding:24px 0;font-size:13px}
footer .wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}footer .wrap div{display:flex;flex-direction:column;gap:6px}footer a{text-decoration:none}
.aviso{text-align:center;color:#6b7280;margin:18px 16px 0}.card img,.principal,.miniaturas img{background:#fff}.banner.com-img{background-size:cover;background-position:center;padding:90px 0}
.prints{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px}.prints a{flex:0 0 auto;scroll-snap-align:start}.prints img{height:min(380px,65vh);max-width:80vw;width:auto;object-fit:contain;border:1px solid #e5e7eb;border-radius:8px;background:#fff;display:block}.dica{font-size:12px;color:#6b7280}
.lightbox{display:none;position:fixed;inset:0;z-index:9;background:#000d;align-items:center;justify-content:center;padding:16px}.lightbox:target{display:flex}.lightbox img{max-width:100%;max-height:100%;object-fit:contain}.lightbox .fechar{position:absolute;top:8px;right:16px;color:#fff;font-size:36px;text-decoration:none}
.galeria-fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}.galeria-fotos img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px}.sobre-img{width:100%;max-height:360px;object-fit:cover;border-radius:8px;margin-bottom:12px}
@media(max-width:640px){.pdp{grid-template-columns:1fr}.banner{padding:36px 0}}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<base href="about:srcdoc"><title>${esc(d.nomeLoja)} — prévia</title><style>${css}</style></head><body>${cabecalho}${paginasProduto}${home}${rodape}${lightbox}</body></html>`;
}
