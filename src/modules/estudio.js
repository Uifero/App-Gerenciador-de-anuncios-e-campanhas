// Estúdio de peças: entrega o material pronto (foto PNG e vídeo) a partir do criativo, direto no navegador.
// Os arquivos são baixados no computador (não dependem do Storage); as fotos/vídeos de origem ficam só na sessão.
//
// DECISÃO DE NAVEGAÇÃO (registrada, não é esquecimento): diferente dos demais módulos de entrega — que são uma
// entrada em MODULOS, controlada por `escopo` e com rota própria (#/c/:id/:aba) — o Estúdio é aberto como um modal
// de dentro do detalhe de UM criativo (abrirEstudio(criativo, cliente) em criativos.js), sem rota e fora do escopo.
// Motivo: ele não é um repositório de itens do cliente como as outras abas, é uma ferramenta de exportação pontual
// ligada a UM criativo específico (usa o hook/copy/roteiro dele para montar a peça); nada aqui fica salvo no
// Firestore para listar depois. Reavaliar isso (virar aba própria) só faria sentido se o Estúdio passasse a guardar
// um histórico de peças geradas por cliente — não é o caso hoje.

import { tokenAtual } from '../core/auth.js';
import { sugerirPromptsVisuais } from '../core/ia.js';
import {
  FORMATOS_IMAGEM, TEMPLATES, LIMITE_VIDEO_S, midiaDaCena, extrairCenas, desenharPeca, canvasParaPng, carregarMidia, carregarImagemUrl, formatoDeVideo, gravarVideo,
} from '../lib/estudio.js';
import { $, esc, on, modal, toast, ocupado, opcoes, copiar } from '../core/ui.js';
import { CENAS_UNBOXING } from '../lib/constantes.js';
import { slug } from '../lib/csv.js'; // mesma função usada em sites.js/relatorios.js/backup.js — era duplicada aqui
import { montarEditorVideo } from './video-editor.js';

/** slug() de lib/csv.js devolve '' para um nome vazio; aqui é nome de arquivo, então cai num nome genérico. */
const nomeArquivo = (s) => (slug(s) || 'criativo').slice(0, 40);
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
    <label class="label">Fotos e vídeos (do produto, gerados por IA ou enviados pelo cliente)</label>
    <input type="file" data-midias multiple accept="image/*,video/*" class="block text-sm">
    <div data-lista-midias class="mt-2 flex flex-wrap gap-2"></div>
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <div><label class="label">Logo (opcional, PNG com fundo transparente)</label><input type="file" data-logo accept="image/*" class="block text-sm"></div>
      <div><label class="label">Música do vídeo (opcional, MP3/WAV)</label><input type="file" data-musica accept="audio/*" class="block text-sm"></div>
      <div><label class="label">Cor da marca</label><input type="color" data-cor value="${esc(est.cor)}" class="h-9 w-16 rounded border"></div>
      <div><label class="label">Cor do texto</label><input type="color" data-cor-texto value="${esc(est.corTexto)}" class="h-9 w-16 rounded border"></div>
    </div>
    <details class="mt-3 rounded-lg border border-violet-200 p-2"><summary class="cursor-pointer text-sm font-medium text-violet-800"><i class="fa-solid fa-lightbulb"></i> Sem foto ou sem cenas? A IA escreve os prompts para você colar num gerador</summary>
      <div class="mt-2 flex flex-wrap items-center justify-end gap-2"><select class="input !w-auto" data-modelo-prompt title="Modelo de roteiro">
          <option value="roteiro">Seguir o roteiro do criativo</option><option value="unboxing">UGC: unboxing + manuseio (6 cenas de 5 s)</option></select>
        <button class="btn-ia btn-sm" data-sugerir-prompt>Sugerir prompts</button></div>
      <p class="hint mt-1">O Claude não gera imagem nem vídeo: ele escreve o prompt (usa a sua assinatura). Os prompts são em inglês porque os geradores entendem melhor; a tradução aparece embaixo de cada um. Cole no Gemini, ChatGPT, Ideogram, Veo, Runway ou Kling, baixe o resultado e envie aqui em "Fotos e vídeos".</p>
      <div data-prompts class="mt-2 space-y-2"></div></details>
    <details class="mt-3 rounded-lg border border-indigo-200 p-2"><summary class="cursor-pointer text-sm font-medium text-indigo-800"><i class="fa-solid fa-film"></i> Animar uma foto com IA (clipe real de ~5 s)</summary>
      <p class="hint my-1">A IA dá movimento à foto (pessoa, tecido, câmera). Leva de 1 a 3 minutos. <b>A foto é enviada por 1 hora a uma hospedagem pública anônima e ao gerador</b>: use só fotos que o cliente autorizou.</p>
      <div class="grid gap-2 sm:grid-cols-2">
        <div><label class="label">Foto</label><select class="input" data-animar-foto></select></div>
        <div><label class="label">Ligar à cena</label><select class="input" data-animar-cena></select></div>
        <div class="sm:col-span-2"><label class="label">Movimento (em inglês funciona melhor)</label>
          <input class="input" data-animar-prompt value="The camera slowly pushes in. The person moves naturally, subtle hair and fabric movement, realistic handheld social media video."></div>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2"><button class="btn-ia btn-sm" data-animar><i class="fa-solid fa-wand-magic-sparkles"></i> Animar com IA</button>
        <span class="hint" data-status-video></span></div>
    </details>
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
    <div class="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
      <p class="text-sm font-medium text-emerald-800"><i class="fa-solid fa-scissors"></i> O cliente mandou um vídeo? Edite para performar melhor</p>
      <p class="hint my-1">Envie o vídeo em "Materiais" (clique na miniatura para assistir e anotar os segundos). Depois monte a base e ajuste: <b>gancho nos 3 primeiros segundos</b> (texto grande), <b>cortes</b> nas partes paradas (uma cena = um trecho, com "início no vídeo"), <b>legendas</b> (muita gente assiste sem som), <b>velocidade</b> 1.1x a 1.25x para dar ritmo, <b>CTA no final</b>, formato 9:16 e música baixa por cima.</p>
      <div class="flex flex-wrap items-end gap-2"><div><label class="label">Vídeo</label><select class="input" data-base-video-sel></select></div>
        <button class="btn-ghost btn-sm" data-base-video><i class="fa-solid fa-wand-magic-sparkles"></i> Montar base com gancho e CTA</button></div>
    </div>
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
  </section>

  <details class="mt-4 rounded-lg border border-emerald-200 p-3"><summary class="cursor-pointer text-sm font-semibold"><i class="fa-solid fa-film"></i> 4. Editor avançado de vídeo (corte, proporção, texto e legenda)</summary>
    <div class="mt-3" data-editor-video></div>
  </details>`;

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
      ${x.tipo === 'imagem' ? `<img src="${esc(x.url)}" class="h-full w-full object-cover" alt="">` : `<button data-ver-midia="${i}" class="flex h-full w-full items-center justify-center bg-slate-200 text-slate-600" title="Assistir e anotar o segundo do corte"><i class="fa-solid fa-circle-play text-2xl"></i></button>`}
      <button data-rm-midia="${i}" class="absolute right-0 top-0 bg-black/60 px-1.5 text-xs text-white" title="Remover">×</button></div>`).join('')
      || '<p class="hint">Nenhuma foto ou vídeo ainda. Sem material, o app usa um fundo de cor (só texto).</p>';
    $('[data-fundo]', raiz).innerHTML = fotos().length ? opcoes(fotos().map((x, i) => [String(i), `${i + 1}. ${x.nome}`]), '0') : '<option value="0">(sem foto: usa fundo de cor)</option>';
    agendarPrevia();
    if (typeof listarCenas === 'function') listarCenas();
  };

  const mostrarTotal = () => {
    const t = est.cenas.reduce((a, c) => a + Number(c.dur || 0), 0), el = $('[data-total]', raiz);
    el.textContent = `Duração total: ${t.toFixed(1)} s (máximo ${LIMITE_VIDEO_S} s)`;
    el.classList.toggle('text-rose-600', t > LIMITE_VIDEO_S + 0.05); el.classList.toggle('font-semibold', t > LIMITE_VIDEO_S + 0.05);
  };
  const listarCenas = () => {
    const velocidades = [0.8, 1, 1.1, 1.25, 1.5, 2];
    $('[data-cenas]', raiz).innerHTML = est.cenas.map((c, i) => {
      const m = midiaDaCena({ midia: c.midiaIdx != null ? est.midias[c.midiaIdx] : null }, i, est.midias), video = m?.tipo === 'video';
      return `<div class="rounded-lg bg-slate-50 p-2"><div class="flex items-start gap-2">
        <span class="mt-2 w-14 shrink-0 text-xs text-slate-500">${c.tipo === 'cta' ? 'Final' : 'Cena ' + (i + 1)}</span>
        <textarea class="input" rows="2" data-cena-texto="${i}" placeholder="(sem legenda: só a imagem)">${esc(c.texto)}</textarea>
        <button class="btn-ghost btn-sm shrink-0" data-cena-rm="${i}" title="Remover cena">×</button></div>
        <div class="mt-2 flex flex-wrap items-end gap-3 sm:pl-16">
          ${est.midias.length ? `<label class="text-xs text-slate-500">Imagem/vídeo<select class="input mt-0.5 !w-36" data-cena-midia="${i}"><option value="">auto</option>${est.midias.map((x, k) => `<option value="${k}" ${c.midiaIdx === k ? 'selected' : ''}>${k + 1}. ${esc(x.nome).slice(0, 16)}</option>`).join('')}</select></label>` : ''}
          <label class="text-xs text-slate-500">Duração (s)<input type="number" class="input mt-0.5 !w-20" min="1" max="${LIMITE_VIDEO_S}" step="0.5" data-cena-dur="${i}" value="${c.dur}"></label>
          ${video ? `<label class="text-xs text-slate-500" title="Segundo do vídeo de origem em que este trecho começa">Início no vídeo (s)<input type="number" class="input mt-0.5 !w-24" min="0" step="0.5" data-cena-inicio="${i}" value="${c.inicio || 0}"></label>
            <label class="text-xs text-slate-500">Velocidade<select class="input mt-0.5 !w-24" data-cena-vel="${i}">${velocidades.map((v) => `<option value="${v}" ${(c.vel || 1) === v ? 'selected' : ''}>${v}x</option>`).join('')}</select></label>
            <label class="flex items-center gap-1 pb-2 text-xs text-slate-600"><input type="checkbox" data-cena-som="${i}" ${c.som ? 'checked' : ''}> Som original</label>` : ''}
        </div></div>`;
    }).join('') || '<p class="hint">Sem cenas. Adicione pelo menos uma.</p>';
    mostrarTotal();
    atualizarAnimar();
  };
  const atualizarBase = () => {
    const sel = $('[data-base-video-sel]', raiz), atual = sel.value;
    const videos = est.midias.map((x, k) => [k, x]).filter(([, x]) => x.tipo === 'video');
    sel.innerHTML = videos.length ? videos.map(([k, x]) => `<option value="${k}" ${String(k) === atual ? 'selected' : ''}>${k + 1}. ${esc(x.nome)}</option>`).join('') : '<option value="">(envie um vídeo em Materiais)</option>';
  };
  const atualizarAnimar = () => {
    atualizarBase();
    const f = $('[data-animar-foto]', raiz), c = $('[data-animar-cena]', raiz), fa = f.value, ca = c.value;
    f.innerHTML = fotos().length ? opcoes(fotos().map((x, i) => [String(i), `${i + 1}. ${x.nome}`]), fa || '0') : '<option value="">(envie ou gere uma foto antes)</option>';
    c.innerHTML = '<option value="">(nenhuma: escolho depois)</option>' + est.cenas.map((x, i) => x.tipo === 'cena' ? `<option value="${i}" ${ca === String(i) ? 'selected' : ''}>Cena ${i + 1}${x.texto ? ': ' + esc(x.texto).slice(0, 28) : ''}</option>` : '').join('');
  };
  listarMidias(); listarCenas();
  montarEditorVideo($('[data-editor-video]', raiz), { criativo, cliente });

  const adicionarArquivos = async (arqs) => {
    for (const f of arqs) est.midias.push(await carregarMidia(f));
    listarMidias();
  };
  on(raiz, 'change', '[data-midias]', (i) => ocupado(i, async () => { await adicionarArquivos([...i.files]); i.value = ''; }));
  on(raiz, 'click', '[data-rm-midia]', (b) => {
    const k = Number(b.dataset.rmMidia), [x] = est.midias.splice(k, 1); URL.revokeObjectURL(x.url);
    est.cenas.forEach((c) => { if (c.midiaIdx === k) c.midiaIdx = null; else if (c.midiaIdx > k) c.midiaIdx--; }); // cada cena continua ligada à mesma imagem
    listarMidias();
  });
  on(raiz, 'change', '[data-cena-midia]', (s) => { est.cenas[Number(s.dataset.cenaMidia)].midiaIdx = s.value === '' ? null : Number(s.value); });
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
  on(raiz, 'click', '[data-baixar-foto]', (b) => ocupado(b, async () => { baixar(await pngDe(est.formato), `${nomeArquivo(criativo.nome)}-${est.formato}.png`); toast('Foto baixada.'); }));
  on(raiz, 'click', '[data-baixar-todas]', (b) => ocupado(b, async () => {
    for (const [f] of FORMATOS_IMAGEM) { baixar(await pngDe(f), `${nomeArquivo(criativo.nome)}-${f}.png`); await new Promise((r) => setTimeout(r, 400)); }
    toast('3 fotos baixadas. Se o navegador pedir, permita downloads múltiplos.');
  }));

  on(raiz, 'click', '[data-baixar-por-foto]', (b) => ocupado(b, async () => {
    const lista = fotos();
    if (!lista.length) throw new Error('Envie pelo menos uma foto em "Materiais".');
    for (const [i, f] of lista.entries()) { baixar(await pngDe(est.formato, { midia: f }), `${nomeArquivo(criativo.nome)}-${est.formato}-foto${i + 1}.png`); await new Promise((r) => setTimeout(r, 400)); }
    toast(`${lista.length} peça(s) baixada(s). Se o navegador pedir, permita downloads múltiplos.`);
  }));

  // ---- prompts para geradores externos (usa a assinatura, sem custo extra) ----
  on(raiz, 'click', '[data-sugerir-prompt]', (b) => ocupado(b, async () => {
    const modelo = $('[data-modelo-prompt]', raiz).value, ugc = modelo === 'unboxing';
    const r = await sugerirPromptsVisuais({ cliente, criativo, modelo });
    est.promptsCenas = r.cenas; est.legendasUgc = ugc ? r.legendas : [];
    const extra = (i) => (ugc ? `${r.legendas[i] ? `<p class="mt-1 text-xs"><b>Legenda na tela:</b> ${esc(r.legendas[i])}</p>` : ''}${r.filmagem[i] ? `<p class="text-xs text-emerald-700"><b>Como filmar:</b> ${esc(r.filmagem[i])}</p>` : ''}` : '');
    const caixa = (rotulo, texto, pt, cena = null) => `<div class="rounded-lg bg-slate-50 p-2"><div class="mb-1 flex items-center justify-between gap-2"><b class="text-xs text-slate-600">${esc(rotulo)}</b>
      <span class="flex gap-1">${cena !== null ? `<button class="btn-ia btn-sm" data-gerar-cena="${cena}" title="Gera a imagem desta cena e liga à cena do vídeo">Gerar imagem</button>` : ''}
      <button class="btn-ghost btn-sm" data-copiar-prompt>Copiar (inglês)</button></span></div><p class="whitespace-pre-wrap text-sm" data-texto-prompt>${esc(texto)}</p>
      ${pt ? `<p class="mt-1 whitespace-pre-wrap border-t border-slate-200 pt-1 text-xs text-slate-500"><b>Tradução:</b> ${esc(pt)}</p>` : ''}${cena !== null ? extra(cena) : ''}</div>`;
    $('[data-prompts]', raiz).innerHTML = (r.foto ? caixa('Foto estática (4:5)', r.foto, r.fotoPt) : '') + (r.cenas.length ? `<div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 p-2"><span class="text-sm">Vídeo com IA: uma imagem por cena (${r.cenas.length} imagens, sai da cota do dia)</span>
        <button class="btn-ia btn-sm" data-gerar-todas><i class="fa-solid fa-images"></i> Gerar imagem de todas as cenas</button></div>` : '')
      + (ugc && r.legendas.length ? `<div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2"><span class="text-sm">Modelo UGC: ${r.cenas.length} cenas de 5 s = ${r.cenas.length * 5} s. Filme cada cena ou gere os clipes.</span>
        <button class="btn-ghost btn-sm" data-usar-cenas-ugc><i class="fa-solid fa-list-ol"></i> Usar estas cenas na linha do tempo</button></div>` : '')
      + r.cenas.map((c, i) => caixa(`${ugc ? `Cena ${i + 1}: ${CENAS_UNBOXING[i] || ''}` : `Vídeo — cena ${i + 1}`} (9:16)`, c, r.cenasPt[i], i)).join('')
      + (r.dicas ? `<p class="hint">${esc(r.dicas)}</p>` : '');
    if (r.foto) $('[data-prompt-ia]', raiz).value = r.foto;
  }));
  // Cria a linha do tempo do vídeo com as legendas do modelo UGC (5 s por cena; a última é o CTA).
  on(raiz, 'click', '[data-usar-cenas-ugc]', () => {
    const l = est.legendasUgc || [];
    if (!l.length) return;
    est.cenas = l.map((texto, i) => ({ texto, dur: 5, tipo: i === l.length - 1 ? 'cta' : 'cena' }));
    listarCenas();
    toast(`Linha do tempo criada com ${l.length} cenas de 5 s. Envie ou gere um clipe para cada cena e ligue no seletor "Imagem/vídeo".`);
  });
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
  /** Gera uma imagem no servidor (rodízio de provedores), adiciona aos materiais e devolve o índice dela. */
  const gerarImagemIa = async (prompt, formato) => {
    const r = await fetch('/api/imagem', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenAtual()}` },
      body: JSON.stringify({ prompt, formato }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Falha ao gerar a imagem.');
    const m = await carregarImagemUrl(j.imagem);
    m.nome = `ia-${est.midias.length + 1}`;
    est.midias.push(m);
    return est.midias.length - 1;
  };
  on(raiz, 'click', '[data-gerar-ia]', (b) => ocupado(b, async () => {
    const prompt = $('[data-prompt-ia]', raiz).value.trim();
    if (!prompt) throw new Error('Descreva a imagem.');
    await gerarImagemIa(prompt, formatoIa());
    listarMidias(); toast('Imagem gerada e adicionada aos materiais.'); statusIa();
  }));
  // Liga a i-ésima cena do roteiro (só as de conteúdo, sem o CTA final) à imagem gerada para ela.
  const cenaDeConteudo = (i) => est.cenas.filter((c) => c.tipo === 'cena')[i];
  const formatoVideoIa = () => { const [w, h] = dims(est.formatoVideo); return h / w > 1.5 ? '9:16' : h === w ? '1:1' : '4:5'; };
  on(raiz, 'click', '[data-gerar-cena]', (b) => ocupado(b, async () => {
    const i = Number(b.dataset.gerarCena);
    const k = await gerarImagemIa(est.promptsCenas[i], formatoVideoIa());
    const cena = cenaDeConteudo(i); if (cena) cena.midiaIdx = k;
    listarMidias(); statusIa(); toast(`Imagem da cena ${i + 1} pronta${cena ? ' e ligada à cena do vídeo.' : '.'}`);
  }));
  on(raiz, 'click', '[data-gerar-todas]', (b) => ocupado(b, async () => {
    const total = est.promptsCenas.length; let feitas = 0;
    try {
      for (let i = 0; i < total; i++) {
        b.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cena ${i + 1} de ${total}…`;
        const k = await gerarImagemIa(est.promptsCenas[i], formatoVideoIa());
        const cena = cenaDeConteudo(i); if (cena) cena.midiaIdx = k;
        feitas++; listarMidias();
      }
    } finally { statusIa(); }
    toast(`${feitas} imagens geradas e ligadas às cenas. Confira e clique em "Gerar vídeo".`);
  }));

  // ---- foto -> vídeo com IA (Pixazo/LTX) ----
  const reduzirFoto = (img, lado = 1024) => {
    const e = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * e); c.height = Math.round(img.naturalHeight * e);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9);
  };
  const statusVideoIa = async () => {
    const el = $('[data-status-video]', raiz);
    try {
      const r = await fetch('/api/video/status', { headers: { Authorization: `Bearer ${await tokenAtual()}` } });
      const s = await r.json();
      el.textContent = s.configurado ? `${s.provedor}: ${s.usadoHoje}/${s.limiteDia} hoje` : 'Sem chave: crie a conta gratuita em pixazo.ai e coloque PIXAZO_API_KEY no .env (veja o README).';
    } catch { el.textContent = 'Servidor de IA indisponível.'; }
  };
  statusVideoIa();
  on(raiz, 'click', '[data-animar]', (b) => ocupado(b, async () => {
    const foto = fotos()[Number($('[data-animar-foto]', raiz).value)];
    if (!foto) throw new Error('Envie ou gere uma foto antes.');
    b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Animando… (1 a 3 min)';
    const r = await fetch('/api/video', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenAtual()}` },
      body: JSON.stringify({ imagem: reduzirFoto(foto.el), prompt: $('[data-animar-prompt]', raiz).value.trim(), formato: formatoVideoIa() }),
    });
    if (!r.ok || !(r.headers.get('content-type') || '').startsWith('video/')) throw new Error((await r.json().catch(() => ({}))).erro || 'Falha ao gerar o vídeo.');
    const m = await carregarMidia(new File([await r.blob()], `ia-video-${est.midias.length + 1}.mp4`, { type: 'video/mp4' }));
    est.midias.push(m);
    const cena = $('[data-animar-cena]', raiz).value;
    if (cena !== '') est.cenas[Number(cena)].midiaIdx = est.midias.length - 1;
    listarMidias(); statusVideoIa();
    toast(`Clipe pronto e adicionado aos materiais${cena !== '' ? ', ligado à cena ' + (Number(cena) + 1) : ''}. Clique em "Gerar vídeo" para montar.`);
  }));

  // ---- cenas ----
  on(raiz, 'input', '[data-cena-texto]', (t) => { est.cenas[Number(t.dataset.cenaTexto)].texto = t.value; });
  on(raiz, 'input', '[data-cena-dur]', (t) => {
    est.cenas[Number(t.dataset.cenaDur)].dur = Math.min(12, Math.max(1, Number(t.value) || 1));
    mostrarTotal();
  });
  on(raiz, 'input', '[data-cena-inicio]', (t) => { est.cenas[Number(t.dataset.cenaInicio)].inicio = Math.max(0, Number(t.value) || 0); });
  on(raiz, 'change', '[data-cena-vel]', (t) => { est.cenas[Number(t.dataset.cenaVel)].vel = Number(t.value) || 1; });
  on(raiz, 'change', '[data-cena-som]', (t) => { est.cenas[Number(t.dataset.cenaSom)].som = t.checked; });
  on(raiz, 'click', '[data-ver-midia]', (b) => {
    const x = est.midias[Number(b.dataset.verMidia)];
    const v = modal(`Assistir: ${x.nome}`, `<video src="${esc(x.url)}" controls playsinline class="mx-auto max-h-[70vh] w-full rounded-lg bg-black"></video><p class="hint mt-2">Anote o segundo em que cada trecho começa e use em "Início no vídeo" de cada cena.</p>`);
    return v;
  });
  // Base de edição para o vídeo do cliente: gancho (3 s) + corpo + CTA, tudo dentro do limite de 30 s.
  on(raiz, 'click', '[data-base-video]', () => {
    const k = Number($('[data-base-video-sel]', raiz).value), m = est.midias[k];
    if (!m || m.tipo !== 'video') return toast('Envie o vídeo do cliente em "Materiais" primeiro.', 'erro');
    const d = Number.isFinite(m.el.duration) ? m.el.duration : LIMITE_VIDEO_S;
    const cta = $('[data-cta]', raiz).value.trim(), gancho = Math.min(3, d), fimCta = cta ? 3 : 0;
    const corpo = Math.max(0, Math.min(d - gancho, LIMITE_VIDEO_S - gancho - fimCta));
    est.cenas = [
      { texto: $('[data-hook]', raiz).value.trim(), dur: gancho, tipo: 'cena', midiaIdx: k, inicio: 0, vel: 1, som: true },
      ...(corpo >= 1 ? [{ texto: '', dur: corpo, tipo: 'cena', midiaIdx: k, inicio: gancho, vel: 1, som: true }] : []),
      ...(cta ? [{ texto: cta, dur: fimCta, tipo: 'cta', midiaIdx: k, inicio: Math.min(gancho + corpo, Math.max(0, d - fimCta)), vel: 1, som: true }] : []),
    ];
    listarCenas();
    toast(`Base montada (${est.cenas.reduce((a, c) => a + c.dur, 0).toFixed(0)} s): gancho com o hook, o vídeo do cliente e o CTA. Ajuste os cortes e legendas.`);
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
    const totalCenas = est.cenas.reduce((a, c) => a + Number(c.dur || 0), 0);
    if (totalCenas > LIMITE_VIDEO_S + 0.05) return toast(`O vídeo tem ${totalCenas.toFixed(1)} s. O máximo é ${LIMITE_VIDEO_S} s: reduza a duração de alguma cena.`, 'erro');
    const [largura, altura] = dims(est.formatoVideo);
    est.ctrl = new AbortController();
    const barra = $('[data-barra]', raiz), prog = $('[data-progresso]', raiz), cancelar = $('[data-cancelar]', raiz);
    prog.classList.remove('hidden'); cancelar.classList.remove('hidden'); barra.style.width = '0%';
    $('[data-resultado]', raiz).innerHTML = '';
    await ocupado(b, async () => {
      try {
        const r = await gravarVideo({
          cenas: est.cenas.map((c) => ({ ...c, midia: c.midiaIdx != null ? est.midias[c.midiaIdx] : null })), midias: est.midias, cor: est.cor, corTexto: est.corTexto, logo: est.logo, musica: est.musica,
          largura, altura, sinal: est.ctrl.signal, aoProgresso: (p) => { barra.style.width = `${Math.round(p * 100)}%`; },
        });
        if (est.urlVideo) URL.revokeObjectURL(est.urlVideo);
        est.urlVideo = URL.createObjectURL(r.blob);
        const nome = `${nomeArquivo(criativo.nome)}-${est.formatoVideo}.${r.ext}`;
        $('[data-resultado]', raiz).innerHTML = `<video src="${esc(est.urlVideo)}" controls playsinline class="mx-auto max-h-[420px] rounded-lg bg-black"></video>
          <div class="mt-2 flex flex-wrap items-center gap-2"><button class="btn-primary btn-sm" data-baixar-video><i class="fa-solid fa-download"></i> Baixar ${esc(r.ext.toUpperCase())} (${r.duracao.toFixed(0)} s)</button></div>
          ${r.ext === 'webm' ? '<p class="mt-2 text-sm text-amber-700"><i class="fa-solid fa-triangle-exclamation"></i> Este navegador só gravou em WebM. O Meta Ads e o TikTok pedem MP4: atualize o Chrome/Edge ou converta o arquivo antes de subir.</p>' : ''}`;
        est.ultimo = { blob: r.blob, nome };
        toast('Vídeo pronto. Confira a prévia e baixe.');
      } finally { prog.classList.add('hidden'); cancelar.classList.add('hidden'); est.ctrl = null; }
    });
  });
}
