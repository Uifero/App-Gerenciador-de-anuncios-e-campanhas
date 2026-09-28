// Rastreamento do site do cliente: Pixel do Meta e tag do Google Ads (quem comprou), Hotjar (como as pessoas navegam)
// e Tawk.to (chat ao vivo). Todos só carregam depois do aceite no aviso de cookies do site.
// O app NÃO envia dado de pixel a lugar nenhum: só guarda os IDs no cliente e escreve o código padrão de cada
// plataforma no HTML do site "custom" (quem recebe as visitas/eventos são o Meta e o Google, direto do navegador de
// quem visita o site). No modo pacote (Nuvemshop/Shopify) o código não é inserido: a plataforma tem campo próprio,
// e o manual de handoff traz os IDs prontos para colar. Sem ID nenhum, nada disso aparece.
import { esc } from '../core/ui.js';

/**
 * Hotjar: aceita o número do site (ex.: 3456789) ou o código colado inteiro ("hjid:3456789").
 * Tawk.to: aceita o Property ID e o Widget ID separados, ou o link/código colado inteiro no 1º campo
 * ("https://embed.tawk.to/<property>/<widget>") — os dois são tirados de lá.
 */
export function normalizarExtras({ hotjarId = '', tawkPropertyId = '', tawkWidgetId = '' } = {}) {
  const erros = [];
  const hjBruto = String(hotjarId || '').trim();
  const hj = (/hjid\s*:\s*(\d+)/i.exec(hjBruto)?.[1]) || hjBruto.replace(/\s+/g, '');
  if (hj && !/^\d{5,12}$/.test(hj)) erros.push('O ID do site no Hotjar tem só números (ex.: 3456789). Confira no Hotjar em Configurações > Sites e organizações.');
  let prop = String(tawkPropertyId || '').trim(), wid = String(tawkWidgetId || '').trim();
  const doLink = /embed\.tawk\.to\/([a-f0-9]{24})\/([\w-]{1,40})/i.exec(prop) || /embed\.tawk\.to\/([a-f0-9]{24})\/([\w-]{1,40})/i.exec(wid);
  if (doLink) { prop = doLink[1]; wid = doLink[2]; }
  prop = prop.replace(/\s+/g, '').toLowerCase(); wid = wid.replace(/\s+/g, '');
  const propOk = /^[a-f0-9]{24}$/.test(prop), widOk = /^[\w-]{1,40}$/.test(wid);
  if ((prop || wid) && !(propOk && widOk)) erros.push('O Tawk.to precisa dos dois códigos: Property ID (24 letras e números, ex.: 64f1a2b3c4d5e6f7a8b9c0d1) e Widget ID (ex.: 1h2j3k4l5). Dica: cole no 1º campo o link "https://embed.tawk.to/…" que aparece no código do Tawk.to, que o app separa sozinho.');
  return { valor: { hotjarId: /^\d{5,12}$/.test(hj) ? hj : '', tawkPropertyId: propOk && widOk ? prop : '', tawkWidgetId: propOk && widOk ? wid : '' }, erros };
}

/** Normaliza e valida os campos do formulário. Devolve { valor: { metaPixelId, googleAdsId, googleAdsRotulo, hotjarId, tawkPropertyId, tawkWidgetId }, erros: [] }. */
export function normalizarRastreamento({ metaPixelId = '', googleAdsId = '', ...extras } = {}) {
  const erros = [];
  const ex = normalizarExtras(extras);
  const meta = String(metaPixelId || '').replace(/\s+/g, '');
  if (meta && !/^\d{8,20}$/.test(meta)) erros.push('O ID do Pixel do Meta tem só números (ex.: 123456789012345). Confira no Gerenciador de Eventos.');
  // Aceita "AW-123456789" ou "AW-123456789/AbCdEfGh" (ID + rótulo da conversão, como o Google mostra no "snippet de evento").
  const g = String(googleAdsId || '').replace(/\s+/g, '').replace(/^aw-/i, 'AW-');
  const m = /^(AW-\d{6,15})(?:\/([\w-]{1,64}))?$/.exec(g);
  if (g && !m) erros.push('O ID do Google Ads tem o formato AW-123456789 (ou AW-123456789/rótulo). Confira em Ferramentas > Medição > Conversões.');
  return {
    valor: { metaPixelId: /^\d{8,20}$/.test(meta) ? meta : '', googleAdsId: m ? m[1] : '', googleAdsRotulo: m?.[2] || '', ...ex.valor },
    erros: [...erros, ...ex.erros],
  };
}

/** IDs gravados no cliente (vazio quando não há). */
export const rastreamentoDe = (cliente) => ({
  metaPixelId: cliente?.rastreamento?.metaPixelId || '', googleAdsId: cliente?.rastreamento?.googleAdsId || '', googleAdsRotulo: cliente?.rastreamento?.googleAdsRotulo || '',
  hotjarId: cliente?.rastreamento?.hotjarId || '', tawkPropertyId: cliente?.rastreamento?.tawkPropertyId || '', tawkWidgetId: cliente?.rastreamento?.tawkWidgetId || '',
});

/** Algum script que só carrega depois do aceite de cookies (Pixel, Google, Hotjar ou Tawk.to)? */
export const temScriptsDeTerceiros = (r) => Boolean(r.metaPixelId || r.googleAdsId || r.hotjarId || r.tawkPropertyId);

/** Frase do aviso de cookies do site, dizendo em palavras simples o que carrega só com o "Aceitar". */
export function textoAvisoCookies(r) {
  const usos = [(r.metaPixelId || r.googleAdsId) && 'medir os anúncios', r.hotjarId && 'entender como as pessoas usam o site', r.tawkPropertyId && 'abrir o chat de atendimento'].filter(Boolean);
  const lista = usos.length > 1 ? `${usos.slice(0, -1).join(', ')} e ${usos[usos.length - 1]}` : usos[0];
  return `Usamos cookies para o carrinho funcionar${lista ? ` e, se você aceitar, para ${lista}` : ''}. Você pode mudar a escolha quando quiser em "Preferências de cookies", no fim da página.`;
}

/** Indicador do resumo do cliente: { configurado, texto }. */
export function statusPixel(cliente) {
  const r = rastreamentoDe(cliente);
  const partes = [r.metaPixelId && 'Meta', r.googleAdsId && 'Google Ads'].filter(Boolean);
  return partes.length
    ? { configurado: true, texto: `Pixel configurado (${partes.join(' + ')})` }
    : { configurado: false, texto: 'Pixel não configurado: campanhas não vão conseguir medir conversão no site' };
}

// Os IDs já passaram por normalizarRastreamento (só dígitos / AW-dígitos / rótulo \w-), mas ainda assim vão para o
// JavaScript por JSON.stringify e para atributos de URL por encodeURIComponent: nada digitado vira código.
const js = (s) => JSON.stringify(String(s)).replace(/</g, '\\u003c');

/** Chave do localStorage (no navegador do visitante) onde o banner de cookies do site guarda a escolha. */
export const CHAVE_CONSENTIMENTO = 'consentimento_cookies';

/**
 * Código para o <head>: Pixel do Meta (com PageView) e tag global do Google Ads — '' sem IDs.
 * LGPD: nada é carregado de cara. O código fica dentro de window.carregarRastreamento(), que só roda se o visitante
 * já aceitou os cookies antes (escolha guardada no navegador) ou quando clicar em "Aceitar" no banner. Recusou = o
 * Pixel e a tag nunca carregam (e os eventos de checkout, que testam window.fbq/window.gtag, não disparam).
 * Sem o <noscript> do Pixel: sem JavaScript não há como pedir consentimento.
 */
export function codigoHead(r) {
  const partes = [];
  if (r.metaPixelId) {
    partes.push(`  // Meta Pixel (código padrão do Meta; ID do cadastro do cliente)
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', ${js(r.metaPixelId)});
  fbq('track', 'PageView');`);
  }
  if (r.googleAdsId) {
    partes.push(`  // Tag do Google Ads (gtag.js; ID do cadastro do cliente)
  var g=document.createElement('script');g.async=true;g.src='https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(r.googleAdsId)}';document.head.appendChild(g);
  window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments);};gtag('js',new Date());gtag('config',${js(r.googleAdsId)});`);
  }
  if (r.hotjarId) {
    partes.push(`  // Hotjar (mapa de cliques e gravação de navegação; ID do cadastro do cliente)
  (function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};h._hjSettings={hjid:${js(r.hotjarId)},hjsv:6};
  a=o.getElementsByTagName('head')[0];r=o.createElement('script');r.async=1;r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;a.appendChild(r);})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`);
  }
  if (r.tawkPropertyId && r.tawkWidgetId) {
    partes.push(`  // Tawk.to (chat ao vivo; códigos do cadastro do cliente)
  window.Tawk_API=window.Tawk_API||{};window.Tawk_LoadStart=new Date();
  var s1=document.createElement('script');s1.async=true;s1.src='https://embed.tawk.to/${encodeURIComponent(r.tawkPropertyId)}/${encodeURIComponent(r.tawkWidgetId)}';s1.charset='UTF-8';s1.setAttribute('crossorigin','*');document.head.appendChild(s1);`);
  }
  if (!partes.length) return '';
  const nomes = [r.metaPixelId && 'Pixel do Meta', r.googleAdsId && 'Google Ads', r.hotjarId && 'Hotjar', r.tawkPropertyId && r.tawkWidgetId && 'Tawk.to'].filter(Boolean).join(' / ');
  return `<!-- Scripts de terceiros (${nomes}): só carregam depois que o visitante aceita os cookies no banner. -->
<script>
window.carregarRastreamento=function(){
  if(window.__rastreamentoCarregado)return;window.__rastreamentoCarregado=true;
${partes.join('\n')}
};
try{if(localStorage.getItem(${js(CHAVE_CONSENTIMENTO)})==='aceito')window.carregarRastreamento();}catch(e){}
</script>
<!-- Fim do rastreamento -->`;
}

/**
 * Função chamada no botão "Finalizar compra" (o ponto de encaixe do checkout), antes de ir para o checkout de terceiro.
 * Meta: InitiateCheckout (quem clica em finalizar ainda não pagou — a compra (Purchase) acontece no checkout do
 * provedor, que tem integração própria com o Pixel). Google: com o rótulo da conversão, dispara essa conversão;
 * sem rótulo, o evento padrão begin_checkout. Sem IDs, a função existe mas não faz nada.
 */
export function codigoCheckout(r) {
  const linhas = [];
  if (r.metaPixelId) linhas.push(`  try{if(window.fbq)fbq('track','InitiateCheckout',{value:valor,currency:'BRL',num_items:qtd});}catch(e){}`);
  if (r.googleAdsId) {
    linhas.push(r.googleAdsRotulo
      ? `  try{if(window.gtag)gtag('event','conversion',{send_to:${js(`${r.googleAdsId}/${r.googleAdsRotulo}`)},value:valor,currency:'BRL'});}catch(e){}`
      : `  try{if(window.gtag)gtag('event','begin_checkout',{value:valor,currency:'BRL',items:itens.map(function(i){return{item_id:i.id,item_name:i.nome,price:i.preco,quantity:i.qtd}})});}catch(e){}`);
  }
  return `// Rastreamento do clique em "Finalizar compra" (${linhas.length ? 'Pixel/tag do cadastro do cliente' : 'nenhum ID cadastrado: não faz nada'}).
function rastrearCheckout(itens){
  var valor=itens.reduce(function(s,i){return s+i.preco*i.qtd},0),qtd=itens.reduce(function(s,i){return s+i.qtd},0);
${linhas.join('\n')}
}`;
}

const ONDE = {
  nuvemshop: 'no admin da Nuvemshop, em Configurações > Códigos externos (campos "Facebook Pixel" e "Google")',
  shopify: 'no admin da Shopify, em Configurações > Apps e canais de vendas: app "Facebook & Instagram" (Pixel do Meta) e app "Google & YouTube" (Google Ads)',
};

/** Passos do manual do modo pacote, com os valores reais do cliente. [] quando não há nenhum ID. */
export function passosRastreamentoPacote(r, plataforma, nomePlataforma) {
  if (!r.metaPixelId && !r.googleAdsId) return [];
  const ids = [r.metaPixelId && `do Pixel do Meta ${r.metaPixelId}`, r.googleAdsId && `do Google Ads ${r.googleAdsId}`].filter(Boolean).join(' e ');
  return [
    `Cole o ID ${ids} nas configurações de rastreamento da sua loja em ${nomePlataforma}.`,
    `Onde fica: ${ONDE[plataforma] || 'nas configurações de rastreamento/pixel do painel da loja'}.`,
    ...(r.googleAdsRotulo ? [`Rótulo da conversão do Google Ads (se a plataforma pedir): ${r.googleAdsRotulo}.`] : []),
    'Depois de salvar, faça uma visita e um pedido de teste e confira no Gerenciador de Eventos do Meta (aba "Testar eventos") e no Google Ads (Conversões) se os eventos chegaram.',
  ];
}

const ONDE_EXTRAS = {
  nuvemshop: {
    hotjar: 'no admin da Nuvemshop, em Configurações > Códigos externos, no campo de scripts do site (ou instale o app "Hotjar" pela Loja de Aplicativos da Nuvemshop, se estiver disponível)',
    tawk: 'no admin da Nuvemshop, em Configurações > Códigos externos, no mesmo campo de scripts (ou instale o app "tawk.to" pela Loja de Aplicativos da Nuvemshop, se estiver disponível)',
  },
  shopify: {
    hotjar: 'na Shopify, instale o app oficial "Hotjar" (Apps > Shopify App Store) e informe o ID do site; sem o app, cole o código em Loja virtual > Temas > Editar código > theme.liquid, antes de </head>',
    tawk: 'na Shopify, instale o app oficial "tawk.to Live Chat" (Apps > Shopify App Store) e entre com a conta do Tawk.to; sem o app, cole o código em Loja virtual > Temas > Editar código > theme.liquid, antes de </body>',
  },
};

/** Código avulso para colar na plataforma (mesmo código padrão do site personalizado, sem a trava do nosso banner). */
export const codigoHotjarAvulso = (r) => (r.hotjarId ? `<script>(function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};h._hjSettings={hjid:${r.hotjarId},hjsv:6};a=o.getElementsByTagName('head')[0];r=o.createElement('script');r.async=1;r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;a.appendChild(r);})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');</script>` : '');
export const codigoTawkAvulso = (r) => (r.tawkPropertyId ? `<script>var Tawk_API=Tawk_API||{},Tawk_LoadStart=new Date();(function(){var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];s1.async=true;s1.src='https://embed.tawk.to/${r.tawkPropertyId}/${r.tawkWidgetId}';s1.charset='UTF-8';s1.setAttribute('crossorigin','*');s0.parentNode.insertBefore(s1,s0);})();</script>` : '');

/** Passos do manual do modo pacote para Hotjar e Tawk.to, com os valores reais do cliente. [] quando não há nenhum. */
export function passosExtrasPacote(r, plataforma, nomePlataforma) {
  const onde = ONDE_EXTRAS[plataforma] || {};
  const passos = [];
  if (r.hotjarId) passos.push(`Hotjar (ID do site ${r.hotjarId}): ${onde.hotjar || `cole o código abaixo nas configurações de scripts da loja em ${nomePlataforma}`}. Código, se a plataforma pedir: ${codigoHotjarAvulso(r)}`);
  if (r.tawkPropertyId) passos.push(`Tawk.to (Property ID ${r.tawkPropertyId}, Widget ID ${r.tawkWidgetId}): ${onde.tawk || `cole o código abaixo nas configurações de scripts da loja em ${nomePlataforma}`}. Código, se a plataforma pedir: ${codigoTawkAvulso(r)}`);
  if (passos.length) passos.push(`Aviso de cookies (LGPD): ative o banner de cookies/privacidade da própria ${nomePlataforma} para que esses scripts só rodem depois do aceite do visitante, como no site personalizado.`);
  return passos;
}

/** Selo "Pixel configurado" (verde) ou "Pixel não configurado" (âmbar) com link para o cadastro. Tela do cliente e aba Site/Loja. */
export function indicadorPixel(c, id = c?.id) {
  const s = statusPixel(c);
  return `<a href="#/c/${esc(id)}/editar" class="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.configurado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}" data-status-pixel="${s.configurado ? 'ok' : 'falta'}" title="Editar em: Editar > Rastreamento">
    <i class="fa-solid fa-${s.configurado ? 'circle-check' : 'triangle-exclamation'}"></i> ${esc(s.texto)}</a>`;
}
