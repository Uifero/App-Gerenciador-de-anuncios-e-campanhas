// Aba Site/Loja: modo "custom" (site HTML exportável) ou "pacote_plataforma" (CSV + textos p/ Nuvemshop/Shopify),
// ambos com manual de handoff em PDF. Nunca processa pagamento: só marca o ponto de encaixe de checkout de terceiros.
import { db, COL } from '../core/storage.js';
import { gerarConteudoSite, gerarTextosPacote, gerarFaqSite, objecoesDe } from '../core/ia.js';
import { gerarSiteHTML, faqValida, FORMAS_PAGAMENTO, PAGAMENTOS_PADRAO } from '../lib/sitegen.js';
import { montarPerguntasSite, progressoSite, PAGAMENTOS_PRETENDIDOS, TOTAL_PERGUNTAS } from './perguntas-site.js';
import { csvShopify, csvNuvemshop, slug, comTextosDoPacote } from '../lib/csv.js';
import { criarPdf } from '../lib/pdf.js';
import { rastreamentoDe, passosRastreamentoPacote, passosExtrasPacote, indicadorPixel } from '../lib/rastreamento.js';
import { temCustom, temPacote, baseDoCustom, baseDoPacote, aplicarBaseNoPacote, aplicarBaseNoCustom, divergencias, baseParaGerar, AVISO_MODOS } from '../lib/site-modos.js';
import { criarZip } from '../lib/zip.js';
import { estadoDoSite, registrarVersao, versoesDoModo } from '../lib/site-blocos.js';
import { montarAjusteSite } from './ajuste-site.js';
import { montarPainelMaterial } from './material-site.js';
import { provasEmImagem, depoimentoDeProva, mesclarProvasNoSite, depoimentoGerido, EXIBICOES_PROVA, ORIGEM_PROVA, montarDepoimentos, temProvaReal } from '../lib/prova-social.js';
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

/** FAQ <-> texto do formulário: uma pergunta por linha, "pergunta | resposta". */
export const faqParaTexto = (faq = []) => faq.map((f) => `${f.p} | ${f.r}`).join('\n');
export const textoParaFaq = (txt) => listaDeLinhas(txt).map((l) => { const [p, ...r] = l.split('|'); return { p: p.trim(), r: r.join('|').trim() }; }).filter((f) => f.p);
/** Sem IA: uma linha por objeção, já em forma de pergunta, com a resposta em branco para completar. */
export const perguntasDasObjecoes = (cliente) => objecoesDe(cliente).map((o) => `${/[?？]$/.test(o) ? o : o.charAt(0).toUpperCase() + o.slice(1) + '?'} | `).join('\n');

export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  const [produtos, sites, criativos, materiais] = await Promise.all([
    db.listar(COL.produtos, { clienteId: cliente.id }), db.listar(COL.sites, { clienteId: cliente.id }), db.listar(COL.criativos, { clienteId: cliente.id }),
    db.listar(COL.materiais, { clienteId: cliente.id }),
  ]);
  let site = sites[0] || null;
  // Criativos aprovados marcados "usar como prova social" (toggle na aba Criativos) — candidatos a depoimento do site.
  const marcados = criativos.filter((c) => c.provaSocial && ['aprovado', 'em_uso', 'pausado'].includes(c.status));

  const salvarSite = async (patch) => {
    if (site) { await db.atualizar(COL.sites, site.id, patch); Object.assign(site, patch); }
    else site = await db.criar(COL.sites, { clienteId: cliente.id, status: 'rascunho', versaoManual: 0, ...patch });
  };
  // Mudança de conteúdo fora do "Ajustar este site" (formulário, geração com IA, sincronizar): se o site já tem versões,
  // vira versão também (o "Voltar para esta versão" continua fiel); uma mudança proposta em aberto é descartada.
  const salvarEVersionar = async (patch, resumo, modo = site?.modo === 'custom' ? 'custom' : 'pacote') => {
    const extra = {};
    if (site?.rascunhoAjuste?.modo === modo) { extra.rascunhoAjuste = null; toast('A mudança proposta em "Ajustar este site" foi descartada, porque o conteúdo mudou por outro caminho.', 'info'); }
    if (versoesDoModo(site, modo).length) Object.assign(extra, registrarVersao(site, { modo, estadoAntes: estadoDoSite(site, modo), estadoDepois: estadoDoSite({ ...site, ...patch }, modo), resumo, origem: 'formulario' }));
    await salvarSite({ ...patch, ...extra });
  };

  // Geração dos textos com IA no modo do site — usada pelo botão do formulário e pelo "Gerar site com essas respostas".
  // Se o OUTRO modo já foi gerado e este ainda não, a base (textos principais, cores, FAQ, depoimentos) vem de lá e é
  // reaplicada por cima do que a IA escrever (lib/site-modos.js): o cliente continua vendo o que já aprovou.
  const gerarComIa = (b) => ocupado(b, async () => {
    const base = baseParaGerar(site, site.modo === 'custom' ? 'custom' : 'pacote');
    const reaproveitou = base ? { avisoModosVisto: false, baseReaproveitadaEm: new Date().toISOString() } : {};
    if (site.modo === 'custom') {
      const atual = site.conteudo || {};
      // Depoimentos: com prova social real (texto, prints, criativos, escritos à mão), só o real — a IA nem escreve
      // modelo. Sem nenhuma prova, os modelos da IA, sempre marcados "[MODELO – substituir…]" (lib/prova-social.js).
      const argsProva = { cliente, materiais, atuais: atual.depoimentos || [], provasOcultas: atual.provasOcultas || [] };
      const r = await gerarConteudoSite({ cliente, produtos, base, semDepoimentos: temProvaReal(argsProva) });
      const { depoimentos, usouModelos } = montarDepoimentos({ ...argsProva, modelosIa: r.depoimentos || [] });
      const gerado = { ...atual, ...r, depoimentos };
      await salvarEVersionar({ ...(base ? aplicarBaseNoCustom(gerado, site.config || {}, base) : { conteudo: gerado }), ...reaproveitou }, 'Textos gerados de novo pela IA');
      toast(base ? 'Site gerado reaproveitando o texto, as cores e a FAQ do pacote que o cliente já viu. A IA só completou o que faltava.'
        : `Textos gerados pela IA${faqValida(r.faq).length ? ` (com ${faqValida(r.faq).length} pergunta(s) frequente(s))` : ''}. ${usouModelos ? 'Sem prova social cadastrada: os depoimentos são MODELOS marcados para substituir.' : `Depoimentos: só as ${depoimentos.length} prova(s) social(is) reais do cliente.`} Revise e use "Ver prévia" ou "Baixar pasta do site".`);
    } else {
      const gerado = await gerarTextosPacote({ cliente, produtos, plataforma: nomePlat(site.plataforma), base });
      await salvarEVersionar({ pacote: base ? aplicarBaseNoPacote(gerado, base) : gerado, ...reaproveitou }, 'Pacote gerado de novo pela IA');
      toast(base ? 'Pacote gerado reaproveitando o texto, as cores e a FAQ do site personalizado. Revise abaixo.' : 'Banners, briefing do tema e textos gerados. Revise abaixo.');
    }
    recarregar();
  });
  const ctxPerguntas = { cliente, produtos, salvarSite, recarregar, gerar: gerarComIa, get site() { return site; } };

  // Painel "Material para montar o site" (só leitura + links para o campo real). "Editar" de um item do perfil abre
  // o questionário (abaixo) na pergunta certa, com o campo em foco.
  const irParaPergunta = (id) => {
    const card = $('[data-perguntas-site]', root); if (!card) return;
    card.open = true;
    const alvoP = id ? $(`[data-pergunta="${id}"]`, card) : card;
    (alvoP || card).scrollIntoView({ block: 'center' });
    alvoP?.querySelector?.('textarea, input:not([type=checkbox]):not([type=radio]):not([type=file]), select')?.focus({ preventScroll: true });
  };
  const painelMaterial = () => montarPainelMaterial($('[data-painel]', root), {
    cliente, produtos, materiais, site, respondidas: progressoSite(cliente, site, produtos, materiais.length), totalPerguntas: TOTAL_PERGUNTAS,
    recarregar, gerar: site?.modo ? gerarComIa : null, irParaPergunta,
  });

  // ---------- escolha do modo ----------
  if (!site?.modo) {
    root.innerHTML = `${cabecalho('Site / Loja', 'Escolha como a loja deste cliente será entregue. Você pode trocar depois.')}
    <div data-painel></div>
    <div class="grid gap-4 md:grid-cols-2">
      <button class="card text-left transition hover:border-indigo-400 hover:shadow-md" data-modo="custom"><div class="mb-2 text-2xl text-indigo-500"><i class="fa-solid fa-code"></i></div>
        <h3 class="font-semibold">Site personalizado</h3><p class="caption">Gera um site pronto, com catálogo, carrinho, banner, depoimentos e WhatsApp, para publicar numa hospedagem gratuita própria do cliente (o app explica o passo a passo). O pagamento é ligado a um serviço externo.</p></button>
      <button class="card text-left transition hover:border-indigo-400 hover:shadow-md" data-modo="pacote_plataforma"><div class="mb-2 text-2xl text-indigo-500"><i class="fa-solid fa-box-open"></i></div>
        <h3 class="font-semibold">Pacote para Nuvemshop/Shopify</h3><p class="caption">Gera o catálogo em CSV, banners e textos prontos e o briefing do tema para importar na plataforma.</p></button></div>
    ${temCustom(site) || temPacote(site) ? `<p class="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-2 text-sm"><i class="fa-solid fa-circle-info mr-1"></i> Este cliente já tem ${temCustom(site) && temPacote(site) ? 'as duas versões' : temCustom(site) ? 'o site personalizado' : 'o pacote de plataforma'}. Nada se perde ao trocar: o texto, as cores e a FAQ que já existem são reaproveitados na outra versão.</p>` : ''}
    <p class="caption mt-4">Ainda não sabe? Converse com o cliente usando as perguntas abaixo — a pergunta (i) escolhe o modo por você.</p>
    <div class="mt-2" data-perguntas></div>`;
    montarPerguntasSite($('[data-perguntas]', root), ctxPerguntas, { aberto: true });
    painelMaterial();
    on(root, 'click', '[data-modo]', async (b) => { await salvarSite({ modo: b.dataset.modo, plataforma: b.dataset.modo === 'pacote_plataforma' ? 'nuvemshop' : null }); recarregar(); });
    return;
  }

  const semProdutos = !produtos.length;
  const c = site.conteudo || {};
  const cfg = site.config || {};
  const custom = site.modo === 'custom';
  const rastro = rastreamentoDe(cliente);
  // Prints de prova social (Materiais etiquetados "prova social") -> depoimentos do site, por escolha da pessoa.
  const provas = provasEmImagem(materiais);
  const exibirAtual = (m) => (c.depoimentos || []).find((d) => d.origem === ORIGEM_PROVA && d.materialId === m.id)?.exibir || '';
  const cartaoProvasHTML = () => `<div class="card mt-4" data-cartao-provas><h3 class="mb-1 font-semibold"><i class="fa-solid fa-star-half-stroke mr-1 text-amber-500"></i> Prints de prova social no site</h3>
      <p class="caption mb-3">Os prints de avaliação guardados (pergunta 10 ou o painel "Material para montar o site") podem entrar nos depoimentos do site como <b>imagem real</b> (mais confiável), como <b>texto</b> ou os dois. Escolha para cada um e clique em salvar. Gerar os textos com IA de novo não apaga essa escolha.</p>
      ${!provas.length ? '<p class="hint">Nenhum print de prova social guardado ainda. Envie em "Material para montar o site", no topo desta aba, ou na pergunta 10.</p>'
        : !custom ? '<p class="hint">No pacote Nuvemshop/Shopify, suba estes prints como imagem na seção de depoimentos do tema (o manual explica onde). Eles estão em Materiais do cliente.</p>'
        : `<div class="grid gap-2 sm:grid-cols-2">${provas.map((m) => `<div class="flex gap-2 rounded-lg border border-slate-200 p-2 text-sm"><img src="${esc(m.url)}" alt="Print de prova social" class="h-20 w-20 shrink-0 rounded border object-cover" loading="lazy">
          <div class="min-w-0 flex-1"><p class="line-clamp-2 text-slate-600">${esc(m.citacao || m.descricao || 'Print de prova social')}</p>
            <select class="input mt-1 !py-1 text-xs" data-exibir-prova="${esc(m.id)}" title="Como este print aparece nos depoimentos do site">${opcoes(EXIBICOES_PROVA, exibirAtual(m))}</select></div></div>`).join('')}</div>
          <button class="btn-primary btn-sm mt-3" data-salvar-provas-site><i class="fa-solid fa-floppy-disk"></i> Salvar a escolha nos depoimentos do site</button>`}</div>`;

  // Consistência entre os dois modos (lib/site-modos.js): aviso fixo e reabrível + oferta de sincronizar edições.
  const doisModos = temCustom(site) && temPacote(site);
  const avisoModosHTML = doisModos || site.baseReaproveitadaEm ? `<details class="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm" data-aviso-modos ${site.avisoModosVisto ? '' : 'open'}>
      <summary class="cursor-pointer font-medium"><i class="fa-solid fa-circle-info mr-1"></i> Este cliente tem as duas versões da loja: por que o visual pode não ficar idêntico</summary>
      <p class="mt-2">${AVISO_MODOS}</p>
      <p class="mt-1 hint">Em outras palavras: o título, a história, as perguntas frequentes, as cores e as fotos dos produtos são os mesmos nas duas versões. O que muda é o "molde" de cada plataforma (fonte, espaçamentos, posição dos blocos). Mostre ao cliente a versão final antes de publicar. Clique no título acima para fechar ou reabrir este aviso.</p></details>` : '';
  const dif = divergencias(site);
  const divergenciaHTML = dif.length ? `<div class="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800" data-divergencia>
      <p><b><i class="fa-solid fa-code-compare mr-1"></i> O texto do formulário "Conteúdo da loja" está diferente do pacote Nuvemshop/Shopify em: ${esc(dif.join(', '))}.</b></p>
      <p class="mt-1">Isso acontece quando um dos dois é editado depois. Nada é copiado sozinho: escolha qual versão vale (banner principal, história/Sobre, perguntas frequentes e cores).</p>
      <div class="mt-2 flex flex-wrap gap-2"><button class="${custom ? 'btn-primary' : 'btn-ghost'} btn-sm" data-sincronizar-modos><i class="fa-solid fa-arrows-rotate"></i> Sincronizar essa edição com o pacote também</button>
        <button class="${custom ? 'btn-ghost' : 'btn-primary'} btn-sm" data-sincronizar-inverso><i class="fa-solid fa-arrows-rotate"></i> Levar o texto do pacote para o site personalizado</button></div></div>` : '';

  root.innerHTML = `${cabecalho(custom ? 'Site personalizado' : 'Pacote de plataforma', custom ? 'Um site pronto, com vitrine e carrinho. Caminho: 1. preencher o conteúdo → 2. ver a prévia → 3. baixar a pasta → 4. publicar (passo a passo no fim da página) → 5. ligar o pagamento (manual de entrega).' : 'Arquivos prontos para montar a loja do cliente na Nuvemshop ou na Shopify. Caminho: 1. conteúdo → 2. gerar banners e textos → 3. baixar catálogo e manual → 4. seguir o manual na plataforma.',
    `<button class="btn-ghost btn-sm" data-trocar title="Voltar e escolher outro modo">Trocar modo</button>`)}
    ${semProdutos ? `<div class="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">Você ainda não cadastrou produtos. <a class="font-semibold underline" href="#/c/${cliente.id}/produtos">Cadastrar agora</a> — o site e o CSV usam essa lista.</div>` : ''}
    <div class="mb-4 flex flex-wrap gap-1">${tag(STATUS_SITE.find(([k]) => k === site.status)?.[1] || site.status, site.status === 'rascunho' ? '' : 'tag-ok')}${tag(produtos.length + ' produto(s)')}
      ${site.plataforma ? tag(nomePlat(site.plataforma), 'tag-info') : ''}${site.versaoManual ? tag('manual v' + site.versaoManual) : ''}${site.exportadoEm ? tag('exportado em ' + dataBR(site.exportadoEm)) : ''}
      ${cliente.siteReferencia ? `<a class="tag tag-info" href="${esc(cliente.siteReferencia)}" target="_blank" rel="noopener">site de referência</a>` : ''}</div>
    <div class="-mt-2 mb-4">${indicadorPixel(cliente)} ${tag(rastro.hotjarId ? 'Hotjar configurado' : 'Hotjar: não usado', rastro.hotjarId ? 'tag-ok' : '')} ${tag(rastro.tawkPropertyId ? 'Chat Tawk.to configurado' : 'Chat ao vivo: não usado', rastro.tawkPropertyId ? 'tag-ok' : '')}
      <p class="hint mt-1">${custom ? 'Os códigos preenchidos no cadastro do cliente (Editar > Rastreamento) entram sozinhos no site gerado e só carregam depois que o visitante aceita os cookies.' : 'Os códigos preenchidos no cadastro do cliente (Editar > Rastreamento) vão para o manual, com o passo a passo para colar na loja.'}</p></div>
    <div data-painel></div>
    ${avisoModosHTML}${divergenciaHTML}
    <div class="mb-4" data-perguntas></div>

    <div class="grid gap-4 lg:grid-cols-2">
      <form id="fc" class="card space-y-3"><h3 class="font-semibold">1. Conteúdo da loja</h3>
        <p class="caption">Preencha à mão e clique em "Salvar conteúdo", ou use "Gerar textos com IA": ela escreve banner, história da marca, políticas${custom ? ' e a FAQ (a partir das objeções do perfil)' : ''}, e <b>substitui</b> o que estiver nos campos. Depoimentos: se o cliente tem prova social cadastrada (texto ou prints), entram só os reais; sem nenhuma, a IA escreve modelos marcados "[MODELO – substituir]". ${custom ? 'Cores e WhatsApp ficam em "Mais opções".' : 'No pacote, estes textos são a base dos banners e da página Sobre.'}</p>
        ${custom && !temCustom(site) && temPacote(site) ? `<div class="rounded-lg border border-sky-200 bg-sky-50 p-2 text-sm">Este cliente já tem o pacote Nuvemshop/Shopify pronto. Para o site sair igual ao que ele já viu, traga os textos e as cores de lá (sem IA), ou use "Gerar textos com IA", que também mantém esses textos e só completa o resto.
          <button type="button" class="btn-ghost btn-sm mt-1" data-trazer-pacote><i class="fa-solid fa-file-import"></i> Trazer texto e cores do pacote (sem IA)</button></div>` : ''}
        <div><label class="label">Título do banner (hero)</label><input class="input" name="heroTitulo" value="${esc(c.heroTitulo)}"></div>
        <div><label class="label">Subtítulo</label><input class="input" name="heroSubtitulo" value="${esc(c.heroSubtitulo)}"></div>
        <div><label class="label">Texto do botão do banner</label><input class="input" name="heroCta" value="${esc(c.heroCta)}"></div>
        <div><label class="label">História da marca</label><textarea class="input" rows="4" name="storytelling">${esc(c.storytelling)}</textarea></div>
        <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Mais opções</summary><div class="mt-3 space-y-3">
          ${custom ? `<div class="grid grid-cols-2 gap-3"><div><label class="label">Cor principal</label><input type="color" class="h-10 w-full rounded" name="corPrimaria" value="${esc(cfg.corPrimaria || '#4f46e5')}"></div>
            <div><label class="label">Cor de fundo</label><input type="color" class="h-10 w-full rounded" name="corFundo" value="${esc(cfg.corFundo || '#ffffff')}"></div></div>
            <div><label class="label">WhatsApp (com DDD)</label><input class="input" name="whatsapp" value="${esc(cfg.whatsapp)}" placeholder="5511999999999"></div>` : ''}
          <div><label class="label">Depoimentos escritos (um por linha: Nome | texto)</label><textarea class="input" rows="3" name="depoimentos" placeholder="Ana | Chegou rápido e serviu certinho">${esc((c.depoimentos || []).filter((d) => !depoimentoGerido(d)).map((d) => `${d.nome} | ${d.texto}`).join('\n'))}</textarea>
            <p class="hint">Use depoimentos reais. Os que começam com "[MODELO" foram escritos pela IA só porque o cliente ainda não tinha prova social: troque por reais. Os depoimentos puxados de criativos e de prints de prova social (abaixo) não aparecem aqui — são geridos à parte.</p></div>
          ${custom ? `<div><label class="label">Perguntas frequentes (uma por linha: pergunta | resposta)</label><textarea class="input" rows="4" name="faq" placeholder="E se não servir? | A troca é grátis em até 30 dias.">${esc(faqParaTexto(c.faq || []))}</textarea>
            <p class="hint">Vira a seção "Perguntas frequentes" do site. Pergunta sem resposta não aparece. ${objecoesDe(cliente).length ? `Base: as ${objecoesDe(cliente).length} objeção(ões) do perfil de marca.` : 'Sem objeções no perfil de marca: com o campo vazio, a seção não aparece no site.'}</p>
            ${objecoesDe(cliente).length ? `<div class="mt-1 flex flex-wrap gap-2"><button type="button" class="btn-ia btn-sm" data-faq-ia title="Só a FAQ: não mexe no resto do conteúdo"><i class="fa-solid fa-wand-magic-sparkles"></i> Escrever FAQ com IA a partir das objeções</button>
              <button type="button" class="btn-ghost btn-sm" data-faq-manual title="Coloca as objeções como perguntas; você escreve as respostas">Montar perguntas das objeções (sem IA)</button></div>` : ''}</div>
          <div><label class="label">Formas de pagamento no selo "Compra segura"</label><div class="flex flex-wrap gap-3 text-sm">${FORMAS_PAGAMENTO.map(([k, t]) => `<label class="flex items-center gap-1"><input type="checkbox" name="pag_${k}" ${(cfg.pagamentos || PAGAMENTOS_PADRAO).includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}</div>
            <p class="hint">Aparece perto do botão "Finalizar compra", com ícones genéricos (sem logotipo de bandeira). Marque só o que o checkout do cliente aceita de verdade.</p></div>` : ''}
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
          <p class="caption">O site é gerado como uma pasta pronta para publicar (com o arquivo <code>index.html</code> dentro). Este app <b>não publica</b> o site em lugar nenhum: veja abaixo, em "Como publicar este site", onde colocar.</p>
          <button class="btn-ghost" data-preview ${semProdutos ? 'disabled' : ''} title="Abre o site numa aba separada, isolada do painel, só para conferir"><i class="fa-solid fa-eye"></i> Ver prévia do site em nova aba</button>
          <button class="btn-primary" data-baixar-zip ${semProdutos ? 'disabled' : ''}><i class="fa-solid fa-file-zipper"></i> Baixar pasta do site pronta para publicar (.zip)</button>
          <button class="btn-ghost btn-sm" data-baixar-site ${semProdutos ? 'disabled' : ''} title="O mesmo site, só o arquivo solto (para quem já sabe onde colocar)"><i class="fa-solid fa-download"></i> Baixar só o arquivo index.html</button>`
        : `
          <div><label class="label">Plataforma</label><select class="input" data-plat>${opcoes(PLATAFORMAS, site.plataforma)}</select></div>
          <p class="caption">Três entregas: o catálogo (planilha que a plataforma importa), os textos/banners e o manual. A loja fica hospedada na própria ${esc(nomePlat(site.plataforma))}, na conta do cliente.</p>
          <button class="btn-primary" data-csv ${semProdutos ? 'disabled' : ''}><i class="fa-solid fa-file-csv"></i> Baixar catálogo de produtos para importar (CSV)</button>
          <button class="btn-ia" data-pacote ${semProdutos ? 'disabled' : ''} title="A IA escreve banners, briefing do tema e textos de página"><i class="fa-solid fa-wand-magic-sparkles"></i> ${site.pacote ? 'Gerar de novo banners, briefing e textos' : 'Gerar banners, briefing do tema e textos com IA'}</button>
          ${temCustom(site) && !temPacote(site) ? '<p class="hint">Como o site personalizado já existe, o título, a história, a FAQ e as cores dele serão mantidos; a IA só completa o resto (briefing do tema e descrições).</p>' : ''}
          ${cliente.logoArquivo ? '<button class="btn-ghost" data-baixar-logo title="O arquivo original, sem compressão, para subir no tema da plataforma"><i class="fa-solid fa-copyright"></i> Baixar o logo (arquivo original)</button>' : '<p class="hint">Sem logo salvo: envie na pergunta 9 ou no painel "Material para montar o site".</p>'}
          ${site.pacote ? `<button class="btn-ghost" data-baixar-pacote><i class="fa-solid fa-download"></i> Baixar banners e briefing em texto (.txt)</button>` : ''}`}
        <div><label class="label">Endereço do site já publicado (opcional)</label><input class="input" name="link" data-link value="${esc(site.linkPublicado)}" placeholder="https://…">
          <p class="hint">Depois de publicar, cole aqui o endereço. A aba Campanhas passa a sugerir este link como destino dos anúncios${custom ? ', e o site baixado de novo já sai com a prévia certa para o WhatsApp' : ''}.</p></div>
        <div><label class="label">Status</label><select class="input" data-status>${opcoes(STATUS_SITE, site.status)}</select></div>
        <hr class="border-slate-200">
        <p class="caption">O manual de entrega é um PDF com o passo a passo para quem vai publicar/importar${custom ? ' e ligar o pagamento' : ''}. Pode mandar direto para o cliente.</p>
        <button class="btn-primary" data-manual><i class="fa-solid fa-file-pdf"></i> Baixar manual de entrega (PDF)</button></div></div>
    <div data-ajuste>${custom || site.pacote ? '' : '<div class="card mt-4"><h3 class="font-semibold">Ajustar o conteúdo deste pacote</h3><p class="caption">Disponível depois de gerar o pacote (botão "Gerar banners, briefing do tema e textos com IA", acima).</p></div>'}</div>
    ${custom ? comoPublicarHTML(cliente) : ''}

    <div class="card mt-4"><h3 class="mb-1 font-semibold">Prova social a partir de criativos aprovados</h3>
      <p class="caption mb-3">Em vez de montar depoimentos do zero: marque "usar como prova social" no detalhe de um criativo aprovado (aba Criativos) e traga aqui, com o vídeo/imagem anexado quando houver.</p>
      ${marcados.length ? `<div class="space-y-1 text-sm mb-3">${marcados.map((cr) => `<div class="flex items-center gap-2"><i class="fa-solid fa-circle-check text-emerald-500"></i><b>${esc(cr.nome)}</b> ${cr.arquivoUrl ? tag('com mídia', 'tag-ok') : tag('só texto (hook)')}</div>`).join('')}</div>
        <button class="btn-primary btn-sm" data-sync-prova><i class="fa-solid fa-arrows-rotate"></i> Atualizar depoimentos com estes ${marcados.length} criativo(s)</button>`
        : `<p class="hint">Nenhum criativo aprovado marcado ainda. Abra um criativo aprovado (Criativos) e marque "Usar como prova social no site".</p>`}
      ${(c.depoimentos || []).some((d) => d.origem === 'criativo') ? `<div class="mt-3 grid gap-2 sm:grid-cols-2">${(c.depoimentos || []).filter((d) => d.origem === 'criativo').map((d) => `
        <div class="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2 text-sm"><b>${esc(d.nome)}</b>${d.midiaUrl ? ` ${tag('com mídia', 'tag-ok')}` : ''}<p class="line-clamp-2 text-slate-600">“${esc(d.texto)}”</p></div>`).join('')}</div>` : ''}
    </div>
    ${cartaoProvasHTML()}
    ${site.pacote ? `<div class="card mt-4"><h3 class="mb-2 font-semibold">Banners e briefing do tema${custom ? ' <span class="text-sm font-normal text-slate-500">(do pacote Nuvemshop/Shopify, não aparece neste site)</span>' : ''}</h3>${iaNota(custom ? 'Guardado da versão pacote deste cliente, só para consulta. O site personalizado usa o formulário "Conteúdo da loja" acima.' : 'Criado pela IA para a plataforma escolhida. Próximo passo: use os textos nos banners da loja e o briefing para escolher e ajustar o tema (o manual de entrega explica onde).')}
      ${pacoteHTML(site.pacote)}</div>` : ''}`;

  on(root, 'click', '[data-trocar]', async () => { await salvarSite({ modo: null }); recarregar(); });
  painelMaterial();

  on(root, 'click', '[data-salvar-provas-site]', (b) => ocupado(b, async () => {
    const novos = provas.map((m) => depoimentoDeProva(m, $(`[data-exibir-prova="${m.id}"]`, root)?.value || ''));
    const depoimentos = mesclarProvasNoSite(c.depoimentos, novos);
    const provasOcultas = provas.filter((m, i) => !novos[i]).map((m) => m.id); // "Não usar": nem o print, nem o texto dele
    await salvarEVersionar({ conteudo: { ...c, depoimentos, provasOcultas } }, 'Depoimentos a partir de prints de prova social');
    toast(`Depoimentos atualizados: ${novos.filter(Boolean).length} print(s) no site. Confira em "Ver prévia".`); recarregar();
  }));

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
    const dep = [...escritos, ...(c.depoimentos || []).filter(depoimentoGerido)];
    return {
      conteudo: { ...c, heroTitulo: v.heroTitulo, heroSubtitulo: v.heroSubtitulo, heroCta: v.heroCta, storytelling: v.storytelling, depoimentos: dep,
        newsletterTitulo: v.newsletterTitulo, politicas: { trocas: v.trocas, envio: v.envio, privacidade: v.privacidade }, ...(custom ? { faq: textoParaFaq(v.faq) } : {}) },
      config: { ...cfg, ...(custom ? { corPrimaria: v.corPrimaria, corFundo: v.corFundo, whatsapp: v.whatsapp, pagamentos: FORMAS_PAGAMENTO.map(([k]) => k).filter((k) => $('#fc', root).elements['pag_' + k]?.checked) } : {}) },
    };
  };
  on(root, 'submit', '#fc', async (f, ev) => { ev.preventDefault(); await ocupado(f.querySelector('[type=submit]'), async () => { await salvarEVersionar(lerConteudo(), 'Edição no formulário "Conteúdo da loja"'); toast('Conteúdo salvo.'); recarregar(); }); });

  on(root, 'click', '[data-ia]', (b) => gerarComIa(b));
  montarPerguntasSite($('[data-perguntas]', root), ctxPerguntas, { aberto: progressoSite(cliente, site, produtos) < TOTAL_PERGUNTAS && !site.exportadoEm });
  on(root, 'click', '[data-faq-manual]', () => {
    const t = $('#fc [name=faq]', root);
    t.value = [t.value.trim(), perguntasDasObjecoes(cliente)].filter(Boolean).join('\n');
    toast('Perguntas colocadas. Escreva a resposta depois do | e clique em "Salvar conteúdo".', 'info');
  });
  on(root, 'click', '[data-faq-ia]', (b) => ocupado(b, async () => {
    const faq = await gerarFaqSite({ cliente, produtos, politicas: c.politicas || {} });
    $('#fc [name=faq]', root).value = faqParaTexto(faq);
    toast(`A IA escreveu ${faq.length} pergunta(s). Revise e clique em "Salvar conteúdo".`, 'info');
  }));

  // Sempre o estado ACEITO (conteúdo + cores + layout dos ajustes); uma mudança proposta em aberto nunca entra no download.
  const htmlDe = (e, extra = {}) => gerarSiteHTML({ cliente, produtos, conteudo: e.conteudo || {}, config: e.config || {}, layout: e.layout || null, url: site.linkPublicado || '', ...extra });
  const html = (extra) => htmlDe({ conteudo: site.conteudo, config: site.config, layout: site.layout }, extra);
  if (custom ? (temCustom(site) || produtos.length) : site.pacote) {
    montarAjusteSite($('[data-ajuste]', root), { cliente, produtos, modo: custom ? 'custom' : 'pacote', get site() { return site; }, salvarSite, recarregar, htmlDe, pacoteHTML })
      .catch((e) => { console.warn('[ajuste do site]', e); $('[data-ajuste]', root).innerHTML = '<p class="hint text-rose-600">Não consegui abrir "Ajustar este site". Recarregue a página.</p>'; });
  }
  const marcarExportado = () => salvarSite({ exportadoEm: new Date().toISOString(), status: site.status === 'rascunho' ? 'pronto' : site.status });
  on(root, 'click', '[data-baixar-site]', async () => {
    baixarTexto(`${slug(cliente.nome) || 'loja'}-index.html`, html(), 'text/html;charset=utf-8');
    await marcarExportado(); recarregar();
  });
  on(root, 'click', '[data-baixar-zip]', async () => {
    const pasta = pastaDoSite(cliente);
    // O logo vai DENTRO da pasta, com os bytes originais (sem converter), e o site aponta para ele.
    const logo = await arquivoDoLogo(cliente);
    if (cliente.logoArquivo && !logo) toast('Não consegui baixar o arquivo do logo agora: o site aponta para o endereço dele na internet.', 'info');
    baixarTexto(`${pasta}.zip`, criarZip([{ nome: `${pasta}/index.html`, conteudo: html(logo ? { logoUrl: logo.nome } : {}) }, ...(logo ? [{ nome: `${pasta}/${logo.nome}`, conteudo: logo.bytes }] : [])]), 'application/zip');
    await marcarExportado();
    toast('Pasta do site baixada. Próximo passo: "Como publicar este site", logo abaixo.', 'info');
    recarregar();
  });
  // Prévia isolada: o site roda num iframe sandbox (origem própria, sem acesso aos dados/login do painel). Antes ele
  // era escrito direto numa aba com a MESMA origem do painel — scripts do cliente (Pixel, Hotjar, Tawk.to) rodariam
  // com acesso ao armazenamento do painel. No iframe o carrinho e o aviso de cookies funcionam, só não guardam a escolha.
  on(root, 'click', '[data-preview]', () => {
    const w = window.open('', '_blank');
    if (!w) return toast('O navegador bloqueou a nova aba. Libere pop-ups para este endereço e tente de novo.', 'erro');
    w.document.open();
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Prévia — ${esc(cliente.nome)}</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style>
<iframe sandbox="allow-scripts allow-popups allow-forms allow-modals" srcdoc="${esc(html())}"></iframe>`);
    w.document.close();
  });
  on(root, 'click', '[data-trazer-pacote]', async (b) => ocupado(b, async () => {
    await salvarSite({ ...aplicarBaseNoCustom(site.conteudo || {}, site.config || {}, baseDoPacote(site)), avisoModosVisto: false, baseReaproveitadaEm: new Date().toISOString() });
    toast('Texto, perguntas frequentes e cor principal trazidos do pacote. Revise e clique em "Salvar conteúdo" se mudar algo.'); recarregar();
  }));
  on(root, 'click', '[data-sincronizar-modos]', (b) => ocupado(b, async () => {
    await salvarEVersionar({ pacote: aplicarBaseNoPacote(site.pacote, baseDoCustom(site)) }, 'Recebeu o texto e as cores do site personalizado', 'pacote');
    toast('Pacote atualizado com o texto e as cores do formulário. Baixe os banners e o manual de novo para entregar a versão nova.'); recarregar();
  }));
  on(root, 'click', '[data-sincronizar-inverso]', (b) => ocupado(b, async () => {
    await salvarEVersionar(aplicarBaseNoCustom(site.conteudo || {}, site.config || {}, baseDoPacote(site)), 'Recebeu o texto e as cores do pacote', 'custom');
    toast('Site personalizado atualizado com o texto e as cores do pacote. Baixe a pasta do site de novo para entregar.'); recarregar();
  }));
  $('[data-aviso-modos]', root)?.addEventListener('toggle', (e) => { if (!e.target.open && !site.avisoModosVisto) salvarSite({ avisoModosVisto: true }); });
  on(root, 'change', '[data-link]', (i) => salvarSite({ linkPublicado: i.value.trim(), ...(i.value.trim() ? { status: 'publicado' } : {}) }).then(() => toast('Link salvo.')));
  on(root, 'change', '[data-status]', (s) => salvarSite({ status: s.value }).then(recarregar));
  on(root, 'change', '[data-plat]', (s) => salvarSite({ plataforma: s.value }).then(recarregar));

  on(root, 'click', '[data-csv]', async () => {
    const lista = comTextosDoPacote(produtos, site.pacote); // descrições/SEO ajustados no pacote, quando houver
    const csv = site.plataforma === 'shopify' ? csvShopify(lista, cliente) : csvNuvemshop(lista, cliente);
    baixarTexto(`catalogo-${site.plataforma}-${slug(cliente.nome)}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
    await salvarSite({ exportadoEm: new Date().toISOString() }); toast('CSV gerado. Confira as colunas no passo a passo do manual.'); recarregar();
  });
  on(root, 'click', '[data-pacote]', (b) => gerarComIa(b));
  on(root, 'click', '[data-baixar-logo]', (b) => ocupado(b, async () => {
    const logo = await arquivoDoLogo(cliente);
    if (!logo) throw new Error('Não consegui baixar o logo agora. Tente de novo.');
    baixarTexto(`${slug(cliente.nome) || 'loja'}-${logo.nome}`, logo.bytes, cliente.logoArquivo.tipo);
  }));
  on(root, 'click', '[data-baixar-pacote]', () => baixarTexto(`pacote-${slug(cliente.nome)}.txt`, pacoteTexto(site.pacote), 'text/plain;charset=utf-8'));

  on(root, 'click', '[data-manual]', async () => {
    const versao = (site.versaoManual || 0) + 1;
    (await (custom ? manualCustom : manualPacote)({ cliente, site, produtos, versao })).salvar(`manual-entrega-${slug(cliente.nome)}-v${versao}.pdf`);
    await salvarSite({ versaoManual: versao }); toast(`Manual v${versao} gerado.`); recarregar();
  });
});

/** Nome da pasta do site dentro do .zip (e do .zip em si). */
const pastaDoSite = (cliente) => `site-${slug(cliente.nome) || 'loja'}`;

/** Bytes ORIGINAIS do logo salvo (sem converter) e o nome do arquivo na pasta: { nome: 'logo.png', bytes } ou null. */
async function arquivoDoLogo(cliente) {
  const l = cliente.logoArquivo; if (!l?.url) return null;
  try {
    const r = await fetch(l.url); if (!r.ok) return null;
    const ext = { 'image/svg+xml': 'svg', 'image/jpeg': 'jpg' }[l.tipo] || 'png';
    return { nome: `logo.${ext}`, bytes: new Uint8Array(await r.arrayBuffer()) };
  } catch { return null; }
}

/**
 * "Como publicar este site" (modo custom). Política: o site do CLIENTE nunca roda no servidor/VM nem no projeto
 * Firebase do painel — cada cliente numa hospedagem própria e separada (isola problema técnico e pico de tráfego de
 * um cliente do painel de trabalho, e deixa claro de quem é o site). Este app só gera o arquivo; não publica.
 */
function comoPublicarHTML(cliente) {
  return `<div class="card mt-4" data-como-publicar><h3 class="mb-1 font-semibold"><i class="fa-solid fa-globe mr-1 text-indigo-500"></i> Como publicar este site</h3>
    <p class="caption mb-3">Publicar = colocar o site na internet com um endereço (ex.: <code>loja-da-ana.netlify.app</code>). Este app não faz isso sozinho: você envia a pasta baixada para uma hospedagem gratuita. Leva uns 5 minutos na primeira vez.</p>
    <ol class="list-decimal space-y-1 pl-5 text-sm">
      <li>Clique em <b>"Baixar pasta do site pronta para publicar (.zip)"</b>, acima.</li>
      <li>No computador, abra a pasta Downloads, clique com o botão direito no arquivo <code>${esc(pastaDoSite(cliente))}.zip</code> e escolha <b>"Extrair tudo"</b> (no Mac, dois cliques). Aparece a pasta <code>${esc(pastaDoSite(cliente))}</code>, com o site dentro.</li>
      <li>Entre em <a class="text-indigo-600 underline" href="https://app.netlify.com/drop" target="_blank" rel="noopener">app.netlify.com/drop</a> e crie uma conta grátis (sem conta, o site sai do ar depois de pouco tempo). O ideal é uma conta <b>no e-mail do cliente</b>, ou uma conta sua separada só para ele.</li>
      <li><b>Arraste a pasta</b> (não o .zip) para o quadro da página. Em poucos segundos aparece o endereço do site.</li>
      <li>Abra o endereço para conferir e cole ele no campo <b>"Endereço do site já publicado"</b>, acima.</li>
      <li>Opcional: para usar um domínio próprio (ex.: <code>lojadaana.com.br</code>), siga "Domain management" no Netlify.</li></ol>
    <p class="hint mt-2">Para atualizar depois: baixe a pasta de novo e, no Netlify, abra o mesmo site > aba "Deploys" e arraste a pasta nova. Funciona igual em outras hospedagens gratuitas (Cloudflare Pages, Vercel).</p>
    <div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800" data-politica-hospedagem>
      <p><b><i class="fa-solid fa-shield-halved mr-1"></i> Regra: cada cliente numa hospedagem própria, nunca no servidor deste painel.</b></p>
      <p class="mt-1">Não publique o site do cliente no mesmo servidor (VM) nem no mesmo projeto Firebase deste painel. Assim, se o site de um cliente tiver um problema ou muitas visitas de uma vez, o painel de trabalho não é afetado, e fica claro que o site é do cliente. Depois de entregue, manter o site no ar é responsabilidade de quem é dono da hospedagem, a não ser que você tenha combinado outra coisa com o cliente (o manual de entrega explica isso a ele).</p></div></div>`;
}

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
    ...(p.descricoesProdutos || []).map((d) => `${d.nome}\n${d.descricao}\nSEO: ${d.seoTitulo} — ${d.seoDescricao}`),
    ...(p.depoimentos?.length ? ['', 'DEPOIMENTOS (os mesmos do site personalizado)', ...p.depoimentos.map((d) => `"${d.texto}" — ${d.nome}${d.midiaUrl ? ` (mídia: ${d.midiaUrl})` : ''}`)] : [])].join('\n');
}

// ---------- manuais de entrega (PDF) ----------
async function manualCustom({ cliente, site, produtos, versao }) {
  const pdf = await criarPdf(`Manual de entrega — ${cliente.nome}`, `Site personalizado · versão ${versao} · gerado em ${new Date().toLocaleDateString('pt-BR')} · ${produtos.length} produto(s)`);
  pdf.secao('Resumo para o dono da loja')
    .lista(['Seu site está pronto: é uma pasta com todos os produtos, fotos, textos e o carrinho de compras.', 'Antes de vender, faltam 2 coisas: colocar o site no ar (seção 2, dá para fazer sozinho em uns 5 minutos) e ligar a forma de pagamento (seção 3, é a parte técnica: pode encaminhar este manual para quem vai fazer).', 'O site fica numa hospedagem em seu nome, separada de tudo da agência. Quem é dono dessa conta cuida para ele continuar no ar.'])
    .texto('As seções marcadas como (parte técnica) são para quem vai fazer a instalação; você não precisa entendê-las.');
  pdf.secao('1. O que você recebeu')
    .texto(`Uma pasta chamada ${pastaDoSite(cliente)} (entregue compactada em .zip) com o site inteiro num único arquivo, index.html (HTML, CSS e JavaScript no mesmo arquivo), com: banner principal, categorias, mais vendidos, sale, catálogo, história da marca, depoimentos, perguntas frequentes (quando há), newsletter, rodapé com políticas, botão flutuante de WhatsApp, carrinho que funciona no navegador do visitante, selo de compra segura perto do "Finalizar compra" e aviso de cookies (LGPD).`)
    .texto('Quando alguém compartilhar o link do site no WhatsApp ou nas redes, aparecem o nome da loja, uma descrição e a foto do 1º produto (tecnicamente: tags Open Graph no <head>; o endereço final entra quando quem gerou o site informa o link publicado e gera de novo).')
    .texto('IMPORTANTE: sozinho, o site ainda NÃO recebe pagamentos. O botão "Finalizar compra" precisa ser ligado a um serviço de pagamento (Mercado Pago, Stripe ou Shopify), explicado na seção 3. Para quem vai instalar: o ponto de encaixe é a função window.checkoutHandler(itens), no fim do arquivo.');
  pdf.secao('2. Como publicar o site')
    .lista(['Extraia o .zip (botão direito > "Extrair tudo") e abra o index.html da pasta no navegador para conferir textos, preços, fotos e cores.', 'Troque os depoimentos-modelo por depoimentos reais e revise as políticas com um profissional (texto-base, sem valor jurídico).',
      'Crie uma conta grátis em app.netlify.com/drop (de preferência no e-mail do dono da loja) e arraste a PASTA (não o .zip) para o quadro da página. Em segundos aparece o endereço do site. Outras hospedagens gratuitas funcionam igual (Cloudflare Pages, Vercel).', 'Para usar um domínio próprio (ex.: lojadaana.com.br), siga as instruções de "domínio" da hospedagem.',
      'Para atualizar o site depois: gere a pasta de novo e envie para o MESMO site na hospedagem (no Netlify: aba "Deploys", arrastar a pasta nova).'], true)
    .texto('Hospedagem e responsabilidade', { negrito: true })
    .lista(['Cada site de cliente tem a sua própria hospedagem, separada. Ele nunca é publicado no servidor nem no projeto do painel de trabalho da agência: assim um problema técnico ou um pico de visitas neste site não afeta nenhum outro sistema, e fica claro que o site pertence ao cliente.',
      'Depois de entregue, manter o site no ar (hospedagem, domínio, renovações) é responsabilidade de quem é dono da conta de hospedagem. A agência não é responsável por manter o site no ar, a não ser que isso tenha sido combinado explicitamente com o cliente.']);
  pdf.secao('3. Ligando o pagamento (parte técnica, escolha UMA opção)')
    .texto('Em todos os casos, o pagamento acontece na página segura do provedor. Nunca coloque chaves secretas dentro do index.html — ele é público.', { negrito: true });
  const pref = site.pagamentoPreferido;
  if (pref && pref !== 'nao_sei') pdf.texto(`Forma de pagamento pretendida pelo cliente: ${(PAGAMENTOS_PRETENDIDOS.find(([k]) => k === pref) || [, pref])[1]}${pref === 'nativa' ? ' — no site personalizado não há checkout nativo; considere o modo pacote (Nuvemshop/Shopify) ou uma das opções abaixo.' : ' — essa opção vem primeiro abaixo.'}`);
  const checkouts = [];
  checkouts.push(['shopify', () => pdf.texto('Opção A — Shopify Buy Button', { negrito: true }).lista(['Crie uma conta Shopify e cadastre os mesmos produtos (dá para usar o CSV do modo pacote).', 'Instale/ative o canal "Buy Button" no admin da Shopify.',
    'Crie um Buy Button para cada produto (ou uma coleção) e copie o código gerado.', 'No index.html, cole o código do botão no ponto marcado como PONTO DE ENCAIXE DO CHECKOUT, ou faça o checkoutHandler redirecionar para a URL de checkout do produto.',
    'Teste uma compra em modo de teste antes de divulgar.'], true)]);
  checkouts.push(['mercado_pago', () => pdf.texto('Opção B — Mercado Pago Checkout Pro', { negrito: true }).lista(['Crie uma conta de vendedor no Mercado Pago e uma aplicação em "Suas integrações" para obter as credenciais.',
    'Como a criação da "preferência de pagamento" exige o Access Token (SECRETO), ela precisa rodar em um servidor seu (ex.: função serverless). Nunca no navegador.', 'Esse servidor recebe os itens do carrinho, cria a preferência via API e devolve a URL (init_point).',
    'No index.html, faça o window.checkoutHandler chamar seu servidor e redirecionar o cliente para o init_point.', 'Configure as URLs de retorno (sucesso/falha) e teste com usuários de teste do Mercado Pago.'], true)]);
  checkouts.push(['stripe', () => pdf.texto('Opção C — Stripe Payment Links', { negrito: true }).lista(['Crie uma conta Stripe e, no Dashboard, crie um Payment Link para cada produto (preço fixo).', 'Copie a URL de cada Payment Link (algo como buy.stripe.com/...).',
    'No index.html, associe cada produto ao seu link e faça o checkoutHandler redirecionar para ele. Payment Links não exigem servidor, mas atendem 1 produto por link (não o carrinho inteiro).', 'Para carrinho com vários itens, use Stripe Checkout Sessions em um servidor seu.', 'Teste com cartões de teste do Stripe antes de ativar o modo real.'], true)]);
  // A opção que o cliente pretende usar (pergunta "h") sai primeiro; as demais seguem na ordem de sempre.
  [...checkouts.filter(([k]) => k === pref), ...checkouts.filter(([k]) => k !== pref)].forEach(([, escrever]) => escrever());
  const r = rastreamentoDe(cliente);
  pdf.secao('4. Pixel, Hotjar e chat ao vivo (parte técnica)');
  if (r.metaPixelId || r.googleAdsId) {
    pdf.lista([
      ...(r.metaPixelId ? [`Pixel do Meta ${r.metaPixelId}: já instalado no <head> do index.html, com PageView em cada visita e InitiateCheckout no botão "Finalizar compra".`] : []),
      ...(r.googleAdsId ? [`Google Ads ${r.googleAdsId}: tag já instalada no <head>${r.googleAdsRotulo ? `, com a conversão ${r.googleAdsId}/${r.googleAdsRotulo} no botão "Finalizar compra"` : ', com o evento begin_checkout no botão "Finalizar compra" (para contar como conversão, cadastre o ID com o rótulo: AW-.../rótulo)'}.`] : []),
      'LGPD: o Pixel e a tag só carregam depois que o visitante clica em "Aceitar" no aviso de cookies do site. Quem recusa não é rastreado — por isso os números do Meta/Google ficam um pouco abaixo das visitas reais.',
      'A compra (Purchase) acontece no checkout do provedor: ative lá a integração com o Pixel/Google Ads (Shopify, Mercado Pago e Stripe têm).',
      'Depois de publicar, confira no Gerenciador de Eventos do Meta (aba "Testar eventos") e no Google Ads (Conversões) se as visitas estão chegando.',
    ]);
  } else pdf.texto('Nenhum ID de Pixel/Google Ads cadastrado: o site foi gerado sem código de rastreamento. Para medir conversões, preencha em Editar cliente > Rastreamento e gere o site de novo.');
  if (r.hotjarId || r.tawkPropertyId) {
    pdf.texto('Hotjar e chat ao vivo', { negrito: true }).lista([
      ...(r.hotjarId ? [`Hotjar (site ${r.hotjarId}): já instalado. Mostra como as pessoas navegam e onde desistem (mapas de clique e gravações). Veja em hotjar.com, na conta dona desse ID.`] : []),
      ...(r.tawkPropertyId ? ['Tawk.to: o chat ao vivo já aparece no canto do site. As mensagens chegam no painel/app do Tawk.to (tawk.to), na conta dona desse chat: instale o app no celular para responder na hora.'] : []),
      'Assim como o Pixel, eles só carregam depois que o visitante clica em "Aceitar" no aviso de cookies. Quem recusa navega normalmente, mas sem gravação e sem o chat.',
    ]);
  }
  pdf.secao('5. Newsletter e WhatsApp')
    .lista(['Newsletter: o formulário só mostra confirmação local. Ligue-o ao Mailchimp, Brevo ou ferramenta similar (embed/ação do formulário).', `WhatsApp: ${site.config?.whatsapp ? 'já configurado (' + site.config.whatsapp + ').' : 'informe o número em "Configurar loja" e gere o site de novo.'}`]);
  pdf.secao('6. Checklist final').lista(['Fotos e preços conferidos', 'Depoimentos reais', 'Respostas da FAQ conferidas', 'Formas de pagamento do selo iguais às do checkout', 'Políticas revisadas', 'Checkout testado de ponta a ponta', 'Site publicado numa hospedagem própria do cliente (fora do servidor da agência)', 'Domínio e HTTPS funcionando', 'Pixel/analytics instalados (se houver)']);
  return pdf;
}

async function manualPacote({ cliente, site, produtos, versao }) {
  const plat = nomePlat(site.plataforma);
  const pdf = await criarPdf(`Manual de entrega — ${cliente.nome}`, `Pacote ${plat} · versão ${versao} · gerado em ${new Date().toLocaleDateString('pt-BR')} · ${produtos.length} produto(s)`);
  pdf.secao('Resumo para o dono da loja').lista([`Sua loja vai funcionar dentro da ${plat}, numa conta em seu nome: o pagamento, o frete e a hospedagem são da própria ${plat}.`, 'Este manual é o passo a passo para montar a loja lá com os arquivos entregues: catálogo de produtos, textos, banners e as cores do tema.', `Depois de montada, quem cuida da loja no ar é o dono da conta na ${plat}.`]);
  pdf.secao('1. O que você recebeu').lista(['Catálogo de produtos em CSV, no formato de importação da ' + plat + '.', 'Banners e textos prontos (título, subtítulo, CTA e onde usar).', 'Briefing do tema: estilo, paleta, tipografia e seções da home.', 'Textos de página (sobre, FAQ) e descrições/SEO dos produtos, quando gerados.']);
  if (site.pagamentoPreferido && site.pagamentoPreferido !== 'nao_sei') pdf.texto(`Forma de pagamento pretendida pelo cliente: ${(PAGAMENTOS_PRETENDIDOS.find(([k]) => k === site.pagamentoPreferido) || [, site.pagamentoPreferido])[1]}. Ative-a primeiro em "Configurando a loja" (meios de pagamento).`);
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
  const passosPixel = passosRastreamentoPacote(rastreamentoDe(cliente), site.plataforma, plat);
  pdf.secao('Rastreamento (Pixel do Meta e Google Ads)');
  if (passosPixel.length) pdf.lista(passosPixel, true);
  else pdf.texto('Nenhum ID de Pixel/Google Ads cadastrado para este cliente. Sem isso, as campanhas não medem conversão na loja: cadastre em Editar cliente > Rastreamento e gere o manual de novo.');
  const passosExtras = passosExtrasPacote(rastreamentoDe(cliente), site.plataforma, plat);
  if (passosExtras.length) pdf.secao('Hotjar (como as pessoas navegam) e Tawk.to (chat ao vivo)').lista(passosExtras, true);
  pdf.secao('Hospedagem e responsabilidade').lista([`A loja fica hospedada na própria ${plat}, na conta do dono da loja: o plano, o domínio e as renovações são dessa conta.`,
    'Ela não depende de nenhum servidor da agência. Depois de entregue, manter a loja no ar é responsabilidade do dono da conta; a agência não responde por isso, a não ser que tenha sido combinado explicitamente com o cliente.']);
  if (site.pacote?.banners?.length) pdf.secao('5. Banners').lista(site.pacote.banners.map((b) => `${b.uso}: "${b.titulo}" / "${b.subtitulo}" [${b.cta}]`));
  pdf.secao('Checklist final').lista(['Produtos e preços conferidos', 'Banners e textos publicados', 'Pagamento e frete configurados', 'Pedido de teste realizado', 'Domínio conectado']);
  return pdf;
}
