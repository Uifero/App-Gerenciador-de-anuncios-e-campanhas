// Aba Site/Loja: modo "custom" (site HTML exportável) ou "pacote_plataforma" (CSV + textos p/ Nuvemshop/Shopify),
// ambos com manual de handoff em PDF. Nunca processa pagamento: só marca o ponto de encaixe de checkout de terceiros.
import { db, COL } from '../core/storage.js';
import { gerarConteudoSite, gerarTextosPacote } from '../core/ia.js';
import { gerarSiteHTML } from '../lib/sitegen.js';
import { csvShopify, csvNuvemshop, slug } from '../lib/csv.js';
import { criarPdf } from '../lib/pdf.js';
import { PLATAFORMAS, STATUS_SITE } from '../lib/constantes.js';
import { esc, $, on, montar, cabecalho, iaNota, tag, dataBR, toast, ocupado, lerForm, opcoes, baixarTexto, listaDeLinhas } from '../core/ui.js';

const nomePlat = (v) => (PLATAFORMAS.find(([k]) => k === v) || [, v])[1];

const extDoArquivo = (nome) => String(nome || '').split('.').pop().toLowerCase();
/** Criativo aprovado -> depoimento (nome do cliente, hook como texto, mídia anexada se houver). */
export function criativoParaDepoimento(cliente, criativo) {
  return {
    nome: cliente.nome, texto: criativo.hook || criativo.copy?.slice(0, 200) || '', origem: 'criativo', criativoId: criativo.id,
    midiaUrl: criativo.arquivoUrl || null, midiaTipo: criativo.arquivoUrl ? (['mp4', 'mov', 'webm'].includes(extDoArquivo(criativo.arquivoNome)) ? 'video' : 'imagem') : null,
  };
}
/** Substitui só os depoimentos de origem "criativo" pelos novos; os escritos à mão (sem origem) ficam intactos. */
export function mesclarDepoimentos(atuais = [], novos = []) {
  return [...atuais.filter((d) => d.origem !== 'criativo'), ...novos];
}

export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  const [produtos, sites, criativos] = await Promise.all([
    db.listar(COL.produtos, { clienteId: cliente.id }), db.listar(COL.sites, { clienteId: cliente.id }), db.listar(COL.criativos, { clienteId: cliente.id }),
  ]);
  let site = sites[0] || null;
  // Criativos aprovados marcados "usar como prova social" (toggle na aba Criativos) — candidatos a depoimento do site.
  const marcados = criativos.filter((c) => c.provaSocial && ['aprovado', 'em_uso', 'pausado'].includes(c.status));

  const salvarSite = async (patch) => {
    if (site) { await db.atualizar(COL.sites, site.id, patch); Object.assign(site, patch); }
    else site = await db.criar(COL.sites, { clienteId: cliente.id, status: 'rascunho', versaoManual: 0, ...patch });
  };

  // ---------- escolha do modo ----------
  if (!site?.modo) {
    root.innerHTML = `${cabecalho('Site / Loja', 'Escolha como a loja deste cliente será entregue. Você pode trocar depois.')}
    <div class="grid gap-4 md:grid-cols-2">
      <button class="card text-left transition hover:border-indigo-400 hover:shadow-md" data-modo="custom"><div class="mb-2 text-2xl text-indigo-500"><i class="fa-solid fa-code"></i></div>
        <h3 class="font-semibold">Site personalizado</h3><p class="caption">Gera um site HTML pronto, com catálogo, carrinho, banner, depoimentos e WhatsApp. Você hospeda e liga o checkout de terceiros.</p></button>
      <button class="card text-left transition hover:border-indigo-400 hover:shadow-md" data-modo="pacote_plataforma"><div class="mb-2 text-2xl text-indigo-500"><i class="fa-solid fa-box-open"></i></div>
        <h3 class="font-semibold">Pacote para Nuvemshop/Shopify</h3><p class="caption">Gera o catálogo em CSV, banners e textos prontos e o briefing do tema para importar na plataforma.</p></button></div>`;
    on(root, 'click', '[data-modo]', async (b) => { await salvarSite({ modo: b.dataset.modo, plataforma: b.dataset.modo === 'pacote_plataforma' ? 'nuvemshop' : null }); recarregar(); });
    return;
  }

  const semProdutos = !produtos.length;
  const c = site.conteudo || {};
  const cfg = site.config || {};
  const custom = site.modo === 'custom';

  root.innerHTML = `${cabecalho(custom ? 'Site personalizado' : 'Pacote de plataforma', custom ? 'Site HTML exportável com carrinho no navegador e ponto de encaixe para checkout de terceiros.' : 'Arquivos prontos para importar em Nuvemshop ou Shopify.',
    `<button class="btn-ghost btn-sm" data-trocar title="Voltar e escolher outro modo">Trocar modo</button>`)}
    ${semProdutos ? `<div class="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">Você ainda não cadastrou produtos. <a class="font-semibold underline" href="#/c/${cliente.id}/produtos">Cadastrar agora</a> — o site e o CSV usam essa lista.</div>` : ''}
    <div class="mb-4 flex flex-wrap gap-1">${tag(STATUS_SITE.find(([k]) => k === site.status)?.[1] || site.status, site.status === 'rascunho' ? '' : 'tag-ok')}${tag(produtos.length + ' produto(s)')}
      ${site.plataforma ? tag(nomePlat(site.plataforma), 'tag-info') : ''}${site.versaoManual ? tag('manual v' + site.versaoManual) : ''}${site.exportadoEm ? tag('exportado em ' + dataBR(site.exportadoEm)) : ''}
      ${cliente.siteReferencia ? `<a class="tag tag-info" href="${esc(cliente.siteReferencia)}" target="_blank" rel="noopener">site de referência</a>` : ''}</div>

    <div class="grid gap-4 lg:grid-cols-2">
      <form id="fc" class="card space-y-3"><h3 class="font-semibold">1. Conteúdo da loja</h3>
        <p class="caption">Gere os textos com IA ou preencha à mão. ${custom ? 'Cores e WhatsApp ficam em "Mais opções".' : ''}</p>
        <div><label class="label">Título do banner (hero)</label><input class="input" name="heroTitulo" value="${esc(c.heroTitulo)}"></div>
        <div><label class="label">Subtítulo</label><input class="input" name="heroSubtitulo" value="${esc(c.heroSubtitulo)}"></div>
        <div><label class="label">Texto do botão do banner</label><input class="input" name="heroCta" value="${esc(c.heroCta)}"></div>
        <div><label class="label">História da marca</label><textarea class="input" rows="4" name="storytelling">${esc(c.storytelling)}</textarea></div>
        <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Mais opções</summary><div class="mt-3 space-y-3">
          ${custom ? `<div class="grid grid-cols-2 gap-3"><div><label class="label">Cor principal</label><input type="color" class="h-10 w-full rounded" name="corPrimaria" value="${esc(cfg.corPrimaria || '#4f46e5')}"></div>
            <div><label class="label">Cor de fundo</label><input type="color" class="h-10 w-full rounded" name="corFundo" value="${esc(cfg.corFundo || '#ffffff')}"></div></div>
            <div><label class="label">WhatsApp (com DDD)</label><input class="input" name="whatsapp" value="${esc(cfg.whatsapp)}" placeholder="5511999999999"></div>` : ''}
          <div><label class="label">Depoimentos escritos (um por linha: Nome | texto)</label><textarea class="input" rows="3" name="depoimentos" placeholder="Ana | Chegou rápido e serviu certinho">${esc((c.depoimentos || []).filter((d) => d.origem !== 'criativo').map((d) => `${d.nome} | ${d.texto}`).join('\n'))}</textarea>
            <p class="hint">Use depoimentos reais. Os gerados por IA são apenas modelos. Os depoimentos puxados de criativos (abaixo) não aparecem aqui — são geridos à parte.</p></div>
          <div><label class="label">Newsletter — título</label><input class="input" name="newsletterTitulo" value="${esc(c.newsletterTitulo)}"></div>
          <div><label class="label">Política de trocas</label><textarea class="input" rows="2" name="trocas">${esc(c.politicas?.trocas)}</textarea></div>
          <div><label class="label">Política de envio</label><textarea class="input" rows="2" name="envio">${esc(c.politicas?.envio)}</textarea></div>
          <div><label class="label">Política de privacidade</label><textarea class="input" rows="2" name="privacidade">${esc(c.politicas?.privacidade)}</textarea></div>
        </div></details>
        <div class="flex flex-wrap gap-2"><button class="btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar conteúdo</button>
          <button class="btn-ia" type="button" data-ia title="A IA escreve os textos usando o perfil de marca e os produtos"><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar textos com IA</button></div>
        <div id="nota-ia"></div></form>

      <div class="card space-y-3"><h3 class="font-semibold">2. Exportar e entregar</h3>
        ${custom ? `
          <p class="caption">Baixe o site (um único arquivo <code>index.html</code>). Abra no navegador para conferir e depois publique em qualquer hospedagem estática.</p>
          <button class="btn-primary" data-baixar-site ${semProdutos ? 'disabled' : ''}><i class="fa-solid fa-download"></i> Baixar site (index.html)</button>
          <button class="btn-ghost" data-preview ${semProdutos ? 'disabled' : ''}><i class="fa-solid fa-eye"></i> Pré-visualizar</button>`
        : `
          <div><label class="label">Plataforma</label><select class="input" data-plat>${opcoes(PLATAFORMAS, site.plataforma)}</select></div>
          <button class="btn-primary" data-csv ${semProdutos ? 'disabled' : ''}><i class="fa-solid fa-file-csv"></i> Baixar catálogo (CSV)</button>
          <button class="btn-ia" data-pacote ${semProdutos ? 'disabled' : ''} title="A IA gera banners, briefing do tema e textos de página"><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar banners e briefing do tema</button>
          ${site.pacote ? `<button class="btn-ghost" data-baixar-pacote><i class="fa-solid fa-download"></i> Baixar banners e briefing (.txt)</button>` : ''}`}
        <div><label class="label">Link publicado (opcional)</label><input class="input" name="link" data-link value="${esc(site.linkPublicado)}" placeholder="https://…">
          <p class="hint">Assim que preenchido, a aba Campanhas passa a sugerir este link como destino da campanha automaticamente.</p></div>
        <div><label class="label">Status</label><select class="input" data-status>${opcoes(STATUS_SITE, site.status)}</select></div>
        <hr class="border-slate-200">
        <p class="caption">O manual de handoff é o passo a passo para quem vai publicar/importar${custom ? ' e ligar o checkout' : ''}.</p>
        <button class="btn-primary" data-manual><i class="fa-solid fa-file-pdf"></i> Gerar manual de handoff (PDF)</button></div></div>

    <div class="card mt-4"><h3 class="mb-1 font-semibold">Prova social a partir de criativos aprovados</h3>
      <p class="caption mb-3">Em vez de montar depoimentos do zero: marque "usar como prova social" no detalhe de um criativo aprovado (aba Criativos) e traga aqui, com o vídeo/imagem anexado quando houver.</p>
      ${marcados.length ? `<div class="space-y-1 text-sm mb-3">${marcados.map((cr) => `<div class="flex items-center gap-2"><i class="fa-solid fa-circle-check text-emerald-500"></i><b>${esc(cr.nome)}</b> ${cr.arquivoUrl ? tag('com mídia', 'tag-ok') : tag('só texto (hook)')}</div>`).join('')}</div>
        <button class="btn-primary btn-sm" data-sync-prova><i class="fa-solid fa-arrows-rotate"></i> Atualizar depoimentos com estes ${marcados.length} criativo(s)</button>`
        : `<p class="hint">Nenhum criativo aprovado marcado ainda. Abra um criativo aprovado (Criativos) e marque "Usar como prova social no site".</p>`}
      ${(c.depoimentos || []).some((d) => d.origem === 'criativo') ? `<div class="mt-3 grid gap-2 sm:grid-cols-2">${(c.depoimentos || []).filter((d) => d.origem === 'criativo').map((d) => `
        <div class="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2 text-sm"><b>${esc(d.nome)}</b>${d.midiaUrl ? ` ${tag('com mídia', 'tag-ok')}` : ''}<p class="line-clamp-2 text-slate-600">“${esc(d.texto)}”</p></div>`).join('')}</div>` : ''}
    </div>
    ${site.pacote ? `<div class="card mt-4"><h3 class="mb-2 font-semibold">Banners e briefing do tema</h3>${iaNota('Criado pela IA para a plataforma escolhida. Use os textos nos banners e o briefing para configurar o tema.')}
      ${pacoteHTML(site.pacote)}</div>` : ''}`;

  on(root, 'click', '[data-trocar]', async () => { await salvarSite({ modo: null }); recarregar(); });

  on(root, 'click', '[data-sync-prova]', (b) => ocupado(b, async () => {
    const novos = marcados.map((cr) => criativoParaDepoimento(cliente, cr));
    const depoimentos = mesclarDepoimentos(c.depoimentos, novos);
    await salvarSite({ conteudo: { ...c, depoimentos } });
    toast(`Prova social atualizada: ${novos.length} criativo(s).`); recarregar();
  }));

  const lerConteudo = () => {
    const v = lerForm($('#fc', root));
    const escritos = listaDeLinhas(v.depoimentos).map((l) => { const [nome, ...t] = l.split('|'); return { nome: nome.trim(), texto: t.join('|').trim() }; }).filter((d) => d.texto);
    // Preserva os depoimentos puxados de criativos: este formulário só edita os escritos à mão.
    const dep = [...escritos, ...(c.depoimentos || []).filter((d) => d.origem === 'criativo')];
    return {
      conteudo: { ...c, heroTitulo: v.heroTitulo, heroSubtitulo: v.heroSubtitulo, heroCta: v.heroCta, storytelling: v.storytelling, depoimentos: dep,
        newsletterTitulo: v.newsletterTitulo, politicas: { trocas: v.trocas, envio: v.envio, privacidade: v.privacidade } },
      config: { ...cfg, ...(custom ? { corPrimaria: v.corPrimaria, corFundo: v.corFundo, whatsapp: v.whatsapp } : {}) },
    };
  };
  on(root, 'submit', '#fc', async (f, ev) => { ev.preventDefault(); await ocupado(f.querySelector('[type=submit]'), async () => { await salvarSite(lerConteudo()); toast('Conteúdo salvo.'); recarregar(); }); });

  on(root, 'click', '[data-ia]', async (b) => {
    await ocupado(b, async () => {
      const r = await gerarConteudoSite({ cliente, produtos });
      await salvarSite({ conteudo: { ...c, ...r, depoimentos: r.depoimentos || [] } });
      toast('Textos gerados pela IA. Revise antes de exportar.'); recarregar();
    });
  });

  const html = () => gerarSiteHTML({ cliente, produtos, conteudo: (site.conteudo || {}), config: (site.config || {}) });
  on(root, 'click', '[data-baixar-site]', async () => {
    baixarTexto(`${slug(cliente.nome) || 'loja'}-index.html`, html(), 'text/html;charset=utf-8');
    await salvarSite({ exportadoEm: new Date().toISOString(), status: site.status === 'rascunho' ? 'pronto' : site.status }); recarregar();
  });
  on(root, 'click', '[data-preview]', () => { const w = window.open('', '_blank'); if (w) { w.document.open(); w.document.write(html()); w.document.close(); } else toast('O navegador bloqueou a janela. Libere pop-ups.', 'erro'); });
  on(root, 'change', '[data-link]', (i) => salvarSite({ linkPublicado: i.value.trim(), ...(i.value.trim() ? { status: 'publicado' } : {}) }).then(() => toast('Link salvo.')));
  on(root, 'change', '[data-status]', (s) => salvarSite({ status: s.value }).then(recarregar));
  on(root, 'change', '[data-plat]', (s) => salvarSite({ plataforma: s.value }).then(recarregar));

  on(root, 'click', '[data-csv]', async () => {
    const csv = site.plataforma === 'shopify' ? csvShopify(produtos, cliente) : csvNuvemshop(produtos, cliente);
    baixarTexto(`catalogo-${site.plataforma}-${slug(cliente.nome)}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
    await salvarSite({ exportadoEm: new Date().toISOString() }); toast('CSV gerado. Confira as colunas no passo a passo do manual.'); recarregar();
  });
  on(root, 'click', '[data-pacote]', async (b) => {
    await ocupado(b, async () => { const pacote = await gerarTextosPacote({ cliente, produtos, plataforma: nomePlat(site.plataforma) }); await salvarSite({ pacote }); toast('Banners e briefing gerados.'); recarregar(); });
  });
  on(root, 'click', '[data-baixar-pacote]', () => baixarTexto(`pacote-${slug(cliente.nome)}.txt`, pacoteTexto(site.pacote), 'text/plain;charset=utf-8'));

  on(root, 'click', '[data-manual]', async () => {
    const versao = (site.versaoManual || 0) + 1;
    (await (custom ? manualCustom : manualPacote)({ cliente, site, produtos, versao })).salvar(`manual-handoff-${slug(cliente.nome)}-v${versao}.pdf`);
    await salvarSite({ versaoManual: versao }); toast(`Manual v${versao} gerado.`); recarregar();
  });
});

function pacoteHTML(p) {
  const banners = (p.banners || []).map((b) => `<li><b>${esc(b.titulo)}</b> — ${esc(b.subtitulo)} <span class="tag">${esc(b.cta)}</span> <span class="hint">${esc(b.uso)}</span></li>`).join('');
  const t = p.briefingTema || {};
  return `<div class="mt-3 grid gap-4 md:grid-cols-2"><div><h4 class="text-sm font-semibold">Banners</h4><ul class="list-disc space-y-1 pl-5 text-sm">${banners}</ul></div>
    <div><h4 class="text-sm font-semibold">Briefing do tema</h4><p class="text-sm">Estilo: ${esc(t.estilo)}</p><p class="text-sm">Tipografia: ${esc(t.tipografia)}</p>
    <p class="mt-1 flex gap-1">${(t.paletaSugerida || []).map((h) => `<span class="inline-block h-6 w-6 rounded border" style="background:${esc(h)}" title="${esc(h)}"></span>`).join('')}</p>
    <p class="text-sm">Seções da home: ${esc((t.secoesHome || []).join(' → '))}</p><p class="text-sm">${esc(t.observacoes)}</p></div></div>`;
}
function pacoteTexto(p) {
  const t = p.briefingTema || {};
  return ['BANNERS', ...(p.banners || []).map((b) => `- ${b.titulo} | ${b.subtitulo} | CTA: ${b.cta} | ${b.uso}`), '', 'BRIEFING DO TEMA',
    `Estilo: ${t.estilo}`, `Tipografia: ${t.tipografia}`, `Paleta: ${(t.paletaSugerida || []).join(', ')}`, `Seções: ${(t.secoesHome || []).join(' > ')}`, `Obs.: ${t.observacoes}`, '',
    'SOBRE', p.textosPagina?.sobre || '', '', 'FAQ', ...(p.textosPagina?.faq || []).map((f) => `P: ${f.p}\nR: ${f.r}`), '', 'DESCRIÇÕES DE PRODUTO',
    ...(p.descricoesProdutos || []).map((d) => `${d.nome}\n${d.descricao}\nSEO: ${d.seoTitulo} — ${d.seoDescricao}`)].join('\n');
}

// ---------- manuais de handoff (PDF) ----------
async function manualCustom({ cliente, site, produtos, versao }) {
  const pdf = await criarPdf(`Manual de handoff — ${cliente.nome}`, `Site personalizado · versão ${versao} · gerado em ${new Date().toLocaleDateString('pt-BR')} · ${produtos.length} produto(s)`);
  pdf.secao('1. O que você recebeu')
    .texto('Um arquivo index.html autocontido (HTML, CSS e JavaScript no mesmo arquivo) com: banner principal, categorias, mais vendidos, sale, catálogo, história da marca, depoimentos, newsletter, rodapé com políticas, botão flutuante de WhatsApp e carrinho que funciona no navegador do visitante.')
    .texto('IMPORTANTE: o site NÃO processa pagamentos. O botão "Finalizar compra" chama a função window.checkoutHandler(itens), no fim do arquivo. É o ponto de encaixe onde você liga um checkout de terceiro (seção 3).');
  pdf.secao('2. Como publicar o site')
    .lista(['Abra o index.html no navegador e confira textos, preços, fotos e cores.', 'Troque os depoimentos-modelo por depoimentos reais e revise as políticas com um profissional (texto-base, sem valor jurídico).',
      'Publique em uma hospedagem estática (Netlify, Vercel, Cloudflare Pages, Firebase Hosting, GitHub Pages): crie o projeto e envie o arquivo index.html.', 'Aponte o domínio próprio do cliente para a hospedagem, seguindo as instruções do provedor.',
      'Informe o link publicado na aba Site/Loja do app para registrar a entrega.'], true);
  pdf.secao('3. Ligando o checkout (escolha UMA opção)')
    .texto('Em todos os casos, o pagamento acontece na página segura do provedor. Nunca coloque chaves secretas dentro do index.html — ele é público.', { negrito: true });
  pdf.texto('Opção A — Shopify Buy Button', { negrito: true }).lista(['Crie uma conta Shopify e cadastre os mesmos produtos (dá para usar o CSV do modo pacote).', 'Instale/ative o canal "Buy Button" no admin da Shopify.',
    'Crie um Buy Button para cada produto (ou uma coleção) e copie o código gerado.', 'No index.html, cole o código do botão no ponto marcado como PONTO DE ENCAIXE DO CHECKOUT, ou faça o checkoutHandler redirecionar para a URL de checkout do produto.',
    'Teste uma compra em modo de teste antes de divulgar.'], true);
  pdf.texto('Opção B — Mercado Pago Checkout Pro', { negrito: true }).lista(['Crie uma conta de vendedor no Mercado Pago e uma aplicação em "Suas integrações" para obter as credenciais.',
    'Como a criação da "preferência de pagamento" exige o Access Token (SECRETO), ela precisa rodar em um servidor seu (ex.: função serverless). Nunca no navegador.', 'Esse servidor recebe os itens do carrinho, cria a preferência via API e devolve a URL (init_point).',
    'No index.html, faça o window.checkoutHandler chamar seu servidor e redirecionar o cliente para o init_point.', 'Configure as URLs de retorno (sucesso/falha) e teste com usuários de teste do Mercado Pago.'], true);
  pdf.texto('Opção C — Stripe Payment Links', { negrito: true }).lista(['Crie uma conta Stripe e, no Dashboard, crie um Payment Link para cada produto (preço fixo).', 'Copie a URL de cada Payment Link (algo como buy.stripe.com/...).',
    'No index.html, associe cada produto ao seu link e faça o checkoutHandler redirecionar para ele. Payment Links não exigem servidor, mas atendem 1 produto por link (não o carrinho inteiro).', 'Para carrinho com vários itens, use Stripe Checkout Sessions em um servidor seu.', 'Teste com cartões de teste do Stripe antes de ativar o modo real.'], true);
  pdf.secao('4. Newsletter e WhatsApp')
    .lista(['Newsletter: o formulário só mostra confirmação local. Ligue-o ao Mailchimp, Brevo ou ferramenta similar (embed/ação do formulário).', `WhatsApp: ${site.config?.whatsapp ? 'já configurado (' + site.config.whatsapp + ').' : 'informe o número em "Configurar loja" e gere o site de novo.'}`]);
  pdf.secao('5. Checklist final').lista(['Fotos e preços conferidos', 'Depoimentos reais', 'Políticas revisadas', 'Checkout testado de ponta a ponta', 'Domínio e HTTPS funcionando', 'Pixel/analytics instalados (se houver)']);
  return pdf;
}

async function manualPacote({ cliente, site, produtos, versao }) {
  const plat = nomePlat(site.plataforma);
  const pdf = await criarPdf(`Manual de handoff — ${cliente.nome}`, `Pacote ${plat} · versão ${versao} · gerado em ${new Date().toLocaleDateString('pt-BR')} · ${produtos.length} produto(s)`);
  pdf.secao('1. O que você recebeu').lista(['Catálogo de produtos em CSV, no formato de importação da ' + plat + '.', 'Banners e textos prontos (título, subtítulo, CTA e onde usar).', 'Briefing do tema: estilo, paleta, tipografia e seções da home.', 'Textos de página (sobre, FAQ) e descrições/SEO dos produtos, quando gerados.']);
  if (site.plataforma === 'shopify') {
    pdf.secao('2. Importando o catálogo na Shopify').lista(['No admin, vá em Produtos > Importar e selecione o CSV.', 'Marque a opção de sobrescrever apenas se já existirem produtos com o mesmo Handle.', 'Revise a prévia da importação e conclua.',
      'Confira preços, variações e imagens (as imagens são baixadas das URLs do CSV; elas precisam estar acessíveis).', 'Ajuste estoque, peso e categoria de produto, que vão em branco.'], true);
    pdf.secao('3. Configurando a loja').lista(['Escolha um tema em Loja virtual > Temas e aplique a paleta e a tipografia do briefing.', 'Suba os banners no bloco de imagem/slideshow da home.', 'Crie as páginas Sobre e FAQ com os textos fornecidos.', 'Cadastre as políticas em Configurações > Políticas.', 'Configure frete e meios de pagamento (Shopify Payments ou provedor local).'], true);
  } else {
    pdf.secao('2. Importando o catálogo na Nuvemshop').lista(['No admin, vá em Produtos > Importar/Exportar e baixe a planilha modelo da própria Nuvemshop para comparar as colunas com o CSV gerado.', 'Se os nomes de colunas divergirem, ajuste o CSV para o modelo oficial (a plataforma pode alterar o formato).',
      'Envie o CSV e siga o assistente de importação.', 'Adicione as fotos dos produtos (a importação por planilha usa as fotos já hospedadas; envie manualmente se necessário).', 'Revise preços, variações, estoque e categorias.'], true);
    pdf.secao('3. Configurando a loja').lista(['Escolha um tema e aplique a paleta e a tipografia do briefing (Design > Personalizar).', 'Suba os banners no carrossel/banner principal.', 'Crie as páginas Sobre e FAQ com os textos fornecidos.', 'Cadastre as políticas de trocas, envio e privacidade.', 'Ative os meios de pagamento (Nuvempago, Mercado Pago, etc.) e de envio.'], true);
  }
  const t = site.pacote?.briefingTema;
  if (t) pdf.secao('4. Briefing do tema').texto(`Estilo: ${t.estilo}`).texto(`Tipografia: ${t.tipografia}`).texto(`Paleta: ${(t.paletaSugerida || []).join(', ')}`).texto(`Seções da home: ${(t.secoesHome || []).join(' > ')}`).texto(t.observacoes || '');
  if (site.pacote?.banners?.length) pdf.secao('5. Banners').lista(site.pacote.banners.map((b) => `${b.uso}: "${b.titulo}" / "${b.subtitulo}" [${b.cta}]`));
  pdf.secao('Checklist final').lista(['Produtos e preços conferidos', 'Banners e textos publicados', 'Pagamento e frete configurados', 'Pedido de teste realizado', 'Domínio conectado']);
  return pdf;
}
