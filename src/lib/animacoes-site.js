// "Animações do site" (passo 4 de "Montar site"): efeitos leves, feitos SÓ com CSS (a prévia do pacote roda sem script),
// que valem para a prévia do pacote, o link de aprovação e o site personalizado baixado. Regras:
//  - sutis por padrão, só opacity/transform (nada que mude o tamanho de nada: sem salto de layout);
//  - tudo dentro de @media (prefers-reduced-motion: no-preference): quem pede menos movimento vê a página parada;
//  - nada esconde o botão de compra: a página do produto, o botão e a barra de compra nunca entram no "surgir ao rolar";
//  - contador de oferta só com prazo REAL escrito na oferta ativa do perfil ("até 31/10"); sem prazo, desligado e diz por quê.
// No pacote (Shopify/Nuvemshop) o passo 6 vira instrução de tema, sem prometer que o tema fica igual.
const txt = (v) => String(v ?? '').trim();
const norm = (s) => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const ANIMACOES_SITE = [
  { id: 'revelar', nome: 'Seções surgindo ao rolar', legenda: 'Cada seção aparece de leve quando entra na tela (a página do produto e o botão de compra nunca).' },
  { id: 'banner', nome: 'Banner com movimento leve', legenda: 'A foto do banner aproxima bem devagar.' },
  { id: 'botao', nome: 'Botão de compra reage ao toque', legenda: 'O botão "afunda" um pouco ao tocar, para a pessoa sentir que tocou.' },
  { id: 'frete', nome: 'Selo de frete em destaque', legenda: 'A faixa de frete brilha duas vezes ao abrir a página.' },
  { id: 'junto', nome: '"Compre junto" em destaque', legenda: 'A caixa do "Compre junto" ganha borda na cor da marca e pulsa duas vezes.' },
  { id: 'contador', nome: 'Contador da oferta', legenda: 'Mostra quanto falta para a oferta acabar. Só com prazo real na oferta ativa do perfil.' },
];
export const PADRAO_ANIMACOES = { revelar: true, banner: true, botao: true, frete: false, junto: false, contador: false };
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * Prazo real da oferta, lido da oferta ativa do perfil ("até 31/10", "válida até 31/10/2026", "termina em 5 de novembro").
 * Devolve { fim (Date, 23:59 do dia), texto } ou { motivo } (sem prazo, prazo passado ou sem oferta).
 */
export function prazoDaOferta(cliente = {}, hoje = new Date()) {
  const o = txt(cliente.marca?.ofertaAtiva);
  if (!o) return { motivo: 'Não há oferta ativa no perfil do cliente (pergunta 15): sem oferta, não há contador.' };
  const n = norm(o);
  let d = null, m = null, a = null;
  const num = /\b(?:ate|termina(?:\s+em)?|vale\s+ate|valida\s+ate|encerra(?:\s+em)?)\s+(?:o\s+)?(?:dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(n);
  const ext = /\b(?:ate|termina(?:\s+em)?|valida\s+ate|encerra(?:\s+em)?)\s+(?:o\s+)?(?:dia\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/.exec(n);
  if (num) [d, m, a] = [Number(num[1]), Number(num[2]), num[3] ? Number(num[3].length === 2 ? `20${num[3]}` : num[3]) : null];
  else if (ext && MESES.includes(ext[2])) [d, m, a] = [Number(ext[1]), MESES.indexOf(ext[2]) + 1, ext[3] ? Number(ext[3]) : null];
  if (!d || !m || m > 12 || d > 31) return { motivo: `A oferta ativa ("${o.slice(0, 60)}") não tem data de término. Para ligar o contador, escreva o prazo real no perfil (ex.: "até 31/10"). O app não inventa prazo.` };
  const fim = new Date(a || hoje.getFullYear(), m - 1, d, 23, 59, 59);
  if (fim.getTime() <= hoje.getTime()) return { motivo: `O prazo da oferta (${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}) já passou: atualize a oferta ativa do perfil.` };
  return { fim, texto: `Oferta até ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} às 23:59` };
}

/** Escolhas válidas: o que o operador marcou (ou o padrão), com o contador desligado sem prazo real. */
export function normalizarAnimacoes(a = null, { prazo = null } = {}) {
  const base = { ...PADRAO_ANIMACOES, ...(a && typeof a === 'object' ? a : {}) };
  const out = Object.fromEntries(ANIMACOES_SITE.map(({ id }) => [id, Boolean(base[id])]));
  if (!prazo?.fim) out.contador = false;
  return out;
}
export const ligadas = (a) => ANIMACOES_SITE.filter(({ id }) => a?.[id]).map(({ id }) => id);
/** Classes no <body> (o CSS só age com a classe ligada). */
export const classesBody = (a) => ligadas(a).map((id) => `anim-${id}`).join(' ');

/**
 * CSS das animações (mesmos nomes nas duas prévias). Só opacity/transform; dentro de prefers-reduced-motion. O surgir ao
 * rolar usa animation-timeline: view() (sem script); navegador sem suporte mostra tudo parado, nunca escondido.
 */
export function cssAnimacoes(a, { acento = '#2b2b2b' } = {}) {
  if (!ligadas(a).length) return '';
  return `.hero-img,.banner.com-foto .hero-img{display:block;overflow:hidden;border-radius:var(--raio-g,12px)}
.contador{display:inline-block;margin:0 0 12px;padding:6px 12px;border:1px solid ${acento};border-radius:var(--raio,6px);font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
@media (prefers-reduced-motion:no-preference){
@keyframes gcc-surgir{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
@keyframes gcc-respirar{from{transform:scale(1)}to{transform:scale(1.05)}}
@keyframes gcc-brilho{0%,100%{opacity:1}50%{opacity:.72}}
@keyframes gcc-pulso{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}
@supports (animation-timeline:view()){
.anim-revelar .home>.sec,.anim-revelar .home>.faixa,.anim-revelar>section:not(.pdp-pagina):not(.pagina):not(.home):not(#topo){animation:gcc-surgir linear both;animation-timeline:view();animation-range:entry 0% entry 30%}}
.anim-banner .hero-img img,.anim-banner .car-slide img{animation:gcc-respirar 16s ease-in-out infinite alternate;will-change:transform}
.anim-botao .comprar,.anim-botao .btn,.anim-botao .cta,.anim-botao .hero a:not(.hero-img),.anim-botao .bc-botao{transition:transform .12s ease-out}
.anim-botao .comprar:active,.anim-botao .btn:active,.anim-botao .cta:active,.anim-botao .hero a:not(.hero-img):active,.anim-botao .bc-botao:active{transform:scale(.97)}
.anim-frete .barra-frete{animation:gcc-brilho 1.2s ease-in-out .6s 2}
.anim-junto .junto{border-color:${acento};animation:gcc-pulso 1.4s ease-in-out .8s 2}
.anim-contador .contador{animation:gcc-brilho 2s ease-in-out infinite}}`;
}

/** Contador: o texto fixo serve para a prévia sem script; o site personalizado troca pelo tempo que falta (script). */
export const htmlContador = (prazo) => (prazo?.fim ? `<p class="contador" data-contador data-fim="${prazo.fim.toISOString()}" aria-live="off">${prazo.texto}</p>` : '');
export const JS_CONTADOR = `(function(){var el=document.querySelectorAll('[data-contador]');if(!el.length)return;function f(){el.forEach(function(e){var r=new Date(e.dataset.fim)-new Date();if(r<=0){e.textContent='Oferta encerrada';return;}var d=Math.floor(r/864e5),h=Math.floor(r/36e5)%24,m=Math.floor(r/6e4)%60;e.textContent='A oferta acaba em '+(d?d+'d ':'')+String(h).padStart(2,'0')+'h '+String(m).padStart(2,'0')+'min';});}f();setInterval(f,30000);})();`;

/**
 * Instruções de tema para o passo 6 (pacote). Dawn tem "Animações" nas configurações do tema; Horizon e Nuvemshop
 * variam: "confira no editor do tema". Contador em Shopify/Nuvemshop pede app da loja de apps. Nunca promete igual.
 */
export function instrucoesTema(a, plataforma, tema = '') {
  const t = norm(tema), ids = ligadas(a);
  if (!ids.length) return [];
  const conf = 'confira no editor do tema';
  const dawn = plataforma === 'shopify' && t === 'dawn';
  const onde = plataforma === 'shopify' ? (dawn ? 'Loja virtual > Temas > Personalizar > Configurações do tema > Animações' : `Loja virtual > Temas > Personalizar > Configurações do tema (${conf}: nem todo tema tem "Animações")`)
    : plataforma === 'nuvemshop' ? `Design > Personalizar (${conf}: depende do tema da Nuvemshop)` : 'Escolha a plataforma no passo 3';
  const item = { revelar: dawn ? 'Ligue "Revelar seções ao rolar".' : `Procure uma opção de revelar seções ao rolar (${conf}).`,
    banner: `No banner/slideshow, procure efeito de movimento ou zoom lento (${conf}).`,
    botao: dawn ? 'Em "Efeito ao passar o mouse", escolha um efeito discreto (no celular o toque já dá retorno).' : `Procure efeito de botão/passar o mouse (${conf}).`,
    frete: 'Use a barra de anúncio do tema para o frete; destaque animado depende do tema.',
    junto: 'O "Compre junto" depende do app ou do recurso de recomendação da plataforma; destaque animado depende do tema.',
    contador: `Contador de oferta não vem no tema: precisa de um app de contador da loja de apps da ${plataforma === 'nuvemshop' ? 'Nuvemshop' : 'Shopify'}, com o mesmo prazo real da oferta.` };
  return [{ rotulo: 'Onde', valor: onde }, ...ids.map((id) => ({ rotulo: ANIMACOES_SITE.find((x) => x.id === id).nome, valor: item[id] })),
    { rotulo: 'Atenção', valor: 'O efeito do tema pode não ser igual ao da prévia: a prévia mostra a ideia, o tema define como fica.' }];
}
