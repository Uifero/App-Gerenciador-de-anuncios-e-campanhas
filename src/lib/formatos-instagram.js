// Criativos são vistos no Instagram, no celular (regra no CLAUDE.md). Formatos padrão e zona segura usados pelo Estúdio
// (lib/estudio.js desenha dentro dela; modules/estudio.js mostra o guia e avisa) e citados nos prompts de criativo.
//
// Zona segura (margens conservadoras): Meta unificou em 2026 a zona de Reels e Stories (Facebook e Instagram) no 9:16:
// fora dos 14% de cima (nome do perfil, barra de progresso), dos 35% de baixo (legenda do Reels, que cresce, botões e
// CTA; nos Stories são ~20%, aqui vale o pior caso) e de 6% de cada lado. Fonte: central de ajuda do Meta "Sobre
// sobreposições de texto e zona de segurança para anúncios no Stories e no Reels" (resumo em billo.app/blog/meta-ads-safe-zones).
// Feed (4:5 e 1:1) não tem interface por cima da imagem; 5% em volta só dá respiro para corte de tela.

export const FORMATOS_INSTAGRAM = [
  ['1080x1920', 'Reels e Stories 9:16 (1080×1920)'],
  ['1080x1350', 'Feed 4:5 (1080×1350)'],
  ['1080x1080', 'Quadrado 1:1 (1080×1080), só quando pedirem'],
];
export const FORMATO_IMAGEM_PADRAO = '1080x1350';
export const FORMATO_VIDEO_PADRAO = '1080x1920';

/** Margens em fração da altura (topo/base) e da largura (lados). */
export const MARGENS_ZONA = { vertical: { topo: 0.14, base: 0.35, lados: 0.06 }, feed: { topo: 0.05, base: 0.05, lados: 0.05 } };

const vertical = (w, h) => h / w > 1.5;

/** Retângulo seguro em pixels: { x, y, w, h, topo, base, lados } (topo/base/lados = margens em px). */
export function zonaSegura(w, h) {
  const m = vertical(w, h) ? MARGENS_ZONA.vertical : MARGENS_ZONA.feed;
  const topo = Math.round(h * m.topo), base = Math.round(h * m.base), lados = Math.round(w * m.lados);
  return { x: lados, y: topo, w: w - lados * 2, h: h - topo - base, topo, base, lados };
}

/**
 * Quais caixas ficam (mesmo em parte) fora da zona segura. caixas: [{ nome, x, y, w, h }] em px da peça.
 * Tolerância de 1px para arredondamento do canvas. Caixa vazia (w ou h 0) é ignorada.
 */
export function foraDaZona(caixas, w, h) {
  const z = zonaSegura(w, h);
  return (caixas || []).filter((c) => c && c.w > 0 && c.h > 0)
    .filter((c) => c.x < z.x - 1 || c.y < z.y - 1 || c.x + c.w > z.x + z.w + 1 || c.y + c.h > z.y + z.h + 1)
    .map((c) => c.nome);
}

/** Nome do formato para o arquivo: reels-9x16 (vídeo 9:16), stories-9x16 (imagem 9:16), feed-4x5, feed-1x1. */
export function nomeFormato(formato, tipo = 'imagem') {
  const [w, h] = String(formato).split('x').map(Number);
  if (!w || !h) return 'peca';
  if (vertical(w, h)) return tipo === 'video' ? 'reels-9x16' : 'stories-9x16';
  if (w === h) return 'feed-1x1';
  return Math.abs(h / w - 1.25) < 0.01 ? 'feed-4x5' : `${w}x${h}`;
}

/** Texto curto que vai nos prompts de criativo (copy, hooks e roteiro). Sem número inventado: só formato e leitura. */
export const REGRA_INSTAGRAM = 'FORMATO: o criativo é visto no Instagram, no celular. Padrão: Reels/Stories 9:16 (1080x1920) e feed 4:5 (1080x1350); quadrado 1:1 só se o pedido disser. Texto na tela grande e com poucas palavras por cena (até ~6 palavras), contraste forte; nada importante (texto, logo, preço, CTA) nas faixas de cima e de baixo, que a interface do Instagram cobre. Vídeo é assistido sem som: toda fala importante também vira texto na tela (legenda), e o gancho aparece nos 3 primeiros segundos.';
