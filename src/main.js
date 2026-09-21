// Ponto de entrada: autenticação obrigatória, layout e roteador por hash.
import './style.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { aoMudarUsuario, entrar, sair } from './core/auth.js';
import { DEMO } from './core/firebase.js';
import { esc, $, on } from './core/ui.js';
import * as dashboard from './modules/dashboard.js';
import * as configuracoes from './modules/configuracoes.js';
import * as clientes from './modules/clientes.js';
import * as criativos from './modules/criativos.js';
import * as hooks from './modules/hooks.js';
import * as referencias from './modules/referencias.js';
import * as campanhas from './modules/campanhas.js';
import * as resultados from './modules/resultados.js';
import * as produtos from './modules/produtos.js';
import * as sites from './modules/sites.js';
import * as relatorios from './modules/relatorios.js';
import * as playbooks from './modules/playbooks.js';
import * as onboarding from './modules/onboarding.js';
import { viewPublica } from './modules/aprovacao.js';
import { montarBusca } from './modules/busca.js';
import { aplicarTema, alternarTema, temaAtual } from './core/tema.js';

aplicarTema();

// Registro das abas do cliente (id do escopo -> renderizador).
const ABAS = {
  criativos: criativos.view, hooks: hooks.view, referencias: referencias.view, campanhas: campanhas.view,
  resultados: resultados.view, produtos: produtos.view, site: sites.view, relatorio: relatorios.view,
};

const app = document.getElementById('app');
const TITULO = 'Gerenciador de Criativos e Campanhas';
let usuario = null;
let seq = 0;

function telaLogin() {
  document.title = TITULO; // a página pública de aprovação troca o título; aqui volta ao normal
  app.innerHTML = `<div class="flex min-h-screen items-center justify-center p-4"><form id="login" class="card w-full max-w-sm space-y-4">
    <div class="text-center"><div class="text-4xl">🎯</div><h1 class="text-xl font-bold">Gerenciador de Criativos e Campanhas</h1><p class="caption">Acesso restrito ao administrador.</p></div>
    ${DEMO ? '<p class="rounded bg-amber-50 p-2 text-xs text-amber-800">Modo DEMO (testes locais): qualquer e-mail/senha entra; dados ficam só neste navegador.</p>' : ''}
    <div><label class="label" for="email">E-mail</label><input id="email" class="input" type="email" name="email" autocomplete="username" required></div>
    <div><label class="label" for="senha">Senha</label><input id="senha" class="input" type="password" name="senha" autocomplete="current-password" required></div>
    <p id="erro" class="hidden text-sm text-rose-600" role="alert"></p>
    <button class="btn-primary w-full" type="submit">Entrar</button></form></div>`;
  $('#login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('#login button'); btn.disabled = true;
    try { await entrar($('#email').value.trim(), $('#senha').value); }
    catch (e) { const p = $('#erro'); p.textContent = e.message; p.classList.remove('hidden'); btn.disabled = false; }
  });
}

function iconeTema() { return temaAtual() === 'escuro' ? 'sun' : 'moon'; }

function layout() {
  app.innerHTML = `<header class="sticky top-0 z-30 border-b border-slate-200 bg-white"><div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
    <a href="#/" class="font-bold text-slate-900">🎯 Gerenciador de Criativos e Campanhas</a>
    <div id="busca-slot" class="order-last w-full md:order-none md:ml-2 md:flex-1"></div>
    <nav class="ml-auto flex items-center gap-1 text-sm"><a class="btn-ghost btn-sm" href="#/" title="Visão geral de todos os clientes"><i class="fa-solid fa-house"></i> <span class="hidden sm:inline">Início</span></a>
      <a class="btn-ghost btn-sm" href="#/playbooks" title="Receitas de ângulos e hooks por tipo de produto"><i class="fa-solid fa-book-open"></i> <span class="hidden sm:inline">Playbooks</span></a>
      <a class="btn-ghost btn-sm" href="#/config" title="Ajustes globais"><i class="fa-solid fa-gear"></i> <span class="hidden sm:inline">Configurações</span></a>
      <button class="btn-ghost btn-sm" id="tema" title="Alternar tema claro/escuro" aria-label="Alternar tema claro/escuro"><i class="fa-solid fa-${iconeTema()}"></i></button>
      <button class="btn-ghost btn-sm" id="sair" title="Encerrar a sessão"><i class="fa-solid fa-right-from-bracket"></i> <span class="hidden sm:inline">Sair</span></button></nav></div></header>
    <main id="main" class="mx-auto max-w-6xl px-4 py-6"></main>`;
  $('#sair').addEventListener('click', () => sair());
  $('#tema').addEventListener('click', (e) => { alternarTema(); e.currentTarget.innerHTML = `<i class="fa-solid fa-${iconeTema()}"></i>`; });
  montarBusca($('#busca-slot'), () => rotear());
  // Aviso discreto quando a IA está usando a assinatura do Claude (modo de desenvolvimento) em vez da API paga.
  fetch('/api/saude').then((r) => r.json()).then((s) => {
    if (s.provedor === 'cli' && $('#tema')) $('#tema').insertAdjacentHTML('beforebegin', '<span class="tag tag-info" title="As chamadas de IA usam a sua assinatura do Claude (CLI), sem custo por token. Ao configurar a chave da API, o servidor passa a usá-la como reserva."><i class="fa-solid fa-user-check mr-1"></i>IA: assinatura</span>');
  }).catch(() => {});
}

async function rotear() {
  if (!usuario) return;
  document.title = TITULO;
  const minha = ++seq;
  const antigo = $('#main');
  const main = document.createElement('main');   // nó novo a cada rota: descarta listeners antigos
  main.id = 'main'; main.className = antigo.className;
  antigo.replaceWith(main);
  const partes = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  main.innerHTML = '<p class="caption"><i class="fa-solid fa-spinner fa-spin"></i> Carregando…</p>';
  try {
    if (!partes.length) await dashboard.view(main);
    else if (partes[0] === 'config') await configuracoes.view(main);
    else if (partes[0] === 'playbooks') await playbooks.view(main);
    else if (partes[0] === 'clientes' && partes[1] === 'novo' && partes[2] === 'assistente') await onboarding.view(main);
    else if (partes[0] === 'clientes' && partes[1] === 'novo' && partes[2] === 'completo') {
      let baseId = null;   // vindo de "Duplicar como base"
      try { baseId = sessionStorage.getItem('gcc_base'); sessionStorage.removeItem('gcc_base'); } catch { /* sem storage */ }
      await clientes.viewForm(main, null, { baseId });
    }
    else if (partes[0] === 'clientes' && partes[1] === 'novo') await clientes.viewNovo(main);
    else if (partes[0] === 'c' && partes[2] === 'editar') await clientes.viewForm(main, partes[1]);
    else if (partes[0] === 'c') await clientes.viewCliente(main, partes[1], partes[2], ABAS);
    else main.innerHTML = '<p class="caption">Página não encontrada. <a class="text-indigo-600" href="#/">Voltar ao início</a></p>';
    if (minha === seq) window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="card text-rose-700"><b>Não foi possível carregar.</b><p class="text-sm">${esc(e.message)}</p>
      ${/permission|insufficient/i.test(e.message) ? '<p class="mt-2 text-sm">Parece um bloqueio das regras de segurança. Publique as regras do Firestore/Storage (veja o README).</p>' : ''}</div>`;
  }
}

// Página pública do link de aprovação (#/aprovar/<token>): funciona SEM login e mostra só a peça enviada.
function verPublico() {
  const m = location.hash.match(/^#\/aprovar\/([\w-]+)$/);
  if (!m) return false;
  viewPublica(app, m[1]);
  return true;
}

aoMudarUsuario((u) => {
  usuario = u;
  if (verPublico()) return;
  if (!u) { telaLogin(); return; }
  layout(); rotear();
});
window.addEventListener('hashchange', () => {
  if (verPublico()) return;
  if (!usuario) { telaLogin(); return; }   // saiu do link público sem estar logado
  if (!$('#main')) layout();               // voltando de um link público para o painel
  rotear();
});
