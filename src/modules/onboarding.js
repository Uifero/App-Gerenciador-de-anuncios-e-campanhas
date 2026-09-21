// Assistente de onboarding: pergunta uma informação do perfil por vez e monta o cliente ao final.
// Usa exatamente os mesmos campos e a mesma função de gravação do formulário completo.
import { db, COL } from '../core/storage.js';
import { IDIOMAS, ESTAGIOS, MODULOS, ESCOPO_PADRAO } from '../lib/constantes.js';
import { esc, $, on, montar, cabecalho, toast, ocupado, opcoes } from '../core/ui.js';
import { criarCliente } from './clientes.js';

// tipo: texto | longo | numero | opcoes | playbook | escopo. `cond` decide se a pergunta aparece.
const PERGUNTAS = [
  { campo: 'nome', obrigatorio: true, pergunta: 'Como se chama o cliente ou a loja?', dica: 'Só o nome, como você o chama no dia a dia.', placeholder: 'Ex.: Loja da Ana' },
  { campo: 'nicho', obrigatorio: true, pergunta: 'O que ele vende?', dica: 'Nicho ou produto principal, em poucas palavras.', placeholder: 'Ex.: moda fitness feminina' },
  { campo: 'estagio', tipo: 'opcoes', opcoes: ESTAGIOS, pergunta: 'Ele já anuncia hoje?', dica: 'Se já roda anúncios, usamos o histórico para sugerir uma estrutura mais afinada.' },
  { campo: 'cpaMedio', tipo: 'numero', cond: (v) => v.estagio === 'rodando', pergunta: 'Qual o CPA médio atual? (R$)', dica: 'Custo por aquisição médio dos últimos anúncios.' },
  { campo: 'orcamentoDiario', tipo: 'numero', cond: (v) => v.estagio === 'rodando', pergunta: 'Quanto gasta por dia em anúncios? (R$)', dica: 'Orçamento diário atual.' },
  { campo: 'publicosHist', cond: (v) => v.estagio === 'rodando', pergunta: 'Quais públicos já convertem?', dica: 'Pode listar vários, separados por vírgula.', placeholder: 'Ex.: mulheres 25-40, lookalike de compradores' },
  { campo: 'idioma', tipo: 'opcoes', opcoes: IDIOMAS, pergunta: 'Em que idioma os criativos serão escritos?', dica: 'A IA escreve nesse idioma.' },
  { campo: 'tomDeVoz', pergunta: 'Como a marca fala com o público?', dica: 'O tom de voz faz a IA soar como a marca e não como anúncio.', placeholder: 'Ex.: próximo, bem-humorado, sem formalidade', sugestoes: ['próximo e bem-humorado', 'profissional e direto', 'acolhedor e calmo', 'jovem e informal'] },
  { campo: 'linguagemDor', tipo: 'longo', pergunta: 'Com as palavras do próprio cliente final: qual a dor que o produto resolve?', dica: 'Como o público reclamaria para um amigo. Quanto mais real, mais natural o anúncio.', placeholder: 'Ex.: "minha legging fica transparente quando agacho"' },
  { campo: 'usp', pergunta: 'O que faz esse produto ser diferente dos outros?', dica: 'Seu diferencial (USP), em uma frase.', placeholder: 'Ex.: tecido opaco que não transparece' },
  { campo: 'objecoes', tipo: 'longo', opcional: true, pergunta: 'Quais objeções o público costuma ter antes de comprar?', dica: 'Ex.: preço, tamanho, prazo de entrega. Pode pular.' },
  { campo: 'provasSociais', tipo: 'longo', opcional: true, pergunta: 'Que provas sociais reais existem?', dica: 'Avaliações, números de vendas, depoimentos. Só o que é verdadeiro. Pode pular.' },
  { campo: 'termosProibidos', tipo: 'longo', opcional: true, pergunta: 'Existe alguma palavra que não pode aparecer nos anúncios?', dica: 'Termos proibidos ou restritos no nicho, separados por vírgula. A IA evita e o app avisa. Pode pular.', placeholder: 'Ex.: cura, garantido, emagreça' },
  { campo: 'metaCpa', tipo: 'numero', opcional: true, pergunta: 'Qual a meta de CPA? (R$)', dica: 'Ativa o semáforo do cliente. Pode pular e definir depois.' },
  { campo: 'metaRoas', tipo: 'numero', opcional: true, pergunta: 'Qual a meta de ROAS?', dica: 'Ex.: 3 significa R$ 3 de retorno para cada R$ 1 investido. Pode pular.' },
  { campo: 'siteReferencia', opcional: true, pergunta: 'Tem um site de referência?', dica: 'Um site que o cliente admira, para usar de inspiração. Pode pular.', placeholder: 'https://…' },
  { campo: 'playbookId', tipo: 'playbook', opcional: true, pergunta: 'Quer partir de um playbook?', dica: 'Um playbook traz hooks e ângulos que costumam funcionar nesse tipo de produto. Pode pular.' },
  { campo: 'escopo', tipo: 'escopo', pergunta: 'O que será entregue a este cliente?', dica: 'Só as abas marcadas aparecem dentro do cliente.' },
];

const ROTULO = {
  nome: 'Nome', nicho: 'Nicho', estagio: 'Estágio', cpaMedio: 'CPA médio', orcamentoDiario: 'Orçamento diário', publicosHist: 'Públicos que convertem', idioma: 'Idioma',
  tomDeVoz: 'Tom de voz', linguagemDor: 'Dor do público', usp: 'Diferencial', objecoes: 'Objeções', provasSociais: 'Provas sociais', termosProibidos: 'Termos proibidos',
  metaCpa: 'Meta de CPA', metaRoas: 'Meta de ROAS', siteReferencia: 'Site de referência', playbookId: 'Playbook',
};

export const view = (el) => montar(el, async (root) => {
  const playbooks = await db.listar(COL.playbooks);
  const resp = { estagio: 'novo', idioma: 'pt-BR' };
  const escopo = { ...ESCOPO_PADRAO };
  let i = 0, revisao = false;

  const visiveis = () => PERGUNTAS.filter((p) => !p.cond || p.cond(resp));
  const perguntaAtual = () => visiveis()[i];

  function desenhar() {
    const lista = visiveis();
    if (revisao) return desenharRevisao();
    const p = lista[i];
    const pct = Math.round((i / lista.length) * 100);
    let campo;
    if (p.tipo === 'opcoes') campo = `<select class="input" name="valor" autofocus>${opcoes(p.opcoes, resp[p.campo])}</select>`;
    else if (p.tipo === 'longo') campo = `<textarea class="input" rows="3" name="valor" placeholder="${esc(p.placeholder || '')}" autofocus>${esc(resp[p.campo])}</textarea>`;
    else if (p.tipo === 'numero') campo = `<input class="input" type="number" step="0.01" min="0" name="valor" value="${esc(resp[p.campo])}" autofocus>`;
    else if (p.tipo === 'playbook') campo = playbooks.length
      ? `<select class="input" name="valor"><option value="">Nenhum (começar do zero)</option>${playbooks.map((b) => `<option value="${b.id}" ${resp.playbookId === b.id ? 'selected' : ''}>${esc(b.nome)} — ${esc(b.tipoProduto)}</option>`).join('')}</select>`
      : '<p class="caption">Você ainda não tem playbooks. Dá para criar depois, na tela Playbooks.</p><input type="hidden" name="valor" value="">';
    else if (p.tipo === 'escopo') campo = `<div class="space-y-2">${MODULOS.map((m) => `<label class="flex items-start gap-3 rounded-lg border border-slate-200 p-2.5"><input type="checkbox" data-esc="${m.id}" class="mt-1" ${escopo[m.id] ? 'checked' : ''}>
      <span><b class="text-sm"><i class="fa-solid fa-${m.icone} mr-1 text-slate-400"></i>${m.nome}</b><br><span class="caption">${m.legenda}</span></span></label>`).join('')}</div>`;
    else campo = `<input class="input" name="valor" value="${esc(resp[p.campo])}" placeholder="${esc(p.placeholder || '')}" autofocus>`;

    root.innerHTML = `${cabecalho('Novo cliente — assistente', 'Uma pergunta por vez. Dá para voltar e mudar qualquer resposta.',
      '<a class="btn-ghost btn-sm" href="#/clientes/novo/completo" title="Trocar para o formulário completo (você perde as respostas já dadas)">Prefiro preencher tudo de uma vez</a>')}
    <form id="q" class="card max-w-xl" novalidate>
      <div class="mb-1 flex justify-between text-xs text-slate-500"><span>Pergunta ${i + 1} de ${lista.length}</span><span>${pct}%</span></div>
      <div class="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-indigo-500 transition-all" style="width:${pct}%"></div></div>
      <label class="mb-1 block text-lg font-semibold">${esc(p.pergunta)}</label><p class="caption mb-3">${esc(p.dica)}</p>
      ${campo}
      ${(p.sugestoes || []).length ? `<div class="mt-2 flex flex-wrap gap-1">${p.sugestoes.map((s) => `<button type="button" class="tag hover:bg-indigo-100" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
      <p id="erro" class="mt-2 hidden text-sm text-rose-600" role="alert"></p>
      <div class="mt-6 flex items-center justify-between">
        <button type="button" class="btn-ghost ${i === 0 ? 'invisible' : ''}" data-voltar>Voltar</button>
        <span class="flex gap-2">${p.opcional ? '<button type="button" class="btn-ghost" data-pular title="Deixar em branco e seguir">Pular</button>' : ''}
          <button type="submit" class="btn-primary">${i === lista.length - 1 ? 'Revisar' : 'Continuar'} <i class="fa-solid fa-arrow-right"></i></button></span></div></form>`;
    $('[name=valor]', root)?.focus();
  }

  function desenharRevisao() {
    const ativos = new Set(visiveis().map((p) => p.campo)); // respostas de perguntas que deixaram de valer não entram
    const linhas = Object.keys(ROTULO).filter((k) => ativos.has(k) && resp[k] !== undefined && resp[k] !== '').map((k) => {
      let v = resp[k];
      if (k === 'playbookId') v = playbooks.find((b) => b.id === v)?.nome || v;
      if (k === 'estagio') v = ESTAGIOS.find(([x]) => x === v)?.[1];
      if (k === 'idioma') v = IDIOMAS.find(([x]) => x === v)?.[1];
      return `<div class="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm"><span class="text-slate-500">${ROTULO[k]}</span><span class="text-right font-medium">${esc(v)}</span></div>`;
    }).join('');
    root.innerHTML = `${cabecalho('Confira e salve', 'Este é o perfil que o assistente montou. Você pode editar tudo depois.')}
      <div class="card max-w-xl">${linhas}
        <p class="mt-3 text-sm"><b>Abas:</b> ${MODULOS.filter((m) => escopo[m.id]).map((m) => m.nome).join(', ') || '—'}</p>
        <div class="mt-5 flex justify-between"><button class="btn-ghost" data-voltar>Voltar</button>
          <button class="btn-primary" data-salvar><i class="fa-solid fa-check"></i> Salvar cliente</button></div></div>`;
  }

  function guardar() {
    const p = perguntaAtual();
    if (p.tipo === 'escopo') { root.querySelectorAll('[data-esc]').forEach((c) => { escopo[c.dataset.esc] = c.checked; }); return true; }
    const v = String($('[name=valor]', root).value ?? '').trim();
    if (p.obrigatorio && !v) { const e = $('#erro', root); e.textContent = 'Esta informação é necessária para continuar.'; e.classList.remove('hidden'); return false; }
    if (p.tipo === 'numero' && v !== '' && !(Number(v) >= 0)) { const e = $('#erro', root); e.textContent = 'Informe um número válido.'; e.classList.remove('hidden'); return false; }
    resp[p.campo] = v;
    return true;
  }

  on(root, 'submit', '#q', (_f, ev) => {
    ev.preventDefault();
    if (!guardar()) return;
    if (i >= visiveis().length - 1) revisao = true; else i++;
    desenhar();
  });
  on(root, 'click', '[data-pular]', () => { const p = perguntaAtual(); resp[p.campo] = ''; if (i >= visiveis().length - 1) revisao = true; else i++; desenhar(); });
  on(root, 'click', '[data-voltar]', () => { if (revisao) revisao = false; else i = Math.max(0, i - 1); desenhar(); });
  on(root, 'click', '[data-sug]', (b) => { $('[name=valor]', root).value = b.dataset.sug; });
  on(root, 'click', '[data-salvar]', async (b) => {
    await ocupado(b, async () => {
      const novo = await criarCliente(resp, escopo, { playbook: playbooks.find((p) => p.id === resp.playbookId) });
      toast('Cliente criado! Já pode começar pelos criativos.');
      location.hash = `#/c/${novo.id}`;
    });
  });
  desenhar();
});
