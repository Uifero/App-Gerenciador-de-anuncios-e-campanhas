// Contraste de texto (WCAG 2): a cor escolhida pelo cliente continua a mesma no fundo (banner, botão, barra);
// só a cor do TEXTO é calculada para chegar a 4,5:1. Usado na prévia da loja (pacote-loja.js) e no site (sitegen.js).

const HEX = /^#?([\da-f]{3}|[\da-f]{6})$/i;
export const MINIMO_TEXTO = 4.5;
const ESCURO = '#111827', CLARO = '#ffffff';

function rgb(hex) {
  const m = HEX.exec(String(hex || '').trim()); if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const paraHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const luminancia = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };

/** Razão de contraste entre duas cores hex (1 a 21). Cor inválida conta como preto/branco do lado mais seguro: devolve 1. */
export function contraste(a, b) {
  const ca = rgb(a), cb = rgb(b); if (!ca || !cb) return 1;
  const [l1, l2] = [luminancia(ca), luminancia(cb)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Cor do texto em cima de um fundo na cor do cliente: branco ou quase preto, o que der mais contraste (preto puro se nenhum chegar a 4,5). */
export function textoSobre(fundo) {
  if (!rgb(fundo)) return CLARO;
  const melhor = contraste(CLARO, fundo) >= contraste(ESCURO, fundo) ? CLARO : ESCURO;
  if (contraste(melhor, fundo) >= MINIMO_TEXTO) return melhor;
  // Cinza médio: nem branco nem #111827 chegam; entre branco e preto puro, um sempre passa de 4,58:1.
  return contraste(CLARO, fundo) >= contraste('#000000', fundo) ? CLARO : '#000000';
}

/**
 * Texto NA cor do cliente (preço, botão branco com texto colorido) sobre `fundo`: a mesma cor, escurecida (fundo claro)
 * ou clareada (fundo escuro) só o necessário para chegar a 4,5:1. Se já chega, volta a própria cor.
 */
export function corLegivel(cor, fundo = CLARO) {
  const c = rgb(cor); if (!c) return ESCURO;
  if (contraste(paraHex(c), fundo) >= MINIMO_TEXTO) return paraHex(c);
  const alvo = luminancia(rgb(fundo) || [255, 255, 255]) > 0.18 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const x = paraHex(c.map((v, i) => v + (alvo[i] - v) * t));
    if (contraste(x, fundo) >= MINIMO_TEXTO) return x;
  }
  return paraHex(alvo);
}
