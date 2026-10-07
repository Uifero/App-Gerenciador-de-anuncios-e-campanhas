// Ponto de entrada: autenticação obrigatória, layout e roteador por hash.
import './style.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { aoMudarUsuario, entrar, sair } from './core/auth.js';
import { DEMO } from './core/firebase.js';
import { esc, $, on, ativarCamposArquivo, fecharModais } from './core/ui.js';
import { ligarSalvamento, podeSair } from './core/salvamento.js';
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
import * as modelosPrompt from './modules/modelos-prompt.js';
import * as onboarding from './modules/onboarding.js';
import { viewPublica } from './modules/aprovacao.js';
import { montarBusca } from './modules/busca.js';
import { aplicarTema, alternarTema, temaAtual } from './core/tema.js';

aplicarTema();
ativarCamposArquivo();

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

// Celular (abaixo de md): só uma barra fina fica fixa no topo; a busca abre pelo ícone e o menu pelo ☰.
// Computador: o mesmo cabeçalho de sempre (título, busca, menu numa linha).
const fecharTopo = () => {
  for (const [botao, alvo] of [['[data-abrir-menu]', '#menu-topo'], ['[data-abrir-busca]', '#busca-slot']]) {
    const b = $(botao), a = $(alvo); if (!b || !a) continue;
    b.setAttribute('aria-expanded', 'false'); a.classList.add('hidden'); a.classList.remove('flex');
  }
};

function layout() {
  app.innerHTML = `<header class="sticky top-0 z-30 border-b border-slate-200 bg-white"><div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 md:py-3">
    <a href="#/" class="font-bold text-slate-900" title="Gerenciador de Criativos e Campanhas">🎯 <span class="md:hidden">Gerenciador</span><span class="hidden md:inline">Gerenciador de Criativos e Campanhas</span></a>
    <div class="ml-auto flex items-center gap-1 md:hidden"><button type="button" class="btn-ghost btn-sm" data-abrir-busca aria-controls="busca-slot" aria-expanded="false" aria-label="Buscar" title="Buscar clientes, criativos e hooks"><i class="fa-solid fa-magnifying-glass"></i></button>
      <button type="button" class="btn-ghost btn-sm" data-abrir-menu aria-controls="menu-topo" aria-expanded="false" aria-label="Menu" title="Menu"><i class="fa-solid fa-bars"></i></button></div>
    <div id="busca-slot" class="order-last hidden w-full md:order-none md:ml-2 md:block md:w-auto md:min-w-[7rem] md:flex-1"></div>
    <nav id="menu-topo" class="order-last hidden w-full flex-col items-stretch gap-1 pb-1 text-sm md:order-none md:ml-auto md:flex md:w-auto md:flex-row md:items-center md:pb-0" aria-label="Menu principal"><a class="btn-ghost btn-sm !justify-start md:!justify-center" href="#/" title="Visão geral de todos os clientes"><i class="fa-solid fa-house"></i> <span>Início</span></a>
      <a class="btn-ghost btn-sm !justify-start md:!justify-center" href="#/playbooks" title="Receitas de ângulos e hooks por tipo de produto"><i class="fa-solid fa-book-open"></i> <span>Playbooks</span></a>
      <a class="btn-ghost btn-sm !justify-start md:!justify-center" href="#/modelos" title="Modelos prontos de prompt para editar ou gerar fotos de produto"><i class="fa-solid fa-swatchbook"></i> <span>Modelos de Prompt</span></a>
      <a class="btn-ghost btn-sm !justify-start md:!justify-center" href="#/config" title="Ajustes globais"><i class="fa-solid fa-gear"></i> <span>Configurações</span></a>
      <button class="btn-ghost btn-sm !justify-start md:!justify-center" id="tema" title="Alternar tema claro/escuro" aria-label="Alternar tema claro/escuro"><i class="fa-solid fa-${iconeTema()}"></i><span class="md:hidden">Tema claro/escuro</span></button>
      <button class="btn-ghost btn-sm !justify-start md:!justify-center" id="sair" title="Encerrar a sessão"><i class="fa-solid fa-right-from-bracket"></i> <span>Sair</span></button></nav></div></header>
    <main id="main" class="mx-auto max-w-6xl px-4 py-6"></main>`;
  $('#sair').addEventListener('click', () => sair());
  $('#tema').addEventListener('click', (e) => { alternarTema(); e.currentTarget.querySelector('i').className = `fa-solid fa-${iconeTema()}`; });
  // Celular: ☰ e a lupa abrem um de cada vez; trocar de tela fecha os dois.
  for (const [botao, alvo, depois] of [['[data-abrir-menu]', '#menu-topo', null], ['[data-abrir-busca]', '#busca-slot', () => $('#busca')?.focus()]]) {
    $(botao).addEventListener('click', (e) => {
      const abrir = e.currentTarget.getAttribute('aria-expanded') !== 'true';
      fecharTopo();
      if (!abrir) return;
      e.currentTarget.setAttribute('aria-expanded', 'true'); $(alvo).classList.remove('hidden'); if (alvo === '#menu-topo') $(alvo).classList.add('flex');
      depois?.();
    });
  }
  window.addEventListener('hashchange', fecharTopo);
  montarBusca($('#busca-slot'), () => rotear());
  // Quem respondeu a última chamada de IA: a assinatura do Claude (sem custo por token) ou a reserva (API, paga).
  // Antes da primeira chamada, mostra o que o servidor vai usar agora (/api/saude).
  $('#tema').insertAdjacentHTML('beforebegin', '<span id="ia-provedor" class="hidden"></span>');
  const pintar = (prov, ultima) => {
    const el = $('#ia-provedor'); if (!el) return;
    const reserva = prov === 'api';
    el.className = `tag ${reserva ? 'tag-warn' : 'tag-info'}`;
    el.dataset.provedor = reserva ? 'reserva' : 'assinatura';
    el.title = `${ultima ? 'A última chamada de IA foi respondida' : 'As chamadas de IA estão indo'} pela ${reserva ? 'reserva (API da Anthropic, cobrada por token). Isso acontece quando o limite da assinatura acaba.' : 'assinatura do Claude (sem custo por token).'}`;
    // Assinatura (o normal) fica só no ícone até telas bem largas, para a busca caber; reserva é alerta e sempre tem texto.
    el.setAttribute('aria-label', `IA: ${reserva ? 'reserva' : 'assinatura'}`);
    el.innerHTML = `<i class="fa-solid fa-${reserva ? 'key' : 'user-check'}"></i><span class="${reserva ? '' : 'md:hidden 2xl:inline'} ml-1">IA: ${reserva ? 'reserva' : 'assinatura'}</span>`;
  };
  fetch('/api/saude').then((r) => r.json()).then((s) => { if (!$('#ia-provedor')?.dataset.provedor) pintar(s.provedor); }).catch(() => {});
  window.addEventListener('gcc:ia-provedor', (e) => pintar(e.detail?.provedor, true));
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
    else if (partes[0] === 'modelos') await modelosPrompt.view(main);
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
// Ícones Font Awesome são decorativos em todo o app (painel e links públicos): o nome vem do texto do botão ou do
// aria-label dele. Um observador só, em vez de aria-hidden em cada um dos centenas de <i> dos módulos.
const esconderIcones = (n) => { if (n.nodeType !== 1) return; if (n.matches('i[class*="fa-"]')) n.setAttribute('aria-hidden', 'true'); else n.querySelectorAll('i[class*="fa-"]:not([aria-hidden])').forEach((i) => i.setAttribute('aria-hidden', 'true')); };
esconderIcones(document.body);
new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(esconderIcones))).observe(document.body, { childList: true, subtree: true });
// Texto não salvo: ao trocar de tela, pergunta antes (confirmação nativa). Se a pessoa ficar, a barra de endereço volta
// para a tela atual sem recarregar nada (replaceState não dispara outro hashchange).
ligarSalvamento();
let rotaAtual = location.hash;
window.addEventListener('hashchange', () => {
  if (!podeSair()) { history.replaceState(null, '', rotaAtual || '#/'); return; }
  rotaAtual = location.hash;
  fecharModais(); // janela da tela anterior não fica por cima da nova
  if (verPublico()) return;
  if (!usuario) { telaLogin(); return; }   // saiu do link público sem estar logado
  if (!$('#main')) layout();               // voltando de um link público para o painel
  rotear();
});
