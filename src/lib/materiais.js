// Materiais do cliente (Storage + gcc_materiais): fotos do site/Instagram, prints de prova social e o LOGO.
// Uma única função de envio (salvarMaterial) para todos. O arquivo vai como veio: nada aqui converte nem recomprime
// (o logo precisa manter o PNG/SVG original, com transparência).
import { db, COL, removerArquivo } from '../core/storage.js';
import { DEMO } from '../core/firebase.js';
import { enviarArquivoOuAvisar } from './uploads.js';

const EXTENSOES = { 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/jpeg': 'jpg', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };

/** Guarda um arquivo em Materiais do cliente, exatamente com os bytes recebidos. Devolve o documento criado. */
export async function salvarMaterial(cliente, blob, origem, extra = {}) {
  const ext = EXTENSOES[blob.type] || 'jpg';
  const nome = `${origem}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const env = await enviarArquivoOuAvisar(`gcc/${cliente.id}/materiais/${nome}`, new File([blob], nome, { type: blob.type || 'image/jpeg' }));
  return db.criar(COL.materiais, { clienteId: cliente.id, url: env.url, path: env.path, nome, origem, ...extra });
}

// ---------- fotos e vídeos enviados pelo operador ("Materiais do cliente") ----------
export const ORIGEM_ENVIO = 'envio';
export const ACEITA_MATERIAL = 'image/png,image/jpeg,image/webp,video/mp4,video/quicktime,.png,.jpg,.jpeg,.webp,.mp4,.mov';
const TIPO_POR_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime' };
/** Limite por arquivo: o mesmo de hoje (regra do Storage: 100 MB; no modo demo, 3 MB). */
export const limiteMaterialMB = (demo = DEMO) => (demo ? 3 : 100);

/** Foto (PNG/JPG/WEBP) ou vídeo (MP4/MOV), dentro do limite. Devolve { tipo, video } ou lança Error com o motivo. */
export function validarMaterial(file, limiteMB = limiteMaterialMB()) {
  const ext = String(file?.name || '').toLowerCase().split('.').pop();
  const tipo = Object.values(TIPO_POR_EXT).includes(file?.type) ? file.type : TIPO_POR_EXT[ext];
  if (!tipo) throw new Error(`"${file?.name || 'arquivo'}": formato não aceito. Envie foto (PNG, JPG, WEBP) ou vídeo (MP4, MOV).`);
  if (file.size > limiteMB * 1024 * 1024) throw new Error(`"${file.name}" tem ${(file.size / 1048576).toFixed(1)} MB e passa do limite de ${limiteMB} MB por arquivo. Reduza o arquivo (ou envie o vídeo por link na pergunta 8).`);
  return { tipo, video: tipo.startsWith('video/') };
}

/** Impressão digital do arquivo ORIGINAL (SHA-256), para reconhecer o mesmo print enviado em dois lugares. */
export async function hashArquivo(file) {
  try { const h = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer()); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); } catch { return null; }
}

/** Envia vários arquivos (o tipo é detectado sozinho). Devolve { salvos: [docs], falhas: [mensagem] }; um erro não para os outros. */
export async function enviarMateriais(cliente, arquivos = [], aoProgresso = () => {}) {
  const salvos = [], falhas = [];
  for (const [i, file] of [...arquivos].entries()) {
    aoProgresso(i, arquivos.length, file.name);
    try {
      const { tipo } = validarMaterial(file);
      const hash = await hashArquivo(file);
      salvos.push(await salvarMaterial(cliente, new Blob([file], { type: tipo }), ORIGEM_ENVIO, { tipo, nomeOriginal: file.name, tamanho: file.size, ...(hash ? { hash } : {}) }));
    } catch (e) { falhas.push(e.message); }
  }
  return { salvos, falhas };
}

/**
 * Apaga um material (registro + arquivo no Storage). Se era o logo atual, o cliente fica sem logo.
 * ÚNICO lugar que apaga um material (fora apagar o cliente inteiro, em lib/cascata.js). Exige motivo explícito:
 *  - { confirmado: true } — a pessoa clicou em apagar e confirmou na janela;
 *  - { trocando: 'logo' | 'referencia' } — troca do logo ou do print de referência, e só apaga material dessa origem.
 * Sem isso, recusa: nenhum outro fluxo (envio de prints, borrar, "É print de cliente"...) pode sumir com um arquivo.
 */
export async function removerMaterial(cliente, m, { confirmado = false, trocando = null } = {}) {
  if (!m?.id) throw new Error('Material inválido.');
  if (!confirmado && !(trocando && ['logo', 'referencia'].includes(trocando) && m.origem === trocando)) {
    throw new Error('Apagar um material só pelo botão de apagar, com confirmação.');
  }
  await removerArquivo(m.path);
  if (m.borrada?.path) await removerArquivo(m.borrada.path); // cópia borrada do print (o site usa ela)
  await db.remover(COL.materiais, m.id);
  if (cliente.logoArquivo?.materialId === m.id) { await db.atualizar(COL.clientes, cliente.id, { logoArquivo: null }); cliente.logoArquivo = null; }
}

// ---------- logo (um atual por cliente) ----------
export const ORIGEM_LOGO = 'logo';
export const ACEITA_LOGO = 'image/png,image/svg+xml,image/jpeg,.png,.svg,.jpg,.jpeg';
export const AVISO_JPG = 'PNG com fundo transparente fica melhor.';
const POR_EXTENSAO = { png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

/** PNG, SVG ou JPG (o Windows às vezes manda SVG sem tipo: vale a extensão). Devolve { tipo, aviso } ou lança Error. */
export function validarLogo(file) {
  const ext = String(file?.name || '').toLowerCase().split('.').pop();
  const tipo = Object.values(POR_EXTENSAO).includes(file?.type) ? file.type : POR_EXTENSAO[ext];
  if (!tipo) throw new Error('Envie o logo em PNG, SVG ou JPG.');
  return { tipo, aviso: tipo === 'image/jpeg' ? AVISO_JPG : '' };
}

/** Logo atual entre os materiais (o mais recente com origem "logo"). */
export const logoAtual = (materiais = []) => materiais.filter((m) => m?.origem === ORIGEM_LOGO).sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')))[0] || null;

/**
 * Envia o logo ORIGINAL (mesmos bytes, mesmo tipo: nunca recomprimido nem convertido para JPEG), troca o anterior
 * (o arquivo antigo sai do Storage) e guarda o atalho em cliente.logoArquivo, usado pelo site, pelo Estúdio e pela
 * pergunta 9. Quem chama confirma a troca antes, quando já existe logo.
 */
export async function salvarLogo(cliente, file) {
  const { tipo } = validarLogo(file);
  const anteriores = (await db.listar(COL.materiais, { clienteId: cliente.id })).filter((m) => m.origem === ORIGEM_LOGO);
  const mat = await salvarMaterial(cliente, new Blob([file], { type: tipo }), ORIGEM_LOGO, { nomeOriginal: file.name, tamanho: file.size });
  for (const m of anteriores) await removerMaterial({ id: cliente.id }, m, { trocando: ORIGEM_LOGO }); // cliente "vazio": o logoArquivo é regravado logo abaixo
  const logoArquivo = { materialId: mat.id, url: mat.url, nome: file.name, tipo, em: new Date().toISOString() };
  await db.atualizar(COL.clientes, cliente.id, { logoArquivo });
  cliente.logoArquivo = logoArquivo;
  return mat;
}
