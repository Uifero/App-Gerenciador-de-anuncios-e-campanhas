// Carrossel do banner SÓ com HTML + CSS (a prévia do pacote roda num iframe sem script nenhum; o site personalizado usa
// o mesmo, para a prévia, o link de aprovação e o site baixado ficarem iguais).
//  - Passa sozinho (animação CSS, 5 s por slide). Ao tocar numa seta ou num ponto, para e mostra o slide escolhido
//    (rádios escondidos + :has()); navegador sem :has() continua passando sozinho.
//  - Proporção do quadro por aparelho (computador/celular) e cada foto recortada pelo ponto focal (object-position =
//    foco, a mesma conta do .zip: lib/medidas-site.js). "Juntar fotos": 2 ou 3 fotos lado a lado no mesmo slide.
//  - Um slide só = banner com imagem fixa (sem setas, pontos nem animação), como os sites de antes.
import { posicaoCss, proporcao } from './medidas-site.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const SEGUNDOS_POR_SLIDE = 5;

/**
 * HTML do carrossel. `slides` = [{ fotos: [{ url, foco }] }] (lib/fotos-site.js slidesDoBanner); `medida` = medidas do
 * banner ({ desktop, mobile }); `conteudo` = HTML do texto por cima (título, botão); `id` = prefixo único na página.
 */
export function carrosselHtml({ slides = [], medida, conteudo = '', id = 'bn', alt = '' }) {
  const lista = slides.filter((s) => s?.fotos?.some((f) => f?.url));
  if (!lista.length) return '';
  const n = lista.length;
  const rd = proporcao(medida?.desktop), rm = proporcao(medida?.mobile || medida?.desktop);
  const radios = n > 1 ? lista.map((_, i) => `<input type="radio" name="${id}" id="${id}-${i}" class="car-r" aria-label="Slide ${i + 1}">`).join('') : '';
  const fotos = (s) => s.fotos.filter((f) => f?.url).map((f) => `<img src="${esc(f.url)}" alt="${esc(alt)}" style="--pos:${posicaoCss(f.foco)}" loading="eager">`).join('');
  const slidesHtml = lista.map((s, i) => `<div class="car-slide${s.fotos.length > 1 ? ' car-junto' : ''}" style="--i:${i}" data-slide="${i + 1}">${fotos(s)}</div>`).join('');
  const setas = n > 1 ? `<div class="car-setas">${lista.map((_, i) => `<span class="car-par s-${i}"><label for="${id}-${(i - 1 + n) % n}" class="car-seta" aria-label="Slide anterior">‹</label><label for="${id}-${(i + 1) % n}" class="car-seta" aria-label="Próximo slide">›</label></span>`).join('')}</div>
<div class="car-pontos">${lista.map((_, i) => `<label for="${id}-${i}" style="--i:${i}" aria-label="Ir para o slide ${i + 1}"></label>`).join('')}</div>` : '';
  return `<div class="car car-${n}" id="${id}" style="--rd:${rd.toFixed(4)};--rm:${rm.toFixed(4)};--n:${n}" data-carrossel="${n}">${radios}<div class="car-trilho">${slidesHtml}</div>${conteudo ? `<div class="car-texto">${conteudo}</div>` : ''}${setas}</div>`;
}

/** CSS do carrossel (uma vez por página). `n` = número de slides (as regras de escolher slide dependem dele). */
export function carrosselCss({ n = 1, id = 'bn' } = {}) {
  const T = SEGUNDOS_POR_SLIDE, ciclo = n * T, vis = (100 / Math.max(n, 1));
  const base = `.car{position:relative;width:100%;aspect-ratio:var(--rd);min-height:240px;overflow:hidden;background:#111;color:#fff}
.car-r{position:absolute;opacity:0;pointer-events:none}.car-trilho,.car-slide{position:absolute;inset:0}
.car-slide{display:flex}.car-slide img{flex:1 1 0;min-width:0;width:100%;height:100%;object-fit:cover;object-position:var(--pos,50% 50%);display:block}
.car-junto img+img{border-left:3px solid #fff}
.car-texto{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px 56px;background:linear-gradient(#0000,#0008);z-index:2}
.car-setas{position:absolute;inset:0;z-index:3;pointer-events:none}.car-par{display:none}
.car-seta{pointer-events:auto;position:absolute;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:999px;background:#0008;color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;line-height:1;cursor:pointer;user-select:none}
.car-seta:first-child{left:10px}.car-seta:last-child{right:10px}
.car-pontos{position:absolute;left:0;right:0;bottom:10px;display:flex;justify-content:center;gap:8px;z-index:3}
.car-pontos label{width:10px;height:10px;border-radius:999px;background:#fff;opacity:.45;cursor:pointer}
@media(max-width:640px){.car{aspect-ratio:var(--rm);min-height:0}.car-texto{padding:16px 44px}}`;
  if (n < 2) return base;
  // Passar sozinho: cada slide aparece 1/n do ciclo; a defasagem negativa faz todos já estarem rodando no início.
  const anim = `@keyframes car${n}{0%{opacity:1}${(vis - 1).toFixed(2)}%{opacity:1}${vis.toFixed(2)}%{opacity:0}${(100 - 1).toFixed(2)}%{opacity:0}100%{opacity:1}}
@keyframes car${n}p{0%{opacity:1}${(vis - 1).toFixed(2)}%{opacity:1}${vis.toFixed(2)}%{opacity:.45}100%{opacity:.45}}
#${id} .car-slide{opacity:0;animation:car${n} ${ciclo}s infinite;animation-delay:calc(var(--i) * ${T}s - ${ciclo}s)}
#${id} .car-pontos label{animation:car${n}p ${ciclo}s infinite;animation-delay:calc(var(--i) * ${T}s - ${ciclo}s)}
#${id} .s-0{display:block}
#${id}:has(.car-r:checked) .car-slide,#${id}:has(.car-r:checked) .car-pontos label{animation:none}
#${id}:has(.car-r:checked) .car-slide{opacity:0}#${id}:has(.car-r:checked) .car-pontos label{opacity:.45}#${id}:has(.car-r:checked) .s-0{display:none}`;
  const escolha = Array.from({ length: n }, (_, i) => `#${id}-${i}:checked~.car-trilho .car-slide:nth-child(${i + 1}){opacity:1}#${id}-${i}:checked~.car-setas .s-${i}{display:block}#${id}-${i}:checked~.car-pontos label:nth-child(${i + 1}){opacity:1}`).join('\n');
  return `${base}\n${anim}\n${escolha}\n@media(prefers-reduced-motion:reduce){#${id} .car-slide,#${id} .car-pontos label{animation:none}#${id}:not(:has(.car-r:checked)) .car-slide:first-child{opacity:1}}`;
}
