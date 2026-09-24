// Rastreamento do site do cliente: Pixel do Meta e tag do Google Ads.
// O app NÃO envia dado de pixel a lugar nenhum: só guarda os IDs no cliente e escreve o código padrão de cada
// plataforma no HTML do site "custom" (quem recebe as visitas/eventos são o Meta e o Google, direto do navegador de
// quem visita o site). No modo pacote (Nuvemshop/Shopify) o código não é inserido: a plataforma tem campo próprio,
// e o manual de handoff traz os IDs prontos para colar. Sem ID nenhum, nada disso aparece.
import { esc } from '../core/ui.js';

/** Normaliza e valida os campos do formulário. Devolve { valor: { metaPixelId, googleAdsId, googleAdsRotulo }, erros: [] }. */
export function normalizarRastreamento({ metaPixelId = '', googleAdsId = '' } = {}) {
  const erros = [];
  const meta = String(metaPixelId || '').replace(/\s+/g, '');
  if (meta && !/^\d{8,20}$/.test(meta)) erros.push('O ID do Pixel do Meta tem só números (ex.: 123456789012345). Confira no Gerenciador de Eventos.');
  // Aceita "AW-123456789" ou "AW-123456789/AbCdEfGh" (ID + rótulo da conversão, como o Google mostra no "snippet de evento").
  const g = String(googleAdsId || '').replace(/\s+/g, '').replace(/^aw-/i, 'AW-');
  const m = /^(AW-\d{6,15})(?:\/([\w-]{1,64}))?$/.exec(g);
  if (g && !m) erros.push('O ID do Google Ads tem o formato AW-123456789 (ou AW-123456789/rótulo). Confira em Ferramentas > Medição > Conversões.');
  return {
    valor: { metaPixelId: /^\d{8,20}$/.test(meta) ? meta : '', googleAdsId: m ? m[1] : '', googleAdsRotulo: m?.[2] || '' },
    erros,
  };
}

/** IDs gravados no cliente (vazio quando não há). */
export const rastreamentoDe = (cliente) => ({
  metaPixelId: cliente?.rastreamento?.metaPixelId || '', googleAdsId: cliente?.rastreamento?.googleAdsId || '', googleAdsRotulo: cliente?.rastreamento?.googleAdsRotulo || '',
});

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

/** Código para o <head>: Pixel do Meta (com PageView no carregamento) e tag global do Google Ads. '' sem IDs. */
export function codigoHead(r) {
  const partes = [];
  if (r.metaPixelId) {
    partes.push(`<!-- Meta Pixel (código padrão do Meta; ID do cadastro do cliente) -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${js(r.metaPixelId)});
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${encodeURIComponent(r.metaPixelId)}&ev=PageView&noscript=1"></noscript>
<!-- Fim do Meta Pixel -->`);
  }
  if (r.googleAdsId) {
    partes.push(`<!-- Tag do Google Ads (gtag.js; ID do cadastro do cliente) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(r.googleAdsId)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${js(r.googleAdsId)});</script>
<!-- Fim da tag do Google Ads -->`);
  }
  return partes.join('\n');
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

/** Selo "Pixel configurado" (verde) ou "Pixel não configurado" (âmbar) com link para o cadastro. Tela do cliente e aba Site/Loja. */
export function indicadorPixel(c, id = c?.id) {
  const s = statusPixel(c);
  return `<a href="#/c/${esc(id)}/editar" class="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.configurado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}" data-status-pixel="${s.configurado ? 'ok' : 'falta'}" title="Editar em: Editar > Rastreamento">
    <i class="fa-solid fa-${s.configurado ? 'circle-check' : 'triangle-exclamation'}"></i> ${esc(s.texto)}</a>`;
}
