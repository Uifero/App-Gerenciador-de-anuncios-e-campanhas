// Login único de administrador (Firebase Auth e-mail/senha). Não existe tela de cadastro.
import { DEMO, app } from './firebase.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';

const auth = () => getAuth(app());
let demoUser = null;
try { demoUser = DEMO && localStorage.getItem('gcc_demo_user') ? { email: 'demo@local' } : null; } catch { /* sem storage */ }

const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f(demoUser));

export function aoMudarUsuario(cb) {
  if (DEMO) { ouvintes.add(cb); cb(demoUser); return () => ouvintes.delete(cb); }
  return onAuthStateChanged(auth(), cb);
}

export async function entrar(email, senha) {
  if (DEMO) {
    if (email && senha) { demoUser = { email }; localStorage.setItem('gcc_demo_user', '1'); avisar(); return demoUser; }
    throw new Error('Informe e-mail e senha.');
  }
  try {
    const r = await signInWithEmailAndPassword(auth(), email, senha);
    return r.user;
  } catch (e) {
    const m = {
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco.',
      'auth/invalid-email': 'E-mail inválido.',
    };
    throw new Error(m[e.code] || 'Não foi possível entrar. Verifique os dados.');
  }
}

export async function sair() {
  if (DEMO) { demoUser = null; localStorage.removeItem('gcc_demo_user'); avisar(); return; }
  await signOut(auth());
}

export async function tokenAtual() {
  if (DEMO) return 'demo';
  const u = auth().currentUser;
  if (!u) throw new Error('Sessão expirada. Entre novamente.');
  return u.getIdToken();
}
