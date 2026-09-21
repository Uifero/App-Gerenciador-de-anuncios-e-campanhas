// Dashboard geral: visão consolidada de todos os clientes, com o próximo passo óbvio.
import { db, COL } from '../core/storage.js';
import { obterConfig } from './configuracoes.js';
import { cartaoCliente } from './clientes.js';
import { cabecalho, vazio, diasDesde, esc, tag } from '../core/ui.js';

export async function view(el) {
  const [clientes, criativos, campanhas, cfg] = await Promise.all([
    db.listar(COL.clientes), db.listar(COL.criativos), db.listar(COL.campanhas), obterConfig(),
  ]);
  const acoes = '<a class="btn-primary" href="#/clientes/novo" title="Cadastrar um novo cliente"><i class="fa-solid fa-plus"></i> Novo cliente</a>';

  if (!clientes.length) {
    el.innerHTML = cabecalho('Início', 'Visão geral de todos os clientes.') +
      vazio('users', 'Vamos começar?', 'Cadastre seu primeiro cliente. Leva menos de 2 minutos e o resto do app se adapta a ele.', acoes);
    return;
  }

  const fadiga = criativos.filter((c) => c.status === 'em_uso' && (diasDesde(c.emUsoDesde) ?? 0) >= cfg.diasFadiga);
  const nomeDe = (id) => clientes.find((c) => c.id === id)?.nome || 'cliente';
  const total = (k, v) => criativos.filter((c) => c[k] === v).length;

  el.innerHTML = `${cabecalho('Início', 'Visão consolidada de todos os clientes.', acoes)}
    <div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      ${[['Clientes', clientes.length], ['Criativos em uso', total('status', 'em_uso')], ['Aguardando aprovação', total('status', 'rascunho')], ['Campanhas ativas', campanhas.filter((c) => c.status === 'ativa').length]]
        .map(([k, v]) => `<div class="card"><p class="caption">${k}</p><p class="text-2xl font-bold">${v}</p></div>`).join('')}</div>
    ${fadiga.length ? `<div class="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"><b><i class="fa-solid fa-triangle-exclamation"></i> Criativos com fadiga (mais de ${cfg.diasFadiga} dias no ar):</b>
      <ul class="mt-1 list-disc pl-5">${fadiga.map((c) => `<li><a class="underline" href="#/c/${c.clienteId}/campanhas">${esc(nomeDe(c.clienteId))}</a> — ${esc(c.nome)} (${diasDesde(c.emUsoDesde)} dias)</li>`).join('')}</ul></div>` : ''}
    <h3 class="mb-3 font-semibold">Seus clientes</h3>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${clientes.map((c) => {
      const cs = criativos.filter((x) => x.clienteId === c.id);
      const extra = `<div class="mt-3 flex flex-wrap gap-1">${tag(cs.length + ' criativos')}${tag(cs.filter((x) => x.status === 'em_uso').length + ' em uso', 'tag-ok')}
        ${cs.some((x) => x.status === 'em_uso' && (diasDesde(x.emUsoDesde) ?? 0) >= cfg.diasFadiga) ? tag('fadiga', 'tag-bad') : ''}</div>`;
      return cartaoCliente(c, extra);
    }).join('')}</div>`;
}
