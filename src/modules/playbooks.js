// Biblioteca de playbooks (gcc_playbooks): sequência de ângulos/hooks que costuma funcionar por tipo de produto.
// Um playbook pode ser aplicado num cliente (vira hooks + ângulos sugeridos) ou criado a partir de um cliente que performa bem.
import { db, COL } from '../core/storage.js';
import { gerarPlaybook } from '../core/ia.js';
import { CATEGORIAS_HOOK } from '../lib/constantes.js';
import { esc, $, on, montar, cabecalho, vazio, tag, dataBR, toast, modal, ocupado, lerForm, confirmar } from '../core/ui.js';

const nomeCat = (v) => (CATEGORIAS_HOOK.find(([k]) => k === v) || [, v])[1];

/** "Ângulo | hook 1 | hook 2" (uma linha por ângulo) -> [{angulo, hooks[]}] */
export function parseAngulos(txt) {
  return String(txt || '').split('\n').map((l) => l.split('|').map((s) => s.trim()).filter(Boolean)).filter((p) => p.length)
    .map(([angulo, ...hooks]) => ({ angulo, hooks }));
}
export const angulosTexto = (as = []) => as.map((a) => [a.angulo, ...(a.hooks || [])].join(' | ')).join('\n');

/** Copia os hooks do playbook para o cliente e grava os ângulos sugeridos. Retorna quantos hooks foram criados. */
export async function aplicarPlaybook(cliente, pb) {
  const jaTem = new Set((await db.listar(COL.hooks, { clienteId: cliente.id })).map((h) => String(h.texto).trim().toLowerCase()));
  const novos = [];
  for (const a of pb.angulos || []) {
    for (const h of a.hooks || []) {
      const k = String(h).trim().toLowerCase();
      if (jaTem.has(k)) continue; // não duplica hook que o cliente já tem
      jaTem.add(k);
      novos.push({ texto: h, categoria: '', angulo: a.angulo, origemPlaybook: pb.nome, clienteId: cliente.id, clienteNome: cliente.nome, nota: null });
    }
  }
  await Promise.all(novos.map((h) => db.criar(COL.hooks, h))); // gravações em paralelo (rápido mesmo com dezenas de hooks)
  const n = novos.length;
  await db.atualizar(COL.clientes, cliente.id, { playbookId: pb.id, playbookNome: pb.nome, angulosSugeridos: (pb.angulos || []).map((a) => a.angulo) });
  Object.assign(cliente, { playbookId: pb.id, playbookNome: pb.nome, angulosSugeridos: (pb.angulos || []).map((a) => a.angulo) });
  return n;
}

/** Monta um rascunho de playbook a partir do que funcionou no cliente (ângulos dos criativos + hooks bem avaliados). */
export async function rascunhoDeCliente(cliente) {
  const f = { clienteId: cliente.id };
  const [criativos, resultados, hooks] = await Promise.all([db.listar(COL.criativos, f), db.listar(COL.resultados, f), db.listar(COL.hooks, f)]);
  const grupos = new Map();
  for (const c of criativos.filter((x) => x.angulo && x.hook)) {
    const g = grupos.get(c.angulo) || { angulo: c.angulo, hooks: [], roas: 0 };
    if (!g.hooks.includes(c.hook)) g.hooks.push(c.hook);
    for (const r of resultados.filter((x) => x.criativoId === c.id && x.roas)) g.roas = Math.max(g.roas, r.roas);
    grupos.set(c.angulo, g);
  }
  const angulos = [...grupos.values()].sort((a, b) => b.roas - a.roas || b.hooks.length - a.hooks.length)
    .map((g) => ({ angulo: g.angulo, hooks: g.hooks.slice(0, 4) }));
  const bons = hooks.filter((h) => (h.nota || 0) >= 4);
  const porCat = new Map();
  for (const h of bons) porCat.set(h.categoria || 'geral', [...(porCat.get(h.categoria || 'geral') || []), h.texto]);
  for (const [cat, hs] of porCat) angulos.push({ angulo: `Hooks bem avaliados (${nomeCat(cat)})`, hooks: hs.slice(0, 4) });
  const melhor = [...resultados].filter((r) => r.roas).sort((a, b) => b.roas - a.roas)[0];
  return {
    nome: `Playbook — ${cliente.nome}`, tipoProduto: cliente.nicho, angulos,
    notas: [`Criado a partir do cliente "${cliente.nome}" (${cliente.estagio === 'rodando' ? 'rodando' : 'novo'}).`,
      cliente.marca?.usp && `Diferencial: ${cliente.marca.usp}.`, cliente.marca?.tomDeVoz && `Tom de voz: ${cliente.marca.tomDeVoz}.`,
      melhor && `Melhor ROAS registrado: ${melhor.roas}x ("${melhor.criativoNome}").`].filter(Boolean).join(' '),
    origemClienteId: cliente.id,
  };
}

const formHtml = (p = {}) => `<form id="fpb" class="space-y-3">
  <div><label class="label">Nome do playbook *</label><input class="input" name="nome" value="${esc(p.nome)}" placeholder="Ex.: Moda fitness feminina"></div>
  <div><label class="label">Tipo de produto / nicho *</label><input class="input" name="tipoProduto" value="${esc(p.tipoProduto)}" placeholder="Ex.: leggings e roupas de treino"></div>
  <div><label class="label">Ângulos e hooks que costumam funcionar</label>
    <textarea class="input font-mono text-xs" rows="7" name="angulos" placeholder="Vergonha na academia | Ninguém fala disso... | Testei e não transparece&#10;Custo-benefício | ...">${esc(angulosTexto(p.angulos))}</textarea>
    <p class="hint">Um ângulo por linha, na ordem em que costumam funcionar. Formato: <code>Ângulo | hook 1 | hook 2</code></p></div>
  <div><label class="label">Notas gerais</label><textarea class="input" rows="3" name="notas">${esc(p.notas)}</textarea></div>
  <div class="flex justify-between"><button class="btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar playbook</button>
    ${p.id ? '<button class="btn-danger" type="button" data-apagar>Apagar</button>' : ''}</div></form>`;

/** Abre o editor de playbook. `rascunho` = dados iniciais (sem id) ou playbook existente (com id). */
export function abrirEditor(rascunho, aoSalvar, titulo = 'Playbook') {
  const m = modal(titulo, formHtml(rascunho || {}), { largo: true });
  on(m.el, 'submit', '#fpb', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f);
    if (!v.nome || !v.tipoProduto) return toast('Informe o nome e o tipo de produto.', 'erro');
    const dados = { nome: v.nome, tipoProduto: v.tipoProduto, angulos: parseAngulos(v.angulos), notas: v.notas || '', origemClienteId: rascunho?.origemClienteId || null };
    await ocupado(f.querySelector('[type=submit]'), async () => {
      const salvo = rascunho?.id ? (await db.atualizar(COL.playbooks, rascunho.id, dados), { id: rascunho.id, ...dados }) : await db.criar(COL.playbooks, dados);
      toast('Playbook salvo.'); m.fechar(); aoSalvar?.(salvo);
    });
  });
  on(m.el, 'click', '[data-apagar]', async () => {
    if (!(await confirmar('Apagar este playbook? Clientes que já o aplicaram não são afetados.', 'Apagar'))) return;
    await db.remover(COL.playbooks, rascunho.id); m.fechar(); toast('Playbook apagado.'); aoSalvar?.(null);
  });
}

// ---------------- página da biblioteca ----------------
/** Entrada fixa, só de leitura: resumo da referência que a IA usa (server/referencias/metodologia-vortex.js). */
const METODOLOGIA_HTML = `<details class="card mb-4" data-metodologia><summary class="cursor-pointer font-semibold"><i class="fa-solid fa-book-open mr-1 text-indigo-500"></i> Metodologia Vortex (referência)</summary>
  <p class="hint mt-1">Material do curso Vortex, uso interno, resumido com palavras nossas. A IA usa como UMA referência entre outras ao criar criativos, campanhas e o site, quando combina com o cliente. Não é método obrigatório: política do Meta, "não inventar dados" e o perfil de marca vêm antes.</p>
  <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
    <li><b>Dor x desejo:</b> o produto resolve uma dor, atende um desejo ou os dois (em geral o desejo está apoiado numa dor).</li>
    <li><b>Consciência do público:</b> quem nem sabe do problema ou só sabe do problema = topo; quem já sabe da solução = meio; quem já conhece o produto = fundo.</li>
    <li><b>Narrativas:</b> topo = Dor vs Solução, Quebra de Crença; meio = Nós vs Eles, Por que usar / Por que funciona; fundo = Antes e Depois, Resultado/Depoimento, Oferta. As de prova só com prova real do cliente.</li>
    <li><b>Formatos:</b> React, Owner, Meia tela, UGC, Estático + oferta, Caixinha de pergunta, Cinema. Conceito = narrativa + formato.</li>
    <li><b>Multiplicar:</b> a narrativa que vence pode ser refeita em outros formatos, mantendo a mesma narrativa.</li>
    <li><b>Regra prática:</b> um conjunto equilibrado cobre topo, meio e fundo.</li></ul>
  <p class="hint mt-2">Na tela de criativo, em "Mais opções", o campo "Narrativa (opcional)" fixa uma delas; em "A IA escolhe", ela decide.</p></details>`;

/** Entrada fixa, só de leitura: resumo da referência de tráfego que a IA usa (server/referencias/trafego.js). */
const TRAFEGO_HTML = `<details class="card mb-4" data-trafego><summary class="cursor-pointer font-semibold"><i class="fa-solid fa-chart-line mr-1 text-indigo-500"></i> Critérios de tráfego (referência)</summary>
  <p class="hint mt-1">Resumo com palavras nossas do squad Traffic Masters (Xquads, licença MIT). A IA usa como UMA referência entre outras na estrutura e na discussão de campanha, em Insights, no diagnóstico e em "Analisar e recomendar" / plano de otimização. Os dados do cliente, "não inventar dados", a política do Meta e o perfil de marca vêm antes. Os números são regras de manejo, não médias de mercado.</p>
  <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
    <li><b>Leitura de dado:</b> menos de ~7 dias ou poucas conversões é indício, não conclusão. Nos primeiros ~3 dias (aprendizado), não mexer.</li>
    <li><b>Diagnóstico em cadeia:</b> CTR baixo = gancho ou público; CTR bom e conversão baixa = página, oferta ou destino; conversão boa e CPA alto = CPM, orçamento ou lance; alcance baixo = público estreito ou verba pequena.</li>
    <li><b>Fadiga:</b> frequência subindo (público frio acima de ~3) com CTR caindo e CPA subindo pede criativo novo, não mais verba.</li>
    <li><b>Escala:</b> vertical = ~20% a cada 48–72 h no que está estável na meta, voltando um passo se o CPA piorar mais de ~30% por 48 h; horizontal = duplicar o vencedor para públicos novos. Só com rastreamento confiável e criativos de reserva.</li>
    <li><b>Orçamento:</b> mudar aos poucos; reduzir antes de desligar o que dá lucro; decidir por margem, não só faturamento.</li>
    <li><b>Classificar:</b> vencedor (escalar), na meta (otimizar), abaixo (corrigir ou pausar), sem volume nem função (desligar).</li>
    <li><b>Teste e funil:</b> mudar uma coisa por vez no criativo; não pôr toda a verba em remarketing.</li></ul></details>`;

/** Entrada fixa, só de leitura: resumo da referência de copy que a IA usa (server/referencias/copy.js). */
const COPY_HTML = `<details class="card mb-4" data-copy><summary class="cursor-pointer font-semibold"><i class="fa-solid fa-pen-nib mr-1 text-indigo-500"></i> Critérios de copy (referência)</summary>
  <p class="hint mt-1">Resumo com palavras nossas do Copy Squad (Xquads, licença MIT). A IA usa como UMA referência entre outras ao criar criativos, hooks e nos ajustes de criativo, junto com a Metodologia Vortex. As regras do app vêm antes: tom orgânico, sem linguagem de venda óbvia, termos proibidos e "não inventar dados". Ficaram de fora o drama ao falar da dor e a urgência inventada.</p>
  <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
    <li><b>Escorregador:</b> cada frase existe para fazer ler a próxima. Para público frio, nada de saudação ou marca abrindo o texto.</li>
    <li><b>Gancho pela consciência:</b> não sabe do problema = cena ou história, sem o produto; sabe do problema = a dor com as palavras do público; conhece soluções = o mecanismo; conhece o produto = prova real e objeção; pronto para comprar = a oferta ativa.</li>
    <li><b>Variar o gancho:</b> pergunta, "como...", "por que...", novidade, curiosidade, número específico, ordem direta.</li>
    <li><b>Específico e benefício:</b> cena e detalhe concreto em vez de adjetivo; o que muda na vida da pessoa, com a característica como prova.</li>
    <li><b>Credibilidade:</b> a promessa cabe no que o produto entrega e na prova disponível; curiosidade que o texto não cumpre é isca.</li>
    <li><b>Urgência e CTA:</b> urgência só se for real (oferta, prazo ou estoque do perfil); um anúncio, um objetivo, um CTA.</li></ul></details>`;

/** Entrada fixa, só de leitura: resumo da referência de oferta que a IA usa (server/referencias/oferta.js). */
const OFERTA_HTML = `<details class="card mb-4" data-oferta><summary class="cursor-pointer font-semibold"><i class="fa-solid fa-tags mr-1 text-indigo-500"></i> Critérios de oferta (referência)</summary>
  <p class="hint mt-1">Resumo com palavras nossas do Hormozi Squad (Xquads, licença MIT). A IA usa como UMA referência entre outras no site, em "Analisar e recomendar" e no plano de otimização. Ficou de fora a parte do método que cria bônus, garantia, preço-âncora e escassez: a IA não inventa preço, prazo, garantia nem número.</p>
  <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
    <li><b>Regra de ouro:</b> no texto para o público (site, anúncio), só o que existe no cadastro: preço, garantia, brinde, frete, prazo, troca e prova. Na análise para você, a IA pode sugerir algo novo, como sugestão a combinar com o cliente e sem número inventado.</li>
    <li><b>Valor percebido:</b> resultado desejado × confiança de que vai conseguir, dividido por tempo até o resultado × esforço. Sobe o valor sem baixar o preço.</li>
    <li><b>Diagnóstico:</b> atacar primeiro o mais fraco dos quatro. Clique bom e pouca venda costuma ser confiança baixa (prova, garantia, troca pouco visíveis) ou esforço alto (frete, prazo, checkout).</li>
    <li><b>Objeções:</b> cada objeção do perfil vira uma resposta na oferta ou na página.</li>
    <li><b>Preço e prazo:</b> justificar pelo resultado, não pelo concorrente; desconto, "de/por", escassez e prazo só se forem reais e estiverem cadastrados.</li></ul></details>`;

export const view = (el) => montar(el, async (root, recarregar) => {
  const pbs = await db.listar(COL.playbooks);
  root.innerHTML = `${cabecalho('Playbooks', 'Receitas reaproveitáveis por tipo de produto: a sequência de ângulos e hooks que costuma funcionar. Para usar num cliente: escolha o playbook ao cadastrar o cliente, ou dentro dele em "Mais ações" > "Aplicar playbook" — os hooks vão para a aba Hooks e os ângulos aparecem como sugestão ao criar criativos.',
    `<button class="btn-ia" data-ia title="A IA sugere um playbook a partir do tipo de produto"><i class="fa-solid fa-wand-magic-sparkles"></i> Sugerir playbook com IA</button>
     <button class="btn-primary" data-novo title="Escreva um playbook você mesmo"><i class="fa-solid fa-plus"></i> Novo playbook</button>`)}
    <div id="painel"></div>
    ${METODOLOGIA_HTML}
    ${TRAFEGO_HTML}
    ${COPY_HTML}
    ${OFERTA_HTML}
    ${pbs.length ? `<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${pbs.map((p) => `<button data-abrir="${p.id}" class="card text-left transition hover:border-indigo-400 hover:shadow-md">
      <h3 class="font-semibold leading-tight">${esc(p.nome)}</h3><p class="caption mt-1">${esc(p.tipoProduto)}</p>
      <div class="mt-3 flex flex-wrap gap-1">${tag((p.angulos || []).length + ' ângulos', 'tag-info')}${(p.angulos || []).slice(0, 3).map((a) => tag(a.angulo)).join('')}${p.origemClienteId ? tag('de um cliente', 'tag-ok') : ''}</div>
      <p class="hint mt-2">${dataBR(p.criadoEm)}</p></button>`).join('')}</div>`
      : vazio('book-open', 'Nenhum playbook ainda', 'Crie um manualmente, peça uma sugestão à IA ou salve a estrutura de um cliente que está performando bem (dentro do cliente, em "Mais ações").')}`;

  on(root, 'click', '[data-novo]', () => abrirEditor({}, recarregar, 'Novo playbook'));
  on(root, 'click', '[data-abrir]', (b) => abrirEditor(pbs.find((p) => p.id === b.dataset.abrir), recarregar, 'Editar playbook'));
  on(root, 'click', '[data-ia]', () => {
    $('#painel', root).innerHTML = `<form id="fi" class="card mb-4 space-y-3"><p class="caption">A IA propõe ângulos e hooks que costumam funcionar para esse tipo de produto. Você revisa num editor antes de salvar.</p>
      <div><label class="label">Para que tipo de produto?</label>
      <input class="input" name="tipo" placeholder="Ex.: suplemento para dormir melhor" required></div>
      <button class="btn-ia" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar playbook sugerido</button></form>`;
  });
  on(root, 'submit', '#fi', async (f, ev) => {
    ev.preventDefault();
    const tipo = lerForm(f).tipo; if (!tipo) return;
    await ocupado(f.querySelector('button'), async () => {
      const r = await gerarPlaybook({ tipoProduto: tipo });
      $('#painel', root).innerHTML = '';
      toast('Sugestão criada pela IA. Revise e salve.');
      abrirEditor({ nome: r.nome || `Playbook — ${tipo}`, tipoProduto: tipo, angulos: r.angulos || [], notas: r.notas || '' }, recarregar, 'Sugestão da IA (revise antes de salvar)');
    });
  });
});
