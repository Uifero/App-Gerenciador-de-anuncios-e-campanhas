// Janela "Materiais do cliente": enviar fotos e vídeos (vários de uma vez, botão ou arrastar), ver tudo agrupado
// (Logo, Fotos, Vídeos, Provas sociais) e apagar. Usa salvarMaterial (lib/materiais.js): mesmo Storage, mesmas regras e
// mesmo limite de hoje; nada guardado em paralelo. Abre do painel "Material para montar o site", da pergunta 8 e da aba
// Criativos. O Estúdio (etapa 1) e o "Ajustar este site" já leem esta mesma lista.
import { db, COL } from '../core/storage.js';
import { enviarMateriais, removerMaterial, ACEITA_MATERIAL, limiteMaterialMB } from '../lib/materiais.js';
import { tipoMaterial } from '../lib/prova-social.js';
import { logoHtml, ligarLogo } from './logo-cliente.js';
import { esc, $, on, modal, campoArquivo, toast, ocupado, confirmar, mostrarResultado } from '../core/ui.js';

const GRUPOS = [['logo', 'Logo'], ['foto', 'Fotos'], ['video', 'Vídeos'], ['prova_social', 'Provas sociais']];
const XADREZ = 'background:repeating-conic-gradient(#cbd5e1 0% 25%,#ffffff 0% 50%) 50%/12px 12px';
const mb = (b) => (b ? `${(b / 1048576).toFixed(1)} MB` : '');

/** `aoMudar(lista)` roda depois de cada envio ou exclusão, com a lista atual de materiais (para os contadores). */
export async function abrirMateriais(cliente, { aoMudar: aoMudarExtra = () => {} } = {}) {
  // Cada mudança avisa a tela de trás (painel do site, pergunta 8) para os contadores atualizarem na hora.
  const aoMudar = (lista) => { aoMudarExtra(lista); document.dispatchEvent(new CustomEvent('gcc:materiais', { detail: { clienteId: cliente.id, lista } })); };
  const limite = limiteMaterialMB();
  const m = modal(`Materiais do cliente — ${cliente.nome}`, `<div data-materiais-cliente>
    <p class="caption mb-2">Fotos e vídeos do cliente para as peças do Estúdio e para o site. Ficam salvos aqui e aparecem no Estúdio (etapa 1, "Materiais") e no "Ajustar este site".</p>
    <div class="rounded-lg border-2 border-dashed border-slate-300 p-3" data-soltar data-zona-materiais>
      ${campoArquivo({ attrs: 'data-materiais-arquivos', accept: ACEITA_MATERIAL, multiple: true, icone: 'upload', texto: 'Enviar fotos e vídeos', lista: true,
        dica: `Arraste os arquivos para esta área ou clique no botão. Vários de uma vez: fotos (PNG, JPG, WEBP) e vídeos (MP4, MOV); o tipo é detectado sozinho. Até ${limite} MB por arquivo.` })}
      <p class="hint mt-1" data-progresso-materiais></p></div>
    <div class="mt-3"><p class="text-sm font-semibold">Logo</p><div data-logo-materiais>${logoHtml(cliente)}</div></div>
    <div class="mt-3 space-y-3" data-grade-materiais><p class="caption"><i class="fa-solid fa-spinner fa-spin"></i> Carregando…</p></div></div>`, { largo: true });
  const raiz = $('[data-materiais-cliente]', m.el);
  let lista = [];

  const cartao = (x) => {
    const video = tipoMaterial(x) === 'video';
    const midia = video ? `<video src="${esc(x.url)}#t=0.1" muted preload="metadata" playsinline class="h-24 w-full rounded bg-black object-cover"></video>`
      : `<img src="${esc(x.url)}" alt="" loading="lazy" class="h-24 w-full rounded object-${tipoMaterial(x) === 'logo' ? 'contain' : 'cover'}" ${tipoMaterial(x) === 'logo' ? `style="${XADREZ}"` : ''}>`;
    return `<div class="rounded-lg border border-slate-200 p-1 text-xs" data-material="${esc(x.id)}">${midia}
      <p class="mt-1 truncate" title="${esc(x.nomeOriginal || x.descricao || x.nome || '')}">${esc(x.nomeOriginal || x.descricao || x.nome || 'arquivo')}</p>
      <div class="flex items-center justify-between gap-1"><span class="text-slate-500">${esc(mb(x.tamanho))}</span>
        <button type="button" class="btn-danger btn-sm !px-2 !py-0.5" data-apagar-material="${esc(x.id)}" title="Apagar este arquivo"><i class="fa-solid fa-trash"></i></button></div></div>`;
  };
  const desenharGrade = async () => {
    lista = await db.listar(COL.materiais, { clienteId: cliente.id });
    $('[data-grade-materiais]', raiz).innerHTML = GRUPOS.map(([k, titulo]) => {
      const itens = lista.filter((x) => tipoMaterial(x) === k);
      return `<section data-grupo-material="${k}"><p class="text-sm font-semibold">${titulo} <span class="font-normal text-slate-500">(${itens.length})</span></p>
        ${itens.length ? `<div class="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">${itens.map(cartao).join('')}</div>` : '<p class="hint">Nenhum ainda.</p>'}</section>`;
    }).join('');
    return lista;
  };

  on(raiz, 'change', '[data-materiais-arquivos]', (inp) => ocupado(inp, async () => {
    const arqs = [...(inp.files || [])]; if (!arqs.length) return;
    const prog = $('[data-progresso-materiais]', raiz);
    try {
      const { salvos, falhas } = await enviarMateriais(cliente, arqs, (i, n, nome) => { prog.textContent = `Enviando ${i + 1} de ${n}: ${nome}…`; });
      prog.textContent = '';
      await desenharGrade(); aoMudar(lista);
      if (falhas.length) toast(`${falhas.length} arquivo(s) não enviado(s):\n${falhas.join('\n')}`, 'erro');
      if (salvos.length) {
        const fotos = salvos.filter((x) => tipoMaterial(x) === 'foto').length, videos = salvos.filter((x) => tipoMaterial(x) === 'video').length;
        mostrarResultado($(`[data-grupo-material="${videos && !fotos ? 'video' : 'foto'}"]`, raiz), `Pronto: ${fotos} foto(s) e ${videos} vídeo(s) salvos nos materiais do cliente.`);
      }
    } finally { inp.value = ''; $('[data-upload-escolhido]', raiz)?.classList.add('hidden'); $('.upload-btn', raiz)?.classList.remove('hidden'); }
  }));
  on(raiz, 'click', '[data-apagar-material]', async (b) => {
    const x = lista.find((y) => y.id === b.dataset.apagarMaterial); if (!x) return;
    if (!(await confirmar(`Apagar "${x.nomeOriginal || x.nome}" dos materiais do cliente? O arquivo sai do Estúdio e do site.${tipoMaterial(x) === 'logo' ? ' É o logo atual: o cliente fica sem logo.' : ''}`, 'Apagar'))) return;
    await ocupado(b, async () => {
      await removerMaterial(cliente, x);
      if (tipoMaterial(x) === 'logo') $('[data-logo-materiais]', raiz).innerHTML = logoHtml(cliente);
      await desenharGrade(); aoMudar(lista); toast('Arquivo apagado.');
    });
  });
  ligarLogo($('[data-logo-materiais]', raiz), cliente, async () => { await desenharGrade(); aoMudar(lista); });
  await desenharGrade();
  return m;
}
