// Estúdio de peças: entrega o material pronto (foto PNG e vídeo) a partir do criativo, direto no navegador.
// Os arquivos são baixados no computador (não dependem do Storage); as fotos/vídeos de origem ficam só na sessão.
import { tokenAtual } from '../core/auth.js';
import { sugerirPromptsVisuais } from '../core/ia.js';
import {
  FORMATOS_IMAGEM, TEMPLATES, extrairCenas, desenharPeca, canvasParaPng, carregarMidia, carregarImagemUrl, formatoDeVideo, gravarVideo,
} from '../lib/estudio.js';
import { $, esc, on, modal, toast, ocupado, opcoes, copiar } from '../core/ui.js';

const slug = (s) => String(s || 'criativo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'criativo';
const chavePref = (clienteId) => `gcc_estudio_${clienteId}`;
const lerPref = (clienteId) => { try { return JSON.parse(localStorage.getItem(chavePref(clienteId)) || '{}'); } catch { return {}; } };
const gravarPref = (clienteId, p) => { try { localStorage.setItem(chavePref(clienteId), JSON.stringify(p)); } catch { /* sem armazenamento: só não lembra */ } };

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}


export function abrirEstudio(criativo, cliente) {
  const pref = lerPref(cliente.id);
  const est = {
    midias: [], logo: null, musica: null, cenas: extrairCenas(criativo), cor: pref.cor || '#4f46e5', corTexto: pref.corTexto || '#ffffff',
    template: 'destaque', formato: '1080x1350', formatoVideo: '1080x1920', urlVideo: null, ctrl: null,
  };
  const fmtVideo = formatoDeVideo();
  const m = modal(`Gerar material — ${criativo.nome}`, `<div id="est"></div>`, {
    largo: true,
    aoFechar: () => { est.ctrl?.abort(); est.midias.forEach((x) => URL.revokeObjectURL(x.url)); if (est.urlVideo) URL.revokeObjectURL(est.urlVideo); },
  });
  const raiz = $('#est', m.el);
  const dims = (f) => f.split('x').map(Number);

  raiz.innerHTML = `
  <p class="caption mb-3">Monte a foto e o vídeo prontos para subir na campanha. Tudo é feito neste navegador e baixado no seu computador. As fotos que você escolher aqui não ficam salvas: escolha de novo na próxima vez.</p>

  <section class="rounded-lg border border-slate-200 p-3">
    <h4 class="mb-2 text-sm font-semibold"><i class="fa-solid fa-images"></i> 1. Materiais</h4>
    <label class="label">Fotos e vídeos do produto (várias)</label>
    <input type="file" data-midias multiple accept="image/*,video/*" class="block text-sm">
    <div data-lista-midias class="mt-2 flex flex-wrap gap-2"></div>
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <div><label class="label">Logo (opcional, PNG com fundo transparente)</label><input type="file" data-logo accept="image/*" class="block text-sm"></div>
      <div><label class="label">Música do vídeo (opcional, MP3/WAV)</label><input type="file" data-musica accept="audio/*" class="block text-sm"></div>
      <div><label class="label">Cor da marca</label><input type="color" data-cor value="${esc(est.cor)}" class="h-9 w-16 rounded border"></div>
      <div><label class="label">Cor do texto</label><input type="color" data-cor-texto value="${esc(est.corTexto)}" class="h-9 w-16 rounded border"></div>
    </div>
    <div class="mt-3 rounded-lg border border-violet-200 p-2">
      <div class="flex flex-wrap items-center justify-between gap-2"><p class="text-sm font-medium text-violet-800"><i class="fa-solid fa-lightbulb"></i> Sem foto ou sem cenas? A IA escreve os prompts para você colar num gerador</p>
        <button class="btn-ia btn-sm" data-sugerir-prompt>Sugerir prompts</button></div>
      <p class="hint mt-1">O Claude não gera imagem nem vídeo: ele escreve o prompt (usa a sua assinatura). Os prompts são em inglês porque os geradores entendem melhor; a tradução aparece embaixo de cada um. Cole no Gemini, ChatGPT, Ideogram, Veo, Runway ou Kling, baixe o resultado e envie aqui em "Fotos e vídeos".</p>
      <div data-prompts class="mt-2 space-y-2"></div></div>
    <details class="mt-3 rounded-lg border border-violet-200 p-2"><summary class="cursor-pointer text-sm font-medium text-violet-800"><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar imagem com IA (gratuito, vários provedores em rodízio)</summary>
      <p class="hint my-2">O app tenta cada gerador gratuito configurado e, se um atingir a cota do dia, passa ao próximo. Peça a imagem sem texto: o texto entra pelo template, com letras nítidas. Para produto real, prefira a foto verdadeira.</p>
      <p class="mb-2 text-xs text-slate-600" data-status-ia>Carregando geradores…</p>
      <div class="flex gap-2"><input class="input" data-prompt-ia value="${esc(`Foto publicitária vertical, estilo orgânico de redes sociais, para anúncio de ${cliente.nicho || 'produto'}: ${criativo.hook}. Sem texto, sem logotipos.`)}">
        <button class="btn-ia btn-sm" data-gerar-ia>Gerar</button></div></details>
  </section>

  <section class="mt-4 rounded-lg border border-slate-200 p-3">
    <h4 class="mb-2 text-sm font-semibold"><i class="fa-solid fa-image"></i> 2. Foto (PNG)</h4>
    <div class="grid gap-3 sm:grid-cols-2">
      <div><label class="label">Template</label><select class="input" data-template>${opcoes(TEMPLATES, est.template)}</select></div>
      <div><label class="label">Formato</label><select class="input" data-formato>${opcoes(FORMATOS_IMAGEM, est.formato)}</select></div>
      <div class="sm:col-span-2"><label class="label">Foto de fundo</label><select class="input" data-fundo></select></div>
      <div class="sm:col-span-2"><label class="label">Texto principal (hook)</label><input class="input" data-hook value="${esc(criativo.hook)}"></div>
      <div class="sm:col-span-2"><label class="label">Botão / CTA</label><input class="input" data-cta value="${esc(criativo.cta)}"></div>
    </div>
    <div class="mt-3 flex justify-center rounded-lg bg-slate-100 p-2"><canvas data-previa style="max-width:100%;max-height:420px" class="rounded"></canvas></div>
    <div class="mt-3 flex flex-wrap gap-2"><button class="btn-primary btn-sm" data-baixar-foto><i class="fa-solid fa-download"></i> Baixar este formato</button>
      <button class="btn-ghost btn-sm" data-baixar-todas><i class="fa-solid fa-file-zipper"></i> Baixar os 3 formatos</button>
      <button class="btn-ghost btn-sm" data-baixar-por-foto title="Uma peça para cada foto enviada, no formato escolhido (ótimo para testar várias fotos ou montar carrossel)"><i class="fa-solid fa-images"></i> Uma peça para cada foto</button></div>
    <p class="hint mt-1" data-aviso-fotos></p>
  </section>

  <section class="mt-4 rounded-lg border border-slate-200 p-3">
    <h4 class="mb-2 text-sm font-semibold"><i class="fa-solid fa-film"></i> 3. Vídeo</h4>
    <p class="hint mb-2">A linha do tempo vem do roteiro do criativo (uma cena = uma legenda). Ajuste textos e tempos abaixo. Cada cena usa uma foto/vídeo da lista, em rodízio.</p>
    <div data-cenas class="space-y-2"></div>
    <button class="btn-ghost btn-sm mt-2" data-add-cena><i class="fa-solid fa-plus"></i> Adicionar cena</button>
    <div class="mt-3 flex flex-wrap items-end gap-3">
      <div><label class="label">Formato</label><select class="input" data-formato-video>${opcoes(FORMATOS_IMAGEM, est.formatoVideo)}</select></div>
      <button class="btn-primary" data-gravar ${fmtVideo ? '' : 'disabled'}><i class="fa-solid fa-circle-play"></i> Gerar vídeo</button>
      <button class="btn-danger btn-sm hidden" data-cancelar>Cancelar</button>
      <span data-total class="hint"></span></div>
    ${fmtVideo ? '' : '<p class="mt-2 text-sm text-rose-600">Este navegador não grava vídeo. Use o Chrome ou o Edge atualizado.</p>'}
    <p class="hint mt-2">A gravação acontece em tempo real: um vídeo de 20 s leva 20 s. <b>Mantenha esta aba visível</b> até terminar.</p>
    <div data-progresso class="mt-2 hidden"><div class="h-2 w-full overflow-hidden rounded bg-slate-200"><div data-barra class="h-2 w-0 bg-indigo-600"></div></div></div>
    <div data-resultado class="mt-3"></div>
  </section>`;

  const canvas = $('[data-previa]', raiz);
  const cfgPeca = () => ({
    template: est.template, hook: $('[data-hook]', raiz).value, cta: $('[data-cta]', raiz).value,
    midia: fotos()[Number($('[data-fundo]', raiz).value) || 0] || null,
    midias: fotos(),
    cor: est.cor, corTexto: est.corTexto, logo: est.logo,
  });
  const fotos = () => est.midias.filter((x) => x.tipo === 'imagem');
  const previa = () => {
    const n = fotos().length;
    $('[data-aviso-fotos]', raiz).textContent = est.template === 'colagem' ? (n < 2 ? 'A colagem precisa de 2 a 4 fotos (você enviou ' + n + ').' : `Colagem com as ${Math.min(4, n)} primeiras fotos.`)
      : n > 1 ? `Você enviou ${n} fotos: este template usa só a escolhida em "Foto de fundo". Para usar várias na mesma peça, escolha "Colagem"; para uma peça por foto, use "Uma peça para cada foto".` : '';
    const [w, h] = dims(est.formato); canvas.width = w; canvas.height = h;
    desenharPeca(canvas.getContext('2d'), w, h, cfgPeca());
  };
  let agendado = 0;
  const agendarPrevia = () => { cancelAnimationFrame(agendado); agendado = requestAnimationFrame(previa); };

  const listarMidias = () => {
    $('[data-lista-midias]', raiz).innerHTML = est.midias.map((x, i) => `<div class="relative h-20 w-20 overflow-hidden rounded-lg border bg-slate-100">
      ${x.tipo === 'imagem' ? `<img src="${esc(x.url)}" class="h-full w-full object-cover" alt="">` : '<div class="flex h-full items-center justify-center text-slate-500"><i class="fa-solid fa-film"></i></div>'}
      <button data-rm-midia="${i}" class="absolute right-0 top-0 bg-black/60 px-1.5 text-xs text-white" title="Remover">×</button></div>`).join('')
      || '<p class="hint">Nenhuma foto ou vídeo ainda. Sem material, o app usa um fundo de cor (só texto).</p>';
    $('[data-fundo]', raiz).innerHTML = fotos().length ? opcoes(fotos().map((x, i) => [String(i), `${i + 1}. ${x.nome}`]), '0') : '<option value="0">(sem foto: usa fundo de cor)</option>';
    agendarPrevia();
  };

  const listarCenas = () => {
    $('[data-cenas]', raiz).innerHTML = est.cenas.map((c, i) => `<div class="flex items-start gap-2 rounded-lg bg-slate-50 p-2">
      <span class="mt-2 w-14 shrink-0 text-xs text-slate-500">${c.tipo === 'cta' ? 'Final' : 'Cena ' + (i + 1)}</span>
      <textarea class="input" rows="2" data-cena-texto="${i}" placeholder="(sem legenda: só a imagem)">${esc(c.texto)}</textarea>
      <input type="number" class="input !w-20 shrink-0" min="1" max="12" step="0.5" data-cena-dur="${i}" value="${c.dur}" title="Segundos">
      <button class="btn-ghost btn-sm shrink-0" data-cena-rm="${i}" title="Remover cena">×</button></div>`).join('')
      || '<p class="hint">Sem cenas. Adicione pelo menos uma.</p>';
    const t = est.cenas.reduce((s, c) => s + Number(c.dur || 0), 0);
    $('[data-total]', raiz).textContent = `Duração total: ${t.toFixed(1)} s`;
  };
  listarMidias(); listarCenas();

  const adicionarArquivos = async (arqs) => {
    for (const f of arqs) est.midias.push(await carregarMidia(f));
    listarMidias();
  };
  on(raiz, 'change', '[data-midias]', (i) => ocupado(i, async () => { await adicionarArquivos([...i.files]); i.value = ''; }));
  on(raiz, 'click', '[data-rm-midia]', (b) => { const [x] = est.midias.splice(Number(b.dataset.rmMidia), 1); URL.revokeObjectURL(x.url); listarMidias(); });
  on(raiz, 'change', '[data-logo]', (i) => ocupado(i, async () => { est.logo = i.files[0] ? (await carregarMidia(i.files[0])).el : null; agendarPrevia(); }));
  on(raiz, 'change', '[data-musica]', (i) => { est.musica = i.files[0] || null; });
  on(raiz, 'input', '[data-cor]', (i) => { est.cor = i.value; gravarPref(cliente.id, { cor: est.cor, corTexto: est.corTexto }); agendarPrevia(); });
  on(raiz, 'input', '[data-cor-texto]', (i) => { est.corTexto = i.value; gravarPref(cliente.id, { cor: est.cor, corTexto: est.corTexto }); agendarPrevia(); });
  on(raiz, 'change', '[data-template]', (s) => { est.template = s.value; agendarPrevia(); });
  on(raiz, 'change', '[data-formato]', (s) => { est.formato = s.value; agendarPrevia(); });
  on(raiz, 'change', '[data-fundo]', agendarPrevia);
  on(raiz, 'input', '[data-hook]', agendarPrevia);
  on(raiz, 'input', '[data-cta]', agendarPrevia);
  on(raiz, 'change', '[data-formato-video]', (s) => { est.formatoVideo = s.value; });

  // ---- foto ----
  const pngDe = async (formato, extra = {}) => {
    const [w, h] = dims(formato), c = document.createElement('canvas'); c.width = w; c.height = h;
    desenharPeca(c.getContext('2d'), w, h, { ...cfgPeca(), ...extra });
    return canvasParaPng(c);
  };
  on(raiz, 'click', '[data-baixar-foto]', (b) => ocupado(b, async () => { baixar(await pngDe(est.formato), `${slug(criativo.nome)}-${est.formato}.png`); toast('Foto baixada.'); }));
  on(raiz, 'click', '[data-baixar-todas]', (b) => ocupado(b, async () => {
    for (const [f] of FORMATOS_IMAGEM) { baixar(await pngDe(f), `${slug(criativo.nome)}-${f}.png`); await new Promise((r) => setTimeout(r, 400)); }
    toast('3 fotos baixadas. Se o navegador pedir, permita downloads múltiplos.');
  }));

  on(raiz, 'click', '[data-baixar-por-foto]', (b) => ocupado(b, async () => {
    const lista = fotos();
    if (!lista.length) throw new Error('Envie pelo menos uma foto em "Materiais".');
    for (const [i, f] of lista.entries()) { baixar(await pngDe(est.formato, { midia: f }), `${slug(criativo.nome)}-${est.formato}-foto${i + 1}.png`); await new Promise((r) => setTimeout(r, 400)); }
    toast(`${lista.length} peça(s) baixada(s). Se o navegador pedir, permita downloads múltiplos.`);
  }));

  // ---- prompts para geradores externos (usa a assinatura, sem custo extra) ----
  on(raiz, 'click', '[data-sugerir-prompt]', (b) => ocupado(b, async () => {
    const r = await sugerirPromptsVisuais({ cliente, criativo });
    const caixa = (rotulo, texto, pt) => `<div class="rounded-lg bg-slate-50 p-2"><div class="mb-1 flex items-center justify-between"><b class="text-xs text-slate-600">${esc(rotulo)}</b>
      <button class="btn-ghost btn-sm" data-copiar-prompt>Copiar (inglês)</button></div><p class="whitespace-pre-wrap text-sm" data-texto-prompt>${esc(texto)}</p>
      ${pt ? `<p class="mt-1 whitespace-pre-wrap border-t border-slate-200 pt-1 text-xs text-slate-500"><b>Tradução:</b> ${esc(pt)}</p>` : ''}</div>`;
    $('[data-prompts]', raiz).innerHTML = (r.foto ? caixa('Foto estática (4:5)', r.foto, r.fotoPt) : '') + r.cenas.map((c, i) => caixa(`Vídeo — cena ${i + 1} (9:16)`, c, r.cenasPt[i])).join('')
      + (r.dicas ? `<p class="hint">${esc(r.dicas)}</p>` : '');
    if (r.foto) $('[data-prompt-ia]', raiz).value = r.foto;
  }));
  on(raiz, 'click', '[data-copiar-prompt]', (b) => copiar($('[data-texto-prompt]', b.closest('div').parentElement).textContent));

  // ---- imagem por IA (gratuita, vários provedores) ----
  const formatoIa = () => { const [w, h] = dims(est.formato); return h / w > 1.5 ? '9:16' : h === w ? '1:1' : '4:5'; };
  const statusIa = async () => {
    const el = $('[data-status-ia]', raiz);
    try {
      const r = await fetch('/api/imagem/status', { headers: { Authorization: `Bearer ${await tokenAtual()}` } });
      const { provedores } = await r.json();
      const linhas = provedores.map((p) => !p.configurado ? `${p.rotulo}: sem chave` : p.pausado ? `${p.rotulo}: em pausa (erro recente)` : `${p.rotulo}: ${p.usadoHoje}/${p.limiteDia} hoje`);
      el.innerHTML = linhas.map((l) => esc(l)).join('<br>');
      if (!provedores.some((p) => p.configurado)) el.innerHTML += '<br><b>Nenhum gerador configurado.</b> Veja o README (seção Estúdio) para criar as chaves gratuitas.';
    } catch { el.textContent = 'Servidor de IA indisponível (rode npm run dev).'; }
  };
  statusIa();
  on(raiz, 'click', '[data-gerar-ia]', (b) => ocupado(b, async () => {
    const prompt = $('[data-prompt-ia]', raiz).value.trim();
    if (!prompt) throw new Error('Descreva a imagem.');
    const r = await fetch('/api/imagem', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenAtual()}` },
      body: JSON.stringify({ prompt, formato: formatoIa() }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Falha ao gerar a imagem.');
    est.midias.push(await carregarImagemUrl(j.imagem));
    listarMidias(); toast(`Imagem gerada (${j.rotulo}) e adicionada aos materiais.`);
    statusIa();
  }));

  // ---- cenas ----
  on(raiz, 'input', '[data-cena-texto]', (t) => { est.cenas[Number(t.dataset.cenaTexto)].texto = t.value; });
  on(raiz, 'input', '[data-cena-dur]', (t) => {
    est.cenas[Number(t.dataset.cenaDur)].dur = Math.min(12, Math.max(1, Number(t.value) || 1));
    $('[data-total]', raiz).textContent = `Duração total: ${est.cenas.reduce((s, c) => s + c.dur, 0).toFixed(1)} s`;
  });
  on(raiz, 'click', '[data-cena-rm]', (b) => { est.cenas.splice(Number(b.dataset.cenaRm), 1); listarCenas(); });
  on(raiz, 'click', '[data-add-cena]', () => {
    const i = est.cenas.length && est.cenas[est.cenas.length - 1].tipo === 'cta' ? est.cenas.length - 1 : est.cenas.length;
    est.cenas.splice(i, 0, { texto: '', dur: 3, tipo: 'cena' }); listarCenas();
  });

  // ---- vídeo ----
  on(raiz, 'click', '[data-cancelar]', () => est.ctrl?.abort());
  on(raiz, 'click', '[data-baixar-video]', () => est.ultimo && baixar(est.ultimo.blob, est.ultimo.nome));
  on(raiz, 'click', '[data-gravar]', async (b) => {
    if (!est.cenas.length) return toast('Adicione pelo menos uma cena.', 'erro');
    const [largura, altura] = dims(est.formatoVideo);
    est.ctrl = new AbortController();
    const barra = $('[data-barra]', raiz), prog = $('[data-progresso]', raiz), cancelar = $('[data-cancelar]', raiz);
    prog.classList.remove('hidden'); cancelar.classList.remove('hidden'); barra.style.width = '0%';
    $('[data-resultado]', raiz).innerHTML = '';
    await ocupado(b, async () => {
      try {
        const r = await gravarVideo({
          cenas: est.cenas, midias: est.midias, cor: est.cor, corTexto: est.corTexto, logo: est.logo, musica: est.musica,
          largura, altura, sinal: est.ctrl.signal, aoProgresso: (p) => { barra.style.width = `${Math.round(p * 100)}%`; },
        });
        if (est.urlVideo) URL.revokeObjectURL(est.urlVideo);
        est.urlVideo = URL.createObjectURL(r.blob);
        const nome = `${slug(criativo.nome)}-${est.formatoVideo}.${r.ext}`;
        $('[data-resultado]', raiz).innerHTML = `<video src="${esc(est.urlVideo)}" controls playsinline class="mx-auto max-h-[420px] rounded-lg bg-black"></video>
          <div class="mt-2 flex flex-wrap items-center gap-2"><button class="btn-primary btn-sm" data-baixar-video><i class="fa-solid fa-download"></i> Baixar ${esc(r.ext.toUpperCase())} (${r.duracao.toFixed(0)} s)</button></div>
          ${r.ext === 'webm' ? '<p class="mt-2 text-sm text-amber-700"><i class="fa-solid fa-triangle-exclamation"></i> Este navegador só gravou em WebM. O Meta Ads e o TikTok pedem MP4: atualize o Chrome/Edge ou converta o arquivo antes de subir.</p>' : ''}`;
        est.ultimo = { blob: r.blob, nome };
        toast('Vídeo pronto. Confira a prévia e baixe.');
      } finally { prog.classList.add('hidden'); cancelar.classList.add('hidden'); est.ctrl = null; }
    });
  });
}
