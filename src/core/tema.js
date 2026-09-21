// Tema claro/escuro. A preferência fica só neste navegador (localStorage); sem escolha salva, segue o sistema.
const CHAVE = 'gcc_tema';

const salvo = () => { try { return localStorage.getItem(CHAVE); } catch { return null; } };

export function temaAtual() {
  const s = salvo();
  if (s === 'escuro' || s === 'claro') return s;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

export function aplicarTema() {
  document.documentElement.classList.toggle('dark', temaAtual() === 'escuro');
}

export function alternarTema() {
  const novo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
  try { localStorage.setItem(CHAVE, novo); } catch { /* sem storage: vale só nesta sessão */ }
  document.documentElement.classList.toggle('dark', novo === 'escuro');
  return novo;
}
