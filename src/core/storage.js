// Camada de dados: Firestore (coleções com prefixo "gcc_") + Firebase Storage.
// No modo DEMO (só testes locais, VITE_DEMO_MODE=1) usa localStorage; o resto do app não percebe.
import { DEMO, app } from './firebase.js';
import {
  getFirestore, collection, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc, doc, query, where,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

export const COL = {
  config: 'gcc_configuracoes', clientes: 'gcc_clientes', criativos: 'gcc_criativos', hooks: 'gcc_hooks',
  referencias: 'gcc_referencias', campanhas: 'gcc_campanhas', resultados: 'gcc_resultados',
  produtos: 'gcc_produtos', sites: 'gcc_sites', playbooks: 'gcc_playbooks',
  usoApi: 'gcc_uso_api', aprovacoes: 'gcc_aprovacoes', respostas: 'gcc_aprovacao_respostas',
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

export const db = {
  /** Lista documentos; `filtro` é igualdade simples (ex.: {clienteId}). Ordena por criadoEm desc. */
  async listar(col, filtro) {
    const r = await drv.listar(col, filtro);
    return r.sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
  },
  obter: (col, id) => drv.obter(col, id),
  /** Grava um documento exatamente como veio (sem criadoEm/atualizadoEm). Usado nas respostas públicas de aprovação, cujas regras aceitam só campos específicos. */
  async definir(col, id, dados) { await drv.criar(col, semUndefined(dados), id); avisar(col); },
  async criar(col, dados, id) {
    const d = semUndefined({ ...dados, criadoEm: agora(), atualizadoEm: agora() });
    const nid = await drv.criar(col, d, id);
    avisar(col);
    return { id: nid, ...d };
  },
  async atualizar(col, id, patch) { await drv.atualizar(col, id, semUndefined({ ...patch, atualizadoEm: agora() })); avisar(col); },
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
export async function removerArquivo(caminho) {
  if (DEMO || !caminho) return;
  try { await deleteObject(ref(getStorage(app()), caminho)); } catch { /* já removido */ }
}
