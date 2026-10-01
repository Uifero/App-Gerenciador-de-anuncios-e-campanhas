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
import { padroesLocais, padroesDoNicho } from './insights.js';
import { diagnosticarCampanha } from '../core/ia.js';
import { obterConfig, classificarSinal } from './configuracoes.js';
import { paisDoCliente, chavePais, simboloDoCliente, simbolosDaMoeda } from '../lib/pais.js';
import { PLATAFORMAS_ANUNCIO } from '../lib/constantes.js';
import { $, esc, on, modal, toast, ocupado, opcoes, dataBR, lerForm, num, campoArquivo, mostrarResultado } from '../core/ui.js';

export const MAX_ANEXOS = 6;
const TIPOS_LEITURA = ['metricas', 'anuncio_ativo', 'criativo', 'ilegivel', 'sem_relacao'];
const ROTULO_TIPO = { metricas: 'print de métricas', anuncio_ativo: 'anúncio ativo do cliente (Biblioteca de Anúncios)', criativo: 'peça de criativo', ilegivel: 'ilegível', sem_relacao: 'sem relação com a campanha', sem_leitura: 'não analisada' };
const usavel = (tipo) => tipo === 'metricas' || tipo === 'anuncio_ativo' || tipo === 'criativo';
/** Opções da marcação de cada imagem (o que o gestor diz que ela é). */
export const MARCACOES_IMAGEM = [['metricas', 'É print de métricas'], ['anuncio_ativo', 'É print de anúncio ativo (Biblioteca de Anúncios)'], ['criativo', 'É o arquivo de uma peça']];
const nomeMarcacao = (v) => (MARCACOES_IMAGEM.find(([k]) => k === v) || MARCACOES_IMAGEM[0])[1];
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '_');

/** "Sem IA": só os dados informados lado a lado com os padrões já detectados — nenhuma interpretação em texto. */
export function resumoSemIA({ dados, locais, nicho, referenciasFortes, simbolo = 'R$' }) {
  const linha = (rotulo, l) => (l.length ? `${rotulo}: ` + l.slice(0, 4).map((g) => `${g.valor} (ROAS ${g.roasMedio?.toFixed(2) ?? 'n/d'}x, CPA ${g.cpaMedio != null ? simbolo + ' ' + g.cpaMedio.toFixed(2) : 'n/d'}, ${g.amostras}x)`).join('; ') : null);
  return {
    bibliotecaAnuncios: String(dados?.bibliotecaAnuncios || '').trim() || null,
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
    const dias = x?.diasNoAr == null || x.diasNoAr === '' ? NaN : Number(x.diasNoAr);
    const diasNoAr = tipo === 'anuncio_ativo' && Number.isFinite(dias) && dias >= 0 ? Math.round(dias) : null;
    return x ? { numero: i + 1, tipo: TIPOS_LEITURA.includes(tipo) ? tipo : 'sem_leitura', leitura: String(x.leitura || ''), ...(diasNoAr != null ? { diasNoAr } : {}) }
      : { numero: i + 1, tipo: 'sem_leitura', leitura: 'A IA não comentou esta imagem.' };
  });
  for (const lista of ['funcionandoBem', 'desperdicio', 'comparacaoMercado', 'recomendacoes']) {
    r[lista] = (Array.isArray(r[lista]) ? r[lista] : []).map((it) => {
      const item = { ...it, fonte: normalizar(it?.fonte) || undefined };
      delete item.alerta; // avisos são sempre recalculados aqui (registro antigo reaberto ganha as regras atuais)
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

const linkValido = (u) => /^https?:\/\/[^\s]+$/i.test(String(u || '').trim());
/**
 * Confere a camada de mercado (pesquisa na web) sem confiar cegamente na IA:
 *  - "buscaMercado" vira { encontrou: boolean, resumo } (ou fica ausente em diagnóstico antigo, feito antes da pesquisa);
 *  - conclusão de fonte "mercado" sem link de verdade ganha `alerta` (não dá para conferir de onde veio);
 *  - se a própria IA disse que a pesquisa não achou nada, qualquer conclusão atribuída ao mercado ganha `alerta`.
 * Links que não são http(s) são descartados (nunca viram href).
 */
export function conferirFontesMercado(resultado) {
  const r = { ...(resultado || {}) };
  const sim = (v) => v === true || v === 'true';
  if (r.buscaMercado && typeof r.buscaMercado === 'object') {
    const b = r.buscaMercado;
    r.buscaMercado = { encontrou: sim(b.encontrou), resumo: String(b.resumo || ''),
      ...(b.noPaisDoCliente != null ? { noPaisDoCliente: sim(b.noPaisDoCliente) } : {}), ...(b.paisDosDados ? { paisDosDados: String(b.paisDosDados) } : {}) };
  } else delete r.buscaMercado;
  if (r.buscaBiblioteca && typeof r.buscaBiblioteca === 'object') r.buscaBiblioteca = { encontrou: sim(r.buscaBiblioteca.encontrou), resumo: String(r.buscaBiblioteca.resumo || '') };
  else delete r.buscaBiblioteca;
  r.paginasConsultadas = (Array.isArray(r.paginasConsultadas) ? r.paginasConsultadas : []).filter((f) => linkValido(f?.url))
    .filter((f, i, l) => l.findIndex((x) => x.url === f.url) === i);
  for (const lista of ['funcionandoBem', 'desperdicio', 'comparacaoMercado', 'recomendacoes']) {
    if (!Array.isArray(r[lista])) continue;
    r[lista] = r[lista].map((it) => {
      const item = { ...it };
      if (item.link != null) item.link = linkValido(item.link) ? String(item.link).trim() : undefined;
      if (item.moeda != null) item.moeda = String(item.moeda).trim().toUpperCase() || undefined;
      if (item.alerta) return item;
      const fonte = normalizar(item.fonte);
      // Valor em "R$" num item cuja fonte é de outra moeda: a IA misturou moedas — avisa em vez de deixar passar.
      // (Se o texto também cita a moeda real — ex.: "os benchmarks estão em US$, não comparo com os R$ do cliente" — está explícito, sem aviso.)
      const txt = String(item.texto || '');
      if (item.moeda && item.moeda !== 'BRL' && /R\$/.test(txt) && ![item.moeda, ...simbolosDaMoeda(item.moeda)].some((m) => txt.includes(m))) item.alerta = `O texto usa "R$", mas a IA disse que o dado é em ${item.moeda}: confira a moeda na fonte antes de comparar.`;
      else if (fonte === 'mercado') {
        if (r.buscaMercado && !r.buscaMercado.encontrou) item.alerta = 'A IA disse que a pesquisa de mercado não trouxe nada, mas atribuiu esta conclusão ao mercado: desconsidere.';
        else if (!item.link) item.alerta = 'Sem o link da página pesquisada: trate como opinião, não como prática de mercado confirmada.';
      } else if (fonte === 'biblioteca') {
        // Conclusão que também se apoia num print válido não é descartada: só a parte "Biblioteca" fica sem confirmação.
        const img = item.imagem != null ? r.imagens?.[item.imagem - 1] : null;
        if (r.buscaBiblioteca && !r.buscaBiblioteca.encontrou) item.alerta = img && usavel(img.tipo)
          ? `A IA não achou os anúncios da marca pela Biblioteca: esta conclusão se apoia na imagem ${item.imagem} e no que ela achou na web. Confira antes de usar.`
          : 'A IA disse que não achou os anúncios da marca pela Biblioteca, mas atribuiu esta conclusão a eles: desconsidere.';
        else if (!item.link) item.alerta = 'Sem o link de onde a IA viu este anúncio: confira na Biblioteca de Anúncios antes de usar.';
      }
      return item;
    });
  }
  return r;
}
/** As duas conferências juntas (imagens + mercado), usadas no resultado novo e ao reabrir o histórico. */
export const conferirDiagnostico = (resultado, totalImagens) => conferirFontesMercado(conferirLeituraImagens(resultado, totalImagens));

/** Reduz a imagem (lado maior <= `lado`) e converte para JPEG. Devolve base64 puro (para a IA) e a data URL (para guardar/mostrar). */
export async function prepararImagem(file, lado, qualidade) {
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

function htmlLeituraImagens(imagens = [], fontes = [], marcacoes = [], cfg = null) {
  if (!imagens.length) return '';
  return `<div class="mt-2"><h5 class="text-xs font-semibold uppercase text-slate-500"><i class="fa-solid fa-image"></i> Leitura das imagens anexadas</h5>
    <ul class="mt-1 space-y-1 text-sm">${imagens.map((im, i) => `<li class="flex gap-2 rounded-lg ${usavel(im.tipo) ? 'bg-slate-50' : 'border border-amber-300 bg-amber-50'} p-2">
      ${fontes[i] ? miniatura(fontes[i], i) : ''}
      <div class="min-w-0"><p><b>Imagem ${im.numero}</b> · <span class="tag ${usavel(im.tipo) ? 'tag-info' : 'tag-warn'}">${esc(ROTULO_TIPO[im.tipo] || im.tipo)}</span>${marcacoes[i] ? ` <span class="hint !mt-0">(você marcou: ${esc(nomeMarcacao(marcacoes[i]).replace(/^É /, ''))})</span>` : ''}
        ${im.diasNoAr != null ? ` ${tagDias(im.diasNoAr, cfg)}` : ''}</p>
        <p class="${usavel(im.tipo) ? '' : 'text-amber-800'}">${usavel(im.tipo) ? '' : '<i class="fa-solid fa-triangle-exclamation"></i> Não usada na análise. '}${esc(im.leitura)}</p></div></li>`).join('')}</ul></div>`;
}

const SELOS = {
  dados: '<span class="tag"><i class="fa-solid fa-keyboard mr-1"></i>dados digitados</span>',
  padrao: '<span class="tag"><i class="fa-solid fa-chart-line mr-1"></i>padrões</span>',
  referencia: '<span class="tag"><i class="fa-solid fa-bookmark mr-1"></i>referência salva</span>',
  mercado: '<span class="tag tag-info"><i class="fa-solid fa-globe mr-1"></i>pesquisa de mercado</span>',
  biblioteca: '<span class="tag tag-info"><i class="fa-brands fa-meta mr-1"></i>link da Biblioteca de Anúncios</span>',
};
/** Selo da fonte + selo da imagem citada (os dois aparecem numa conclusão mista, ex.: dado digitado x print). */
const seloImagem = (it, imagens) => (imagens[it.imagem - 1]?.tipo === 'anuncio_ativo'
  ? `<span class="tag tag-info"><i class="fa-solid fa-rectangle-ad mr-1"></i>print de anúncio ativo (imagem ${esc(it.imagem)})</span>`
  : `<span class="tag tag-info"><i class="fa-solid fa-image mr-1"></i>lido na imagem ${esc(it.imagem ?? '?')}</span>`);
/** País e moeda a que o item se refere; amarelo quando não é o país do cliente (nunca some em silêncio). */
function seloPais(it, cliente) {
  if (!it.pais && !it.moeda) return '';
  const outro = it.pais && normalizar(it.pais) !== 'geral' && chavePais({ pais: it.pais }) !== chavePais(cliente);
  return `<span class="tag ${outro ? 'tag-warn' : ''}" title="País e moeda a que esta informação se refere"><i class="fa-solid fa-earth-americas mr-1"></i>${esc(it.pais || '')}${it.pais && it.moeda ? ' · ' : ''}${esc(it.moeda || '')}</span>`;
}
const seloFonte = (it, imagens = [], cliente = null) => (SELOS[it.fonte] || '')
  + (it.fonte === 'imagem' || it.imagem != null ? seloImagem(it, imagens) : '')
  + (cliente ? seloPais(it, cliente) : '')
  + (it.link ? `<a class="text-xs text-indigo-600 underline" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">abrir a fonte</a>` : '');

/** Faixa do topo: o que a pesquisa de mercado trouxe, ou o aviso de que não trouxe nada (e a análise seguiu só com o interno). */
function htmlBuscaMercado(r, cliente) {
  const b = r.buscaMercado, bib = r.buscaBiblioteca; if (!b && !bib) return '';
  const pais = paisDoCliente(cliente);
  const linhaBib = bib ? `<div class="mt-2 rounded-lg border ${bib.encontrou ? 'border-sky-300 bg-sky-50' : 'border-amber-300 bg-amber-50 text-amber-800'} p-2 text-sm">
    <p><i class="fa-brands fa-meta"></i> <b>${bib.encontrou ? 'Anúncios atuais da marca (pelo link da Biblioteca)' : 'Não achei os anúncios da marca pelo link/nome informado'}</b></p>
    ${bib.resumo ? `<p class="mt-1">${esc(bib.resumo)}</p>` : ''}</div>` : '';
  if (!b) return linhaBib;
  const paginas = r.paginasConsultadas || [];
  return `<div class="mt-2 rounded-lg border ${b.encontrou ? 'border-sky-300 bg-sky-50' : 'border-amber-300 bg-amber-50 text-amber-800'} p-2 text-sm">
    <p><i class="fa-solid fa-globe"></i> <b>${b.encontrou ? 'Pesquisa de mercado' : 'A pesquisa de mercado não trouxe nada relevante ou atual'}</b>${b.encontrou ? '' : ' — esta análise usa só os dados internos e as referências salvas.'}</p>
    ${b.encontrou && b.noPaisDoCliente === false ? `<p class="mt-1 font-medium text-amber-800"><i class="fa-solid fa-triangle-exclamation"></i> Não achei dado confiável de ${esc(pais)}. Os números de mercado abaixo são de: ${esc(b.paisDosDados || 'outro país (não informado)')}.</p>`
      : b.paisDosDados ? `<p class="mt-1 text-xs"><i class="fa-solid fa-earth-americas"></i> Dados de: ${esc(b.paisDosDados)}</p>` : ''}
    ${b.resumo ? `<p class="mt-1">${esc(b.resumo)}</p>` : ''}
    ${paginas.length ? `<details class="mt-1"><summary class="cursor-pointer text-xs">Páginas consultadas (${paginas.length})</summary><ul class="mt-1 list-disc pl-5 text-xs">${paginas.map((f) => `<li><a class="text-indigo-600 underline" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.titulo || f.url)}</a></li>`).join('')}</ul></details>` : ''}</div>` + linhaBib;
}

/** Dias no ar lidos no print do anúncio ativo, com o mesmo sinal (forte/moderado/fraco) usado nas Referências. */
function tagDias(dias, cfg) {
  const sinal = cfg ? classificarSinal(dias, cfg) : null;
  return `<span class="tag ${sinal === 'forte' ? 'tag-ok' : sinal === 'moderado' ? 'tag-warn' : ''}" title="Quanto mais tempo um anúncio fica no ar pago, mais provável que esteja vendendo">no ar há ${esc(dias)} dia(s)${sinal ? ` · sinal ${sinal}` : ''}</span>`;
}

function htmlResultadoIA(r, fontes = [], { cliente = null, marcacoes = [], cfg = null } = {}) {
  const bloco = (titulo, itens, classe) => (itens?.length ? `<div class="mt-2"><h5 class="text-xs font-semibold uppercase text-slate-500">${titulo}</h5>
    <ul class="mt-1 space-y-1 text-sm">${itens.map((it) => `<li class="rounded-lg ${classe} p-2">${esc(it.texto)}${it.prioridade ? ` <span class="tag ${it.prioridade === 'alta' ? 'tag-bad' : it.prioridade === 'media' ? 'tag-warn' : ''}">${esc(it.prioridade)}</span>` : ''}
      <br><span class="mt-1 inline-flex flex-wrap items-center gap-1">${seloFonte(it, r.imagens || [], cliente)}<span class="hint !mt-0">Origem: ${esc(it.origem || 'n/d')}</span></span>
      ${it.alerta ? `<p class="mt-1 text-xs font-medium text-amber-700"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(it.alerta)}</p>` : ''}</li>`).join('')}</ul></div>` : '');
  return htmlBuscaMercado(r, cliente) + htmlLeituraImagens(r.imagens, fontes, marcacoes, cfg) +
    bloco('O que provavelmente está funcionando (e por quê)', r.funcionandoBem, 'bg-emerald-50') +
    bloco('Provável desperdício de verba / oportunidade', r.desperdicio, 'bg-amber-50') +
    bloco('Comparação com o mercado e marcas de referência', r.comparacaoMercado, 'bg-sky-50') +
    bloco('Recomendações (em ordem de prioridade)', r.recomendacoes, 'bg-indigo-50') +
    '<p class="caption mt-3"><b>Próximo passo:</b> comece pelas recomendações de prioridade alta. Depois de alguns dias, registre os novos números na aba Resultados e rode o diagnóstico de novo para comparar (o anterior fica no histórico abaixo).</p>';
}
function htmlResultadoManual(r, fontes = [], marcacoes = []) {
  const lista = (titulo, itens) => (itens.length ? `<div class="mt-2"><h5 class="text-xs font-semibold uppercase text-slate-500">${titulo}</h5><ul class="mt-1 list-disc pl-5 text-sm">${itens.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '');
  const bib = r.bibliotecaAnuncios;
  return (bib ? `<div class="mt-2"><h5 class="text-xs font-semibold uppercase text-slate-500"><i class="fa-brands fa-meta"></i> Biblioteca de Anúncios informada (sem leitura automática)</h5>
      <p class="text-sm">${/^https?:\/\//i.test(bib) ? `<a class="text-indigo-600 underline break-all" href="${esc(bib)}" target="_blank" rel="noopener noreferrer">${esc(bib)}</a>` : esc(bib)}</p></div>` : '')
    + lista('Padrões deste cliente', r.padroesDoCliente) + lista('Padrões de clientes do mesmo nicho', r.padroesDoNicho) + lista('Referências de mercado de sinal forte', r.referenciasFortes)
    + (!r.padroesDoCliente.length && !r.padroesDoNicho.length ? '<p class="hint mt-2">Ainda não há padrões suficientes (mínimo 2 amostras por ângulo/framework/formato) — registre mais resultados.</p>' : '')
    + (fontes.length ? `<div class="mt-2"><h5 class="text-xs font-semibold uppercase text-slate-500"><i class="fa-solid fa-image"></i> Imagens anexadas (sem interpretação automática)</h5>
      <div class="mt-1 flex flex-wrap gap-2">${fontes.map((src, i) => `<div class="text-center">${miniatura(src, i)}${marcacoes[i] ? `<p class="mt-0.5 max-w-[5rem] text-[10px] leading-tight text-slate-500">${esc(nomeMarcacao(marcacoes[i]).replace(/^É /, ''))}</p>` : ''}</div>`).join('')}</div></div>` : '');
}

/** `aoFechar` (opcional): chamado ao fechar o modal (a aba Campanhas usa para atualizar "último diagnóstico"). */
export async function abrirDiagnostico(cliente, { aoFechar } = {}) {
  const simbolo = simboloDoCliente(cliente), pais = paisDoCliente(cliente);
  const [referencias, resultados, historico, cfg] = await Promise.all([
    db.listar(COL.referencias, { clienteId: cliente.id }), db.listar(COL.resultados, { clienteId: cliente.id }), db.listar(COL.diagnosticos, { clienteId: cliente.id }), obterConfig(),
  ]);
  const referenciasFortes = referencias.filter((r) => r.sinal === 'forte');
  const locais = padroesLocais(resultados);
  const h = cliente.historico || {};
  const anexos = []; // { file, url, rotulo } escolhidos nesta abertura do modal (rotulo = marcação do gestor)
  let fontesNaTela = []; // imagens (URLs) do resultado mostrado agora, para o "ver maior"

  const m = modal(`Diagnosticar campanha — ${cliente.nome}`, `<div id="diag"></div>`, { largo: true, aoFechar: () => { anexos.forEach((a) => URL.revokeObjectURL(a.url)); aoFechar?.(); } });
  const raiz = $('#diag', m.el);
  raiz.innerHTML = `
    <p class="hint mb-3">Descreva o que já está no ar hoje. Os campos já vêm preenchidos com o que está cadastrado no perfil do cliente — ajuste para refletir o estado mais atual. Valores em ${esc(simbolo)} (país do cliente: ${esc(pais)}; muda em Editar).</p>
    <form id="fd" class="grid gap-3 sm:grid-cols-2" data-aviso-sair>
      <div><label class="label">Plataforma</label><select class="input" name="plataforma">${opcoes(PLATAFORMAS_ANUNCIO, 'meta')}</select></div>
      <div><label class="label">Orçamento diário atual (${esc(simbolo)})</label><input class="input" type="number" step="0.01" name="orcamentoDiario" value="${esc(h.orcamentoDiario)}"></div>
      <div><label class="label">CPA atual (${esc(simbolo)})</label><input class="input" type="number" step="0.01" name="cpaAtual" value="${esc(h.cpaMedio)}"></div>
      <div><label class="label">ROAS atual</label><input class="input" type="number" step="0.01" name="roasAtual"></div>
      <div class="sm:col-span-2"><label class="label">Público(s) atual(is)</label><input class="input" name="publicos" value="${esc(h.publicos)}"></div>
      <div class="sm:col-span-2"><label class="label">Criativos que já estão rodando (ângulo, formato, há quanto tempo)</label><textarea class="input" rows="2" name="criativosRodando" placeholder="Ex.: 2 criativos de vídeo, ângulo dor, no ar há 3 semanas"></textarea></div>
      <div class="sm:col-span-2"><label class="label">Ofertas/promoções ativas</label><input class="input" name="ofertas" placeholder="Ex.: frete grátis acima de ${esc(simbolo)} 150"></div>
      <div class="sm:col-span-2"><label class="label">Link da Biblioteca de Anúncios da marca <span class="font-normal text-slate-500">(opcional)</span></label>
        <input class="input" name="bibliotecaAnuncios" value="${esc(cliente.bibliotecaAnuncios)}" placeholder="Ex.: https://www.facebook.com/ads/library/?view_all_page_id=... ou Loja da Ana">
        <p class="hint">Cole o link da Biblioteca de Anúncios da marca (ou só o nome da página). Isso ajuda a IA a achar o texto e a oferta dos anúncios que estão no ar agora, além do que já está nas referências salvas. Fica guardado no cliente para os próximos diagnósticos.</p></div>
      <div class="sm:col-span-2 rounded-lg border-2 border-dashed border-slate-300 p-3 transition" data-soltar><label class="label">Prints do painel e/ou peças no ar <span class="font-normal text-slate-500">(opcional)</span></label>
        <p class="hint !mt-0 mb-2"><i class="fa-solid fa-arrow-down"></i> Clique no botão ou arraste as imagens para dentro desta área. Depois, marque embaixo de cada imagem o que ela é.</p>
        <p class="hint !mt-0 mb-2">A Biblioteca de Anúncios mostra o texto e o tempo no ar de cada anúncio, mas não deixa a leitura automática ver o vídeo em si. Por isso, para a IA avaliar a composição visual de verdade (corte, ritmo, enquadramento), tire prints dos anúncios ativos e envie aqui, marcados como "anúncio ativo".</p>
        ${campoArquivo({ attrs: 'data-anexos', accept: 'image/png,image/jpeg,image/webp', multiple: true, icone: 'image', texto: 'Enviar prints ou peças (PNG/JPG)', lista: true, destaque: false,
          dica: `Ex.: print do Gerenciador de Anúncios com as colunas de CPM, frequência e CTR visíveis, ou print de um anúncio ativo da marca na Biblioteca de Anúncios. Até ${MAX_ANEXOS} imagens.` })}
        <div data-lista-anexos class="mt-2 flex flex-wrap gap-2"></div>
        <p class="hint hidden" data-aviso-anexos>Com IA, cada imagem é lida conforme a marcação (métricas = números; anúncio ativo = composição visual e tempo no ar de um anúncio <b>deste cliente</b>, nunca de concorrente) e cada conclusão diz de onde veio. Sem IA, elas só ficam anexadas ao registro para consulta.</p></div>
      <div class="sm:col-span-2 flex flex-wrap gap-2">
        <button class="btn-ia" type="submit" data-modo="ia"><i class="fa-solid fa-wand-magic-sparkles"></i> Diagnosticar com IA</button>
        <button class="btn-ghost" type="submit" data-modo="manual" title="Mostra os dados e padrões lado a lado, sem interpretação por texto; as imagens ficam só anexadas">Ver dados sem IA</button>
        <p class="hint w-full !mt-0"><b>Com IA</b> (1 a 3 min): cruza os seus dados, os prints e a Biblioteca de Anúncios com os padrões e as referências salvas e pesquisa na web o que funciona hoje no nicho em ${esc(pais)}; cada recomendação diz de onde veio e de que país/moeda é o dado. <b>Sem IA</b>: só os dados organizados, na hora.</p>
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
    $('[data-lista-anexos]', raiz).innerHTML = anexos.map((a, i) => `<div class="w-44 rounded-lg border border-slate-200 p-1.5"><div class="relative w-fit">${miniatura(a.url, i)}
      <button type="button" data-rm-anexo="${i}" class="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 text-xs text-white" title="Remover esta imagem">×</button></div>
      <select class="input mt-1 !px-1 !py-1 text-xs" data-rotulo-anexo="${i}" title="O que é esta imagem? A IA lê cada tipo de um jeito">${opcoes(MARCACOES_IMAGEM, a.rotulo)}</select></div>`).join('');
    const cheio = anexos.length >= MAX_ANEXOS, inp = $('[data-anexos]', raiz);
    inp.disabled = cheio;
    $('[data-upload-rotulo]', inp.closest('.upload')).textContent = cheio ? `Limite de ${MAX_ANEXOS} imagens` : anexos.length ? `Adicionar mais imagens (${anexos.length}/${MAX_ANEXOS})` : 'Enviar prints ou peças (PNG/JPG)';
    $('[data-aviso-anexos]', raiz).classList.toggle('hidden', !anexos.length);
  };
  on(raiz, 'change', '[data-anexos]', (inp) => {
    const escolhidos = [...inp.files].filter((f) => f.type.startsWith('image/'));
    const cabem = escolhidos.slice(0, MAX_ANEXOS - anexos.length);
    cabem.forEach((file) => anexos.push({ file, url: URL.createObjectURL(file), rotulo: 'metricas' }));
    if (escolhidos.length > cabem.length) toast(`Só cabem ${MAX_ANEXOS} imagens por diagnóstico: ${escolhidos.length - cabem.length} ficaram de fora.`, 'erro');
    if (inp.files.length > escolhidos.length) toast('Só imagens (PNG, JPG ou WebP) podem ser anexadas.', 'erro');
    inp.value = '';
    desenharAnexos();
  });
  on(raiz, 'change', '[data-rotulo-anexo]', (sel) => { const a = anexos[Number(sel.dataset.rotuloAnexo)]; if (a) a.rotulo = sel.value; });
  on(raiz, 'click', '[data-rm-anexo]', (b) => { const [a] = anexos.splice(Number(b.dataset.rmAnexo), 1); URL.revokeObjectURL(a.url); desenharAnexos(); });
  on(raiz, 'click', '[data-ver-img]', (b) => {
    const src = b.closest('[data-lista-anexos]') ? anexos[Number(b.dataset.verImg)]?.url : fontesNaTela[Number(b.dataset.verImg)];
    if (src) modal(`Imagem ${Number(b.dataset.verImg) + 1}`, `<img src="${esc(src)}" alt="" class="mx-auto max-h-[75vh] rounded-lg">`, { largo: true });
  });

  /** Guarda as imagens do diagnóstico (uma por documento). Falha aqui não perde o diagnóstico já salvo. */
  const guardarImagens = async (diagnosticoId) => {
    let ok = 0;
    for (const [i, a] of anexos.entries()) {
      try { await db.criar(COL.diagnosticoImagens, { clienteId: cliente.id, diagnosticoId, ordem: i + 1, nome: a.file.name, rotulo: a.rotulo, dataUrl: await paraArmazenar(a.file) }); ok++; }
      catch (e) { console.error(e); }
    }
    if (ok < anexos.length) toast(`O diagnóstico foi salvo, mas ${anexos.length - ok} imagem(ns) não puderam ser anexadas ao registro.`, 'erro');
    return ok;
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter; const v = lerForm(form);
    const dados = { plataforma: v.plataforma, orcamentoDiario: num(v.orcamentoDiario), cpaAtual: num(v.cpaAtual), roasAtual: num(v.roasAtual), publicos: v.publicos, criativosRodando: v.criativosRodando, ofertas: v.ofertas,
      bibliotecaAnuncios: String(v.bibliotecaAnuncios || '').trim(), pais, moeda: simbolo, marcacoes: anexos.map((a) => a.rotulo) };
    // O link/nome da Biblioteca fica no cliente para vir preenchido no próximo diagnóstico.
    if (dados.bibliotecaAnuncios !== (cliente.bibliotecaAnuncios || '')) {
      await db.atualizar(COL.clientes, cliente.id, { bibliotecaAnuncios: dados.bibliotecaAnuncios }, { silencioso: true }).catch((e) => console.warn(e));
      cliente.bibliotecaAnuncios = dados.bibliotecaAnuncios;
    }
    await ocupado(btn, async () => {
      const nicho = await padroesDoNicho(cliente).catch(() => ({ padroes: null }));
      const fontes = anexos.map((a) => a.url);
      let resultado, origem;
      if (btn.dataset.modo === 'ia') {
        const imagens = await Promise.all(anexos.map(async (a) => ({ ...(await paraIA(a.file)), rotulo: a.rotulo })));
        resultado = conferirDiagnostico(await diagnosticarCampanha({ cliente, dados, padroesLocais: locais, padroesNicho: nicho.padroes, referenciasFortes, imagens }), anexos.length);
        resultadoEl.innerHTML = htmlResultadoIA(resultado, fontes, { cliente, marcacoes: dados.marcacoes, cfg });
        origem = 'ia';
      } else {
        resultado = resumoSemIA({ dados, locais, nicho: nicho.padroes, referenciasFortes, simbolo });
        resultadoEl.innerHTML = htmlResultadoManual(resultado, fontes, dados.marcacoes);
        origem = 'manual';
      }
      fontesNaTela = fontes;
      const salvo = await db.criar(COL.diagnosticos, { clienteId: cliente.id, origem, dados, resultado, imagens: anexos.length });
      if (anexos.length) salvo.imagens = await guardarImagens(salvo.id);
      historico.push(salvo);
      desenharHistorico();
      mostrarResultado(resultadoEl, anexos.length ? `Pronto: diagnóstico abaixo (salvo no histórico com ${salvo.imagens} imagem(ns)).` : 'Pronto: diagnóstico abaixo (salvo no histórico deste cliente).');
    });
  });

  on(raiz, 'click', '[data-ver-diag]', async (b) => {
    const d = historico.find((x) => x.id === b.dataset.verDiag); if (!d) return;
    const docs = d.imagens ? (await db.listar(COL.diagnosticoImagens, { diagnosticoId: d.id })).sort((a, z) => a.ordem - z.ordem) : [];
    const imgs = docs.map((x) => x.dataUrl), marcacoes = d.dados?.marcacoes || docs.map((x) => x.rotulo);
    fontesNaTela = imgs;
    resultadoEl.innerHTML = `<p class="hint mb-2">Diagnóstico de ${dataBR(d.criadoEm)}${d.origem === 'manual' ? ' (sem IA)' : ''}:</p>` + (d.origem === 'ia' ? htmlResultadoIA(conferirDiagnostico(d.resultado, d.resultado?.imagens?.length || 0), imgs, { cliente, marcacoes, cfg }) : htmlResultadoManual({ padroesDoCliente: [], padroesDoNicho: [], referenciasFortes: [], ...d.resultado }, imgs, marcacoes));
    resultadoEl.scrollIntoView({ block: 'start' });
  });
}
