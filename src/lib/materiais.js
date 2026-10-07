// Materiais do cliente (Storage + gcc_materiais): fotos do site/Instagram, prints de prova social e o LOGO.
// Uma única função de envio (salvarMaterial) para todos. O arquivo vai como veio: nada aqui converte nem recomprime
// (o logo precisa manter o PNG/SVG original, com transparência).
import { db, COL, removerArquivo } from '../core/storage.js';
import { DEMO } from '../core/firebase.js';
import { enviarArquivoOuAvisar } from './uploads.js';
import { novosCodigos, planoMigracao, proximaOrdem, normalizarUsos } from './fotos-site.js';

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
 *  - { trocando: 'logo' | 'referencia' } — troca do logo ou do print de referência, e só apaga material dessa origem;
 *  - { desfazendoMigracao: true } — só registro criado pela migração das fotos dos produtos; o ARQUIVO fica (é do produto).
 * Sem isso, recusa: nenhum outro fluxo (envio de prints, borrar, "É print de cliente"...) pode sumir com um arquivo.
 * `manterArquivo`: o registro sai, mas o arquivo (e a cópia borrada) ficam no Storage porque um link de aprovação já
 * enviado mostra a foto; o caminho vai para cliente.arquivosRetidos (apagado junto se o cliente for apagado).
 * Depois de sair, nenhuma referência fica para trás no site (imagem escolhida nos ajustes, depoimento do print).
 */
export async function removerMaterial(cliente, m, { confirmado = false, trocando = null, desfazendoMigracao = false, manterArquivo = false } = {}) {
  if (!m?.id) throw new Error('Material inválido.');
  const soRegistro = desfazendoMigracao && Boolean(m.migradoDe);
  if (!confirmado && !soRegistro && !(trocando && ['logo', 'referencia'].includes(trocando) && m.origem === trocando)) {
    throw new Error('Apagar um material só pelo botão de apagar, com confirmação.');
  }
  const guardar = manterArquivo && !soRegistro;
  if (!soRegistro && !guardar) await removerArquivo(m.path);
  if (m.borrada?.path && !guardar) await removerArquivo(m.borrada.path); // cópia borrada do print (o site usa ela)
  if (guardar) await reterArquivos(cliente.id, [m.path, m.borrada?.path].filter(Boolean), 'link de aprovação já enviado');
  await db.remover(COL.materiais, m.id);
  await limparReferenciasMaterial(cliente.id, m.id);
  // Print de resultado (aba Campanhas): o registro do print sai junto (os resultados já salvos a partir dele ficam).
  if (m.origem === 'print_resultado') for (const p of await db.listar(COL.printsResultado, { materialId: m.id }).catch(() => [])) await db.remover(COL.printsResultado, p.id);
  if (cliente.logoArquivo?.materialId === m.id) { await db.atualizar(COL.clientes, cliente.id, { logoArquivo: null }); cliente.logoArquivo = null; }
}

/** Arquivos que ficaram no Storage só para um link de aprovação já enviado (apagados junto com o cliente). */
async function reterArquivos(clienteId, paths, motivo) {
  const c = await db.obter(COL.clientes, clienteId).catch(() => null);
  const atuais = c?.arquivosRetidos || [];
  const novos = paths.filter((x) => !atuais.some((a) => a.path === x)).map((path) => ({ path, motivo, em: new Date().toISOString() }));
  if (novos.length) await db.atualizar(COL.clientes, clienteId, { arquivosRetidos: [...atuais, ...novos] }, { silencioso: true });
}

/** Tira do site do cliente o que apontava para o material (imagem dos ajustes rápidos, depoimento do print). */
export async function limparReferenciasMaterial(clienteId, materialId) {
  const sites = await db.listar(COL.sites, { clienteId }).catch(() => []);
  for (const st of sites) {
    const patch = {};
    const img = st.layout?.imagens || {};
    if (Object.values(img).some((v) => v?.materialId === materialId)) patch.layout = { ...st.layout, imagens: Object.fromEntries(Object.entries(img).filter(([, v]) => v?.materialId !== materialId)) };
    if (st.pacote?.visual?.banner?.materialId === materialId) patch.pacote = { ...st.pacote, visual: { ...st.pacote.visual, banner: null } };
    const deps = st.conteudo?.depoimentos || [];
    if (deps.some((d) => d?.materialId === materialId)) patch.conteudo = { ...st.conteudo, depoimentos: deps.filter((d) => d?.materialId !== materialId) };
    if (Object.keys(patch).length) await db.atualizar(COL.sites, st.id, patch, { silencioso: true });
  }
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

// ---------- código das fotos (F1, F2...) e "Usar em" (lib/fotos-site.js) ----------
const travaCodigos = new Map();
/**
 * Dá código às fotos que ainda não têm (as enviadas antes desta função, ou por outro caminho), continuando do contador
 * do cliente (`contadorFotos`): um código apagado nunca volta. Uma chamada por vez por cliente. Devolve a lista
 * atualizada (mesma ordem).
 */
export function garantirCodigos(cliente, lista) {
  const anterior = travaCodigos.get(cliente.id) || Promise.resolve();
  const atual = anterior.catch(() => {}).then(async () => {
    const { atribuir } = novosCodigos(lista, 0);
    if (!atribuir.length) return lista;
    const fresco = await db.obter(COL.clientes, cliente.id).catch(() => null);
    const { atribuir: finais, contador } = novosCodigos(lista, Math.max(Number(fresco?.contadorFotos) || 0, Number(cliente.contadorFotos) || 0));
    await db.atualizar(COL.clientes, cliente.id, { contadorFotos: contador }, { silencioso: true }); // o contador primeiro: nunca repete, mesmo se cair no meio
    cliente.contadorFotos = contador;
    for (const a of finais) await db.atualizar(COL.materiais, a.id, { codigo: a.codigo }, { silencioso: true });
    return lista.map((m) => { const a = finais.find((x) => x.id === m.id); return a ? { ...m, codigo: a.codigo } : m; });
  });
  travaCodigos.set(cliente.id, atual);
  return atual;
}
/** Grava os usos que mudaram ([{ id, usos }], de mudarUso/aplicarReferencias). */
export async function salvarUsos(patches = []) {
  for (const p of patches) await db.atualizar(COL.materiais, p.id, { usos: p.usos }, { silencioso: true });
}

// ---------- fotos dos produtos: um lugar só (Materiais) ----------
/**
 * Migra as fotos do campo antigo dos produtos para Materiais (mesmos arquivos, já ligados ao produto, mesma ordem e
 * mesma foto principal). Idempotente e reversível (desfazerMigracaoFotos); nada é apagado. Guarda o resumo em
 * cliente.migracaoFotos. Devolve { fotos, produtos, jaMigrados }.
 */
export async function migrarFotosProdutos(cliente) {
  const [produtos, materiais] = await Promise.all([db.listar(COL.produtos, { clienteId: cliente.id }), db.listar(COL.materiais, { clienteId: cliente.id })]);
  const { criar, marcar, jaMigrados } = planoMigracao(produtos, materiais, cliente.id);
  if (!marcar.length) return { fotos: 0, produtos: 0, jaMigrados };
  for (const m of criar) await db.criar(COL.materiais, m, undefined, { silencioso: true });
  for (const id of marcar) await db.atualizar(COL.produtos, id, { fotosMigradas: true }, { silencioso: true });
  const migracaoFotos = { em: new Date().toISOString(), fotos: (cliente.migracaoFotos?.fotos || 0) + criar.length, produtos: (cliente.migracaoFotos?.produtos || 0) + marcar.length };
  await db.atualizar(COL.clientes, cliente.id, { migracaoFotos }, { silencioso: true });
  cliente.migracaoFotos = migracaoFotos;
  return { fotos: criar.length, produtos: marcar.length, jaMigrados };
}
/** Desfaz a migração: tira só os REGISTROS criados por ela (o arquivo é do produto e fica) e volta o campo antigo a valer. */
export async function desfazerMigracaoFotos(cliente) {
  const [produtos, materiais] = await Promise.all([db.listar(COL.produtos, { clienteId: cliente.id }), db.listar(COL.materiais, { clienteId: cliente.id })]);
  const migrados = materiais.filter((m) => m.migradoDe);
  for (const m of migrados) await removerMaterial(cliente, m, { desfazendoMigracao: true }); // o arquivo continua no produto
  for (const p of produtos.filter((x) => x.fotosMigradas)) await db.atualizar(COL.produtos, p.id, { fotosMigradas: false }, { silencioso: true });
  await db.atualizar(COL.clientes, cliente.id, { migracaoFotos: null }, { silencioso: true });
  cliente.migracaoFotos = null;
  return { fotos: migrados.length };
}
/** Foto enviada no formulário do produto: vai para Materiais, já ligada ao produto (a 1ª do produto vira a principal). */
export async function enviarFotoDoProduto(cliente, produtoId, file, materiais = []) {
  const { tipo } = validarMaterial(file);
  const hash = await hashArquivo(file);
  const ordem = proximaOrdem(materiais, produtoId);
  const usos = normalizarUsos({ produtos: [{ id: produtoId, ordem, principal: ordem === 1, por: 'manual' }] });
  const m = await salvarMaterial(cliente, new Blob([file], { type: tipo }), ORIGEM_ENVIO, { tipo, nomeOriginal: file.name, tamanho: file.size, usos, ...(hash ? { hash } : {}) });
  return m;
}
