// Dashboard geral: visão consolidada de todos os clientes, central de alertas e o próximo passo óbvio.
import { db, COL } from '../core/storage.js';
import { obterConfig } from './configuracoes.js';
import { cartaoCliente } from './clientes.js';
import { resumoCliente, semaforoHtml, agregar, painelAlertas } from './alertas.js';
import { sugestoesDashboard } from './insights.js';
import { cabecalho, vazio, tag, ocupado, confirmar, toast, modal, esc } from '../core/ui.js';
import { estadoOrcamento, definirMes, mesDe, usd, brl, fecharMesesPendentes } from './custo.js';
import { exportarDados, lerArquivoBackup, resumoRestauracao, restaurarBackup } from './backup.js';

/** Escolhe o arquivo, mostra o que seria gravado e, se confirmado, restaura. Recarrega a página inteira ao final
 * (mais simples e seguro que tentar atualizar cada tela que já leu dados antigos em memória). */
async function importarBackup() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    try {
      const dados = await lerArquivoBackup(file);
      const linhas = resumoRestauracao(dados);
      if (!linhas.length) return toast('Este backup não tem nenhum documento para restaurar.', 'erro');
      const m = modal('Restaurar backup', `<p class="mb-3 text-sm">Isso vai gravar, por cima de qualquer documento existente com o mesmo id:</p>
        <ul class="mb-3 space-y-0.5 text-sm">${linhas.map(([col, n]) => `<li>• <b>${n}</b> documento(s) em <code>${esc(col)}</code></li>`).join('')}</ul>
        <p class="mb-4 text-sm text-amber-700"><i class="fa-solid fa-triangle-exclamation"></i> Dados atuais com o mesmo id serão substituídos. Isso não pode ser desfeito. Respostas de aprovação não são restauradas (o backup não guarda o token, por segurança).</p>
        <div class="flex justify-end gap-2"><button class="btn-ghost" data-nao>Cancelar</button><button class="btn-danger" data-sim>Restaurar</button></div>`);
      m.el.querySelector('[data-nao]').addEventListener('click', () => m.fechar());
      m.el.querySelector('[data-sim]').addEventListener('click', async (ev) => {
        const btn = ev.currentTarget;
        await ocupado(btn, async () => {
          const total = await restaurarBackup(dados);
          m.fechar();
          toast(`Backup restaurado: ${total} documento(s).`);
          location.hash = '#/'; window.dispatchEvent(new Event('hashchange'));
        });
      });
    } catch (e) { toast(e.message || 'Não consegui ler este backup.', 'erro'); }
  };
  input.click();
}

export async function view(el) {
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-exportar-tudo]')) ocupado(ev.target.closest('[data-exportar-tudo]'), () => exportarDados(null));
    if (ev.target.closest('[data-importar]')) importarBackup();
  });
  // Fecha em segundo plano os meses passados que ainda tiverem registros soltos de gcc_uso_api (rollup mensal:
  // nunca mexe no mês atual). Não trava a tela nem mostra nada se falhar — só reduz o tamanho da coleção com o tempo.
  fecharMesesPendentes().catch((e) => console.warn('[custo] fechamento de meses pendentes falhou:', e));
  const [clientes, criativos, campanhas, resultados, sites, cfg, usoMes] = await Promise.all([
    db.listar(COL.clientes), db.listar(COL.criativos), db.listar(COL.campanhas), db.listar(COL.resultados), db.listar(COL.sites), obterConfig(),
    db.listar(COL.usoApi, { mes: mesDe() }),
  ]);
  definirMes(usoMes); // mantém o acumulado do mês (usado na confirmação de orçamento) em dia sem nova leitura
  const acoes = '<button class="btn-ghost" data-exportar-tudo title="Baixa um arquivo JSON com os dados de todos os clientes (backup)"><i class="fa-solid fa-file-export"></i> Baixar backup (todos os clientes)</button>'
    + '<button class="btn-ghost" data-importar title="Restaura um backup JSON gerado por este app (o de todos os clientes ou o de um só)"><i class="fa-solid fa-file-import"></i> Restaurar backup (.json)</button>'
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

  el.innerHTML = `${cabecalho('Início', 'Visão de todos os clientes: o que precisa de atenção hoje, o custo de IA do mês e como está cada cliente. Clique num cliente para trabalhar nele.', acoes)}
    <div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      ${[['Clientes', clientes.length], ['Criativos em uso', total('status', 'em_uso')], ['Rascunho ou aguardando aprovação', total('status', 'rascunho') + total('status', 'pronto_aprovacao')], ['Campanhas ativas', campanhas.filter((c) => c.status === 'ativa').length]]
        .map(([k, v]) => `<div class="card"><p class="caption">${k}</p><p class="text-2xl font-bold">${v}</p></div>`).join('')}
      <div class="card sm:col-span-2 lg:col-span-4" title="Soma das chamadas de IA registradas neste mês (estimativa por tabela de preços)"><div class="flex flex-wrap items-center justify-between gap-2">
        <div><p class="caption"><i class="fa-solid fa-coins mr-1"></i>Custo de IA neste mês</p><p class="text-2xl font-bold">${usd(orc.totalMes)} <span class="text-base font-normal text-slate-500">(≈ ${brl(orc.totalMes, cfg.cotacaoUsd)})</span></p></div>
        <div class="text-right">${orc.orc ? `<p class="caption">${Math.round(orc.pct)}% do orçamento de ${usd(orc.orc)}</p><div class="mt-1 h-2 w-48 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full ${orc.pct >= 100 ? 'bg-rose-500' : orc.pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'}" style="width:${Math.min(100, orc.pct)}%"></div></div>` : '<p class="caption">Sem orçamento definido (Configurações)</p>'}</div></div>
        <p class="hint">Estimativa pela tabela de preços. Chamadas feitas pela assinatura do Claude contam US$ 0.</p></div></div>
    ${painelAlertas(agregar(itens, orc.alertas, sugestoesDashboard(clientes, criativos, resultados)))}
    <h3 class="mb-1 font-semibold">Seus clientes</h3>
    <p class="caption mb-3">O semáforo compara os resultados dos últimos ${cfg.diasSemaforo} dias com a meta de cada cliente (defina a meta ao editar o cliente).</p>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${itens.map(({ cliente: c, resumo: r }) => {
      const cs = criativos.filter((x) => x.clienteId === c.id);
      const extra = `<div class="mt-3 flex flex-wrap gap-1">${tag(cs.length + ' criativos')}${tag(cs.filter((x) => x.status === 'em_uso').length + ' em uso', 'tag-ok')}
        ${r.fadiga.length ? tag('fadiga', 'tag-bad') : ''}${r.escalar.length ? tag('hora de escalar', 'tag-ok') : ''}${tag('lançamento ' + r.lancamento.percentual + '%', r.lancamento.percentual === 100 ? 'tag-ok' : '')}</div>`;
      return cartaoCliente(c, extra, semaforoHtml(r.sem, c.metas));
    }).join('')}</div>`;
}
