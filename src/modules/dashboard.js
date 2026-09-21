// Dashboard geral: visão consolidada de todos os clientes, central de alertas e o próximo passo óbvio.
import { db, COL } from '../core/storage.js';
import { obterConfig } from './configuracoes.js';
import { cartaoCliente } from './clientes.js';
import { resumoCliente, semaforoHtml, agregar, painelAlertas } from './alertas.js';
import { cabecalho, vazio, tag, ocupado } from '../core/ui.js';
import { estadoOrcamento, definirMes, mesDe, usd, brl } from './custo.js';
import { exportarDados } from './backup.js';

export async function view(el) {
  el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-exportar-tudo]'); if (b) ocupado(b, () => exportarDados(null)); });
  const [clientes, criativos, campanhas, resultados, sites, cfg, usoMes] = await Promise.all([
    db.listar(COL.clientes), db.listar(COL.criativos), db.listar(COL.campanhas), db.listar(COL.resultados), db.listar(COL.sites), obterConfig(),
    db.listar(COL.usoApi, { mes: mesDe() }),
  ]);
  definirMes(usoMes); // mantém o acumulado do mês (usado na confirmação de orçamento) em dia sem nova leitura
  const acoes = '<button class="btn-ghost" data-exportar-tudo title="Baixa um arquivo JSON com os dados de todos os clientes (backup)"><i class="fa-solid fa-file-export"></i> Exportar dados</button>'
    + '<a class="btn-primary" href="#/clientes/novo" title="Cadastrar um novo cliente"><i class="fa-solid fa-plus"></i> Novo cliente</a>';

  if (!clientes.length) {
    el.innerHTML = cabecalho('Início', 'Visão geral de todos os clientes.') +
      vazio('users', 'Vamos começar?', 'Cadastre seu primeiro cliente. Leva menos de 2 minutos e o resto do app se adapta a ele.', acoes);
    return;
  }

  const dados = { criativos, resultados, campanhas, sites };
  const itens = clientes.map((cliente) => ({ cliente, resumo: resumoCliente(cliente, dados, cfg) }));
  const total = (k, v) => criativos.filter((c) => c[k] === v).length;
  const orc = estadoOrcamento(cfg, clientes, usoMes);

  el.innerHTML = `${cabecalho('Início', 'Visão consolidada de todos os clientes.', acoes)}
    <div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      ${[['Clientes', clientes.length], ['Criativos em uso', total('status', 'em_uso')], ['Aguardando aprovação', total('status', 'rascunho') + total('status', 'pronto_aprovacao')], ['Campanhas ativas', campanhas.filter((c) => c.status === 'ativa').length]]
        .map(([k, v]) => `<div class="card"><p class="caption">${k}</p><p class="text-2xl font-bold">${v}</p></div>`).join('')}
      <div class="card sm:col-span-2 lg:col-span-4" title="Soma das chamadas de IA registradas neste mês (estimativa por tabela de preços)"><div class="flex flex-wrap items-center justify-between gap-2">
        <div><p class="caption"><i class="fa-solid fa-coins mr-1"></i>Custo de IA neste mês</p><p class="text-2xl font-bold">${usd(orc.totalMes)} <span class="text-base font-normal text-slate-500">(≈ ${brl(orc.totalMes, cfg.cotacaoUsd)})</span></p></div>
        <div class="text-right">${orc.orc ? `<p class="caption">${Math.round(orc.pct)}% do orçamento de ${usd(orc.orc)}</p><div class="mt-1 h-2 w-48 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full ${orc.pct >= 100 ? 'bg-rose-500' : orc.pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'}" style="width:${Math.min(100, orc.pct)}%"></div></div>` : '<p class="caption">Sem orçamento definido (Configurações)</p>'}</div></div></div></div>
    ${painelAlertas(agregar(itens, orc.alertas))}
    <h3 class="mb-1 font-semibold">Seus clientes</h3>
    <p class="caption mb-3">O semáforo compara os resultados dos últimos ${cfg.diasSemaforo} dias com a meta de cada cliente (defina a meta ao editar o cliente).</p>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${itens.map(({ cliente: c, resumo: r }) => {
      const cs = criativos.filter((x) => x.clienteId === c.id);
      const extra = `<div class="mt-3 flex flex-wrap gap-1">${tag(cs.length + ' criativos')}${tag(cs.filter((x) => x.status === 'em_uso').length + ' em uso', 'tag-ok')}
        ${r.fadiga.length ? tag('fadiga', 'tag-bad') : ''}${r.escalar.length ? tag('hora de escalar', 'tag-ok') : ''}${tag('lançamento ' + r.lancamento.percentual + '%', r.lancamento.percentual === 100 ? 'tag-ok' : '')}</div>`;
      return cartaoCliente(c, extra, semaforoHtml(r.sem, c.metas));
    }).join('')}</div>`;
}
