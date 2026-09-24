// Prévia em qualidade reduzida da peça final, para a página pública de aprovação.
// - Imagem: redimensionada no Canvas (até 800 px de largura, JPEG qualidade 70%).
// - Vídeo: 480p comprimido pelo ffmpeg.wasm já usado no editor (ver gerarPreviaVideo em lib/video.js).
// A prévia vai para uma pasta própria no Storage (gcc/<cliente>/previews/<criativo>/); o ORIGINAL em qualidade total
// fica intocado e continua sendo o arquivo usado na campanha. Tudo acontece nos bastidores, logo depois do upload da
// peça final; se o criativo for enviado para aprovação antes de a prévia terminar, criarLink() espera por ela.
import { db, COL, removerArquivo } from '../core/storage.js';
import { enviarArquivoOuAvisar } from './uploads.js';
import { toast } from '../core/ui.js';
import { gerarPreviaVideo } from './video.js'; // o núcleo do ffmpeg.wasm (32 MB) só é baixado quando há vídeo

export const LARGURA_MAX_IMAGEM = 800;
export const QUALIDADE_IMAGEM = 0.7;
const EXT_IMAGEM = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'];
const EXT_VIDEO = ['mp4', 'mov', 'webm', 'm4v'];

/** 'imagem' | 'video' | null (PDF e outros não têm prévia: a página segue mostrando só o texto/link, como antes). */
export function tipoDaPeca(nome = '', mime = '') {
  const e = String(nome).split('.').pop().toLowerCase();
  if (String(mime).startsWith('image/') || EXT_IMAGEM.includes(e)) return 'imagem';
  if (String(mime).startsWith('video/') || EXT_VIDEO.includes(e)) return 'video';
  return null;
}

/** Tamanho da prévia da imagem: largura até `max`, proporção mantida; imagem já pequena não é ampliada. */
export function dimensoesPreviaImagem(largura, altura, max = LARGURA_MAX_IMAGEM) {
  const e = largura > max ? max / largura : 1;
  return { largura: Math.max(1, Math.round(largura * e)), altura: Math.max(1, Math.round(altura * e)) };
}

async function previaImagem(arquivo) {
  const bmp = await createImageBitmap(arquivo).catch(() => { throw new Error('Não consegui abrir a imagem para gerar a prévia.'); });
  const { largura, altura } = dimensoesPreviaImagem(bmp.width, bmp.height);
  const c = document.createElement('canvas'); c.width = largura; c.height = altura;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, largura, altura); // PNG transparente vira fundo branco no JPEG
  ctx.drawImage(bmp, 0, 0, largura, altura);
  bmp.close?.();
  return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Falha ao gerar a prévia da imagem.'))), 'image/jpeg', QUALIDADE_IMAGEM));
}

/** Gera a prévia do arquivo. Devolve { blob, tipo, ext } ou null quando o tipo não tem prévia (ex.: PDF). */
export async function gerarPrevia(arquivo, aoProgresso) {
  const tipo = tipoDaPeca(arquivo.name, arquivo.type);
  if (tipo === 'imagem') return { blob: await previaImagem(arquivo), tipo, ext: 'jpg' };
  if (tipo === 'video') {
    return { blob: await gerarPreviaVideo({ arquivo, aoProgresso }), tipo, ext: 'mp4' };
  }
  return null;
}

/** Campos da prévia gravados no criativo (limpos quando a peça final é removida ou não tem prévia). */
export const SEM_PREVIA = { previaUrl: null, previaPath: null, previaTipo: null, previaDoArquivo: null };

/** A prévia gravada corresponde à peça final atual? (evita mostrar a prévia de um arquivo que já foi substituído) */
export const previaAtual = (c) => Boolean(c.previaUrl && c.arquivoPath && c.previaDoArquivo === c.arquivoPath);

const pendentes = new Map(); // criativoId -> Promise da prévia em andamento

/**
 * Gera e salva a prévia de `arquivo` (a peça final que acabou de ser enviada para `criativo.arquivoPath`).
 * Troca a prévia antiga, se havia. Devolve o patch aplicado ao criativo (ou SEM_PREVIA se não houver prévia).
 */
export function salvarPrevia(cliente, criativo, arquivo) {
  const arquivoPath = criativo.arquivoPath;
  const trabalho = (async () => {
    const p = await gerarPrevia(arquivo);
    if (criativo.arquivoPath !== arquivoPath) return null; // a peça foi trocada enquanto a prévia era gerada
    const antigo = criativo.previaPath;
    let patch = SEM_PREVIA;
    if (p) {
      const caminho = `gcc/${cliente.id}/previews/${criativo.id}/${Date.now()}_previa.${p.ext}`;
      const r = await enviarArquivoOuAvisar(caminho, new File([p.blob], `previa.${p.ext}`, { type: p.blob.type }));
      patch = { previaUrl: r.url, previaPath: r.path, previaTipo: p.tipo, previaDoArquivo: arquivoPath };
    }
    await db.atualizar(COL.criativos, criativo.id, patch, { silencioso: true }); // em segundo plano: não é um "salvar" do usuário
    Object.assign(criativo, patch);
    if (antigo && antigo !== patch.previaPath) await removerArquivo(antigo);
    return patch;
  })();
  pendentes.set(criativo.id, trabalho);
  trabalho.finally(() => { if (pendentes.get(criativo.id) === trabalho) pendentes.delete(criativo.id); }).catch(() => {});
  return trabalho;
}

/** Espera a prévia em andamento deste criativo, se houver (usado antes de gerar o link de aprovação). */
export async function aguardarPrevia(criativoId) {
  try { await pendentes.get(criativoId); } catch { /* a falha já foi avisada quando aconteceu */ }
}

/**
 * Para peças enviadas ANTES desta função existir: tenta baixar o original e gerar a prévia agora.
 * Se o navegador não conseguir ler o arquivo do Storage (ex.: CORS do bucket não configurado), segue sem prévia.
 */
export async function garantirPrevia(cliente, criativo) {
  await aguardarPrevia(criativo.id);
  if (!criativo.arquivoUrl || previaAtual(criativo) || !tipoDaPeca(criativo.arquivoNome)) return;
  try {
    const r = await fetch(criativo.arquivoUrl);
    if (!r.ok) return;
    const blob = await r.blob();
    await salvarPrevia(cliente, criativo, new File([blob], criativo.arquivoNome || 'peca', { type: blob.type }));
  } catch (e) { console.warn('[prévia] não foi possível gerar a prévia de uma peça antiga', criativo.id, e); }
}

/** Remove a prévia do criativo (quando a peça final é removida). */
export async function removerPrevia(criativo) {
  if (criativo.previaPath) await removerArquivo(criativo.previaPath);
  await db.atualizar(COL.criativos, criativo.id, SEM_PREVIA, { silencioso: true });
  Object.assign(criativo, SEM_PREVIA);
}

/** Dispara a prévia sem travar a tela; avisa com um toast quando termina (ou se falhar — a peça original já foi salva). */
export function previaEmSegundoPlano(cliente, criativo, arquivo, aoTerminar) {
  if (!tipoDaPeca(arquivo.name, arquivo.type)) { // PDF etc.: só limpa uma prévia antiga, se houver
    if (criativo.previaPath || criativo.previaUrl) removerPrevia(criativo).catch(() => {});
    return;
  }
  salvarPrevia(cliente, criativo, arquivo)
    .then((p) => { if (p?.previaUrl) { toast('Prévia reduzida para o link de aprovação pronta (o original segue em qualidade total).'); aoTerminar?.(); } })
    .catch((e) => toast(`A peça foi salva, mas não consegui gerar a prévia reduzida para o link de aprovação. ${e.message || e}`, 'erro'));
}
