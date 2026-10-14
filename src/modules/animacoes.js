// "Biblioteca de animações" (Estúdio e passo 3 de "Criar criativos"): cada preset toca ao vivo com as fotos reais, a cor
// e as fontes do cliente; o operador escolhe um, o app preenche sem IA a partir da ideia e do produto (ou com IA, se
// pedir), ele edita texto e tempo de cada cena, e grava MP4 (Reels/Stories 9:16 ou feed 4:5) ou GIF no navegador.
// A peça vai para a Galeria como qualquer outra (config.animacao), e passa pelo "Parece anúncio?". Saúde, colchete do
// modelo de gancho e política do preset bloqueiam a gravação (lib/animacoes.js conferirPlano).
import { db, COL } from '../core/storage.js';
import { preencherAnimacao } from '../core/ia.js';
import { esc, $, on, modal, ocupado, toast, tag, mostrarResultado } from '../core/ui.js';
import { PRESETS, presetPorId, ESTILO_NOME, planoInicial, conferirPlano, motivoPreset, normalizarPlanoIa, ajustarDuracao, DURACAO_MAX_GIF, MAX_CENAS } from '../lib/animacoes.js';
import { carregarFontes, carregarFotos, recursosDe, tocarPrevia, gravarMp4, gravarGif } from '../lib/animacoes-render.js';
import { designDoSite } from '../lib/design-site.js';
import { produtosComFotos } from '../lib/fotos-site.js';
import { printsDoCliente } from '../lib/visual-site.js';
import { normalizarRecursos } from '../lib/recursos-loja.js';
import { nomeFormato } from '../lib/formatos-instagram.js';
import { formatarBytes } from '../lib/pecas.js';
import { salvarPeca } from './pecas.js';

const FORMATOS_ANIM = [['1080x1920', 'Reels/Stories 9:16'], ['1080x1350', 'Feed 4:5']];
const tamanhoPrevia = (formato, largura) => { const [w, h] = formato.split('x').map(Number); return [largura, Math.round(largura * h / w)]; };

/** Abre a biblioteca para um criativo. fonte = { produtos, materiais }. opts.aoFinalizar(peca) quando guardar. */
export async function abrirBibliotecaAnimacoes(criativo, cliente, fonte = {}, opts = {}) {
  const [sites, materiaisDb] = await Promise.all([db.listar(COL.sites, { clienteId: cliente.id }).catch(() => []), fonte.materiais?.length ? Promise.resolve(fonte.materiais) : db.listar(COL.materiais, { clienteId: cliente.id }).catch(() => [])]);
  const site = sites[0] || {};
  const produtos = produtosComFotos(fonte.produtos || await db.listar(COL.produtos, { clienteId: cliente.id }).catch(() => []), materiaisDb);
  const produto = produtos.find((p) => p.id === criativo.produtoId) || produtos[0] || {};
  const fotosProduto = (produto.fotos || []).map((f) => f?.url || f).filter(Boolean);
  const fotosClientes = printsDoCliente(materiaisDb).map((p) => p.url); // cópia borrada quando houver
  const recursosLoja = normalizarRecursos(site.pacote?.recursos || site.config?.recursos);
  const design = designDoSite({ cliente, site });
  const m = modal(`Biblioteca de animações — ${criativo.nome || 'criativo'}`, '<div data-animacoes><p class="caption"><i class="fa-solid fa-spinner fa-spin"></i> Carregando fotos e fontes do cliente…</p></div>', { largo: true, aoFechar: () => paradas.forEach((p) => p()) });
  const raiz = $('[data-animacoes]', m.el);
  const paradas = [];
  await carregarFontes(design);
  const [imgsProduto, imgsClientes] = await Promise.all([carregarFotos(fotosProduto), carregarFotos(fotosClientes)]);
  const fotosDo = (preset) => (preset.fotos === 'produto_ou_clientes' && imgsClientes.length >= 2 && imgsProduto.length < 2 ? imgsClientes : imgsProduto);
  const rec = (preset) => recursosDe(design, fotosDo(preset));
  const ctxPlano = (preset, formato = '1080x1920') => ({ criativo, produto, cliente, recursos: recursosLoja, formato, nFotos: fotosDo(preset).length });

  // ---------- lista de presets (prévia ao vivo de cada um) ----------
  const desenharLista = () => {
    paradas.splice(0).forEach((p) => p());
    raiz.innerHTML = `<p class="caption">Animações feitas por código com as fotos reais, a cor (${esc(design.cores.acento)}) e as fontes (${esc(design.par.titulo)} e ${esc(design.par.texto)}) do cliente. Nada de cena filmada nem pessoa criada: só as fotos que o cliente enviou${fotosClientes.length ? ' e os prints reais de clientes (cópia borrada)' : ''}.</p>
      ${!imgsProduto.length ? '<p class="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800" data-sem-fotos><i class="fa-solid fa-triangle-exclamation"></i> O produto ainda não tem foto: as prévias saem só com a cor. Envie a foto em Materiais (ou na aba Produtos).</p>' : ''}
      <ul class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3" data-lista-presets>${PRESETS.map((p) => {
        const motivo = motivoPreset(p.id, { cliente, produtos, fotos: fotosDo(p).length });
        return `<li class="card !p-2" data-preset="${p.id}" data-bloqueado="${motivo ? 'sim' : 'nao'}">
          <canvas width="180" height="320" class="w-full rounded-lg bg-slate-100" data-previa-preset="${p.id}" role="img" aria-label="Prévia: ${esc(p.nome)}"></canvas>
          <p class="mt-1 text-sm font-semibold leading-snug">${esc(p.nome)}</p>
          <div class="mt-1 flex flex-wrap gap-1">${tag(ESTILO_NOME[p.estilo], p.estilo === 'organico' ? 'tag-ok' : 'tag-warn')}${p.gif ? tag('GIF') : ''}</div>
          <p class="hint !mt-1">${esc(p.descricao)}</p>
          ${motivo ? `<p class="mt-1 text-xs text-rose-700" data-motivo-preset>${esc(motivo)}</p>` : `<button type="button" class="btn-primary btn-sm mt-2 min-h-[44px] w-full" data-usar-preset="${p.id}">Usar esta</button>`}</li>`;
      }).join('')}</ul>`;
    for (const p of PRESETS) {
      const cv = $(`[data-previa-preset="${p.id}"]`, raiz);
      const plano = planoInicial(p.id, ctxPlano(p));
      paradas.push(tocarPrevia(cv, () => ({ plano, rec: rec(p) })));
    }
  };

  // ---------- editor ----------
  function abrirEditor(presetId) {
    paradas.splice(0).forEach((p) => p());
    const preset = presetPorId(presetId);
    let plano = planoInicial(presetId, ctxPlano(preset));
    let guia = true, pausado = false, ultimo = null;
    const desenharCenas = () => {
      $('[data-cenas-anim]', box).innerHTML = plano.cenas.map((c, i) => `<li class="grid grid-cols-[5.5rem_auto] items-end gap-2 sm:grid-cols-[1fr_5.5rem_auto]" data-cena-anim="${i}">
        <div class="col-span-2 sm:col-span-1"><label class="label" for="ca-t${i}">Cena ${i + 1} · ${esc({ fala: 'fala', item: 'item', oferta: 'oferta (preço e frete do cadastro)', cta: 'chamada', antes: 'antes', depois: 'depois' }[c.tipo] || c.tipo)}</label><input class="input" id="ca-t${i}" data-texto-cena="${i}" value="${esc(c.texto)}" maxlength="90"></div>
        <div><label class="label" for="ca-d${i}">Segundos</label><input class="input" id="ca-d${i}" type="number" inputmode="decimal" min="0.8" max="6" step="0.1" data-dur-cena="${i}" value="${c.dur}"></div>
        <button type="button" class="btn-ghost btn-sm min-h-[44px] min-w-[44px] justify-self-start" data-tirar-cena="${i}" aria-label="Tirar a cena ${i + 1}"><i class="fa-solid fa-trash"></i></button></li>`).join('');
      conferir();
    };
    const conferir = () => {
      const c = conferirPlano(plano, { cliente, produtos, nFotos: fotosDo(preset).length });
      const gifOk = plano.duracao <= DURACAO_MAX_GIF;
      $('[data-conferencia-anim]', box).innerHTML = `${c.bloqueio ? `<p class="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700" role="alert" data-bloqueio-anim><i class="fa-solid fa-triangle-exclamation"></i> ${esc(c.bloqueio)}</p>` : ''}
        ${c.avisos.map((a) => `<p class="text-xs text-amber-800" data-aviso-anim><i class="fa-solid fa-circle-exclamation"></i> ${esc(a)}</p>`).join('')}
        <p class="hint">Duração: ${plano.duracao} s · ${plano.cenas.length} cena(s)${plano.preco ? ` · preço do cadastro: ${esc(plano.preco.por)}` : ''}${plano.frete ? ` · ${esc(plano.frete)}` : ''}${plano.preenchidoPor === 'ia' ? ' · textos sugeridos pela IA' : ' · preenchido pelo app (sem IA)'}</p>`;
      $('[data-gravar-mp4]', box).disabled = Boolean(c.bloqueio);
      const bg = $('[data-gravar-gif]', box); bg.disabled = Boolean(c.bloqueio) || !gifOk;
      bg.title = gifOk ? 'GIF de até 6 s, 540 px de largura' : 'GIF só até 6 s: encurte as cenas';
      $('[data-motivo-gif]', box).textContent = gifOk ? '' : `GIF só até ${DURACAO_MAX_GIF} s (esta tem ${plano.duracao} s).`;
    };
    const novoCanvas = () => {
      paradas.splice(0).forEach((p) => p());
      const [w, h] = tamanhoPrevia(plano.formato, 270);
      const cv = $('[data-previa-grande]', box); cv.width = w; cv.height = h;
      paradas.push(tocarPrevia(cv, () => ({ plano, rec: rec(preset), guia, pausado })));
    };
    // Contêiner novo a cada abertura: os eventos do editor anterior somem com ele.
    raiz.innerHTML = ''; const box = document.createElement('div'); raiz.appendChild(box);
    box.innerHTML = `<button type="button" class="btn-ghost btn-sm min-h-[44px]" data-voltar-lista><i class="fa-solid fa-arrow-left"></i> Todas as animações</button>
      <div class="mt-2 grid gap-4 md:grid-cols-[minmax(0,1fr)_17rem]" data-editor-anim="${preset.id}">
        <div class="min-w-0 space-y-3">
          <h4 class="font-semibold">${esc(preset.nome)} ${tag(ESTILO_NOME[preset.estilo], preset.estilo === 'organico' ? 'tag-ok' : 'tag-warn')}</h4>
          <div class="grid gap-2 sm:grid-cols-2"><div><label class="label" for="ca-fmt">Formato</label><select class="input" id="ca-fmt" data-formato-anim ${preset.gif ? 'disabled' : ''}>${FORMATOS_ANIM.map(([k, r]) => `<option value="${k}" ${k === plano.formato ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
            <div class="flex items-end"><button type="button" class="btn-ia btn-sm min-h-[44px] w-full" data-preencher-ia><i class="fa-solid fa-wand-magic-sparkles"></i> Preencher os textos com IA</button></div></div>
          <p class="hint !mt-0">O app já preencheu pela ideia e pelo produto (sem IA). Preço e frete vêm sempre do cadastro.</p>
          <ul class="space-y-2" data-cenas-anim></ul>
          <button type="button" class="btn-ghost btn-sm min-h-[44px]" data-mais-cena><i class="fa-solid fa-plus"></i> Mais uma cena de fala</button>
          <div class="space-y-1" data-conferencia-anim aria-live="polite"></div></div>
        <div><canvas class="mx-auto block w-full max-w-[270px] rounded-lg bg-slate-900" data-previa-grande role="img" aria-label="Prévia da animação"></canvas>
          <label class="mt-2 flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" class="h-4 w-4" data-guia-anim checked> Mostrar a zona segura (só na tela)</label>
          <label class="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" class="h-4 w-4" data-pausar-anim> Pausar a prévia</label>
          <div class="mt-2 grid gap-2"><button type="button" class="btn-primary min-h-[44px]" data-gravar-mp4><i class="fa-solid fa-film"></i> Gravar MP4</button>
            <button type="button" class="btn-ghost min-h-[44px]" data-gravar-gif><i class="fa-solid fa-images"></i> Gravar GIF</button><p class="hint !mt-0" data-motivo-gif></p></div></div></div>
      <div class="mt-3" data-resultado-anim></div>`;
    novoCanvas(); desenharCenas();
    on(box, 'input', '[data-texto-cena]', (i) => { plano.cenas[Number(i.dataset.textoCena)].texto = i.value; conferir(); });
    on(box, 'change', '[data-dur-cena]', (i) => { plano.cenas[Number(i.dataset.durCena)].dur = Number(i.value); plano = ajustarDuracao(plano); desenharCenas(); });
    on(box, 'click', '[data-tirar-cena]', (b) => { if (plano.cenas.length <= 1) return toast('A animação precisa de pelo menos uma cena.', 'erro'); plano.cenas.splice(Number(b.dataset.tirarCena), 1); plano = ajustarDuracao(plano); desenharCenas(); });
    on(box, 'click', '[data-mais-cena]', () => { if (plano.cenas.length >= MAX_CENAS) return toast(`No máximo ${MAX_CENAS} cenas.`, 'erro'); const i = plano.cenas.at(-1)?.tipo === 'cta' ? plano.cenas.length - 1 : plano.cenas.length; plano.cenas.splice(i, 0, { texto: '', dur: 2, tipo: 'fala', foto: i }); plano = ajustarDuracao(plano); desenharCenas(); });
    on(box, 'change', '[data-formato-anim]', (s) => { plano.formato = s.value; novoCanvas(); });
    on(box, 'change', '[data-guia-anim]', (c) => { guia = c.checked; });
    on(box, 'change', '[data-pausar-anim]', (c) => { pausado = c.checked; });
    on(box, 'click', '[data-preencher-ia]', (b) => ocupado(b, async () => {
      const d = await preencherAnimacao({ cliente, criativo, produto, preset, base: plano });
      const novo = normalizarPlanoIa(d, plano);
      if (novo === plano) throw new Error('A IA não devolveu cenas. O preenchimento do app continua aí; edite à mão.');
      plano = novo; desenharCenas();
      mostrarResultado($('[data-cenas-anim]', box), 'Textos e tempos sugeridos pela IA. Confira e edite antes de gravar.');
    }));
    const configPeca = (tipo) => ({ animacao: preset.id, estilo: preset.estilo, template: 'animacao', hook: plano.cenas[0]?.texto || '', cta: plano.cenas.find((c) => c.tipo === 'cta')?.texto || '', temLogo: false,
      cenas: plano.cenas.map(({ texto, dur, tipo: t }) => ({ texto, dur, tipo: t })), formato: tipo === 'gif' ? '540x960' : plano.formato, preenchidoPor: plano.preenchidoPor || 'app' });
    const mostrarGravado = (tipo, r, url) => {
      $('[data-resultado-anim]', box).innerHTML = `<div class="rounded-lg border border-slate-200 p-3" data-gravado="${tipo}">
        ${tipo === 'gif' ? `<img src="${esc(url)}" alt="GIF gravado" class="mx-auto max-h-[420px] rounded-lg">` : `<video src="${esc(url)}" controls playsinline muted class="mx-auto max-h-[420px] rounded-lg bg-black"></video>`}
        <p class="hint">${tipo === 'gif' ? `GIF 540×960, ${r.quadros} quadros (12/s), ${r.duracao} s` : `${r.ext.toUpperCase()} ${plano.formato.replace('x', '×')}, ${r.duracao} s`} · ${formatarBytes(r.blob.size)} · gravado em ${r.segundos.toFixed(1)} s${tipo === 'video' && r.ext !== 'mp4' ? ' · vira MP4 H.264 ao guardar' : ''}</p>
        <div class="mt-2 flex flex-wrap gap-2"><button type="button" class="btn-primary min-h-[44px]" data-guardar-anim><i class="fa-solid fa-circle-check"></i> Finalizar peça (guardar na Galeria)</button></div>
        <div class="mt-2 hidden rounded-lg border p-2 text-sm" role="status" data-status-anim></div></div>`;
      mostrarResultado($('[data-gravado]', box), 'Animação gravada: confira e guarde na Galeria.');
    };
    const gravar = async (b, tipo) => ocupado(b, async () => {
      const c = conferirPlano(plano, { cliente, produtos, nFotos: fotosDo(preset).length });
      if (c.bloqueio) throw new Error(c.bloqueio);
      const inicio = performance.now(), rotulo = b.innerHTML;
      const prog = (p) => { b.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${tipo === 'gif' ? 'Montando o GIF' : 'Gravando'}… ${Math.round(p * 100)}%`; };
      try {
        const [w, h] = plano.formato.split('x').map(Number);
        const r = tipo === 'gif' ? await gravarGif({ plano, rec: rec(preset), aoProgresso: prog }) : await gravarMp4({ plano, rec: rec(preset), largura: w, altura: h, aoProgresso: prog });
        r.segundos = (performance.now() - inicio) / 1000;
        if (ultimo?.url) URL.revokeObjectURL(ultimo.url);
        ultimo = { tipo, r, url: URL.createObjectURL(r.blob), plano: JSON.parse(JSON.stringify(plano)) };
        mostrarGravado(tipo, r, ultimo.url);
      } finally { b.innerHTML = rotulo; }
    });
    on(box, 'click', '[data-gravar-mp4]', (b) => gravar(b, 'video'));
    on(box, 'click', '[data-gravar-gif]', (b) => gravar(b, 'gif'));
    on(box, 'click', '[data-guardar-anim]', (b) => ocupado(b, async () => {
      if (!ultimo) return;
      const st = $('[data-status-anim]', box); st.classList.remove('hidden');
      const tipo = ultimo.tipo, formato = tipo === 'gif' ? '1080x1920' : ultimo.plano.formato;
      const salva = await salvarPeca(cliente, criativo, { blob: ultimo.r.blob, tipo, formato, ext: tipo === 'gif' ? 'gif' : ultimo.r.ext, duracao: ultimo.r.duracao, config: configPeca(tipo) },
        { aoEtapa: (t, p) => { st.textContent = `${t}${p ? ` ${Math.round(p * 100)}%` : ''}`; } });
      st.className = 'mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800';
      st.innerHTML = `<i class="fa-solid fa-circle-check"></i> Guardada na Galeria (${esc(salva.formatoNome || nomeFormato(formato, tipo))}, ${formatarBytes(salva.tamanho)}${salva.comprimido ? ', convertida para MP4' : ''}).`;
      mostrarResultado(st, 'Peça guardada na Galeria.');
      opts.aoFinalizar?.(salva);
    }));
    on(box, 'click', '[data-voltar-lista]', () => desenharLista());
  }

  on(raiz, 'click', '[data-usar-preset]', (b) => abrirEditor(b.dataset.usarPreset));
  desenharLista();
  return m;
}
