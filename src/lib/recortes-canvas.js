// Recorte de verdade (no navegador, canvas) dos arquivos do .zip "Imagens por lugar": cada item de planoArquivos
// (lib/medidas-site.js) vira um JPEG no tamanho do lugar e do aparelho, com o ponto focal dentro e "Juntar fotos" lado a
// lado. O original não é tocado: a foto é baixada, desenhada numa cópia e só a cópia vai para o .zip.
import { recorte, encaixe, fatias } from './medidas-site.js';

const cache = new Map();
/** Baixa a foto uma vez por .zip (a mesma foto pode ir para vários lugares). fetch + blob evita o canvas "sujo" de CORS. */
async function abrir(url) {
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      const r = await fetch(url); if (!r.ok) throw new Error(`não consegui baixar ${url}`);
      return createImageBitmap(await r.blob());
    })());
  }
  return cache.get(url);
}
export const limparCache = () => { for (const p of cache.values()) p.then((b) => b.close?.()).catch(() => {}); cache.clear(); };

/** Desenha um item do plano e devolve os bytes do JPEG (Uint8Array). */
export async function desenharArquivo(item, qualidade = 0.9) {
  const c = document.createElement('canvas'); c.width = item.l; c.height = item.a;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); // fundo branco ("Mostrar inteira" e PNG transparente)
  g.imageSmoothingQuality = 'high';
  const partes = fatias(item.fotos.length, item.l, item.a);
  for (let i = 0; i < item.fotos.length; i++) {
    const f = item.fotos[i], q = partes[i];
    const img = await abrir(f.url);
    if (item.ajuste === 'contain') {
      const e = encaixe(img.width, img.height, q.w, q.h);
      g.drawImage(img, q.x + e.x, q.y + e.y, e.w, e.h);
    } else {
      const r = recorte(img.width, img.height, q.w / q.h, f.foco);
      g.drawImage(img, r.x, r.y, r.w, r.h, q.x, q.y, q.w, q.h);
    }
    if (i > 0) { g.fillStyle = '#fff'; g.fillRect(q.x - 2, 0, 4, item.a); } // mesma divisória branca da prévia
  }
  const blob = await new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('canvas vazio'))), 'image/jpeg', qualidade));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Largura e altura reais de uma foto (para "foto em pé" e a sugestão de "Juntar fotos"). null se não abrir. */
export function medirFoto(url) {
  return new Promise((ok) => { const i = new Image(); i.onload = () => ok(i.naturalWidth ? { largura: i.naturalWidth, altura: i.naturalHeight } : null); i.onerror = () => ok(null); i.src = url; });
}
