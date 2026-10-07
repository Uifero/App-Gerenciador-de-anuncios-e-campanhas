// Configurações > "Documentos de referência": envia PDF ou texto, resume UMA vez (com IA ou à mão) e guarda só a
// referência compacta (gcc_documentos). Vale para todos os clientes ou para um só. A Metodologia Vortex é entrada fixa.
// Interno: nada daqui vai para o site nem para link de aprovação.
import { db, COL } from '../core/storage.js';
import { resumirDocumento } from '../core/ia.js';
import { DOC_VORTEX, ACEITA_DOCUMENTO, prepararTexto, partesDoTexto } from '../lib/documentos.js';
import { esc, $, on, toast, ocupado, campoArquivo, dataBR, tag, mostrarResultado, confirmar } from '../core/ui.js';

/** Texto de um PDF (pdf.js carregado só quando precisa) ou de um arquivo de texto. */
export async function lerTextoArquivo(file) {
  const ext = String(file.name || '').toLowerCase().split('.').pop();
  if (file.type === 'application/pdf' || ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      paginas.push(`[página ${i}]\n` + (await pg.getTextContent()).items.map((x) => x.str).join(' '));
    }
    return { texto: paginas.join('\n\n'), paginas: doc.numPages };
  }
  if (['txt', 'md'].includes(ext) || String(file.type).startsWith('text/')) return { texto: await file.text(), paginas: null };
  throw new Error('Envie PDF, TXT ou MD.');
}

const cartao = (d, clientes) => `<li class="rounded-lg border border-slate-200 p-2 text-sm" data-documento="${esc(d.id)}">
  <div class="flex flex-wrap items-start justify-between gap-2"><p><b>${esc(d.titulo)}</b> ${d.fixo ? tag('fixo', 'tag-info') : ''}${d.clienteId ? tag(`só ${clientes.find((c) => c.id === d.clienteId)?.nome || 'um cliente'}`) : tag('todos os clientes')}${d.origemResumo === 'manual' ? tag('resumo à mão') : d.fixo ? '' : tag('resumo da IA', 'tag-info')}</p>
    ${d.fixo ? '' : `<button type="button" class="btn-danger btn-sm" data-apagar-doc="${esc(d.id)}" title="Apagar este documento"><i class="fa-solid fa-trash"></i></button>`}</div>
  <p class="mt-1 text-xs text-slate-600">${esc(d.resumo)}</p>
  ${(d.partes || []).length ? `<details class="mt-1 text-xs"><summary class="cursor-pointer">Partes que a análise pode citar (${d.partes.length})</summary><ul class="ml-4 list-disc">${d.partes.map((p) => `<li><b>${esc(p.parte)}</b>${p.pontos ? `: ${esc(p.pontos)}` : ''}</li>`).join('')}</ul></details>` : ''}
  ${d.resumidoEm ? `<p class="hint">Resumido em ${dataBR(d.resumidoEm)}${d.cortado ? ' · documento longo: só o começo foi resumido' : ''}. Não é relido a cada análise.</p>` : ''}</li>`;

/** Seção da página de Configurações. */
export async function montarDocumentos(el) {
  const [docs, clientes] = await Promise.all([db.listar(COL.documentos).catch(() => []), db.listar(COL.clientes).catch(() => [])]);
  const desenhar = () => {
    el.innerHTML = `<h3 class="font-semibold"><i class="fa-solid fa-book mr-1 text-slate-400"></i>Documentos de referência</h3>
      <p class="caption mb-2">PDF ou texto que a IA usa nas análises ("Analisar e recomendar" e plano de otimização), citando o documento e a parte. Cada documento é resumido UMA vez e só o resumo fica guardado. Interno: nunca aparece no site nem em link de aprovação.</p>
      <ul class="space-y-2" data-lista-docs>${[DOC_VORTEX, ...docs].map((d) => cartao(d, clientes)).join('')}</ul>
      <form class="mt-3 space-y-2 rounded-lg border border-slate-200 p-3" data-form-doc>
        <div class="grid gap-2 sm:grid-cols-2"><label class="text-sm">Título<input class="input mt-0.5" name="titulo" placeholder="Ex.: Guia de anúncios para WhatsApp"></label>
          <label class="text-sm">Vale para<select class="input mt-0.5" name="clienteId"><option value="">Todos os clientes</option>${clientes.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('')}</select></label></div>
        ${campoArquivo({ attrs: 'name="arquivo" data-arquivo-doc', accept: ACEITA_DOCUMENTO, icone: 'file-lines', texto: 'Escolher PDF ou texto', destaque: false })}
        <label class="block text-sm">Ou cole o texto<textarea class="input mt-0.5" rows="3" name="texto" placeholder="Texto do documento"></textarea></label>
        <details class="text-sm"><summary class="cursor-pointer text-slate-600">Resumir à mão (sem IA)</summary>
          <label class="mt-1 block">Resumo<textarea class="input mt-0.5" rows="3" name="resumoManual" maxlength="1500"></textarea></label>
          <label class="mt-1 block">Partes (uma por linha, "Parte: pontos")<textarea class="input mt-0.5" rows="3" name="partesManual" placeholder="Capítulo 2: oferta com prazo&#10;Página 7: CTA de conversa"></textarea></label></details>
        <div class="flex flex-wrap gap-2"><button class="btn-ia" type="submit" data-modo="ia"><i class="fa-solid fa-wand-magic-sparkles"></i> Enviar e resumir com IA</button><button class="btn-ghost" type="submit" data-modo="manual">Salvar com o resumo à mão</button></div></form>`;
  };
  desenhar();
  on(el, 'submit', '[data-form-doc]', async (f, ev) => {
    ev.preventDefault();
    const btn = ev.submitter;
    await ocupado(btn, async () => {
      const arquivo = f.elements.arquivo.files?.[0] || null;
      const titulo = f.elements.titulo.value.trim() || arquivo?.name?.replace(/\.[^.]+$/, '') || '';
      if (!titulo) throw new Error('Dê um título ao documento.');
      const base = { titulo, clienteId: f.elements.clienteId.value || null, nomeArquivo: arquivo?.name || '', tamanho: arquivo?.size || null };
      let doc;
      if (btn.dataset.modo === 'manual') {
        const resumo = f.elements.resumoManual.value.trim();
        if (!resumo) throw new Error('Escreva o resumo (em "Resumir à mão").');
        doc = { ...base, resumo, partes: partesDoTexto(f.elements.partesManual.value), origemResumo: 'manual', resumidoEm: new Date().toISOString() };
      } else {
        const bruto = arquivo ? await lerTextoArquivo(arquivo) : { texto: f.elements.texto.value };
        const { texto, cortado } = prepararTexto(bruto.texto);
        if (texto.length < 50) throw new Error(arquivo ? 'Não consegui tirar texto deste arquivo (PDF escaneado vira imagem). Cole o texto ou resuma à mão.' : 'Envie um arquivo ou cole o texto do documento.');
        const r = await resumirDocumento({ titulo, texto });
        if (!r.resumo) throw new Error('A IA não devolveu o resumo. Tente de novo ou resuma à mão.');
        doc = { ...base, ...r, origemResumo: 'ia', resumidoEm: new Date().toISOString(), caracteres: texto.length, cortado, paginas: bruto.paginas || null };
      }
      const salvo = await db.criar(COL.documentos, doc);
      docs.unshift(salvo); desenhar();
      mostrarResultado($(`[data-documento="${salvo.id}"]`, el), `Documento "${titulo}" guardado. As próximas análises podem citá-lo.`);
    });
  });
  on(el, 'click', '[data-apagar-doc]', async (b) => {
    if (!(await confirmar('Apagar este documento de referência? As análises já feitas continuam como estão.', 'Apagar'))) return;
    await db.remover(COL.documentos, b.dataset.apagarDoc);
    docs.splice(docs.findIndex((d) => d.id === b.dataset.apagarDoc), 1); desenhar(); toast('Documento apagado.');
  });
}
