// Materiais do cliente (Storage + gcc_materiais): fotos do site/Instagram, prints de prova social e o LOGO.
// Uma única função de envio (salvarMaterial) para todos. O arquivo vai como veio: nada aqui converte nem recomprime
// (o logo precisa manter o PNG/SVG original, com transparência).
import { db, COL, removerArquivo } from '../core/storage.js';
import { enviarArquivoOuAvisar } from './uploads.js';

const EXTENSOES = { 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/jpeg': 'jpg' };

/** Guarda um arquivo em Materiais do cliente, exatamente com os bytes recebidos. Devolve o documento criado. */
export async function salvarMaterial(cliente, blob, origem, extra = {}) {
  const ext = EXTENSOES[blob.type] || 'jpg';
  const nome = `${origem}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const env = await enviarArquivoOuAvisar(`gcc/${cliente.id}/materiais/${nome}`, new File([blob], nome, { type: blob.type || 'image/jpeg' }));
  return db.criar(COL.materiais, { clienteId: cliente.id, url: env.url, path: env.path, nome, origem, ...extra });
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
  for (const m of anteriores) { await removerArquivo(m.path); await db.remover(COL.materiais, m.id); }
  const logoArquivo = { materialId: mat.id, url: mat.url, nome: file.name, tipo, em: new Date().toISOString() };
  await db.atualizar(COL.clientes, cliente.id, { logoArquivo });
  cliente.logoArquivo = logoArquivo;
  return mat;
}
