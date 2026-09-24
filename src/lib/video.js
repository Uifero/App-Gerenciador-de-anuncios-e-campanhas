// Edição de vídeo 100% no navegador via ffmpeg.wasm (WebAssembly) — nenhum arquivo de vídeo bruto passa pelo
// servidor, seguindo o mesmo princípio já usado no Estúdio (Canvas/MediaRecorder). O núcleo do ffmpeg.wasm
// (~32 MB) é servido de public/ffmpeg (copiado do pacote @ffmpeg/core por "npm install", ver
// scripts/copiar-ffmpeg-core.mjs) e só é baixado quando o usuário abre a edição de vídeo pela primeira vez —
// nunca no carregamento inicial do app.
//
// Este arquivo separa DUAS coisas: funções puras que montam os argumentos do ffmpeg (testáveis sem navegador
// real, sem WebAssembly) e as funções que de fato carregam o ffmpeg.wasm e rodam o comando. Isso permite testar
// a lógica (matemática de corte de proporção, escape de texto, geração de .srt) na suíte normal.

let _FFmpegCtor = null, _fetchFile = null, _toBlobURL = null;
let _ffmpeg = null, _carregando = null;

/** Import dinâmico do pacote (só baixa o JS de ~114 KB do @ffmpeg/ffmpeg; o núcleo de 32 MB só entra em carregarFFmpeg()). */
async function importarPacote() {
  if (!_FFmpegCtor) {
    const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
    _FFmpegCtor = FFmpeg; _fetchFile = fetchFile; _toBlobURL = toBlobURL;
  }
  return { FFmpeg: _FFmpegCtor, fetchFile: _fetchFile, toBlobURL: _toBlobURL };
}

/** O navegador tem o básico para rodar ffmpeg.wasm (WebAssembly + Web Worker)? Checagem antes de oferecer a função. */
export function ffmpegSuportado() {
  return typeof WebAssembly !== 'undefined' && typeof Worker !== 'undefined';
}

/**
 * Carrega o ffmpeg.wasm (uma vez só; chamadas seguintes reaproveitam a mesma instância). `aoLog` (opcional)
 * recebe as linhas de log do ffmpeg (útil para depurar um erro de codec/formato na tela).
 */
export async function carregarFFmpeg(aoLog) {
  if (_ffmpeg) return _ffmpeg;
  if (!_carregando) {
    _carregando = (async () => {
      const { FFmpeg, toBlobURL } = await importarPacote();
      const ffmpeg = new FFmpeg();
      if (aoLog) ffmpeg.on('log', ({ message }) => aoLog(message));
      const base = `${location.origin}/ffmpeg`;
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      ]);
      await ffmpeg.load({ coreURL, wasmURL });
      _ffmpeg = ffmpeg;
    })().catch((e) => { _carregando = null; throw new Error('Não consegui carregar o editor de vídeo (ffmpeg.wasm). Verifique sua conexão e tente de novo. Detalhe: ' + (e?.message || e)); });
  }
  await _carregando;
  return _ffmpeg;
}

const extensaoDe = (nome) => (String(nome || '').split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
async function limpar(ffmpeg, nomes) { for (const n of nomes) { try { await ffmpeg.deleteFile(n); } catch { /* já não existe */ } } }

/**
 * Lê um valor de ffprobe (roda no mesmo Worker do ffmpeg) e devolve como texto. Uso interno de metadadosVideo.
 * Importante: `ffmpeg.ffprobe()` do @ffmpeg/ffmpeg não devolve 0 como código de sucesso (na prática devolve -1
 * mesmo quando o arquivo de saída foi escrito corretamente) — por isso o sucesso é decidido pelo conteúdo do
 * arquivo de saída (não vazio), não pelo código de retorno.
 */
async function ffprobeTexto(ffmpeg, nomeEntrada, args) {
  const nomeSaida = 'sonda_' + Math.random().toString(36).slice(2) + '.txt';
  await ffmpeg.ffprobe(['-v', 'error', ...args, nomeEntrada, '-o', nomeSaida]);
  const dados = await ffmpeg.readFile(nomeSaida);
  await limpar(ffmpeg, [nomeSaida]);
  const texto = (typeof dados === 'string' ? dados : new TextDecoder().decode(dados)).trim();
  if (!texto) throw new Error('ffprobe não retornou dados');
  return texto;
}

/**
 * Duração (s) e dimensões (px) do vídeo, lidas pelo ffprobe do próprio ffmpeg.wasm (roda num Web Worker). Não usa
 * o elemento <video> do navegador de propósito: a leitura de metadados por <video> fica sujeita ao navegador
 * pausar/atrasar a decodificação quando a aba está em segundo plano (a Page Visibility API marca a aba como
 * oculta) — o ffprobe roda no worker e não depende da aba estar visível.
 */
export async function metadadosVideo(arquivo) {
  const ffmpeg = await carregarFFmpeg();
  const { fetchFile } = await importarPacote();
  const nomeEntrada = 'sonda_entrada.' + extensaoDe(arquivo.name);
  try {
    await ffmpeg.writeFile(nomeEntrada, await fetchFile(arquivo));
    const duracaoTxt = await ffprobeTexto(ffmpeg, nomeEntrada, ['-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1']);
    const dimTxt = await ffprobeTexto(ffmpeg, nomeEntrada, ['-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0']);
    const [largura, altura] = dimTxt.split('x').map(Number);
    const duracao = Number(duracaoTxt);
    if (!duracao || !largura || !altura) throw new Error('metadados incompletos');
    return { duracao, largura, altura };
  } catch {
    throw new Error('Não consegui ler este vídeo. Formatos aceitos: MP4, WebM, MOV.');
  } finally {
    await limpar(ffmpeg, [nomeEntrada]);
  }
}

/** Executa um comando do ffmpeg sobre UM arquivo de entrada e devolve o resultado como Blob. Uso interno. */
async function rodarUmArquivo({ arquivo, montarArgs, saida = 'saida.mp4', tipo = 'video/mp4', aoProgresso }) {
  const ffmpeg = await carregarFFmpeg();
  const nomeEntrada = 'entrada.' + extensaoDe(arquivo.name);
  const { fetchFile } = await importarPacote();
  const onProg = aoProgresso ? ({ progress }) => aoProgresso(Math.min(1, Math.max(0, progress))) : null;
  if (onProg) ffmpeg.on('progress', onProg);
  try {
    await ffmpeg.writeFile(nomeEntrada, await fetchFile(arquivo));
    const args = montarArgs(nomeEntrada, saida);
    const codigo = await ffmpeg.exec(args);
    if (codigo !== 0) throw new Error(`O ffmpeg devolveu um erro (código ${codigo}). O formato do vídeo pode não ser suportado.`);
    const dados = await ffmpeg.readFile(saida);
    return new Blob([dados.buffer], { type: tipo });
  } finally {
    if (onProg) ffmpeg.off('progress', onProg);
    await limpar(ffmpeg, [nomeEntrada, saida]);
  }
}

// ---------------- 3a. Cortar trechos e concatenar ----------------

/** Valida e ordena uma lista de cortes { inicio, fim } (segundos) contra a duração do vídeo. */
export function validarCortes(cortes, duracao) {
  const validos = (cortes || [])
    .map((c) => ({ inicio: Math.max(0, Number(c.inicio) || 0), fim: Math.min(duracao, Number(c.fim) || 0) }))
    .filter((c) => c.fim > c.inicio + 0.1)
    .sort((a, b) => a.inicio - b.inicio);
  if (!validos.length) throw new Error('Marque pelo menos um trecho com início antes do fim.');
  return validos;
}

/**
 * Corta um ou mais trechos do vídeo e concatena na ordem informada. Usa "-c copy" (sem recodificar: rápido),
 * então o corte pode ficar até ~1 s impreciso em relação ao quadro-chave mais próximo — aceitável para redes
 * sociais; quem precisar de corte exato deve reencodar (as outras ferramentas abaixo já reencodam).
 */
export async function cortarEConcatenar({ arquivo, cortes, aoProgresso }) {
  const ffmpeg = await carregarFFmpeg();
  const { fetchFile } = await importarPacote();
  const nomeEntrada = 'entrada.' + extensaoDe(arquivo.name);
  const partes = cortes.map((_, i) => `corte${i}.mp4`);
  const onProg = aoProgresso ? ({ progress }) => aoProgresso(Math.min(1, Math.max(0, progress)) / (cortes.length + 1)) : null;
  if (onProg) ffmpeg.on('progress', onProg);
  try {
    await ffmpeg.writeFile(nomeEntrada, await fetchFile(arquivo));
    for (let i = 0; i < cortes.length; i++) {
      const { inicio, fim } = cortes[i];
      const cod = await ffmpeg.exec(['-ss', String(inicio), '-to', String(fim), '-i', nomeEntrada, '-c', 'copy', '-avoid_negative_ts', 'make_zero', partes[i]]);
      if (cod !== 0) throw new Error(`Não consegui cortar o trecho ${i + 1}.`);
    }
    if (partes.length === 1) {
      const dados = await ffmpeg.readFile(partes[0]);
      return new Blob([dados.buffer], { type: 'video/mp4' });
    }
    const lista = partes.map((p) => `file '${p}'`).join('\n');
    await ffmpeg.writeFile('lista.txt', lista);
    const cod = await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'lista.txt', '-c', 'copy', 'concat.mp4']);
    if (cod !== 0) throw new Error('Não consegui juntar os trechos cortados.');
    const dados = await ffmpeg.readFile('concat.mp4');
    return new Blob([dados.buffer], { type: 'video/mp4' });
  } finally {
    if (onProg) ffmpeg.off('progress', onProg);
    await limpar(ffmpeg, [nomeEntrada, ...partes, 'lista.txt', 'concat.mp4']);
  }
}

// ---------------- 3b. Ajustar proporção (crop) ----------------

export const PROPORCOES_VIDEO = [['9:16', 'Vertical (Reels/Stories) 9:16'], ['1:1', 'Quadrado 1:1'], ['16:9', 'Horizontal 16:9']];

/** Calcula o corte central (w, h, x, y, sempre pares) para encaixar largura×altura na proporção pedida. */
export function calcularCrop(largura, altura, proporcao) {
  const [pw, ph] = String(proporcao).split(':').map(Number);
  if (!pw || !ph || !largura || !altura) throw new Error('Proporção ou dimensões inválidas.');
  const alvo = pw / ph, atual = largura / altura;
  let w, h;
  if (atual > alvo) { h = altura; w = Math.round(h * alvo); } else { w = largura; h = Math.round(w / alvo); }
  w -= w % 2; h -= h % 2;
  return { w, h, x: Math.round((largura - w) / 2), y: Math.round((altura - h) / 2) };
}

/** Corta (crop central) o vídeo para a proporção pedida, mantendo a maior área possível do quadro original. */
export async function ajustarProporcao({ arquivo, largura, altura, proporcao, aoProgresso }) {
  const { w, h, x, y } = calcularCrop(largura, altura, proporcao);
  return rodarUmArquivo({
    arquivo, aoProgresso,
    montarArgs: (entrada, saida) => ['-i', entrada, '-vf', `crop=${w}:${h}:${x}:${y}`, '-c:a', 'copy', saida],
  });
}

// ---------------- 3c. Texto sobreposto (hook / CTA) ----------------

/** Escapa um texto simples para virar um "arquivo de legenda" seguro (textfile=) — evita ter que escapar
 * dois-pontos/aspas dentro do filtro do ffmpeg, que é frágil para texto livre digitado pelo usuário. */
const limparTexto = (t) => String(t || '').replace(/\r/g, '').slice(0, 200);

function filtroDrawtext(arquivoTexto, janela) {
  return `drawtext=fontfile=fonte.ttf:textfile=${arquivoTexto}:fontsize=54:fontcolor=white:borderw=4:bordercolor=black@0.8:` +
    `x=(w-text_w)/2:y=h-th-60:line_spacing=6${janela ? `:enable='between(t,${janela[0]},${janela[1]})'` : ''}`;
}

/**
 * Baixa a fonte usada para queimar texto/legenda no vídeo (OFL, ~850 KB) uma vez, reaproveitada entre operações.
 * Importante: `ffmpeg.writeFile()` transfere (transferable) o ArrayBuffer para o Worker, o que o deixa "detached"
 * (inutilizável) depois do primeiro uso — por isso aqui devolvemos sempre uma CÓPIA do buffer em cache (.slice()),
 * nunca a mesma instância, senão a segunda vez que qualquer função grava "fonte.ttf" (texto sobreposto ou
 * legenda, na mesma sessão) falha com "ArrayBuffer is detached and could not be cloned".
 */
let _fonte = null;
async function bytesDaFonte() {
  if (!_fonte) {
    const r = await fetch('/fonts/legenda.ttf');
    if (!r.ok) throw new Error('Não consegui carregar a fonte usada para queimar texto no vídeo.');
    _fonte = new Uint8Array(await r.arrayBuffer());
  }
  return _fonte.slice();
}

/**
 * Queima o hook no início e o CTA no final do vídeo (texto sobreposto, tipo legenda). `duracaoTextos` = por
 * quantos segundos cada texto fica na tela (padrão 3s). Deixe `textoInicio`/`textoFim` vazio para pular um dos dois.
 */
export async function sobreporTexto({ arquivo, duracaoVideo, textoInicio, textoFim, duracaoTextos = 3, aoProgresso }) {
  const ffmpeg = await carregarFFmpeg();
  const { fetchFile } = await importarPacote();
  const nomeEntrada = 'entrada.' + extensaoDe(arquivo.name);
  const arquivos = [nomeEntrada];
  const filtros = [];
  const onProg = aoProgresso ? ({ progress }) => aoProgresso(Math.min(1, Math.max(0, progress))) : null;
  if (onProg) ffmpeg.on('progress', onProg);
  try {
    await ffmpeg.writeFile(nomeEntrada, await fetchFile(arquivo));
    await ffmpeg.writeFile('fonte.ttf', await bytesDaFonte());
    arquivos.push('fonte.ttf');
    if (limparTexto(textoInicio)) {
      await ffmpeg.writeFile('hook.txt', limparTexto(textoInicio)); arquivos.push('hook.txt');
      filtros.push(filtroDrawtext('hook.txt', [0, Math.min(duracaoTextos, duracaoVideo)]));
    }
    if (limparTexto(textoFim)) {
      await ffmpeg.writeFile('cta.txt', limparTexto(textoFim)); arquivos.push('cta.txt');
      const ini = Math.max(0, duracaoVideo - duracaoTextos);
      filtros.push(filtroDrawtext('cta.txt', [ini, duracaoVideo]));
    }
    if (!filtros.length) throw new Error('Escreva o texto do hook e/ou do CTA antes de aplicar.');
    const cod = await ffmpeg.exec(['-i', nomeEntrada, '-vf', filtros.join(','), '-c:a', 'copy', 'saida.mp4']);
    if (cod !== 0) throw new Error('Não consegui aplicar o texto sobre o vídeo.');
    const dados = await ffmpeg.readFile('saida.mp4');
    return new Blob([dados.buffer], { type: 'video/mp4' });
  } finally {
    if (onProg) ffmpeg.off('progress', onProg);
    await limpar(ffmpeg, [...arquivos, 'saida.mp4']);
  }
}

// ---------------- 3d. Normalizar volume ----------------

/** Normaliza o volume do áudio (loudnorm, padrão de streaming: -16 LUFS) — corrige áudio baixo ou irregular. */
export async function normalizarAudio({ arquivo, aoProgresso }) {
  return rodarUmArquivo({
    arquivo, aoProgresso,
    montarArgs: (entrada, saida) => ['-i', entrada, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:v', 'copy', saida],
  });
}

// ---------------- 4. Transcrição / legenda ----------------

/** A Web Speech API (reconhecimento de voz nativo) só existe em alguns navegadores — Chrome suporta bem. */
export function reconhecimentoDeVozDisponivel() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** "HH:MM:SS,mmm" — formato de timestamp do .srt. */
function tempoSrt(s) {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const mil = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${sec},${mil}`;
}

/** Valida e ordena segmentos de legenda { inicio, fim, texto } (segundos) — usado tanto para gerar .srt quanto para queimar. */
export function validarSegmentosLegenda(segmentos, duracao) {
  return (segmentos || [])
    .map((s) => ({ inicio: Math.max(0, Number(s.inicio) || 0), fim: Math.min(duracao ?? Infinity, Number(s.fim) || 0), texto: limparTexto(s.texto) }))
    .filter((s) => s.texto && s.fim > s.inicio)
    .sort((a, b) => a.inicio - b.inicio);
}

/** Gera o conteúdo de um arquivo .srt a partir dos segmentos (para baixar/conferir; não é usado para queimar — ver queimarLegenda). */
export function gerarSrt(segmentos) {
  return segmentos.map((s, i) => `${i + 1}\n${tempoSrt(s.inicio)} --> ${tempoSrt(s.fim)}\n${s.texto}\n`).join('\n');
}

/** Queima a legenda nos frames do vídeo, um drawtext por segmento (evita depender de libass/subtitles no core do ffmpeg.wasm). */
export async function queimarLegenda({ arquivo, segmentos, aoProgresso }) {
  if (!segmentos?.length) throw new Error('Não há legenda para queimar. Edite a transcrição ou digite manualmente antes.');
  const ffmpeg = await carregarFFmpeg();
  const { fetchFile } = await importarPacote();
  const nomeEntrada = 'entrada.' + extensaoDe(arquivo.name);
  const arquivos = [nomeEntrada, 'fonte.ttf'];
  const onProg = aoProgresso ? ({ progress }) => aoProgresso(Math.min(1, Math.max(0, progress))) : null;
  if (onProg) ffmpeg.on('progress', onProg);
  try {
    await ffmpeg.writeFile(nomeEntrada, await fetchFile(arquivo));
    await ffmpeg.writeFile('fonte.ttf', await bytesDaFonte());
    const filtros = [];
    for (let i = 0; i < segmentos.length; i++) {
      const nome = `leg${i}.txt`;
      await ffmpeg.writeFile(nome, segmentos[i].texto); arquivos.push(nome);
      filtros.push(filtroDrawtext(nome, [segmentos[i].inicio, segmentos[i].fim]).replace('y=h-th-60', 'y=h-th-40').replace('fontsize=54', 'fontsize=42'));
    }
    const cod = await ffmpeg.exec(['-i', nomeEntrada, '-vf', filtros.join(','), '-c:a', 'copy', 'saida.mp4']);
    if (cod !== 0) throw new Error('Não consegui queimar a legenda no vídeo.');
    const dados = await ffmpeg.readFile('saida.mp4');
    return new Blob([dados.buffer], { type: 'video/mp4' });
  } finally {
    if (onProg) ffmpeg.off('progress', onProg);
    await limpar(ffmpeg, [...arquivos, 'saida.mp4']);
  }
}

// ---------------- 5. Montagem de múltiplos clipes/imagens + trilha ----------------

export const TRANSICOES = [['corte', 'Corte seco'], ['fade', 'Fade (esmaecer)']];
const DURACAO_IMAGEM_PADRAO = 3; // segundos que cada imagem fica na tela quando entra na montagem

/**
 * Monta uma sequência de vídeos/imagens num único vídeo (todos convertidos para o mesmo formato/proporção
 * antes de concatenar). `itens` = [{ arquivo, tipo: 'video'|'imagem', duracao? }] na ordem desejada.
 */
export async function montarClipes({ itens, proporcao, transicao = 'corte', aoProgresso }) {
  if (!itens?.length) throw new Error('Selecione pelo menos um vídeo ou imagem para montar.');
  const ffmpeg = await carregarFFmpeg();
  const { fetchFile } = await importarPacote();
  const arquivos = [];
  const partes = [];
  const total = itens.length + 1;
  try {
    for (let i = 0; i < itens.length; i++) {
      if (aoProgresso) aoProgresso((i / total) * 0.8);
      const item = itens[i];
      const entrada = `item${i}.` + extensaoDe(item.arquivo.name);
      await ffmpeg.writeFile(entrada, await fetchFile(item.arquivo));
      arquivos.push(entrada);
      const saida = `norm${i}.mp4`;
      const { largura, altura } = item.tipo === 'imagem' ? { largura: 0, altura: 0 } : await metadadosVideo(item.arquivo);
      const args = item.tipo === 'imagem'
        ? ['-loop', '1', '-t', String(item.duracao || DURACAO_IMAGEM_PADRAO), '-i', entrada, '-vf', proporcaoParaImagem(proporcao), '-r', '30', '-pix_fmt', 'yuv420p', saida]
        : (() => { const { w, h, x, y } = calcularCrop(largura, altura, proporcao); return ['-i', entrada, '-vf', `crop=${w}:${h}:${x}:${y}`, '-r', '30', '-an', saida]; })();
      const cod = await ffmpeg.exec(args);
      if (cod !== 0) throw new Error(`Não consegui preparar o item ${i + 1} da montagem.`);
      partes.push(saida); arquivos.push(saida);
    }
    if (aoProgresso) aoProgresso(0.85);
    let cod;
    if (transicao === 'fade' && partes.length > 1) {
      // xfade entre pares consecutivos, 0.5s cada, encadeados — só vídeo (sem áudio; a trilha entra depois se pedida).
      const dur = 0.5;
      const entradas = partes.flatMap((p) => ['-i', p]);
      let filtro = '', anterior = '[0:v]', offset = 0;
      for (let i = 1; i < partes.length; i++) {
        const dEntrada = itens[i - 1].tipo === 'imagem' ? (itens[i - 1].duracao || DURACAO_IMAGEM_PADRAO) : (await metadadosVideo(itens[i - 1].arquivo)).duracao;
        offset += dEntrada - dur;
        const alvo = i === partes.length - 1 ? '[vout]' : `[v${i}]`;
        filtro += `${anterior}[${i}:v]xfade=transition=fade:duration=${dur}:offset=${Math.max(0, offset).toFixed(2)}${alvo};`;
        anterior = alvo;
      }
      cod = await ffmpeg.exec([...entradas, '-filter_complex', filtro.slice(0, -1), '-map', '[vout]', 'montagem.mp4']);
    } else {
      const lista = partes.map((p) => `file '${p}'`).join('\n');
      await ffmpeg.writeFile('lista.txt', lista); arquivos.push('lista.txt');
      cod = await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'lista.txt', '-c', 'copy', 'montagem.mp4']);
    }
    if (cod !== 0) throw new Error('Não consegui juntar os clipes da montagem.');
    if (aoProgresso) aoProgresso(1);
    const dados = await ffmpeg.readFile('montagem.mp4');
    return new Blob([dados.buffer], { type: 'video/mp4' });
  } finally {
    await limpar(ffmpeg, [...arquivos, ...partes, 'lista.txt', 'montagem.mp4']);
  }
}

function proporcaoParaImagem(proporcao) {
  const [pw, ph] = String(proporcao).split(':').map(Number);
  // Preenche o quadro-alvo cortando o excesso (cover), sempre com dimensões pares.
  const altura = 1280, largura = Math.round((altura * pw) / ph / 2) * 2;
  return `scale=${largura}:${altura}:force_original_aspect_ratio=increase,crop=${largura}:${altura}`;
}

/** O vídeo (já gravado no FS virtual do ffmpeg) tem alguma faixa de áudio? Uma montagem só de imagens não tem. */
async function temFaixaDeAudio(ffmpeg, nomeEntrada) {
  const nomeSaida = 'sonda_audio_' + Math.random().toString(36).slice(2) + '.txt';
  await ffmpeg.ffprobe(['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', nomeEntrada, '-o', nomeSaida]);
  const dados = await ffmpeg.readFile(nomeSaida);
  await limpar(ffmpeg, [nomeSaida]);
  return !!(typeof dados === 'string' ? dados : new TextDecoder().decode(dados)).trim();
}

/**
 * Sobrepõe uma trilha de áudio ao vídeo montado (mixa com o áudio original, se houver; a trilha some `volume`).
 * Um vídeo montado só a partir de imagens não tem faixa de áudio — nesse caso a trilha vira o áudio inteiro do
 * vídeo (sem tentar mixar com um `[0:a]` que não existe, o que faria o ffmpeg falhar).
 */
export async function misturarAudio({ arquivo, trilha, volumeTrilha = 0.3, aoProgresso }) {
  const ffmpeg = await carregarFFmpeg();
  const { fetchFile } = await importarPacote();
  const nomeVideo = 'entrada.' + extensaoDe(arquivo.name);
  const nomeAudio = 'trilha.' + extensaoDe(trilha.name);
  const onProg = aoProgresso ? ({ progress }) => aoProgresso(Math.min(1, Math.max(0, progress))) : null;
  if (onProg) ffmpeg.on('progress', onProg);
  try {
    await ffmpeg.writeFile(nomeVideo, await fetchFile(arquivo));
    await ffmpeg.writeFile(nomeAudio, await fetchFile(trilha));
    const temAudio = await temFaixaDeAudio(ffmpeg, nomeVideo);
    const filtro = temAudio
      ? `[1:a]volume=${volumeTrilha}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]`
      : `[1:a]volume=${volumeTrilha}[a]`;
    const cod = await ffmpeg.exec([
      '-i', nomeVideo, '-i', nomeAudio,
      '-filter_complex', filtro, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-shortest', 'saida.mp4',
    ]);
    if (cod !== 0) throw new Error('Não consegui misturar a trilha de áudio.');
    const dados = await ffmpeg.readFile('saida.mp4');
    return new Blob([dados.buffer], { type: 'video/mp4' });
  } finally {
    if (onProg) ffmpeg.off('progress', onProg);
    await limpar(ffmpeg, [nomeVideo, nomeAudio, 'saida.mp4']);
  }
}

// ---------------- Prévia em qualidade reduzida (link de aprovação) ----------------

/** Dimensões da prévia: lado MENOR com `alvo` px (480p), proporção mantida, números pares; nunca aumenta um vídeo pequeno. */
export function dimensoesPreviaVideo(largura, altura, alvo = 480) {
  const menor = Math.min(largura, altura);
  const e = menor > alvo ? alvo / menor : 1;
  const par = (n) => Math.max(2, Math.round((n * e) / 2) * 2);
  return { largura: par(largura), altura: par(altura) };
}

/** Argumentos do ffmpeg para a prévia: 480p, H.264 comprimido (CRF 32), áudio AAC 64 kbps, pronto para tocar no navegador. */
export function argsPreviaVideo(entrada, saida, { largura, altura }) {
  return ['-i', entrada, '-vf', `scale=${largura}:${altura}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k', '-ac', '2', '-movflags', '+faststart', saida];
}

/** Gera a versão reduzida de um vídeo (o original não é alterado). Devolve um Blob MP4. */
export async function gerarPreviaVideo({ arquivo, aoProgresso }) {
  const meta = await metadadosVideo(arquivo);
  const dim = dimensoesPreviaVideo(meta.largura, meta.altura);
  return rodarUmArquivo({ arquivo, aoProgresso, saida: 'previa.mp4', montarArgs: (entrada, saida) => argsPreviaVideo(entrada, saida, dim) });
}

// ---------------- Narração: mistura a voz com o áudio que o vídeo já tem ----------------

/**
 * Filtro de áudio da narração. A narração começa no segundo 0 (junto com a primeira cena) e ganha silêncio no fim
 * (apad) para NUNCA encurtar o vídeo; o vídeo é quem define a duração final. Com áudio próprio (música/voz do
 * vídeo), mistura os dois sem a normalização automática do amix (normalize=0), para que os volumes escolhidos
 * valham como estão.
 */
export function filtroNarracao(temAudio, volumeNarracao = 1, volumeOriginal = 0.3) {
  const vn = Math.max(0, Math.min(2, Number(volumeNarracao) || 0)), vo = Math.max(0, Math.min(2, Number(volumeOriginal) || 0));
  return temAudio
    ? `[1:a]volume=${vn},apad[n];[0:a]volume=${vo}[o];[o][n]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`
    : `[1:a]volume=${vn},apad[a]`;
}

/** Coloca a narração no vídeo do editor, ajustando o volume da narração e o do áudio que já existia (ex.: a música). */
export async function misturarNarracao({ arquivo, narracao, volumeNarracao = 1, volumeOriginal = 0.3, aoProgresso }) {
  const ffmpeg = await carregarFFmpeg();
  const { fetchFile } = await importarPacote();
  const nomeVideo = 'entrada.' + extensaoDe(arquivo.name);
  const nomeAudio = 'narracao.' + extensaoDe(narracao.name || 'narracao.webm');
  const onProg = aoProgresso ? ({ progress }) => aoProgresso(Math.min(1, Math.max(0, progress))) : null;
  if (onProg) ffmpeg.on('progress', onProg);
  try {
    await ffmpeg.writeFile(nomeVideo, await fetchFile(arquivo));
    await ffmpeg.writeFile(nomeAudio, await fetchFile(narracao));
    const temAudio = await temFaixaDeAudio(ffmpeg, nomeVideo);
    const cod = await ffmpeg.exec([
      '-i', nomeVideo, '-i', nomeAudio, '-filter_complex', filtroNarracao(temAudio, volumeNarracao, volumeOriginal),
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', 'saida.mp4',
    ]);
    if (cod !== 0) throw new Error('Não consegui misturar a narração. Use um áudio MP3, WAV, M4A ou WebM.');
    const dados = await ffmpeg.readFile('saida.mp4');
    return new Blob([dados.buffer], { type: 'video/mp4' });
  } finally {
    if (onProg) ffmpeg.off('progress', onProg);
    await limpar(ffmpeg, [nomeVideo, nomeAudio, 'saida.mp4']);
  }
}
