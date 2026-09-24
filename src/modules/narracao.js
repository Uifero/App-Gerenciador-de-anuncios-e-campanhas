// Seção "Narração" do Estúdio: prévia sonora (voz sintética do navegador, só para ouvir), roteiro de narração por
// cena para colar numa IA de voz externa (com ou sem IA), gravação da própria voz pelo microfone e anexo do áudio
// final, que entra no "Gerar vídeo" (misturado à música, com volumes separados) e no editor avançado.
// Nada aqui é obrigatório: sem narração anexada, o Estúdio funciona exatamente como antes.
import { gerarRoteiroNarracao } from '../core/ia.js';
import {
  montarRoteiroNarracao, textoRoteiro, textoSoFala, normalizarRoteiroIa, ajustarCenasANarracao, tempo, LIMITE_GRAVACAO_S,
} from '../lib/narracao.js';
import { htmlFerramentas } from '../lib/ferramentas-ia.js';
import { $, esc, on, toast, ocupado, copiar, campoArquivo } from '../core/ui.js';

const temVozSintetica = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
const temMicrofone = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
const MIME_AUDIO = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

/** Duração real do áudio (decodificando): o WebM gravado pelo MediaRecorder não traz a duração no cabeçalho. */
async function duracaoDoAudio(arquivo) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ac = new Ctx();
  try { return (await ac.decodeAudioData(await arquivo.arrayBuffer())).duration; }
  catch { throw new Error('Não consegui ler este áudio. Use MP3, WAV, M4A ou WebM.'); }
  finally { ac.close(); }
}

/** Divide o texto em frases curtas: o Chrome corta falas sintéticas longas (~15 s) se forem uma frase só. */
const frases = (t) => String(t || '').split(/(?<=[.!?…])\s+|\n+/).map((x) => x.trim()).filter(Boolean);

/**
 * Monta a seção dentro de `raiz`. `cenas()` devolve a linha do tempo atual do vídeo; `aoAjustarCenas(novas)` troca
 * as durações; `aoMudar()` avisa o Estúdio que a narração anexada mudou. Devolve { obter, cenasMudaram, parar }.
 */
export function montarNarracao(raiz, { cliente, criativo, cenas, aoAjustarCenas, aoMudar }) {
  const est = { roteiroIa: null, narr: null, gravacao: null, rec: null, falando: false, volNarracao: 1, volMusica: 0.2 };
  const linhas = () => montarRoteiroNarracao(cenas(), est.roteiroIa?.cenas);
  const falaInicial = () => textoSoFala(linhas()) || [criativo.hook, criativo.copy, criativo.cta].filter(Boolean).join('\n\n');

  raiz.innerHTML = `
    <div class="space-y-3">
      <div class="rounded-lg border border-slate-200 p-3" data-bloco="previa">
        <h5 class="text-sm font-semibold"><i class="fa-solid fa-headphones"></i> 1. Ouvir prévia <span class="tag tag-warn ml-1">só para ouvir, não gera arquivo</span></h5>
        <p class="hint mb-2">A voz do próprio navegador lê o texto abaixo, para você sentir o tempo e o ritmo. Ela não pode ser baixada: para o arquivo de voz, use o passo 2 ou 3.</p>
        ${temVozSintetica() ? `<textarea class="input" rows="4" data-texto-previa>${esc(falaInicial())}</textarea>
          <div class="mt-2 flex flex-wrap items-end gap-2">
            <label class="text-xs text-slate-500">Voz<select class="input mt-0.5 !w-56" data-voz><option value="">Padrão do navegador (pt-BR)</option></select></label>
            <label class="text-xs text-slate-500">Velocidade<select class="input mt-0.5 !w-24" data-vel-voz><option value="0.9">0.9x</option><option value="1" selected>1x</option><option value="1.1">1.1x</option><option value="1.25">1.25x</option></select></label>
            <button class="btn-primary btn-sm" data-ouvir><i class="fa-solid fa-play"></i> Ouvir prévia</button>
            <button class="btn-ghost btn-sm hidden" data-parar-voz><i class="fa-solid fa-stop"></i> Parar</button></div>
          <p class="hint mt-1" data-aviso-voz></p>`
        : '<p class="text-sm text-amber-700">Este navegador não tem voz sintética. Use o Chrome ou o Edge para ouvir a prévia; os passos 2, 3 e 4 funcionam normalmente.</p>'}
      </div>

      <div class="rounded-lg border border-slate-200 p-3" data-bloco="roteiro">
        <h5 class="text-sm font-semibold"><i class="fa-solid fa-file-lines"></i> 2. Roteiro para uma IA de voz</h5>
        <p class="hint mb-2">Monta a fala de cada cena do vídeo (a mesma linha do tempo do "Gerar vídeo"), com tempo, tom e ritmo. <b>Sem IA</b> usa o texto de cada cena; <b>com IA</b> escreve falas naturais que cabem no tempo.</p>
        <div class="flex flex-wrap gap-2"><button class="btn-ghost btn-sm" data-roteiro-manual><i class="fa-solid fa-list-ol"></i> Montar roteiro sem IA</button>
          <button class="btn-ia btn-sm" data-roteiro-ia><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar roteiro de narração com IA</button></div>
        <div data-roteiro class="mt-2"></div>
      </div>

      <div class="rounded-lg border border-slate-200 p-3" data-bloco="gravar">
        <h5 class="text-sm font-semibold"><i class="fa-solid fa-microphone"></i> 3. Gravar minha voz</h5>
        <p class="hint mb-2">Grava pelo microfone deste computador, sem IA. O texto do roteiro aparece enquanto você grava. Ouça antes de usar. Máximo ${LIMITE_GRAVACAO_S / 60} minutos.</p>
        ${temMicrofone() ? `<div class="flex flex-wrap items-center gap-2"><button class="btn-primary btn-sm" data-gravar-voz><i class="fa-solid fa-circle"></i> Gravar minha voz</button>
          <button class="btn-danger btn-sm hidden" data-parar-gravacao><i class="fa-solid fa-stop"></i> Parar gravação</button>
          <span class="text-sm font-medium text-rose-600 hidden" data-cronometro></span></div>
          <div data-teleprompter class="mt-2 hidden max-h-48 overflow-y-auto rounded-lg bg-slate-900 p-3 text-lg leading-relaxed text-white"></div>
          <div data-gravacao class="mt-2"></div>`
        : '<p class="text-sm text-amber-700">Este navegador não permite gravar áudio. Use o Chrome ou o Edge atualizado, ou grave no celular e envie no passo 4.</p>'}
      </div>

      <div class="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3" data-bloco="anexar">
        <h5 class="text-sm font-semibold"><i class="fa-solid fa-paperclip"></i> 4. Narração do vídeo</h5>
        <p class="hint mb-2">O áudio escolhido aqui entra no <b>Gerar vídeo</b> (etapa 3), começando junto com a primeira cena e misturado com a música, e também pode ser colocado num vídeo do editor avançado (ferramenta "Adicionar narração").</p>
        <div data-narracao-atual></div>
        ${campoArquivo({ attrs: 'data-arq-narracao', accept: 'audio/*,.mp3,.wav,.m4a,.webm,.ogg', icone: 'file-audio', texto: 'Enviar áudio de narração (MP3, WAV, M4A)', destaque: false, lista: true })}
      </div>
    </div>`;

  // ---------- 1. prévia sonora ----------
  const synth = temVozSintetica() ? window.speechSynthesis : null;
  const vozesPt = () => synth.getVoices().filter((v) => /^pt([-_]|$)/i.test(v.lang)).sort((a, b) => (/BR/i.test(b.lang) ? 1 : 0) - (/BR/i.test(a.lang) ? 1 : 0));
  const listarVozes = () => {
    const sel = $('[data-voz]', raiz); if (!sel) return;
    const atual = sel.value, vozes = vozesPt();
    sel.innerHTML = '<option value="">Padrão do navegador (pt-BR)</option>' + vozes.map((v) => `<option value="${esc(v.name)}" ${v.name === atual ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
    $('[data-aviso-voz]', raiz).textContent = vozes.length ? '' : 'Nenhuma voz em português instalada neste computador: o navegador vai usar a voz padrão (pode sair com sotaque).';
  };
  if (synth) { listarVozes(); synth.addEventListener?.('voiceschanged', listarVozes); }
  const pararVoz = () => {
    if (!synth) return;
    est.falando = false; synth.cancel();
    $('[data-ouvir]', raiz)?.classList.remove('hidden'); $('[data-parar-voz]', raiz)?.classList.add('hidden');
  };
  on(raiz, 'click', '[data-ouvir]', () => {
    const partes = frases($('[data-texto-previa]', raiz).value);
    if (!partes.length) return toast('Escreva o texto que quer ouvir (ou monte o roteiro no passo 2).', 'erro');
    synth.cancel();
    const voz = vozesPt().find((v) => v.name === $('[data-voz]', raiz).value), vel = Number($('[data-vel-voz]', raiz).value) || 1;
    est.falando = true;
    $('[data-ouvir]', raiz).classList.add('hidden'); $('[data-parar-voz]', raiz).classList.remove('hidden');
    partes.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = voz?.lang || 'pt-BR'; if (voz) u.voice = voz; u.rate = vel;
      if (i === partes.length - 1) u.onend = () => { if (est.falando) pararVoz(); };
      u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') { toast('A voz do navegador falhou: ' + e.error, 'erro'); pararVoz(); } };
      synth.speak(u);
    });
  });
  on(raiz, 'click', '[data-parar-voz]', pararVoz);

  // ---------- 2. roteiro ----------
  const mostrarRoteiro = (comIa) => {
    const l = linhas();
    if (!l.length) { $('[data-roteiro]', raiz).innerHTML = '<p class="hint">Sem cenas no vídeo. Adicione cenas na etapa 3 (Vídeo) e monte o roteiro de novo.</p>'; return; }
    const so = textoSoFala(l);
    $('[data-roteiro]', raiz).innerHTML = `
      <div class="rounded-lg bg-slate-50 p-2">
        <div class="mb-1 flex flex-wrap items-center justify-between gap-2"><b class="text-xs text-slate-600">${comIa ? 'Roteiro escrito pela IA (revise antes de usar)' : 'Roteiro montado com o texto das cenas'}</b>
          <span class="flex flex-wrap gap-1"><button class="btn-primary btn-sm" data-copiar-fala><i class="fa-solid fa-copy"></i> Copiar só a fala</button>
          <button class="btn-ghost btn-sm" data-copiar-roteiro>Copiar roteiro completo</button></span></div>
        <pre class="max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-sm" data-texto-roteiro>${esc(textoRoteiro(l, est.roteiroIa?.direcao))}</pre></div>
      <p class="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-sm text-indigo-900"><i class="fa-solid fa-circle-info"></i> <b>Cole isso na ferramenta de voz, baixe o áudio, e envie abaixo</b> (passo 4). Cole <b>só a fala</b>: as marcações de tempo, tom e ritmo são para você escolher a voz e o estilo, não para serem lidas.</p>
      ${htmlFerramentas({ grupos: ['voz'], titulo: 'Ferramentas de voz gratuitas:' })}`;
    $('[data-roteiro]', raiz)._fala = so;
    const tp = $('[data-texto-previa]', raiz); if (tp) tp.value = so;
  };
  on(raiz, 'click', '[data-roteiro-manual]', () => { est.roteiroIa = null; mostrarRoteiro(false); });
  on(raiz, 'click', '[data-roteiro-ia]', (b) => ocupado(b, async () => {
    const cs = cenas();
    if (!cs.length) throw new Error('Adicione pelo menos uma cena na etapa 3 (Vídeo) antes.');
    est.roteiroIa = normalizarRoteiroIa(await gerarRoteiroNarracao({ cliente, criativo, cenas: cs }), cs.length);
    mostrarRoteiro(true);
    toast('Roteiro de narração pronto. Revise e copie só a fala para a ferramenta de voz.');
  }));
  on(raiz, 'click', '[data-copiar-fala]', () => copiar($('[data-roteiro]', raiz)._fala || ''));
  on(raiz, 'click', '[data-copiar-roteiro]', () => copiar($('[data-texto-roteiro]', raiz).textContent));

  // ---------- 3. gravação própria ----------
  const limparGravacao = () => { if (est.gravacao?.url) URL.revokeObjectURL(est.gravacao.url); est.gravacao = null; $('[data-gravacao]', raiz).innerHTML = ''; };
  on(raiz, 'click', '[data-gravar-voz]', async (b) => {
    pararVoz(); limparGravacao();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) {
      return toast(e?.name === 'NotAllowedError' ? 'O navegador bloqueou o microfone. Clique no cadeado ao lado do endereço, permita o microfone e tente de novo.'
        : e?.name === 'NotFoundError' ? 'Nenhum microfone encontrado neste computador.' : 'Não consegui abrir o microfone: ' + (e?.message || e), 'erro');
    }
    const mime = MIME_AUDIO.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), pedacos = [];
    const l = linhas(), t0 = Date.now();
    const tele = $('[data-teleprompter]', raiz), cron = $('[data-cronometro]', raiz);
    tele.innerHTML = l.filter((x) => x.fala).map((x) => `<p class="mb-2 opacity-60 transition-opacity" data-tele="${x.n}">${esc(x.fala)}</p>`).join('') || `<p>${esc(falaInicial())}</p>`;
    tele.classList.remove('hidden'); cron.classList.remove('hidden');
    b.classList.add('hidden'); $('[data-parar-gravacao]', raiz).classList.remove('hidden');
    const tique = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      cron.innerHTML = `<i class="fa-solid fa-circle animate-pulse"></i> Gravando ${tempo(s)}`;
      const atual = l.find((x) => s >= x.inicio && s < x.fim);
      tele.querySelectorAll('[data-tele]').forEach((p) => p.classList.toggle('opacity-60', Number(p.dataset.tele) !== atual?.n));
      if (s >= LIMITE_GRAVACAO_S) rec.stop();
    }, 250);
    rec.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
    rec.onstop = () => {
      clearInterval(tique); stream.getTracks().forEach((t) => t.stop()); est.rec = null;
      tele.classList.add('hidden'); cron.classList.add('hidden');
      b.classList.remove('hidden'); $('[data-parar-gravacao]', raiz).classList.add('hidden');
      const tipo = rec.mimeType || mime || 'audio/webm', ext = tipo.includes('mp4') ? 'm4a' : tipo.includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(pedacos, { type: tipo.split(';')[0] });
      if (!blob.size) return toast('A gravação saiu vazia. Confira o microfone e tente de novo.', 'erro');
      est.gravacao = { arquivo: new File([blob], `narracao-gravada.${ext}`, { type: blob.type }), url: URL.createObjectURL(blob) };
      $('[data-gravacao]', raiz).innerHTML = `<div class="rounded-lg bg-slate-50 p-2"><p class="mb-1 text-sm font-medium">Ouça a gravação antes de usar:</p>
        <audio src="${esc(est.gravacao.url)}" controls class="w-full"></audio>
        <div class="mt-2 flex flex-wrap gap-2"><button class="btn-primary btn-sm" data-usar-gravacao><i class="fa-solid fa-check"></i> Usar esta gravação como narração</button>
          <button class="btn-ghost btn-sm" data-descartar-gravacao>Descartar e gravar de novo</button></div></div>`;
    };
    rec.start(250);
    est.rec = rec;
  });
  on(raiz, 'click', '[data-parar-gravacao]', () => { if (est.rec?.state === 'recording') est.rec.stop(); });
  on(raiz, 'click', '[data-descartar-gravacao]', limparGravacao);
  on(raiz, 'click', '[data-usar-gravacao]', (b) => ocupado(b, async () => {
    await definirNarracao(est.gravacao.arquivo, 'gravada aqui no app');
    limparGravacao();
  }));

  // ---------- 4. narração anexada ----------
  async function definirNarracao(arquivo, origem) {
    const duracao = await duracaoDoAudio(arquivo);
    if (est.narr?.url) URL.revokeObjectURL(est.narr.url);
    est.narr = { arquivo, origem, duracao, url: URL.createObjectURL(arquivo) };
    desenharNarracao(); aoMudar?.();
    toast('Narração pronta. Ela entra no próximo "Gerar vídeo".');
  }
  function desenharNarracao() {
    const el = $('[data-narracao-atual]', raiz), n = est.narr;
    const rotulo = $('[data-bloco="anexar"] [data-upload-rotulo]', raiz);
    if (rotulo) rotulo.textContent = n ? 'Trocar por outro áudio (MP3, WAV, M4A)' : 'Enviar áudio de narração (MP3, WAV, M4A)';
    if (!n) { el.innerHTML = '<p class="hint mb-2">Nenhuma narração ainda. Envie o áudio que baixou da ferramenta de voz, ou use "Gravar minha voz". Sem narração, o vídeo sai só com a música (se houver), como antes.</p>'; return; }
    const total = cenas().reduce((a, c) => a + (Number(c.dur) || 0), 0), dif = n.duracao - total;
    el.innerHTML = `<div class="mb-2 rounded-lg bg-white p-2">
      <p class="mb-1 text-sm"><i class="fa-solid fa-circle-check text-emerald-600"></i> <b>${esc(n.arquivo.name)}</b> · ${tempo(n.duracao)} (${n.duracao.toFixed(1)} s) · ${esc(n.origem)}</p>
      <audio src="${esc(n.url)}" controls class="w-full"></audio>
      ${Math.abs(dif) > 1 ? `<p class="mt-2 text-sm text-amber-700"><i class="fa-solid fa-triangle-exclamation"></i> A narração tem ${n.duracao.toFixed(1)} s e as cenas somam ${total.toFixed(1)} s: ${dif > 0 ? 'o fim da fala seria cortado' : 'o vídeo continua depois que a fala acaba'}.
        <button class="btn-ghost btn-sm ml-1" data-ajustar-cenas>Ajustar a duração das cenas à narração</button></p>` : '<p class="hint mt-1">A duração bate com a das cenas.</p>'}
      <div class="mt-2 grid gap-2 sm:grid-cols-2">
        <label class="text-sm">Volume da narração <b data-rot-vol-n>${Math.round(est.volNarracao * 100)}%</b><input type="range" min="0" max="1.5" step="0.05" value="${est.volNarracao}" data-vol-narracao class="w-full"></label>
        <label class="text-sm">Volume da música de fundo <b data-rot-vol-m>${Math.round(est.volMusica * 100)}%</b><input type="range" min="0" max="1" step="0.05" value="${est.volMusica}" data-vol-musica class="w-full"></label></div>
      <p class="hint">A música é a enviada em "1. Materiais" (e, no editor avançado, o áudio que o vídeo já tem). Deixe a música bem mais baixa que a voz.</p>
      <button class="btn-danger btn-sm mt-2" data-rm-narracao>Remover narração</button></div>`;
  }
  on(raiz, 'change', '[data-arq-narracao]', (inp) => ocupado(inp, async () => {
    const f = inp.files[0]; if (!f) return;
    try { await definirNarracao(f, 'arquivo enviado'); } finally { inp.value = ''; } // o cartão acima mostra o arquivo em uso
  }));
  on(raiz, 'input', '[data-vol-narracao]', (i) => { est.volNarracao = Number(i.value); $('[data-rot-vol-n]', raiz).textContent = `${Math.round(est.volNarracao * 100)}%`; });
  on(raiz, 'input', '[data-vol-musica]', (i) => { est.volMusica = Number(i.value); $('[data-rot-vol-m]', raiz).textContent = `${Math.round(est.volMusica * 100)}%`; });
  on(raiz, 'click', '[data-ajustar-cenas]', () => {
    aoAjustarCenas(ajustarCenasANarracao(cenas(), est.narr.duracao));
    desenharNarracao();
    toast('Durações das cenas ajustadas à narração. Confira na etapa 3.');
  });
  on(raiz, 'click', '[data-rm-narracao]', () => {
    URL.revokeObjectURL(est.narr.url); est.narr = null; desenharNarracao(); aoMudar?.();
  });
  desenharNarracao();

  return {
    /** Narração anexada (ou null): o que o "Gerar vídeo" e o editor avançado usam. */
    obter: () => (est.narr ? { arquivo: est.narr.arquivo, duracao: est.narr.duracao, volumeNarracao: est.volNarracao, volumeMusica: est.volMusica } : null),
    /** O Estúdio chama quando as cenas mudam (a comparação de duração precisa ser refeita). */
    cenasMudaram: () => { if (est.narr) desenharNarracao(); },
    /** Ao fechar o Estúdio: para a voz, a gravação e libera os arquivos da memória. */
    parar: () => {
      pararVoz(); if (est.rec?.state === 'recording') est.rec.stop();
      synth?.removeEventListener?.('voiceschanged', listarVozes);
      if (est.narr?.url) URL.revokeObjectURL(est.narr.url);
      if (est.gravacao?.url) URL.revokeObjectURL(est.gravacao.url);
    },
  };
}
