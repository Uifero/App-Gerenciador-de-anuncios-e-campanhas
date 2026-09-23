// Diagnóstico de campanha já rodando (clientes com estágio "rodando"): cruza o que o gestor informa sobre o que
// já está no ar com os padrões do motor de Insights (deste cliente e de clientes do mesmo nicho) e as
// referências de mercado salvas de sinal forte, pra apontar o que manter e o que mudar. Guarda um histórico
// simples (data + o que foi analisado) numa coleção nova (gcc_diagnosticos — já coberta pela regra genérica do
// Firestore "gcc_*", sem precisar mexer em firestore.rules).
//
// Análise visual (opcional): o gestor pode anexar prints do painel de métricas e/ou as peças que estão no ar. Com
// IA, as imagens vão junto com os dados e cada conclusão volta marcada com a fonte (imagem N x dados digitados);
// sem IA, elas só ficam anexadas ao registro para consulta. As imagens ficam em gcc_diagnostico_imagens, um
// documento por imagem (data URL reduzida): o Storage pode estar desativado (plano Blaze) e um documento do
// Firestore aguenta até ~1 MB, então várias imagens juntas no próprio diagnóstico estourariam esse limite.
import { db, COL } from '../core/storage.js';
import { padroesLocais, padroesPorNicho } from './insights.js';
import { diagnosticarCampanha } from '../core/ia.js';
import { PLATAFORMAS_ANUNCIO } from '../lib/constantes.js';
import { $, esc, on, modal, toast, ocupado, opcoes, dataBR, lerForm, num, campoArquivo } from '../core/ui.js';

export const MAX_ANEXOS = 6;
const TIPOS_LEITURA = ['metricas', 'criativo', 'ilegivel', 'sem_relacao'];
const ROTULO_TIPO = { metricas: 'print de métricas', criativo: 'peça de criativo', ilegivel: 'ilegível', sem_relacao: 'sem relação com a campanha', sem_leitura: 'não analisada' };
const usavel = (tipo) => tipo === 'metricas' || tipo === 'criativo';
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '_');

/** "Sem IA": só os dados informados lado a lado com os padrões já detectados — nenhuma interpretação em texto. */
export function resumoSemIA({ dados, locais, nicho, referenciasFortes }) {
  const linha = (rotulo, l) => (l.length ? `${rotulo}: ` + l.slice(0, 4).map((g) => `${g.valor} (ROAS ${g.roasMedio?.toFixed(2) ?? 'n/d'}x, CPA ${g.cpaMedio?.toFixed(2) ?? 'n/d'}, ${g.amostras}x)`).join('; ') : null);
  return {
    dadosInformados: dados,
    padroesDoCliente: ['angulo', 'framework', 'formato'].map((c) => linha(c, locais[c] || [])).filter(Boolean),
    padroesDoNicho: ['angulo', 'framework', 'formato'].map((c) => linha(c, nicho?.[c] || [])).filter(Boolean),
    referenciasFortes: referenciasFortes.map((r) => `${r.titulo || 'referência'} (ângulo ${r.analise?.angulo || 'n/d'})`),
  };
}

/**
 * Confere a resposta da IA contra as imagens que foram de fato enviadas (`total`), sem confiar cegamente nela:
 *  - garante uma leitura por imagem (se a IA pulou alguma, a tela diz "não analisada" em vez de sumir com ela);
 *  - normaliza o tipo ("métricas" -> "metricas"); tipo desconhecido vira "não analisada";
 *  - marca com `alerta` toda conclusão atribuída a uma imagem inexistente ou que a própria IA disse ser ilegível
 *    ou sem relação — a pessoa vê o aviso ao lado da conclusão, em vez de uma leitura inventada passar batida.
 */
export function conferirLeituraImagens(resultado, total) {
  const r = { ...(resultado || {}) };
  const lidas = Array.isArray(r.imagens) ? r.imagens : [];
  r.imagens = Array.from({ length: total }, (_, i) => {
    const x = lidas.find((l) => Number(l?.numero) === i + 1);
    const tipo = normalizar(x?.tipo);
    return x ? { numero: i + 1, tipo: TIPOS_LEITURA.includes(tipo) ? tipo : 'sem_leitura', leitura: String(x.leitura || '') }
      : { numero: i + 1, tipo: 'sem_leitura', leitura: 'A IA não comentou esta imagem.' };
  });
  for (const lista of ['funcionandoBem', 'desperdicio', 'recomendacoes']) {
    r[lista] = (Array.isArray(r[lista]) ? r[lista] : []).map((it) => {
      const item = { ...it, fonte: normalizar(it?.fonte) || undefined };
      // Conclusão mista (ex.: dado digitado em conflito com o print) vem com fonte "dados" + número da imagem: confere igual.
      if (item.fonte !== 'imagem' && (it?.imagem == null || it.imagem === '')) return item;
      const n = Number(it.imagem), img = r.imagens[n - 1];
      item.imagem = Number.isInteger(n) ? n : null;
      if (!img) item.alerta = 'A IA atribuiu esta conclusão a uma imagem que não foi enviada. Desconsidere.';
      else if (!usavel(img.tipo)) item.alerta = `A IA marcou a imagem ${n} como ${ROTULO_TIPO[img.tipo]}, mas tirou esta conclusão dela: confira antes de usar.`;
      return item;
    });
  }
  return r;
}

/** Reduz a imagem (lado maior <= `lado`) e converte para JPEG. Devolve base64 puro (para a IA) e a data URL (para guardar/mostrar). */
async function prepararImagem(file, lado, qualidade) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error(`Não consegui abrir "${file.name}" como imagem.`)); i.src = url; });
    const e = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * e); c.height = Math.round(img.naturalHeight * e);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); // PNG transparente não vira fundo preto
    const dataUrl = c.toDataURL('image/jpeg', qualidade);
    return { media_type: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), dataUrl };
  } finally { URL.revokeObjectURL(url); }
}
/** Para a IA: 1568 px é o tamanho que a Claude lê sem reduzir de novo (números pequenos de print continuam legíveis). */
const paraIA = (file) => prepararImagem(file, 1568, 0.88);
/** Para guardar no registro: cabe folgado num documento do Firestore (~1 MB); reduz mais se o print for pesado. */
async function paraArmazenar(file) {
  for (const [lado, q] of [[1400, 0.82], [1100, 0.72], [800, 0.65]]) {
    const r = await prepararImagem(file, lado, q);
    if (r.dataUrl.length < 750_000) return r.dataUrl;
  }
  throw new Error(`"${file.name}" é pesada demais para anexar.`);
}

const miniatura = (src, i, extra = '') => `<button type="button" data-ver-img="${i}" class="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${extra}" title="Ver imagem ${i + 1} em tamanho maior">
  <img src="${esc(src)}" alt="" class="h-full w-full object-cover"><span class="absolute bottom-0 left-0 bg-black/60 px-1 text-[10px] text-white">${i + 1}</span></button>`;

function htmlLeituraImagens(imagens = [], fontes = []) {
  if (!imagens.length) return '';
  return `<div class="mt-2"><h5 class="text-xs font-semibold uppercase text-slate-500"><i class="fa-solid fa-image"></i> Leitura das imagens anexadas</h5>
    <ul class="mt-1 space-y-1 text-sm">${imagens.map((im, i) => `<li class="flex gap-2 rounded-lg ${usavel(im.tipo) ? 'bg-slate-50' : 'border border-amber-300 bg-amber-50'} p-2">
      ${fontes[i] ? miniatura(fontes[i], i) : ''}
      <div class="min-w-0"><p><b>Imagem ${im.numero}</b> · <span class="tag ${usavel(im.tipo) ? 'tag-info' : 'tag-warn'}">${esc(ROTULO_TIPO[im.tipo] || im.tipo)}</span></p>
        <p class="${usavel(im.tipo) ? '' : 'text-amber-800'}">${usavel(im.tipo) ? '' : '<i class="fa-solid fa-triangle-exclamation"></i> Não usada na análise. '}${esc(im.leitura)}</p></div></li>`).join('')}</ul></div>`;
}

const SELOS = {
  dados: '<span class="tag"><i class="fa-solid fa-keyboard mr-1"></i>dados digitados</span>',
  padrao: '<span class="tag"><i class="fa-solid fa-chart-line mr-1"></i>padrões</span>',
  referencia: '<span class="tag"><i class="fa-solid fa-bookmark mr-1"></i>referência</span>',
};
/** Selo da fonte + selo da imagem citada (os dois aparecem numa conclusão mista, ex.: dado digitado x print). */
const seloFonte = (it) => (SELOS[it.fonte] || '')
  + (it.fonte === 'imagem' || it.imagem != null ? `<span class="tag tag-info"><i class="fa-solid fa-image mr-1"></i>lido na imagem ${esc(it.imagem ?? '?')}</span>` : '');

function htmlResultadoIA(r, fontes = []) {
  const bloco = (titulo, itens, classe) => (itens?.length ? `<div class="mt-2"><h5 class="text-xs font-semibold uppercase text-slate-500">${titulo}</h5>
    <ul class="mt-1 space-y-1 text-sm">${itens.map((it) => `<li class="rounded-lg ${classe} p-2">${esc(it.texto)}${it.prioridade ? ` <span class="tag ${it.prioridade === 'alta' ? 'tag-bad' : it.prioridade === 'media' ? 'tag-warn' : ''}">${esc(it.prioridade)}</span>` : ''}
      <br><span class="mt-1 inline-flex flex-wrap items-center gap-1">${seloFonte(it)}<span class="hint !mt-0">Origem: ${esc(it.origem || 'n/d')}</span></span>
      ${it.alerta ? `<p class="mt-1 text-xs font-medium text-amber-700"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(it.alerta)}</p>` : ''}</li>`).join('')}</ul></div>` : '');
  return htmlLeituraImagens(r.imagens, fontes) +
    bloco('O que provavelmente está funcionando', r.funcionandoBem, 'bg-emerald-50') +
    bloco('Possível desperdício / oportunidade', r.desperdicio, 'bg-amber-50') +
    bloco('Recomendações', r.recomendacoes, 'bg-indigo-50');
}
function htmlResultadoManual(r, fontes = []) {
  const lista = (titulo, itens) => (itens.length ? `<div class="mt-2"><h5 class="text-xs font-semibold uppercase text-slate-500">${titulo}</h5><ul class="mt-1 list-disc pl-5 text-sm">${itens.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '');
  return lista('Padrões deste cliente', r.padroesDoCliente) + lista('Padrões de clientes do mesmo nicho', r.padroesDoNicho) + lista('Referências de mercado de sinal forte', r.referenciasFortes)
    + (!r.padroesDoCliente.length && !r.padroesDoNicho.length ? '<p class="hint mt-2">Ainda não há padrões suficientes (mínimo 2 amostras por ângulo/framework/formato) — registre mais resultados.</p>' : '')
    + (fontes.length ? `<div class="mt-2"><h5 class="text-xs font-semibold uppercase text-slate-500"><i class="fa-solid fa-image"></i> Imagens anexadas (sem interpretação automática)</h5>
      <div class="mt-1 flex flex-wrap gap-2">${fontes.map((src, i) => miniatura(src, i)).join('')}</div></div>` : '');
}

export async function abrirDiagnostico(cliente) {
  const [referencias, resultados, historico] = await Promise.all([
    db.listar(COL.referencias, { clienteId: cliente.id }), db.listar(COL.resultados, { clienteId: cliente.id }), db.listar(COL.diagnosticos, { clienteId: cliente.id }),
  ]);
  const referenciasFortes = referencias.filter((r) => r.sinal === 'forte');
  const locais = padroesLocais(resultados);
  const h = cliente.historico || {};
  const anexos = []; // { file, url } escolhidos nesta abertura do modal
  let fontesNaTela = []; // imagens (URLs) do resultado mostrado agora, para o "ver maior"

  const m = modal(`Diagnosticar campanha — ${cliente.nome}`, `<div id="diag"></div>`, { largo: true, aoFechar: () => anexos.forEach((a) => URL.revokeObjectURL(a.url)) });
  const raiz = $('#diag', m.el);
  raiz.innerHTML = `
    <p class="hint mb-3">Descreva o que já está no ar hoje. Os campos já vêm preenchidos com o que está cadastrado no perfil do cliente — ajuste para refletir o estado mais atual.</p>
    <form id="fd" class="grid gap-3 sm:grid-cols-2">
      <div><label class="label">Plataforma</label><select class="input" name="plataforma">${opcoes(PLATAFORMAS_ANUNCIO, 'meta')}</select></div>
      <div><label class="label">Orçamento diário atual (R$)</label><input class="input" type="number" step="0.01" name="orcamentoDiario" value="${esc(h.orcamentoDiario)}"></div>
      <div><label class="label">CPA atual (R$)</label><input class="input" type="number" step="0.01" name="cpaAtual" value="${esc(h.cpaMedio)}"></div>
      <div><label class="label">ROAS atual</label><input class="input" type="number" step="0.01" name="roasAtual"></div>
      <div class="sm:col-span-2"><label class="label">Público(s) atual(is)</label><input class="input" name="publicos" value="${esc(h.publicos)}"></div>
      <div class="sm:col-span-2"><label class="label">Criativos que já estão rodando (ângulo, formato, há quanto tempo)</label><textarea class="input" rows="2" name="criativosRodando" placeholder="Ex.: 2 criativos de vídeo, ângulo dor, no ar há 3 semanas"></textarea></div>
      <div class="sm:col-span-2"><label class="label">Ofertas/promoções ativas</label><input class="input" name="ofertas" placeholder="Ex.: frete grátis acima de R$ 150"></div>
      <div class="sm:col-span-2 rounded-lg border border-slate-200 p-3"><label class="label">Prints do painel e/ou peças no ar <span class="font-normal text-slate-500">(opcional)</span></label>
        ${campoArquivo({ attrs: 'data-anexos', accept: 'image/png,image/jpeg,image/webp', multiple: true, icone: 'image', texto: 'Enviar prints ou peças (PNG/JPG)', lista: true, destaque: false,
          dica: `Ex.: print do Gerenciador de Anúncios com as colunas de CPM, frequência e CTR visíveis, ou as peças que estão rodando. Até ${MAX_ANEXOS} imagens.` })}
        <div data-lista-anexos class="mt-2 flex flex-wrap gap-2"></div>
        <p class="hint hidden" data-aviso-anexos>Com IA, as imagens são lidas junto com os dados e cada conclusão diz se veio da imagem ou do que foi digitado. Sem IA, elas só ficam anexadas ao registro para consulta.</p></div>
      <div class="sm:col-span-2 flex flex-wrap gap-2">
        <button class="btn-ia" type="submit" data-modo="ia"><i class="fa-solid fa-wand-magic-sparkles"></i> Diagnosticar com IA</button>
        <button class="btn-ghost" type="submit" data-modo="manual" title="Mostra os dados e padrões lado a lado, sem interpretação por texto; as imagens ficam só anexadas">Ver dados sem IA</button>
      </div>
    </form>
    <div id="resultado-diag" class="mt-3"></div>
    <details class="mt-4 rounded-lg border border-slate-200 p-3"><summary id="resumo-historico" class="cursor-pointer text-sm font-medium text-slate-600">Histórico de diagnósticos (${historico.length})</summary>
      <div id="historico-diag" class="mt-2 space-y-1"></div></details>`;

  const form = $('#fd', raiz), resultadoEl = $('#resultado-diag', raiz);
  // Recria a lista/contagem do histórico (chamado no início e de novo depois de cada diagnóstico salvo, senão o
  // "Histórico de diagnósticos (N)" e a lista ficam desatualizados até o modal ser fechado e reaberto).
  const desenharHistorico = () => {
    $('#resumo-historico', raiz).textContent = `Histórico de diagnósticos (${historico.length})`;
    $('#historico-diag', raiz).innerHTML = historico.length
      ? historico.slice().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).map((d) => `<button type="button" class="btn-ghost btn-sm w-full text-left" data-ver-diag="${d.id}">${dataBR(d.criadoEm)} · ${d.origem === 'ia' ? 'com IA' : 'sem IA'}${d.imagens ? ` · <i class="fa-solid fa-image"></i> ${d.imagens} imagem(ns)` : ''}</button>`).join('')
      : '<p class="hint">Nenhum diagnóstico salvo ainda.</p>';
  };
  desenharHistorico();

  // ---- anexos ----
  const desenharAnexos = () => {
    $('[data-lista-anexos]', raiz).innerHTML = anexos.map((a, i) => `<div class="relative">${miniatura(a.url, i)}
      <button type="button" data-rm-anexo="${i}" class="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 text-xs text-white" title="Remover esta imagem">×</button></div>`).join('');
    const cheio = anexos.length >= MAX_ANEXOS, inp = $('[data-anexos]', raiz);
    inp.disabled = cheio;
    $('[data-upload-rotulo]', inp.closest('.upload')).textContent = cheio ? `Limite de ${MAX_ANEXOS} imagens` : anexos.length ? `Adicionar mais imagens (${anexos.length}/${MAX_ANEXOS})` : 'Enviar prints ou peças (PNG/JPG)';
    $('[data-aviso-anexos]', raiz).classList.toggle('hidden', !anexos.length);
  };
  on(raiz, 'change', '[data-anexos]', (inp) => {
    const escolhidos = [...inp.files].filter((f) => f.type.startsWith('image/'));
    const cabem = escolhidos.slice(0, MAX_ANEXOS - anexos.length);
    cabem.forEach((file) => anexos.push({ file, url: URL.createObjectURL(file) }));
    if (escolhidos.length > cabem.length) toast(`Só cabem ${MAX_ANEXOS} imagens por diagnóstico: ${escolhidos.length - cabem.length} ficaram de fora.`, 'erro');
    if (inp.files.length > escolhidos.length) toast('Só imagens (PNG, JPG ou WebP) podem ser anexadas.', 'erro');
    inp.value = '';
    desenharAnexos();
  });
  on(raiz, 'click', '[data-rm-anexo]', (b) => { const [a] = anexos.splice(Number(b.dataset.rmAnexo), 1); URL.revokeObjectURL(a.url); desenharAnexos(); });
  on(raiz, 'click', '[data-ver-img]', (b) => {
    const src = b.closest('[data-lista-anexos]') ? anexos[Number(b.dataset.verImg)]?.url : fontesNaTela[Number(b.dataset.verImg)];
    if (src) modal(`Imagem ${Number(b.dataset.verImg) + 1}`, `<img src="${esc(src)}" alt="" class="mx-auto max-h-[75vh] rounded-lg">`, { largo: true });
  });

  /** Guarda as imagens do diagnóstico (uma por documento). Falha aqui não perde o diagnóstico já salvo. */
  const guardarImagens = async (diagnosticoId) => {
    let ok = 0;
    for (const [i, a] of anexos.entries()) {
      try { await db.criar(COL.diagnosticoImagens, { clienteId: cliente.id, diagnosticoId, ordem: i + 1, nome: a.file.name, dataUrl: await paraArmazenar(a.file) }); ok++; }
      catch (e) { console.error(e); }
    }
    if (ok < anexos.length) toast(`O diagnóstico foi salvo, mas ${anexos.length - ok} imagem(ns) não puderam ser anexadas ao registro.`, 'erro');
    return ok;
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter; const v = lerForm(form);
    const dados = { plataforma: v.plataforma, orcamentoDiario: num(v.orcamentoDiario), cpaAtual: num(v.cpaAtual), roasAtual: num(v.roasAtual), publicos: v.publicos, criativosRodando: v.criativosRodando, ofertas: v.ofertas };
    await ocupado(btn, async () => {
      const nicho = await padroesPorNicho(cliente.nicho, cliente.id).catch(() => ({ padroes: null }));
      const fontes = anexos.map((a) => a.url);
      let resultado, origem;
      if (btn.dataset.modo === 'ia') {
        const imagens = await Promise.all(anexos.map((a) => paraIA(a.file)));
        resultado = conferirLeituraImagens(await diagnosticarCampanha({ cliente, dados, padroesLocais: locais, padroesNicho: nicho.padroes, referenciasFortes, imagens }), anexos.length);
        resultadoEl.innerHTML = htmlResultadoIA(resultado, fontes);
        origem = 'ia';
      } else {
        resultado = resumoSemIA({ dados, locais, nicho: nicho.padroes, referenciasFortes });
        resultadoEl.innerHTML = htmlResultadoManual(resultado, fontes);
        origem = 'manual';
      }
      fontesNaTela = fontes;
      const salvo = await db.criar(COL.diagnosticos, { clienteId: cliente.id, origem, dados, resultado, imagens: anexos.length });
      if (anexos.length) salvo.imagens = await guardarImagens(salvo.id);
      historico.push(salvo);
      desenharHistorico();
      toast(anexos.length ? `Diagnóstico salvo no histórico com ${salvo.imagens} imagem(ns) anexada(s).` : 'Diagnóstico salvo no histórico deste cliente.');
    });
  });

  on(raiz, 'click', '[data-ver-diag]', async (b) => {
    const d = historico.find((x) => x.id === b.dataset.verDiag); if (!d) return;
    const imgs = d.imagens ? (await db.listar(COL.diagnosticoImagens, { diagnosticoId: d.id })).sort((a, z) => a.ordem - z.ordem).map((x) => x.dataUrl) : [];
    fontesNaTela = imgs;
    resultadoEl.innerHTML = `<p class="hint mb-2">Diagnóstico de ${dataBR(d.criadoEm)}${d.origem === 'manual' ? ' (sem IA)' : ''}:</p>` + (d.origem === 'ia' ? htmlResultadoIA(conferirLeituraImagens(d.resultado, d.resultado?.imagens?.length || 0), imgs) : htmlResultadoManual(d.resultado, imgs));
    resultadoEl.scrollIntoView({ block: 'start' });
  });
}
