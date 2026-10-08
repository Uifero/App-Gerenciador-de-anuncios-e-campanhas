// Camada de dados: Firestore (coleções com prefixo "gcc_") + Firebase Storage.
// No modo DEMO (só testes locais, VITE_DEMO_MODE=1) usa localStorage; o resto do app não percebe.
import { DEMO, app } from './firebase.js';
import {
  getFirestore, collection, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc, doc, query, where,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { ehCaminhoDePeca } from '../lib/pecas.js';

export const COL = {
  config: 'gcc_configuracoes', clientes: 'gcc_clientes', criativos: 'gcc_criativos', hooks: 'gcc_hooks',
  referencias: 'gcc_referencias', campanhas: 'gcc_campanhas', resultados: 'gcc_resultados',
  produtos: 'gcc_produtos', sites: 'gcc_sites', playbooks: 'gcc_playbooks',
  usoApi: 'gcc_uso_api', aprovacoes: 'gcc_aprovacoes', respostas: 'gcc_aprovacao_respostas',
  diagnosticos: 'gcc_diagnosticos', diagnosticoImagens: 'gcc_diagnostico_imagens',
  materiais: 'gcc_materiais', // fotos salvas do cliente (ex.: importadas do site dele) para usar no Estúdio
  // "Analisar e recomendar" / plano de otimização (com data), tarefas aceitas, prints de resultado (o arquivo fica em
  // Materiais, origem print_resultado), documentos de referência (clienteId null = vale para todos) e o cache da
  // pesquisa web por nicho + destino. Todos internos: nunca vão para o site nem para link de aprovação.
  analises: 'gcc_analises_anuncio', tarefas: 'gcc_tarefas_anuncio', printsResultado: 'gcc_prints_resultado',
  documentos: 'gcc_documentos', pesquisas: 'gcc_pesquisas_nicho',
  // Peças finalizadas no Estúdio (imagem/vídeo no Storage em gcc/<cliente>/pecas/), ligadas ao criativo e ao produto.
  pecas: 'gcc_pecas',
};

const agora = () => new Date().toISOString();
const semUndefined = (o) => JSON.parse(JSON.stringify(o));

// ---------- driver local (demo) ----------
const L = {
  ler: (c) => { try { return JSON.parse(localStorage.getItem('gccdb_' + c) || '{}'); } catch { return {}; } },
  gravar: (c, d) => localStorage.setItem('gccdb_' + c, JSON.stringify(d)),
};
const local = {
  async listar(c, filtro) {
    return Object.entries(L.ler(c)).map(([id, v]) => ({ id, ...v }))
      .filter((d) => !filtro || Object.entries(filtro).every(([k, v]) => d[k] === v));
  },
  async obter(c, id) { const v = L.ler(c)[id]; return v ? { id, ...v } : null; },
  async criar(c, dados, id) {
    const all = L.ler(c);
    id = id || 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    all[id] = dados; L.gravar(c, all); return id;
  },
  async atualizar(c, id, patch) { const all = L.ler(c); all[id] = { ...all[id], ...patch }; L.gravar(c, all); },
  async remover(c, id) { const all = L.ler(c); delete all[id]; L.gravar(c, all); },
};

// ---------- driver Firestore ----------
let _db;
const fdb = () => (_db ||= getFirestore(app()));
const remoto = {
  async listar(c, filtro) {
    let q = collection(fdb(), c);
    if (filtro) q = query(q, ...Object.entries(filtro).map(([k, v]) => where(k, '==', v)));
    return (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  async obter(c, id) { const s = await getDoc(doc(fdb(), c, id)); return s.exists() ? { id, ...s.data() } : null; },
  async criar(c, dados, id) {
    if (id) { await setDoc(doc(fdb(), c, id), dados); return id; }
    return (await addDoc(collection(fdb(), c), dados)).id;
  },
  async atualizar(c, id, patch) { await updateDoc(doc(fdb(), c, id), patch); },
  async remover(c, id) { await deleteDoc(doc(fdb(), c, id)); },
};

const drv = DEMO ? local : remoto;

/** Avisa a interface que uma coleção mudou (ex.: o card de progresso do cliente se recalcula). */
const avisar = (col) => { try { window.dispatchEvent(new CustomEvent('gcc:mudou', { detail: { col } })); } catch { /* fora do navegador */ } };
/**
 * Avisa que o USUÁRIO salvou algo (a tela mostra "Salvo às HH:MM" e limpa o aviso de texto não salvo do formulário enviado).
 * Gravações automáticas (custo de IA, sincronização, prévia em segundo plano...) passam { silencioso: true } e não avisam.
 */
const COLS_SEMPRE_SILENCIOSAS = new Set([COL.usoApi]);
const avisarSalvo = (col, opts) => {
  if (opts?.silencioso || COLS_SEMPRE_SILENCIOSAS.has(col)) return;
  try { window.dispatchEvent(new CustomEvent('gcc:salvou', { detail: { col } })); } catch { /* fora do navegador */ }
};

export const db = {
  /** Lista documentos; `filtro` é igualdade simples (ex.: {clienteId}). Ordena por criadoEm desc. */
  async listar(col, filtro) {
    const r = await drv.listar(col, filtro);
    return r.sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
  },
  obter: (col, id) => drv.obter(col, id),
  /** Grava um documento exatamente como veio (sem criadoEm/atualizadoEm). Usado nas respostas públicas de aprovação, cujas regras aceitam só campos específicos. */
  // opts (último parâmetro, opcional): { silencioso: true } para gravações automáticas, que não são um "salvar" do usuário.
  async definir(col, id, dados, opts) { await drv.criar(col, semUndefined(dados), id); avisar(col); avisarSalvo(col, opts); },
  async criar(col, dados, id, opts) {
    const d = semUndefined({ ...dados, criadoEm: agora(), atualizadoEm: agora() });
    const nid = await drv.criar(col, d, id);
    avisar(col); avisarSalvo(col, opts);
    return { id: nid, ...d };
  },
  async atualizar(col, id, patch, opts) { await drv.atualizar(col, id, semUndefined({ ...patch, atualizadoEm: agora() })); avisar(col); avisarSalvo(col, opts); },
  async remover(col, id) { await drv.remover(col, id); avisar(col); },
};

// ---------- arquivos ----------
export async function enviarArquivo(caminho, file) {
  if (DEMO) {
    if (file.size > 3 * 1024 * 1024) throw new Error('No modo demo, o limite é 3 MB.');
    const url = await new Promise((ok, err) => {
      const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = err; r.readAsDataURL(file);
    });
    return { url, path: caminho };
  }
  const r = ref(getStorage(app()), caminho);
  await uploadBytes(r, file, { contentType: file.type });
  return { url: await getDownloadURL(r), path: caminho };
}
// Arquivo de peça da Galeria (gcc/<cliente>/pecas/) só sai pela exclusão da própria peça ({ peca: true }): a peça pode
// estar como peça final de um criativo, e trocar/remover a peça final ali não pode apagar o arquivo da Galeria.
export async function removerArquivo(caminho, { peca = false } = {}) {
  if (DEMO || !caminho) return;
  if (ehCaminhoDePeca(caminho) && !peca) return;
  try { await deleteObject(ref(getStorage(app()), caminho)); } catch { /* já removido */ }
}

/**
 * Envio com progresso (0..1) e nome de download: `nomeDownload` vira o Content-Disposition, então o link do arquivo
 * baixa com o nome certo mesmo sem CORS no bucket. No demo, vira data URL (limite de 3 MB, como enviarArquivo).
 */
export async function enviarArquivoComProgresso(caminho, blob, { tipo = blob.type, nomeDownload = '', aoProgresso = () => {} } = {}) {
  if (DEMO) {
    if (blob.size > 3 * 1024 * 1024) throw new Error('No modo demo, o limite é 3 MB.');
    const url = await new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = err; r.readAsDataURL(blob); });
    aoProgresso(1);
    return { url, path: caminho };
  }
  const r = ref(getStorage(app()), caminho);
  const meta = { contentType: tipo, ...(nomeDownload ? { contentDisposition: `attachment; filename="${nomeDownload.replace(/[^\w.-]/g, '_')}"` } : {}) };
  await new Promise((ok, falha) => {
    const t = uploadBytesResumable(r, blob, meta);
    t.on('state_changed', (s) => aoProgresso(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), falha, ok);
  });
  return { url: await getDownloadURL(r), path: caminho };
}
