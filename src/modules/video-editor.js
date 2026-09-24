// Editor avançado de vídeo do Estúdio: corte, proporção, texto/legenda queimados, transcrição por voz, montagem
// de múltiplos clipes e trilha — tudo via ffmpeg.wasm (src/lib/video.js), 100% no navegador. Diferente do "Gerar
// vídeo" (que monta cenas a partir de fotos, no Canvas): aqui se edita um vídeo JÁ GRAVADO de verdade. Nenhum
// arquivo de vídeo bruto passa pelo servidor em nenhum momento.
import {
  ffmpegSuportado, metadadosVideo, cortarEConcatenar, validarCortes, ajustarProporcao, PROPORCOES_VIDEO,
  sobreporTexto, normalizarAudio, reconhecimentoDeVozDisponivel, validarSegmentosLegenda, gerarSrt, queimarLegenda,
  montarClipes, TRANSICOES, misturarAudio, misturarNarracao,
} from '../lib/video.js';
import { db, COL, removerArquivo } from '../core/storage.js';
import { enviarArquivoOuAvisar } from '../lib/uploads.js';
import { previaEmSegundoPlano } from '../lib/previa.js';
import { $, $$, esc, on, toast, ocupado, opcoes, confirmar, campoArquivo } from '../core/ui.js';

const AVISO_LENTIDAO = 'Isso pode demorar dependendo do seu computador (roda tudo aqui, sem servidor). Não feche esta aba enquanto processa.';
const fmtT = (s) => { const n = Number(s) || 0; return `${Math.floor(n / 60)}:${String((n % 60).toFixed(1)).padStart(4, '0')}`; };

/**
 * Monta o editor dentro de `raiz` (um <div> vazio). `criativo`/`cliente` são usados para pré-preencher hook/CTA
 * e para o botão "Usar como peça final deste criativo" (reaproveita o mesmo upload já usado no detalhe do criativo).
 * Devolve { carregarVideo(file) } para o Estúdio abrir aqui um vídeo já enviado em "Materiais".
 */
export function montarEditorVideo(raiz, { criativo, cliente, obterNarracao = () => null }) {
  const est = {
    arquivo: null, atual: null, url: null, meta: null, historico: [],
    cortes: [], legenda: [], reconhecimento: null, gravandoLegenda: false,
  };

  const trocarAtual = (blob) => {
    if (est.atual) est.historico.push(est.atual);
    est.atual = blob;
    if (est.url) URL.revokeObjectURL(est.url);
    est.url = URL.createObjectURL(blob);
  };

  raiz.innerHTML = `<p class="hint mb-2">Diferente do "Gerar vídeo" acima (que monta cenas a partir de fotos): aqui você edita um vídeo <b>já gravado de verdade</b> — corta trechos, ajusta a proporção, queima texto/legenda nos frames. Tudo roda neste navegador; nenhum vídeo é enviado ao servidor.</p>
    ${!ffmpegSuportado() ? '<p class="text-sm text-rose-600"><i class="fa-solid fa-triangle-exclamation"></i> Este navegador não tem o necessário (WebAssembly/Web Worker) para o editor de vídeo. Use o Chrome ou o Edge atualizado.</p>'
      : `<ol class="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-600"><li><span class="tag tag-info">1</span> Envie o vídeo</li><li><span class="tag tag-info">2</span> Abra uma ferramenta e clique em "Aplicar"</li><li><span class="tag tag-info">3</span> Baixe ou use como peça final</li></ol>
    <div data-vindos-materiais></div>
    ${campoArquivo({ attrs: 'data-video-bruto', accept: 'video/mp4,video/webm,video/quicktime,video/*', icone: 'video', texto: 'Enviar vídeo para editar (MP4, MOV ou WebM)', removivel: false })}
    <div data-corpo-editor class="mt-3"></div>`}`;
  if (!ffmpegSuportado()) return { carregarVideo: () => toast('Este navegador não suporta o editor de vídeo. Use o Chrome ou o Edge atualizado.', 'erro') };

  async function carregarVideo(f) {
    try {
      est.arquivo = f; est.meta = await metadadosVideo(f); est.historico = [];
      trocarAtual(f);
      est.cortes = [{ inicio: 0, fim: Number(est.meta.duracao.toFixed(1)) }];
      desenharCorpo();
      return true;
    } catch (e) { toast(e.message, 'erro'); return false; }
  }
  on(raiz, 'change', '[data-video-bruto]', async (inp) => {
    const f = inp.files[0]; if (!f) return;
    // Se o vídeo não abriu, o botão de upload volta (senão a confirmação "Arquivo escolhido" enganaria).
    if (!(await ocupado(inp, () => carregarVideo(f)))) { inp.value = ''; inp.dispatchEvent(new Event('change', { bubbles: true })); }
  });

  function desenharCorpo() {
    const corpo = $('[data-corpo-editor]', raiz);
    if (!est.atual) { corpo.innerHTML = '<p class="hint">Nenhum vídeo no editor ainda. As ferramentas (cortar, proporção, texto, legenda, trilha) aparecem aqui assim que você enviar um.</p>'; return; }
    corpo.innerHTML = `
      <video data-preview src="${est.url}" controls playsinline class="mx-auto max-h-72 rounded-lg bg-black"></video>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <span class="hint"><b>Editando:</b> ${esc(est.arquivo?.name || 'vídeo')} · ${est.meta.largura}×${est.meta.altura}px · ${fmtT(est.meta.duracao)}</span>
        ${est.historico.length ? '<button class="btn-ghost btn-sm" data-desfazer><i class="fa-solid fa-rotate-left"></i> Desfazer última edição</button>' : ''}
      </div>
      <div data-progresso-editor class="my-2 hidden"><p class="hint" data-progresso-texto></p><div class="h-2 w-full overflow-hidden rounded bg-slate-200"><div data-progresso-barra class="h-2 w-0 bg-indigo-600 transition-all"></div></div></div>

      <details class="mt-3 rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-700"><i class="fa-solid fa-scissors"></i> Cortar trechos</summary>
        <p class="hint mt-1 mb-2">Marque um ou mais trechos (início/fim em segundos) e concatene na ordem. Rápido: não recodifica o vídeo.</p>
        <div data-lista-cortes class="space-y-1"></div>
        <button class="btn-ghost btn-sm mt-1" data-add-corte><i class="fa-solid fa-plus"></i> Adicionar trecho</button>
        <div class="mt-2"><button class="btn-primary btn-sm" data-aplicar-corte>Aplicar corte</button></div></details>

      <details class="mt-3 rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-700"><i class="fa-solid fa-crop"></i> Ajustar proporção</summary>
        <p class="hint mt-1 mb-2">Corta as bordas (mantendo o centro) para caber no formato do criativo.</p>
        <select class="input !w-auto" data-proporcao>${opcoes(PROPORCOES_VIDEO, '9:16')}</select>
        <button class="btn-primary btn-sm ml-2" data-aplicar-proporcao>Aplicar recorte</button></details>

      <details class="mt-3 rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-700"><i class="fa-solid fa-font"></i> Texto sobreposto (hook / CTA)</summary>
        <p class="hint mt-1 mb-2">Queima o texto nos frames do início e/ou do final do vídeo. Pré-preenchido com o hook e o CTA deste criativo.</p>
        <div class="grid gap-2 sm:grid-cols-2">
          <div><label class="label">Texto no início (hook)</label><input class="input" data-texto-inicio value="${esc(criativo?.hook || '')}"></div>
          <div><label class="label">Texto no final (CTA)</label><input class="input" data-texto-fim value="${esc(criativo?.cta || '')}"></div>
          <div><label class="label">Segundos na tela</label><input class="input" type="number" min="1" max="8" step="0.5" data-duracao-texto value="3"></div>
        </div>
        <button class="btn-primary btn-sm mt-2" data-aplicar-texto>Aplicar texto</button></details>

      <details class="mt-3 rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-700"><i class="fa-solid fa-volume-high"></i> Normalizar volume</summary>
        <p class="hint mt-1 mb-2">Ajusta o áudio para um nível padrão de redes sociais (-16 LUFS) — corrige áudio baixo ou irregular.</p>
        <button class="btn-primary btn-sm" data-aplicar-volume>Normalizar volume</button></details>

      <details class="mt-3 rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-700"><i class="fa-solid fa-closed-captioning"></i> Transcrição e legenda</summary>
        ${!reconhecimentoDeVozDisponivel() ? '<p class="hint mt-1">Este navegador não tem reconhecimento de voz automático (Web Speech API) — funciona bem no Chrome. Você ainda pode digitar a legenda manualmente abaixo.</p>'
          : '<p class="hint mt-1">Toque o vídeo com o som audível: o reconhecimento ouve pelo microfone o que sai do alto-falante (é uma limitação do navegador — não há como ler o áudio do arquivo diretamente). Funciona melhor em ambiente silencioso, sem fone conectado. <b>É um rascunho: revise e corrija antes de aplicar.</b></p>'}
        <div class="mt-2 flex flex-wrap gap-2">
          ${reconhecimentoDeVozDisponivel() ? `<button class="btn-ia btn-sm" data-transcrever>${est.gravandoLegenda ? 'Parar' : 'Transcrever automaticamente'}</button>` : ''}
          <button class="btn-ghost btn-sm" data-add-legenda><i class="fa-solid fa-plus"></i> Adicionar linha manual</button>
          ${est.legenda.length ? '<button class="btn-ghost btn-sm" data-baixar-srt><i class="fa-solid fa-download"></i> Baixar .srt</button>' : ''}
        </div>
        <div data-lista-legenda class="mt-2 space-y-1"></div>
        <div class="mt-2"><button class="btn-primary btn-sm" data-aplicar-legenda>Queimar legenda no vídeo</button></div></details>

      <details class="mt-3 rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-700"><i class="fa-solid fa-clapperboard"></i> Montar a partir de vários clipes/imagens</summary>
        <p class="hint mt-1 mb-2">Escolha vários vídeos e/ou fotos: são convertidos para a mesma proporção e concatenados na ordem escolhida. Substitui o vídeo atual do editor.</p>
        ${campoArquivo({ attrs: 'data-clipes', accept: 'video/*,image/*', multiple: true, icone: 'photo-film', texto: 'Escolher clipes e fotos (vários de uma vez)', destaque: false })}
        <div class="mt-2 grid gap-2 sm:grid-cols-2">
          <div><label class="label">Proporção</label><select class="input" data-proporcao-montagem>${opcoes(PROPORCOES_VIDEO, '9:16')}</select></div>
          <div><label class="label">Transição</label><select class="input" data-transicao>${opcoes(TRANSICOES, 'corte')}</select></div>
        </div>
        <button class="btn-primary btn-sm mt-2" data-aplicar-montagem>Montar vídeo com estes arquivos</button></details>

      <details class="mt-3 rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-700"><i class="fa-solid fa-music"></i> Adicionar trilha de áudio</summary>
        <p class="hint mt-1 mb-2"><i class="fa-solid fa-triangle-exclamation text-amber-600"></i> Use só música com direito de uso garantido (própria, com licença, ou de banco de músicas livres) — o app não verifica direitos autorais.</p>
        ${campoArquivo({ attrs: 'data-trilha', accept: 'audio/*', icone: 'music', texto: 'Enviar música (MP3/WAV)', destaque: false })}
        <label class="mt-2 block text-sm">Volume da trilha <input type="range" min="0" max="1" step="0.05" value="0.3" data-volume-trilha class="align-middle"></label>
        <button class="btn-primary btn-sm mt-2" data-aplicar-trilha>Misturar trilha</button></details>

      <details class="mt-3 rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-700"><i class="fa-solid fa-microphone-lines"></i> Adicionar narração</summary>
        <p class="hint mt-1 mb-2">Coloca a narração da seção "Narração" do Estúdio neste vídeo, a partir do segundo 0. O áudio que o vídeo já tem (ex.: a música) fica por baixo, no volume escolhido. O vídeo não é encurtado.</p>
        <p class="text-sm" data-editor-narracao></p>
        <div class="mt-2 grid gap-2 sm:grid-cols-2">
          <label class="text-sm">Volume da narração <input type="range" min="0" max="1.5" step="0.05" value="1" data-ed-vol-narracao class="w-full"></label>
          <label class="text-sm">Volume do áudio atual do vídeo <input type="range" min="0" max="1" step="0.05" value="0.3" data-ed-vol-original class="w-full"></label></div>
        <button class="btn-primary btn-sm mt-2" data-aplicar-narracao>Adicionar narração ao vídeo</button></details>

      <div class="mt-4 border-t border-slate-200 pt-3"><p class="mb-2 text-sm font-semibold"><span class="tag tag-info">3</span> Terminou de editar? Exporte:</p><div class="flex flex-wrap gap-2">
        <button class="btn-primary" data-baixar-editado><i class="fa-solid fa-download"></i> Baixar vídeo editado</button>
        <button class="btn-primary" data-usar-como-peca><i class="fa-solid fa-check"></i> Usar como peça final deste criativo</button>
      </div></div>`;
    desenharCortes(); desenharLegenda();
  }

  function desenharCortes() {
    $('[data-lista-cortes]', raiz).innerHTML = est.cortes.map((c, i) => `<div class="flex items-center gap-2 text-sm">
      <input class="input !w-24" type="number" min="0" step="0.1" data-corte-inicio="${i}" value="${c.inicio}"> até
      <input class="input !w-24" type="number" min="0" step="0.1" data-corte-fim="${i}" value="${c.fim}">
      <button class="btn-ghost btn-sm" data-rm-corte="${i}">×</button></div>`).join('');
  }
  function desenharLegenda() {
    $('[data-lista-legenda]', raiz).innerHTML = est.legenda.map((s, i) => `<div class="flex items-center gap-2 text-sm">
      <input class="input !w-20" type="number" min="0" step="0.1" data-leg-inicio="${i}" value="${s.inicio.toFixed(1)}">
      <input class="input !w-20" type="number" min="0" step="0.1" data-leg-fim="${i}" value="${s.fim.toFixed(1)}">
      <input class="input" data-leg-texto="${i}" value="${esc(s.texto)}" placeholder="Texto da legenda">
      <button class="btn-ghost btn-sm" data-rm-legenda="${i}">×</button></div>`).join('') || '<p class="hint">Nenhuma linha de legenda ainda.</p>';
  }

  const progresso = (fracao) => {
    const el = $('[data-progresso-editor]', raiz); if (!el) return;
    el.classList.remove('hidden');
    $('[data-progresso-texto]', raiz).textContent = AVISO_LENTIDAO;
    $('[data-progresso-barra]', raiz).style.width = `${Math.round((fracao ?? 0) * 100)}%`;
  };
  const esconderProgresso = () => $('[data-progresso-editor]', raiz)?.classList.add('hidden');

  /** Roda uma operação do editor: mostra progresso, troca o vídeo atual pelo resultado e redesenha. */
  async function aplicar(botao, fn) {
    await ocupado(botao, async () => {
      progresso(0);
      try {
        const resultado = await fn((p) => progresso(p));
        trocarAtual(resultado);
        toast('Edição aplicada. Confira a prévia.');
        desenharCorpo();
      } finally { esconderProgresso(); }
    });
  }

  on(raiz, 'click', '[data-add-corte]', () => { est.cortes.push({ inicio: 0, fim: Number((est.meta.duracao || 1).toFixed(1)) }); desenharCortes(); });
  on(raiz, 'click', '[data-rm-corte]', (b) => { est.cortes.splice(Number(b.dataset.rmCorte), 1); desenharCortes(); });
  on(raiz, 'input', '[data-corte-inicio]', (i) => { est.cortes[Number(i.dataset.corteInicio)].inicio = Number(i.value) || 0; });
  on(raiz, 'input', '[data-corte-fim]', (i) => { est.cortes[Number(i.dataset.corteFim)].fim = Number(i.value) || 0; });
  on(raiz, 'click', '[data-aplicar-corte]', (b) => aplicar(b, async (aoProgresso) => {
    const cortes = validarCortes(est.cortes, est.meta.duracao);
    const r = await cortarEConcatenar({ arquivo: est.atual, cortes, aoProgresso });
    est.meta = await metadadosVideo(r);
    return r;
  }));

  on(raiz, 'click', '[data-aplicar-proporcao]', (b) => aplicar(b, async (aoProgresso) => {
    const r = await ajustarProporcao({ arquivo: est.atual, largura: est.meta.largura, altura: est.meta.altura, proporcao: $('[data-proporcao]', raiz).value, aoProgresso });
    est.meta = await metadadosVideo(r);
    return r;
  }));

  on(raiz, 'click', '[data-aplicar-texto]', (b) => aplicar(b, (aoProgresso) => sobreporTexto({
    arquivo: est.atual, duracaoVideo: est.meta.duracao, textoInicio: $('[data-texto-inicio]', raiz).value,
    textoFim: $('[data-texto-fim]', raiz).value, duracaoTextos: Number($('[data-duracao-texto]', raiz).value) || 3, aoProgresso,
  })));

  on(raiz, 'click', '[data-aplicar-volume]', (b) => aplicar(b, (aoProgresso) => normalizarAudio({ arquivo: est.atual, aoProgresso })));

  // ---- transcrição ----
  on(raiz, 'click', '[data-transcrever]', (b) => {
    if (est.reconhecimento) { est.reconhecimento.parar(); est.reconhecimento = null; est.gravandoLegenda = false; b.textContent = 'Transcrever automaticamente'; return; }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const video = $('[data-preview]', raiz);
    const rec = new Ctor();
    rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = false;
    let inicioAtual = video.currentTime || 0;
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) {
          const texto = r[0].transcript.trim();
          if (texto) est.legenda.push({ inicio: inicioAtual, fim: video.currentTime || inicioAtual + 1, texto });
          inicioAtual = video.currentTime || inicioAtual;
          desenharLegenda();
        }
      }
    };
    rec.onerror = (ev) => { if (ev.error !== 'no-speech') toast('Reconhecimento de voz: ' + ev.error, 'erro'); };
    rec.onend = () => { if (est.gravandoLegenda) { try { rec.start(); } catch { /* já reiniciando */ } } };
    rec.start(); video.currentTime = 0; video.play();
    est.reconhecimento = { parar: () => { est.gravandoLegenda = false; try { rec.stop(); } catch { /* já parado */ } video.pause(); } };
    est.gravandoLegenda = true;
    b.textContent = 'Parar';
    toast('Transcrevendo enquanto o vídeo toca — revise o resultado antes de queimar a legenda.');
  });
  on(raiz, 'click', '[data-add-legenda]', () => { est.legenda.push({ inicio: 0, fim: 2, texto: '' }); desenharLegenda(); });
  on(raiz, 'click', '[data-rm-legenda]', (b) => { est.legenda.splice(Number(b.dataset.rmLegenda), 1); desenharLegenda(); });
  on(raiz, 'input', '[data-leg-inicio]', (i) => { est.legenda[Number(i.dataset.legInicio)].inicio = Number(i.value) || 0; });
  on(raiz, 'input', '[data-leg-fim]', (i) => { est.legenda[Number(i.dataset.legFim)].fim = Number(i.value) || 0; });
  on(raiz, 'input', '[data-leg-texto]', (i) => { est.legenda[Number(i.dataset.legTexto)].texto = i.value; });
  on(raiz, 'click', '[data-baixar-srt]', () => {
    const blob = new Blob([gerarSrt(validarSegmentosLegenda(est.legenda, est.meta.duracao))], { type: 'text/srt;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'legenda.srt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  on(raiz, 'click', '[data-aplicar-legenda]', (b) => aplicar(b, (aoProgresso) => queimarLegenda({
    arquivo: est.atual, segmentos: validarSegmentosLegenda(est.legenda, est.meta.duracao), aoProgresso,
  })));

  // ---- montagem de clipes ----
  let clipesEscolhidos = [];
  on(raiz, 'change', '[data-clipes]', (inp) => { clipesEscolhidos = [...inp.files].map((arquivo) => ({ arquivo, tipo: arquivo.type.startsWith('image/') ? 'imagem' : 'video' })); });
  on(raiz, 'click', '[data-aplicar-montagem]', (b) => aplicar(b, async (aoProgresso) => {
    if (!clipesEscolhidos.length) throw new Error('Escolha pelo menos um vídeo ou uma imagem.');
    const r = await montarClipes({ itens: clipesEscolhidos, proporcao: $('[data-proporcao-montagem]', raiz).value, transicao: $('[data-transicao]', raiz).value, aoProgresso });
    est.meta = await metadadosVideo(r);
    return r;
  }));

  // ---- trilha de áudio ----
  let trilhaEscolhida = null;
  on(raiz, 'change', '[data-trilha]', (inp) => { trilhaEscolhida = inp.files[0] || null; });
  on(raiz, 'click', '[data-aplicar-trilha]', (b) => aplicar(b, (aoProgresso) => {
    if (!trilhaEscolhida) throw new Error('Escolha um arquivo de áudio primeiro.');
    return misturarAudio({ arquivo: est.atual, trilha: trilhaEscolhida, volumeTrilha: Number($('[data-volume-trilha]', raiz).value) || 0.3, aoProgresso });
  }));

  // ---- narração (vem da seção "Narração" do Estúdio) ----
  on(raiz, 'click', 'summary', () => {
    const el = $('[data-editor-narracao]', raiz); if (!el) return;
    const n = obterNarracao();
    el.innerHTML = n ? `<i class="fa-solid fa-circle-check text-emerald-600"></i> Narração pronta: ${esc(n.arquivo.name)} (${n.duracao.toFixed(1)} s).`
      : '<span class="text-amber-700">Nenhuma narração ainda: grave ou envie o áudio na seção "Narração" do Estúdio (logo acima do editor).</span>';
  });
  on(raiz, 'click', '[data-aplicar-narracao]', (b) => aplicar(b, (aoProgresso) => {
    const n = obterNarracao();
    if (!n) throw new Error('Nenhuma narração: grave ou envie o áudio na seção "Narração" do Estúdio primeiro.');
    return misturarNarracao({ arquivo: est.atual, narracao: n.arquivo, volumeNarracao: Number($('[data-ed-vol-narracao]', raiz).value), volumeOriginal: Number($('[data-ed-vol-original]', raiz).value), aoProgresso });
  }));

  // ---- desfazer / exportar ----
  on(raiz, 'click', '[data-desfazer]', () => {
    if (!est.historico.length) return;
    const anterior = est.historico.pop();
    if (est.url) URL.revokeObjectURL(est.url);
    est.atual = anterior; est.url = URL.createObjectURL(anterior);
    metadadosVideo(anterior).then((m) => { est.meta = m; desenharCorpo(); });
  });
  on(raiz, 'click', '[data-baixar-editado]', () => {
    const a = document.createElement('a'); a.href = est.url; a.download = `${(criativo?.nome || 'video').replace(/[^\w.-]/g, '_')}-editado.mp4`; a.click();
  });
  on(raiz, 'click', '[data-usar-como-peca]', async (b) => {
    if (!criativo || !cliente) return toast('Abra o editor a partir de um criativo para usar esta opção.', 'erro');
    if (!(await confirmar('Usar este vídeo editado como a peça final deste criativo? Substitui o arquivo atual, se houver.', 'Usar'))) return;
    await ocupado(b, async () => {
      const nomeArquivo = `${(criativo.nome || 'video').replace(/[^\w.-]/g, '_')}-editado.mp4`;
      const caminho = `gcc/${cliente.id}/criativos/${criativo.id}/${Date.now()}_${nomeArquivo}`;
      const arquivo = new File([est.atual], nomeArquivo, { type: 'video/mp4' });
      const r = await enviarArquivoOuAvisar(caminho, arquivo);
      if (criativo.arquivoPath) await removerArquivo(criativo.arquivoPath);
      const patch = { arquivoUrl: r.url, arquivoPath: r.path, arquivoNome: nomeArquivo };
      await db.atualizar(COL.criativos, criativo.id, patch);
      Object.assign(criativo, patch);
      toast('Vídeo editado salvo como a peça final do criativo.');
      previaEmSegundoPlano(cliente, criativo, arquivo); // versão 480p para o link de aprovação, nos bastidores
    });
  });

  /** Botões "Editar <vídeo>" para os vídeos já enviados em Materiais (o Estúdio chama ao mudar a lista). */
  function mostrarVindosMateriais(videos) {
    const el = $('[data-vindos-materiais]', raiz); if (!el) return;
    el.innerHTML = videos.length ? `<div class="mb-2 flex flex-wrap items-center gap-2 text-sm"><span class="text-slate-600">Usar um vídeo que você já enviou em Materiais:</span>
      ${videos.map((v, i) => `<button class="btn-ghost btn-sm" data-editar-material="${i}"><i class="fa-solid fa-film"></i> ${esc(v.name).slice(0, 28)}</button>`).join('')}<span class="text-slate-500">ou</span></div>` : '';
    el._videos = videos;
  }
  on(raiz, 'click', '[data-editar-material]', (b) => ocupado(b, async () => {
    const inp = $('[data-video-bruto]', raiz); // esvazia o botão de upload para ele não mostrar outro arquivo
    if (inp.value) { inp.value = ''; inp.dispatchEvent(new Event('change', { bubbles: true })); }
    await carregarVideo($('[data-vindos-materiais]', raiz)._videos[Number(b.dataset.editarMaterial)]);
  }));

  desenharCorpo();
  return { carregarVideo, mostrarVindosMateriais };
}
