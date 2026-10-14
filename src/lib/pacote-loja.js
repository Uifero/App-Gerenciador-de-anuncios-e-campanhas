// Pacote Nuvemshop/Shopify: (1) o que colocar em cada lugar da plataforma, com o caminho de menu do manual de entrega,
// e (2) uma PRÉVIA com cara de loja (tema neutro) para o operador e para o link de aprovação.
// A prévia é só HTML + CSS, SEM NENHUM script (o <base href="about:srcdoc"> mantém as âncoras dentro do iframe; sem ele,
// "#produto-1" iria para o endereço do painel): não tem carrinho nem checkout funcionando, não carrega Pixel, Google Ads,
// Hotjar, Tawk.to nem qualquer rastreador, e é noindex/nofollow. A navegação (home <-> página do produto) é por âncora.
import { comTextosDoPacote } from './csv.js';
import { normalizarVisual, nomeSecaoLoja, AJUSTES_FOTO } from './visual-site.js';
import { produtosComFotos, imagemDoLugar, fotosDoUso, rotuloFoto, slidesDoBanner, arquivosPorPasta } from './fotos-site.js';
import { medidasDe, posicaoCss, textoMedida, nomeLugar } from './medidas-site.js';
import { carrosselHtml, carrosselCss } from './carrossel.js';
import { textoSobre, corLegivel } from './contraste.js';
import { plataformaDoSite, nomeTema } from './etapas-site.js';
import { depoimentosVivos } from './prova-social.js';
import { normalizarRecursos, SECOES_PRODUTO, textoSecaoProduto, sugeridoPara, reais } from './recursos-loja.js';
import { comDestaques } from './textos-site.js';
import { designDoSite, cssVariaveis, textoPar } from './design-site.js';
import { normalizarAnimacoes, prazoDaOferta, cssAnimacoes, classesBody, htmlContador, instrucoesTema } from './animacoes-site.js';

const txt = (v) => String(v ?? '').trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const moeda = (n) => (Number(n) > 0 ? `R$ ${Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}` : '');

export const LEGENDA_PREVIA_PACOTE = 'Prévia aproximada. O visual final depende do tema escolhido na Nuvemshop/Shopify; textos, fotos, preços e ordem das seções são os que vão para a loja.';
export const TEXTO_COMPRA_DESATIVADA = 'Prévia, compra desativada';
const NOME_PAG = { cartao: 'Cartão de crédito', pix: 'Pix', boleto: 'Boleto' };

/** Junta o que vai para a loja: textos do pacote, conteúdo/políticas do formulário, produtos reais (com SEO do pacote), logo e cores. */
/** `provas` = prints reais de clientes (lib/visual-site.js printsDoCliente), já na cópia borrada quando houver. */
/** `materiais` = Materiais do cliente com o "Usar em" de cada foto (lib/fotos-site.js): banner, fotos dos produtos, Sobre e Galeria. */
export function dadosDoPacote({ cliente = {}, site = {}, produtos = [], provas = [], materiais = [] }) {
  const p = site.pacote || {}, c = site.conteudo || {};
  const visual = normalizarVisual(p.visual);
  const banner = imagemDoLugar(materiais, 'banner', visual.banner); // escolha em "Usar em" > ajustes rápidos > texto
  // Carrossel: todas as fotos do banner em "Usar em" (ou a imagem única dos ajustes rápidos, nos sites de antes).
  visual.slides = slidesDoBanner(materiais, visual.banner);
  if (banner) visual.banner = banner;
  else if (visual.banner) { const m = materiais.find((x) => x.id === visual.banner.materialId); if (m?.codigo) visual.banner = { ...visual.banner, codigo: m.codigo }; }
  const plataforma = ['shopify', 'nuvemshop'].includes(plataformaDoSite(site)) ? plataformaDoSite(site) : null;
  // Sistema visual do cliente (lib/design-site.js): par de fontes escolhido, cor da marca como destaque e neutros.
  const design = designDoSite({ cliente, site });
  const cor = design.cores.acento;
  const paleta = [cor, design.cores.texto, design.cores.suave];
  const banners = (p.banners || []).filter((b) => txt(b?.titulo));
  return {
    visual,
    // Frete grátis, pagamento, colunas, botão, página do produto e "Compre junto" (plano do pedido, lib/plano-site.js).
    recursos: normalizarRecursos(p.recursos),
    sobreImagens: fotosDoUso(materiais, 'sobre'),
    galeria: fotosDoUso(materiais, 'galeria'),
    provas: (provas || []).filter((x) => x?.url),
    // Só a plataforma escolhida pelo operador (passo 3 / pergunta 18); sem escolha, null: nenhum caminho de menu é chutado.
    plataforma,
    tema: String(site.tema || '').trim(), nomeTema: nomeTema(site),
    // Tamanho de cada lugar (banner, produto, Clientes reais, Sobre, Galeria) na plataforma/tema escolhidos.
    medidas: medidasDe(plataforma, site.tema),
    nomeLoja: txt(cliente.nome) || 'Loja',
    logoUrl: cliente.logoArquivo?.url || '',
    cor, paleta, design,
    tipografia: textoPar(design.par),
    // Identificação da loja no rodapé (lib/legal-loja.js): só o que o operador preencheu, nunca inventado.
    dadosLoja: cliente.dadosLoja || {},
    // Animações do site (lib/animacoes-site.js): o contador só existe com prazo real na oferta ativa.
    prazo: prazoDaOferta(cliente),
    animacoes: normalizarAnimacoes(site.animacoes, { prazo: prazoDaOferta(cliente) }),
    banner: banners[0] || { titulo: txt(c.heroTitulo), subtitulo: txt(c.heroSubtitulo), cta: txt(c.heroCta) },
    banners,
    secoesHome: (p.briefingTema?.secoesHome || []).map(txt).filter(Boolean),
    sobre: txt(p.textosPagina?.sobre) || txt(c.storytelling),
    faq: (p.textosPagina?.faq || []).filter((f) => txt(f?.p) && txt(f?.r)),
    // Textos do operador escolhidos no plano (lib/textos-site.js): seção "Destaques" da home.
    destaques: (p.destaques || []).map((g) => ({ titulo: txt(g?.titulo) || 'Destaques', linhas: (g?.linhas || []).map((l) => txt(l?.texto)).filter(Boolean) })).filter((g) => g.linhas.length),
    politicas: { trocas: txt(c.politicas?.trocas), envio: txt(c.politicas?.envio), privacidade: txt(c.politicas?.privacidade) },
    // Lidos agora da fonte: provas em texto do perfil de marca, prints (cópia borrada) e escritos à mão (lib/prova-social.js).
    depoimentos: depoimentosVivos({ cliente, materiais, guardados: p.depoimentos?.length ? p.depoimentos : c.depoimentos || [], provasOcultas: c.provasOcultas || [] }).filter((d) => txt(d?.texto)),
    produtos: comTextosDoPacote(produtosComFotos(produtos, materiais), p).filter((x) => txt(x?.nome)).map((x) => ({
      id: x.id || '', nome: txt(x.nome), descricao: txt(x.descricao), formula: txt(x.formula), beneficios: txt(x.beneficios), modoUso: txt(x.modoUso), preco: Number(x.preco) || null, precoPromocional: Number(x.precoPromocional) || null,
      variacoes: (x.variacoes || []).filter((v) => v?.nome && v.valores?.length), fotos: (x.fotos || []).map((f) => f?.url).filter(Boolean),
      arquivos: (x.fotos || []).filter((f) => f?.url).map((f) => ({ url: f.url, nome: f.nome || 'foto', codigo: f.codigo || '', foco: f.foco || null })),
      seoTitulo: txt(x.seoTitulo), seoDescricao: txt(x.seoDescricao), categoria: txt(x.categoria),
    })),
  };
}

// Caminhos de menu: as mesmas instruções do manual de entrega (sites.js, manualPacote).
export const CONFIRA_TEMA = 'confira no editor do seu tema';
const CAMINHOS = {
  shopify: {
    loja: 'Na criação da conta da Shopify (nome da loja); depois, nas configurações da loja',
    logo: 'Loja virtual > Temas > Personalizar (cabeçalho do tema)',
    banner: 'Loja virtual > Temas: bloco de imagem/slideshow da home',
    cores: 'Loja virtual > Temas: aplique a paleta e a tipografia do briefing',
    produtos: 'Produtos > Importar (o CSV já leva estes textos); para conferir, abra o produto em Produtos',
    paginas: 'Crie as páginas Sobre e FAQ com os textos abaixo (manual, passo 3)',
    politicas: 'Configurações > Políticas',
    dados: 'Configurações > Detalhes da loja (nome empresarial, endereço e contato); o rodapé do tema mostra o que estiver lá',
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
    dados: 'Configurações > Informações de contato e dados da empresa (o nome do menu pode variar; confira no painel)',
    fotos: 'Design > Personalizar (lista de produtos / página de produto do tema)',
    fotosAjuda: { contain: 'Procure o formato das fotos e escolha a proporção original/sem corte. Se o tema não tiver essa opção, não há equivalente: envie as fotos já no formato quadrado com fundo branco.', cover: 'Procure o formato das fotos e escolha quadrado (preencher). É o padrão da maioria dos temas.' },
    secoes: 'Design > Personalizar: arraste as seções da página inicial nesta ordem; desative as que não entram',
    provas: 'Design > Personalizar: adicione um bloco de banners/imagens na página inicial (o nome varia com o tema) e suba os prints',
  },
};
// Onde o caminho muda entre os temas da Shopify. Só o que é certo; no resto, "confira no editor do seu tema".
const SHOPIFY_TEMA = {
  dawn: {
    banner: 'Loja virtual > Temas > Personalizar: na página inicial, seção "Banner de imagem" (ou "Apresentação de slides")',
    provas: 'Loja virtual > Temas > Personalizar > Adicionar seção: "Multicoluna" ou "Imagem com texto", e suba os prints',
  },
  horizon: {
    banner: `Loja virtual > Temas > Personalizar: na página inicial, a primeira seção de imagem grande (hero/slideshow; ${CONFIRA_TEMA})`,
    provas: `Loja virtual > Temas > Personalizar > Adicionar seção: uma seção de imagens/galeria (${CONFIRA_TEMA}), e suba os prints`,
  },
};
const SEM_PLATAFORMA = 'Escolha a plataforma no passo 3 ("Como quero") para ver onde colocar';
/** Caminhos de menu para a plataforma e o tema escolhidos. Sem plataforma escolhida, nenhum caminho (nem de outra). */
export function caminhosDe(plataforma, tema = '') {
  if (!CAMINHOS[plataforma]) return Object.fromEntries(Object.keys(CAMINHOS.shopify).map((k) => [k, k === 'fotosAjuda' ? { contain: SEM_PLATAFORMA, cover: SEM_PLATAFORMA } : SEM_PLATAFORMA]));
  if (plataforma !== 'shopify') return CAMINHOS[plataforma];
  const t = String(tema || '').toLowerCase();
  const extra = SHOPIFY_TEMA[t] || { banner: `${CAMINHOS.shopify.banner} (${CONFIRA_TEMA})`, provas: `${CAMINHOS.shopify.provas} (${CONFIRA_TEMA})` };
  return { ...CAMINHOS.shopify, ...extra, fotos: `${CAMINHOS.shopify.fotos} (${CONFIRA_TEMA})`, secoes: t === 'dawn' ? CAMINHOS.shopify.secoes : `${CAMINHOS.shopify.secoes} (${CONFIRA_TEMA})` };
}

const variacoesTexto = (vs = []) => vs.map((v) => `${v.nome}: ${v.valores.join(', ')}`).join(' · ');
/** "1. F5 — frente.jpg (principal)" / "2. foto da aba Produtos — x.jpg": código + nome original de cada arquivo, um por linha. */
const listaArquivosOriginais = (lista = [], produto = false) => lista.filter((x) => x?.url).map((x, i) => `${i + 1}. ${x.codigo ? `${x.codigo} — ` : produto ? 'foto da aba Produtos — ' : ''}${x.nome || 'imagem'}${produto && i === 0 ? ' (principal)' : ''}`).join('\n');

/**
 * "O que colocar na plataforma": [{ id, titulo, caminho, itens: [{ rotulo, valor, tipo? }] }]. Item vazio fica de fora;
 * grupo sem nenhum item também (nada de campo em branco para copiar).
 */
export function gruposPlataforma(d) {
  const cam = caminhosDe(d.plataforma, d.tema);
  const item = (rotulo, valor, tipo) => (txt(valor) ? { rotulo, valor: txt(valor), ...(tipo ? { tipo } : {}) } : null);
  const g = (id, titulo, caminho, itens) => ({ id, titulo, caminho, itens: itens.filter(Boolean) });
  // Arquivos já recortados do .zip "Imagens por lugar" (lib/medidas-site.js): qual arquivo vai em cada posição.
  const plano = arquivosPorPasta(d), med = d.medidas || medidasDe(d.plataforma, d.tema);
  const animTema = instrucoesTema(d.animacoes, d.plataforma, d.tema); // [Onde, ...efeitos, Atenção]
  const deFoto = (f) => `${f.codigo ? `${f.codigo} — ` : ''}${f.nome || 'imagem'}`;
  const listaArquivos = (lugar, pasta, lista = [], produto = false) => {
    const arqs = plano.filter((a) => a.lugar === lugar && (!pasta || a.caminho.startsWith(`${pasta}/`)));
    if (!arqs.length) return listaArquivosOriginais(lista, produto);
    return arqs.map((a) => `${a.posicao}. ${a.caminho}${a.dispositivo === 'mobile' ? ' (celular)' : ''} ← ${a.fotos.map(deFoto).join(' + ')}${produto && a.posicao === 1 ? ' (principal)' : ''}`).join('\n');
  };
  const tamanho = (lugar) => `${nomeLugar(lugar)}: ${textoMedida(med[lugar].desktop)}${med[lugar].mobile ? ` no computador e ${textoMedida(med[lugar].mobile)} no celular` : ''}. Medida: ${med[lugar].fonte}.${med[lugar].nota ? ` ${med[lugar].nota}` : ''}`;
  const pastaProduto = (i) => plano.find((a) => a.lugar === 'produto' && a.produto === i)?.caminho.split('/').slice(0, 2).join('/');
  const slides = (d.visual.slides || []).map((sl, i) => {
    const arqs = plano.filter((a) => a.lugar === 'banner' && a.posicao === i + 1);
    return item(`Slide ${i + 1}${sl.fotos.length > 1 ? ` (${sl.fotos.length} fotos juntas, lado a lado)` : ''}`, [...arqs.map((a) => `${a.dispositivo === 'mobile' ? 'Celular' : 'Computador'}: ${a.caminho} (${a.l}×${a.a})`), `Fotos: ${sl.fotos.map(deFoto).join(' + ')}`].join('\n'));
  });
  const grupos = [
    g('loja', 'Nome da loja', cam.loja, [item('Nome da loja', d.nomeLoja)]),
    g('logo', 'Logo', cam.logo, [d.logoUrl ? item('Arquivo do logo (baixe em "Baixar pacote")', d.logoUrl, 'imagem') : item('Logo', 'Sem logo salvo: envie no passo 2 de "Montar site".')]),
    g('banner', 'Banner', cam.banner, (d.banners.length ? d.banners : [d.banner]).flatMap((b, i) => [
      item(`${b.uso || `Banner ${i + 1}`}: título`, b.titulo), item(`${b.uso || `Banner ${i + 1}`}: subtítulo`, b.subtitulo), item(`${b.uso || `Banner ${i + 1}`}: botão`, b.cta)])),
    g('home', 'Textos da home', cam.cores, [item('Ordem das seções da home', d.secoesHome.join(' > ')), item('Texto "Sobre a marca" (bloco de texto da home)', d.sobre)]),
    g('destaques', 'Seção de destaques (seus textos escolhidos no plano)', cam.secoes, (d.destaques || []).flatMap((x) => [item('Título da seção', x.titulo), item('Textos, nesta ordem (um por linha; no tema use um bloco de texto ou lista)', x.linhas.join('\n'))])),
    ...d.produtos.map((x, i) => g(`produto-${i}`, `Produto: ${x.nome}`, cam.produtos, [
      item('Título', x.nome), item('Descrição', x.descricao), item('Preço', moeda(x.preco)), item('Preço promocional', moeda(x.precoPromocional)),
      item('Variações', variacoesTexto(x.variacoes)), item('Título para SEO', x.seoTitulo), item('Descrição para SEO', x.seoDescricao),
      item('Fotos, nesta ordem (arquivos já no tamanho, do .zip "Imagens por lugar")', listaArquivos('produto', pastaProduto(i), x.arquivos, true)),
      x.arquivos.length ? item('Tamanho das fotos', tamanho('produto')) : null])),
    g('paginas', 'Páginas institucionais', cam.paginas, [item('Página "Sobre"', d.sobre), item('Página "Perguntas frequentes"', d.faq.map((f) => `${f.p}\n${f.r}`).join('\n\n'))]),
    g('politicas', 'Políticas', cam.politicas, [item('Trocas e devoluções', d.politicas.trocas), item('Envio', d.politicas.envio), item('Privacidade', d.politicas.privacidade)]),
    g('dados-loja', 'Identificação da loja (rodapé)', cam.dados, [item('Nome empresarial', d.dadosLoja?.razaoSocial), item('CNPJ', d.dadosLoja?.cnpj), item('Endereço', d.dadosLoja?.endereco), item('E-mail', d.dadosLoja?.email), item('Telefone / WhatsApp', d.dadosLoja?.telefone)]),
    g('animacoes', 'Animações (como na prévia, pelo tema)', animTema[0]?.valor || '', animTema.slice(1).map((x) => item(x.rotulo, x.valor))),
    g('cores', 'Cores e tipografia', cam.cores, [item('Paleta (cor principal primeiro)', d.paleta.join(', ') || d.cor), item('Tipografia', d.tipografia)]),
    // Escolhas feitas na prévia (painel "Site gerado" / "Ajustar este site"): o que fazer no tema para a loja ficar igual.
    g('visual-banner', (d.visual.slides || []).length > 1 ? `Imagens do banner: carrossel com ${d.visual.slides.length} slides, nesta ordem` : 'Imagem do banner (escolhida na prévia)', cam.banner, (d.visual.slides || []).length
      ? [item('Imagem do 1º slide', d.visual.slides[0].fotos[0]?.url, 'imagem'), ...slides, item('Tamanhos', tamanho('banner')),
        d.visual.slides.length > 1 ? item('No tema', 'Use a seção de slideshow/carrossel e crie um slide para cada arquivo acima, na mesma ordem (pasta banner/ do .zip "Imagens por lugar").') : null]
      : d.visual.banner ? [item('Imagem para subir no banner (baixe em "Baixar pacote")', d.visual.banner.url, 'imagem'), item('Arquivo (pasta banner/ do .zip "Imagens por lugar")', rotuloFoto(d.visual.banner))] : []),
    g('visual-fotos', 'Fotos dos produtos (como aparecem)', cam.fotos, [item('Escolha na prévia', `${AJUSTES_FOTO[d.visual.ajusteFotos]}: ${d.visual.ajusteFotos === 'contain' ? 'a foto aparece inteira, sem cortar' : 'a foto preenche o quadro (as bordas podem ser cortadas)'}`),
      item('No tema', cam.fotosAjuda[d.visual.ajusteFotos])]),
    g('visual-secoes', 'Ordem das seções da home (como aprovado na prévia)', cam.secoes, [item('Ordem', d.visual.ordem.filter((k) => !d.visual.ocultas.includes(k)).map(nomeSecaoLoja).join(' > ')), item('Não colocar na home', d.visual.ocultas.map(nomeSecaoLoja).join(', '))]),
    g('provas', 'Clientes reais (prints)', cam.provas, d.provas.length ? [item('Prints para subir', `${d.provas.length} imagem(ns): baixe em "Baixar pacote" (Prints de clientes ou pasta clientes-reais/ do .zip "Imagens por lugar"). São as cópias com dados pessoais borrados quando você borrou.`), item('Arquivos, nesta ordem', listaArquivos('clientes', 'clientes-reais', d.provas)), item('Tamanho', tamanho('clientes')), item('Onde na home', `${d.visual.ocultas.includes('provas') ? 'Oculta na prévia: não colocar.' : `Posição ${d.visual.ordem.filter((k) => !d.visual.ocultas.includes(k)).indexOf('provas') + 1} da home (como na prévia).`}`)] : []),
    g('fotos-sobre', 'Imagem do "Sobre a marca"', cam.paginas, [item('Arquivos (pasta sobre/ do .zip "Imagens por lugar")', listaArquivos('sobre', 'sobre', d.sobreImagens)), (d.sobreImagens || []).length ? item('Tamanho', tamanho('sobre')) : null]),
    g('fotos-galeria', 'Galeria de fotos', cam.provas, [item('Arquivos (pasta galeria/ do .zip "Imagens por lugar")', listaArquivos('galeria', 'galeria', d.galeria)), (d.galeria || []).length ? item('Tamanho', tamanho('galeria')) : null]),
  ];
  return grupos.filter((x) => x.itens.length);
}

/** Rodapé com a identificação da loja (dados reais de cliente.dadosLoja; o que não foi preenchido não aparece). */
export function linhasDadosLoja(dl = {}) {
  return [txt(dl.razaoSocial), txt(dl.cnpj) && `CNPJ ${txt(dl.cnpj)}`, txt(dl.endereco), txt(dl.email), txt(dl.telefone)].filter(Boolean);
}

/**
 * HTML completo da prévia (documento próprio, para o iframe isolado). Sem script nenhum. O visual vem do sistema do
 * cliente (lib/design-site.js): par de fontes, cor da marca só como destaque, neutros, espaço e arredondamento próprios.
 * Celular primeiro: banner com a foto real do produto, título curto à esquerda e, na página do produto, uma barra fixa
 * com preço e botão (sempre visível sem rolar).
 */
export function gerarPreviaLojaHTML(d) {
  const D = d.design || designDoSite({});
  const C = D.cores, cor = C.acento, sobreCor = C.sobreAcento, corTexto = C.acentoTexto;
  const preco = (x) => (x.precoPromocional && x.preco && x.precoPromocional < x.preco
    ? `<span class="de">${esc(moeda(x.preco))}</span> <b>${esc(moeda(x.precoPromocional))}</b>` : x.preco || x.precoPromocional ? `<b>${esc(moeda(x.preco || x.precoPromocional))}</b>` : '<b>Sob consulta</b>');
  // Recorte pelo ponto focal da foto (só quando preenche o quadro; "Mostrar inteiras" não corta nada).
  const pos = (f) => (f?.foco && d.visual.ajusteFotos !== 'contain' ? ` style="object-position:${posicaoCss(f.foco)}"` : '');
  const foto = (x, cls = '') => (x.fotos[0] ? `<img src="${esc(x.fotos[0])}" alt="${esc(x.nome)}"${cls ? ` class="${cls}"` : ''} width="800" height="800"${pos(x.arquivos?.[0])}>` : `<div class="semfoto ${cls}">sem foto</div>`);
  const marca = d.logoUrl ? `<img src="${esc(d.logoUrl)}" alt="${esc(d.nomeLoja)}" class="logo">` : `<span class="nome">${esc(d.nomeLoja)}</span>`;
  const cabecalho = `${d.recursos?.freteGratis ? `<div class="barra-frete" data-barra-frete>Frete grátis acima de ${esc(reais(d.recursos.freteGratis.valor))}</div>` : ''}<header><div class="wrap"><input type="checkbox" id="menu-loja" class="menu-toggle"><label for="menu-loja" class="hamb" title="Menu" aria-label="Abrir o menu"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></label><a href="#inicio" class="marca">${marca}</a><nav><a href="#inicio">Início</a><a href="#produtos">Produtos</a>${d.sobre ? '<a href="#sobre">Sobre</a>' : ''}${d.faq.length ? '<a href="#faq">Dúvidas</a>' : ''}</nav><span class="sacola" title="${esc(TEXTO_COMPRA_DESATIVADA)}"><span class="txt-sacola">Carrinho (0)</span><svg class="ic-sacola" viewBox="0 0 24 24" width="24" height="24" aria-label="Carrinho (0)"><path d="M6 8h12l-1 12H7L6 8zm3 0a3 3 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><b class="qtd-sacola" aria-hidden="true">0</b></span></div></header>`;
  const ident = linhasDadosLoja(d.dadosLoja);
  const rodape = `<footer><div class="wrap"><div>${marca}${ident.length ? `<p class="ident" data-dados-loja>${ident.map(esc).join('<br>')}</p>` : ''}</div><div><b>Institucional</b>${d.sobre ? '<a href="#sobre">Sobre</a>' : ''}${d.faq.length ? '<a href="#faq">Perguntas frequentes</a>' : ''}${d.politicas.trocas ? '<span>Trocas e devoluções</span>' : ''}${d.politicas.envio ? '<span>Envio</span>' : ''}${d.politicas.privacidade ? '<span>Privacidade</span>' : ''}</div><div><b>Compra segura</b><span>Pagamento e frete configurados na plataforma</span>${d.recursos?.pagamentos?.length ? `<span class="pags" data-pagamentos-rodape>${d.recursos.pagamentos.map((k) => `<span>${esc(NOME_PAG[k] || k)}</span>`).join('')}</span>` : ''}</div></div><p class="aviso">${esc(LEGENDA_PREVIA_PACOTE)}</p></footer>`;
  const R = d.recursos || normalizarRecursos();
  const contador = d.animacoes?.contador ? htmlContador(d.prazo) : ''; // só com prazo real (lib/animacoes-site.js)
  const pags = R.pagamentos.length ? `<div class="pags" data-pagamentos>${R.pagamentos.map((k) => `<span>${esc(NOME_PAG[k] || k)}</span>`).join('')}</div>` : '';
  const avisoFrete = R.freteGratis ? `Frete grátis acima de ${esc(reais(R.freteGratis.valor))}` : '';
  const trocaCurta = d.politicas.trocas ? 'Troca e devolução conforme a política da loja' : '';
  // Página do produto: com o plano pedindo, TODAS as fotos; sem, as 5 primeiras (como antes).
  const miniaturas = (x) => (R.paginaProduto ? x.fotos.slice(1) : x.fotos.slice(1, 5));
  const secoesProduto = (x) => R.secoesProduto.map((k) => (textoSecaoProduto(x, k) ? `<details class="secao-prod" open data-secao-produto="${k}"><summary>${esc(SECOES_PRODUTO[k])}</summary><p>${esc(textoSecaoProduto(x, k)).replace(/\n/g, '<br>')}</p></details>` : '')).join('');
  const compreJunto = (x, i) => {
    if (!R.compreJunto || d.produtos.length < 2) return '';
    const s = sugeridoPara(x.id || String(i), d.produtos.map((p, k) => ({ ...p, id: p.id || String(k) })), R); if (!s) return '';
    const k = d.produtos.findIndex((p) => (p.id || '') === (s.id || '') && p.nome === s.nome);
    return `<div class="junto" data-compre-junto><p class="junto-t">Compre junto${R.compreJunto.onde === 'carrinho' ? ' <small>(na loja: sugestão no carrinho)</small>' : ''}</p>
      <a href="#produto-${k}" class="junto-item">${s.fotos[0] ? `<img src="${esc(s.fotos[0])}" alt="" width="72" height="72" loading="lazy">` : ''}<span>+ ${esc(s.nome)}<br><b>${esc(moeda(s.precoPromocional || s.preco) || 'Sob consulta')}</b></span></a></div>`;
  };
  const paginasProduto = d.produtos.map((x, i) => `<section id="produto-${i}" class="pagina"><div class="wrap"><a href="#produtos" class="voltar">&larr; Voltar aos produtos</a>
    <div class="pdp"><div class="galeria">${foto(x, 'principal')}${x.fotos.length > 1 ? `<div class="miniaturas">${miniaturas(x).map((u, k) => `<img src="${esc(u)}" alt="" width="64" height="64" loading="lazy"${pos(x.arquivos?.[k + 1])}>`).join('')}</div>` : ''}</div>
    <div class="pdp-info"><h1>${esc(x.nome)}</h1><p class="preco">${preco(x)}</p>${contador}
      ${x.variacoes.map((v) => `<div class="var"><span>${esc(v.nome)}</span><div>${v.valores.map((val) => `<span class="chip">${esc(val)}</span>`).join('')}</div></div>`).join('')}
      <button type="button" class="comprar${R.botaoGrande ? ' grande' : ''}" disabled data-compra-desativada>${esc(TEXTO_COMPRA_DESATIVADA)}</button>${avisoFrete || trocaCurta ? `<p class="frete-pdp" data-frete-pdp>${[avisoFrete, trocaCurta].filter(Boolean).join(' · ')}</p>` : ''}${pags}
      ${x.descricao ? `<div class="desc">${esc(x.descricao).replace(/\n/g, '<br>')}</div>` : ''}${secoesProduto(x)}${compreJunto(x, i)}</div></div></div>
    <div class="barra-compra" data-barra-compra aria-hidden="true"><span class="bc-preco">${preco(x)}</span><span class="bc-botao">${esc(TEXTO_COMPRA_DESATIVADA)}</span></div></section>`).join('');
  const grade = d.produtos.length ? d.produtos.map((x, i) => `<a class="card" href="#produto-${i}">${foto(x)}<span class="nomep">${esc(x.nome)}</span><span class="preco">${preco(x)}</span>${R.botaoGrande ? '<span class="comprar grande card-btn">Comprar</span>' : ''}</a>`).join('') : '<p>Nenhum produto cadastrado.</p>';
  const V = d.visual;
  const med = d.medidas || medidasDe(d.plataforma, d.tema);
  const slides = V.slides || [];
  const textoBanner = `<h1>${esc(d.banner.titulo || d.nomeLoja)}</h1>${d.banner.subtitulo ? `<p>${esc(d.banner.subtitulo)}</p>` : ''}${contador}${d.banner.cta ? `<a href="#produtos" class="cta">${esc(d.banner.cta)}</a>` : ''}`;
  // Sem foto escolhida para o banner: a foto real do primeiro produto que tiver foto (nunca um fundo de gradiente).
  const iHero = d.produtos.findIndex((x) => x.fotos[0]);
  const lightbox = d.provas.map((p, i) => `<div id="print-${i}" class="lightbox"><a href="#clientes-reais" class="fechar" aria-label="Fechar">×</a><img src="${esc(p.url)}" alt="Print de cliente real"></div>`).join('');
  const [dep1, ...depResto] = d.depoimentos.slice(0, 6);
  const secao = {
    // Banner com fotos: carrossel (uma foto = imagem fixa) no tamanho do banner da plataforma, recortado pelo ponto focal.
    banner: () => (slides.length ? `<div class="banner com-carrossel">${carrosselHtml({ slides, medida: med.banner, conteudo: textoBanner, id: 'bn', alt: d.nomeLoja })}</div>`
      : iHero >= 0 ? `<div class="banner com-foto" data-banner-produto><div class="wrap"><div class="hero-txt">${textoBanner}</div><a class="hero-img" href="#produto-${iHero}">${foto(d.produtos[iHero])}</a></div></div>`
      : `<div class="banner"><div class="wrap">${textoBanner}</div></div>`),
    provas: () => (d.provas.length ? `<div class="sec"><div class="wrap"><h2 id="clientes-reais">Clientes reais</h2><div class="prints">${d.provas.map((p, i) => `<a href="#print-${i}" title="Toque para ampliar"><img src="${esc(p.url)}" alt="${p.foto ? 'Foto de cliente real' : 'Print de cliente real'}" loading="lazy" class="${p.foto ? 'foto-cliente' : 'print'}"${p.foto && p.foco ? ` style="object-position:${posicaoCss(p.foco)}"` : ''}></a>`).join('')}</div><p class="dica">Toque no print para ampliar.</p></div></div>` : ''),
    destaques: () => ((d.destaques || []).length ? d.destaques.map((x) => `<div class="sec" data-destaques><div class="wrap"><h2>${esc(x.titulo)}</h2><ol class="destaques">${x.linhas.map((l) => `<li>${esc(l)}</li>`).join('')}</ol></div></div>`).join('') : ''),
    produtos: () => `<div class="sec"><div class="wrap"><h2 id="produtos">Produtos</h2><div class="grade">${grade}</div></div></div>`,
    confianca: () => `<div class="faixa"><div class="wrap confianca"><p><b>Compra segura</b> pagamento pela plataforma</p><p><b>Entrega</b> ${esc(d.politicas.envio ? d.politicas.envio.slice(0, 90) : 'frete calculado no carrinho')}</p><p><b>Trocas</b> ${esc(d.politicas.trocas ? d.politicas.trocas.slice(0, 90) : 'política de trocas da loja')}</p></div></div>`,
    depoimentos: () => (dep1 ? `<div class="sec suave"><div class="wrap"><h2>Quem já comprou</h2><blockquote class="dep-destaque">“${esc(dep1.texto)}”<cite>${esc(dep1.nome || 'Cliente')}</cite></blockquote>${depResto.length ? `<div class="depos">${depResto.map((x) => `<blockquote>“${esc(x.texto)}”<cite>${esc(x.nome || 'Cliente')}</cite></blockquote>`).join('')}</div>` : ''}</div></div>` : ''),
    galeria: () => ((d.galeria || []).length ? `<div class="sec"><div class="wrap"><h2 id="galeria">Galeria</h2><div class="galeria-fotos">${d.galeria.map((f) => `<img src="${esc(f.url)}" alt="" loading="lazy" style="object-position:${posicaoCss(f.foco)}">`).join('')}</div></div></div>` : ''),
    sobre: () => (d.sobre ? `<div class="sec suave"><div class="wrap${(d.sobreImagens || [])[0] ? ' sobre-grid' : ''}">${(d.sobreImagens || [])[0] ? `<img class="sobre-img" src="${esc(d.sobreImagens[0].url)}" alt="" loading="lazy" style="object-position:${posicaoCss(d.sobreImagens[0].foco)}">` : ''}<div><h2 id="sobre">Sobre a marca</h2><p class="sobre">${esc(d.sobre).replace(/\n/g, '<br>')}</p></div></div></div>` : ''),
    faq: () => (d.faq.length ? `<div class="sec"><div class="wrap estreito"><h2 id="faq">Perguntas frequentes</h2>${d.faq.map((f) => `<details><summary>${esc(f.p)}</summary><p>${esc(f.r)}</p></details>`).join('')}</div></div>` : ''),
  };
  const home = `<section id="inicio" class="home">${comDestaques(V.ordem.filter((k) => !V.ocultas.includes(k)), 'banner').map((k) => secao[k]()).join('')}</section>`;
  // Página de produto: aparece pelo :target; a home some enquanto um produto está aberto.
  const pr = (m, cel = false) => { const x = cel ? m.mobile || m.desktop : m.desktop; return `${x.l}/${x.a}`; };
  const prodR = pr(med.produto || { desktop: { l: 1, a: 1 } });
  const ajuste = V.ajusteFotos;
  const css = `${cssVariaveis(D)}
*{box-sizing:border-box}body{margin:0;font-family:var(--f-texto);font-size:16px;line-height:1.55;color:${C.texto};background:${C.fundo};-webkit-font-smoothing:antialiased}
a{color:inherit}.wrap{max-width:1120px;margin:0 auto;padding:0 20px}img{max-width:100%}
h1,h2,.nome,blockquote.dep-destaque{font-family:var(--f-titulo);font-weight:var(--peso-titulo);letter-spacing:-.01em;text-wrap:balance}
header{border-bottom:1px solid ${C.borda};position:sticky;top:0;background:${C.fundo};z-index:2}header .wrap{display:flex;align-items:center;gap:20px;min-height:68px;flex-wrap:wrap}
.marca{text-decoration:none;display:flex;align-items:center}.logo{max-height:44px;max-width:160px;display:block}.nome{font-size:22px}
nav{display:flex;gap:22px;flex:1;flex-wrap:wrap}nav a{text-decoration:none;font-size:15px}nav a:hover{color:${corTexto}}.sacola{font-size:14px;border:1px solid ${C.borda};border-radius:var(--raio);padding:7px 12px;color:${C.texto}}
.menu-toggle,.hamb,.ic-sacola,.qtd-sacola{display:none}
.banner{background:${C.suave};color:${C.texto};padding:var(--secao) 0}.banner h1{margin:0 0 12px;font-size:clamp(32px,8.5vw,var(--h1));line-height:1.05;max-width:16ch}.banner p{margin:0 0 24px;font-size:18px;max-width:46ch}
.com-foto{padding:0}.com-foto .wrap{display:grid;grid-template-columns:1fr 1.1fr;gap:var(--gap);align-items:center;padding-top:40px;padding-bottom:40px}.hero-img img,.hero-img .semfoto{width:100%;height:auto;aspect-ratio:${prodR};object-fit:${ajuste};border-radius:var(--raio-g);background:${C.fundo};display:block}
.cta{display:inline-flex;align-items:center;min-height:48px;background:${cor};color:${sobreCor};padding:12px 26px;border-radius:var(--raio);font-weight:600;text-decoration:none}
.sec{padding:var(--secao) 0}.sec.suave{background:${C.suave}}h2{margin:0 0 24px;font-size:clamp(26px,6.5vw,var(--h2));line-height:1.12}
.destaques{margin:0;padding-left:1.4em;display:grid;gap:14px;font-size:18px;line-height:1.5;max-width:720px}.destaques li::marker{color:${corTexto};font-weight:700}
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--gap)}
.card{text-decoration:none;display:flex;flex-direction:column;gap:6px}
.barra-frete{background:${cor};color:${sobreCor};text-align:center;font-size:14px;font-weight:600;padding:9px 12px}.frete-pdp{margin:0 0 14px;font-size:14px;color:${C.texto}}
.pags{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 14px}.pags span{border:1px solid ${C.borda};border-radius:var(--raio);padding:3px 8px;font-size:12px;color:${C.texto};background:${C.fundo}}
.comprar.grande{font-size:19px;padding:20px}.card-btn{display:block;text-align:center;background:${cor};color:${sobreCor};margin:6px 0 0;cursor:default;border-radius:var(--raio)}
.secao-prod{margin-top:12px;border-top:1px solid ${C.borda};padding:12px 0}.secao-prod p{margin:8px 0 0;line-height:1.6;font-size:15px}
.junto{margin-top:20px;border:1px solid ${C.borda};border-radius:var(--raio);padding:14px}.junto-t{margin:0 0 8px;font-weight:700}.junto-item{display:flex;gap:12px;align-items:center;text-decoration:none}.junto-item img{width:72px;height:72px;object-fit:cover;border-radius:var(--raio)}
${d.recursos?.colunasProdutos ? `.grade{grid-template-columns:repeat(${d.recursos.colunasProdutos},1fr)}@media(max-width:640px){.grade{grid-template-columns:repeat(${Math.min(2, d.recursos.colunasProdutos)},1fr)}}` : ''}.card img,.card .semfoto{width:100%;height:auto;aspect-ratio:${prodR};object-fit:${ajuste};border-radius:var(--raio);background:${C.suave}}
.semfoto{display:flex;align-items:center;justify-content:center;color:${C.apagado};font-size:13px}.nomep{font-size:15px;margin-top:4px}.preco b{color:${C.texto}}.de{text-decoration:line-through;color:${C.apagado};font-size:14px}
.faixa{border-top:1px solid ${C.borda};border-bottom:1px solid ${C.borda}}.confianca{display:flex;flex-wrap:wrap;gap:8px 40px;padding-top:18px;padding-bottom:18px}.confianca p{margin:0;font-size:14px;color:${C.apagado}}.confianca b{color:${C.texto};margin-right:6px}
.dep-destaque{margin:0 0 28px;font-size:clamp(22px,5.5vw,var(--h3));line-height:1.35;max-width:30ch;border:0;padding:0}.dep-destaque cite{font-family:var(--f-texto);font-size:14px}
.depos{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:var(--gap)}blockquote{margin:0;border-top:2px solid ${cor};padding:14px 0 0;font-size:15px}cite{display:block;margin-top:8px;color:${C.apagado};font-style:normal;font-size:13px}
.sobre{line-height:1.7;max-width:62ch;margin:0}.sobre-grid{display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--gap) * 2);align-items:center}.estreito{max-width:760px}
details{border-bottom:1px solid ${C.borda};padding:14px 0}summary{cursor:pointer;font-weight:600;min-height:24px}details p{margin:10px 0 0;color:${C.texto}}
.pagina{display:none;padding:20px 0 40px}.pagina:target{display:block}.pagina:target~.home{display:none}.voltar{font-size:14px;display:inline-block;padding:12px 0}
.pdp{display:grid;grid-template-columns:1.1fr 1fr;gap:calc(var(--gap) * 1.5);margin-top:8px}.principal{width:100%;height:auto;aspect-ratio:${prodR};object-fit:${ajuste};border-radius:var(--raio-g);background:${C.suave}}
.miniaturas{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.miniaturas img{width:64px;height:64px;object-fit:${ajuste};border-radius:var(--raio)}
.pdp h1{margin:0 0 8px;font-size:clamp(26px,6vw,var(--h2));line-height:1.1}.pdp .preco{font-size:22px;margin:0 0 16px}.var{margin:10px 0}.var>span{font-size:13px;color:${C.apagado};display:block;margin-bottom:6px}
.chip{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border:1px solid ${C.borda};border-radius:var(--raio);padding:6px 10px;margin:0 6px 6px 0;font-size:14px}
.comprar{width:100%;margin:16px 0 10px;min-height:52px;padding:14px;border:0;border-radius:var(--raio);background:${cor};color:${sobreCor};opacity:.7;font-family:inherit;font-weight:700;font-size:16px;cursor:not-allowed}
.barra-compra{display:none}
.desc{line-height:1.65;font-size:16px;max-width:62ch}footer{margin-top:0;border-top:1px solid ${C.borda};background:${C.suave};padding:36px 0 24px;font-size:14px}
footer .wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px}footer .wrap div{display:flex;flex-direction:column;gap:8px}footer a{text-decoration:none}.ident{margin:6px 0 0;color:${C.apagado};font-size:13px;line-height:1.6}
.aviso{text-align:center;color:${C.apagado};margin:24px 16px 0;font-size:13px}.card img,.principal,.miniaturas img{background:${C.fundo}}
.prints{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px}.prints a{flex:0 0 auto;scroll-snap-align:start}.prints img{height:min(380px,65vh);aspect-ratio:${pr(med.clientes)};width:auto;max-width:80vw;object-fit:contain;border:1px solid ${C.borda};border-radius:var(--raio);background:${C.fundo};display:block}.prints img.foto-cliente{object-fit:cover}.dica{font-size:13px;color:${C.apagado}}
.lightbox{display:none;position:fixed;inset:0;z-index:9;background:#000d;align-items:center;justify-content:center;padding:16px}.lightbox:target{display:flex}.lightbox img{max-width:100%;max-height:100%;object-fit:contain}.lightbox .fechar{position:absolute;top:8px;right:16px;color:#fff;font-size:36px;text-decoration:none}
.galeria-fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}.galeria-fotos img{width:100%;aspect-ratio:${pr(med.galeria)};object-fit:cover;border-radius:var(--raio)}.sobre-img{width:100%;aspect-ratio:${pr(med.sobre)};object-fit:cover;border-radius:var(--raio-g)}
.banner.com-carrossel{padding:0;background:#111}.car-texto h1{margin:0 0 8px;font-size:clamp(28px,6vw,var(--h1));color:#fff;max-width:18ch}.car-texto p{margin:0 0 18px;color:#fff}
a:focus-visible,summary:focus-visible,label:focus-visible{outline:2px solid ${corTexto};outline-offset:2px}
${slides.length ? carrosselCss({ n: slides.length, id: 'bn' }) : ''}
${cssAnimacoes(d.animacoes, { acento: cor })}
@media(max-width:640px){header .wrap{flex-wrap:wrap;gap:8px;min-height:56px;padding:0 16px}.hamb{display:flex;align-items:center;justify-content:center;width:44px;height:44px;margin-left:-10px;cursor:pointer;color:${C.texto}}
.marca{flex:1;min-width:0}.nome{font-size:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.logo{max-height:36px}
nav{display:none;order:3;flex-basis:100%;flex-direction:column;gap:0;padding-bottom:6px}.menu-toggle:checked~nav{display:flex}nav a{padding:12px 2px;border-top:1px solid ${C.borda};font-size:16px}
.sacola{position:relative;border:0;padding:10px;color:${C.texto};display:flex}.txt-sacola{display:none}.ic-sacola{display:block}.qtd-sacola{display:flex;position:absolute;top:2px;right:2px;min-width:16px;height:16px;border-radius:999px;background:${cor};color:${sobreCor};font-size:10px;align-items:center;justify-content:center}
.wrap{padding:0 16px}.sec,.banner{padding:var(--secao-cel) 0}.banner.com-carrossel,.com-foto{padding:0}.com-foto .wrap{grid-template-columns:1fr;padding-top:16px;padding-bottom:32px;gap:20px}.hero-img{order:-1}.hero-img img,.hero-img .semfoto{aspect-ratio:4/3}
.pdp{grid-template-columns:1fr;gap:16px}.sobre-grid{grid-template-columns:1fr;gap:20px}.sobre-img{aspect-ratio:${pr(med.sobre, true)}}.grade{grid-template-columns:repeat(2,1fr);gap:14px}
.pagina{padding-bottom:88px}.barra-compra{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:5;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:${C.fundo};border-top:1px solid ${C.borda}}
.bc-preco{font-size:16px}.bc-botao{flex:1;max-width:60%;min-height:48px;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:var(--raio);background:${cor};color:${sobreCor};opacity:.7;font-weight:700;font-size:14px;padding:0 10px}
.pagina:not(:target) .barra-compra{display:none}}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<base href="about:srcdoc"><title>${esc(d.nomeLoja)} — prévia</title><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${esc(D.fontesUrl)}"><style>${css}</style></head><body${d.animacoes && classesBody(d.animacoes) ? ` class="${classesBody(d.animacoes)}"` : ''}>${cabecalho}${paginasProduto}${home}${rodape}${lightbox}</body></html>`;
}
