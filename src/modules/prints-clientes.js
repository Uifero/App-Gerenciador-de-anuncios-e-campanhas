// Prints de clientes reais no site ("Clientes reais"): borrar nome, número e foto antes de publicar (cópia borrada,
// original guardado), autorização antes de o print sair do app (link de aprovação, pacote, pasta do site) e o .zip
// com os prints para subir no tema. Os prints vêm de Materiais / Provas sociais (lib/visual-site.js printsDoCliente).
import { db, COL, removerArquivo } from '../core/storage.js';
import { enviarArquivoOuAvisar } from '../lib/uploads.js';
import { lerPrintsProvaSocial } from '../core/ia.js';
import { lerRespostaProvas, areaValida } from '../lib/prova-social.js';
import { printsSemAutorizacao } from '../lib/visual-site.js';
import { ehProdutoSaude } from '../lib/saude.js';
import { criarZip } from '../lib/zip.js';
import { prepararImagem } from './diagnostico.js';
import { esc, $, on, modal, toast, ocupado, confirmar, baixarTexto } from '../core/ui.js';

export const AVISO_ANVISA = 'Atenção: depoimentos de resultado em suplementos podem ser questionados pela Anvisa; confirme com o cliente.';

/** Bloco "Clientes reais" do painel "Site gerado": um cartão por print, com o estado de privacidade e o "Borrar". */
export function printsPainelHtml(cliente, prints = []) {
  const estado = (p) => (p.protegido ? '<span class="tag tag-ok">dados protegidos</span>' : p.precisaAutorizacao === false ? '<span class="tag">foto sem pessoa</span>' : p.autorizado ? '<span class="tag tag-info">sem borrar · autorizado</span>' : '<span class="tag tag-warn">sem borrar</span>');
  return `<div data-prints-painel>
    ${ehProdutoSaude(cliente) ? `<p class="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-800" data-aviso-anvisa><i class="fa-solid fa-circle-info"></i> ${AVISO_ANVISA}</p>` : ''}
    ${prints.length ? `<p class="hint mb-2">Os prints reais de clientes (Materiais e Provas sociais, sem repetir o mesmo arquivo) aparecem na seção "Clientes reais", logo depois do banner. Mude a posição em "Seções" acima. Antes de publicar, borre nome, número e foto de quem aparece: o site usa a cópia borrada e o original fica guardado.</p>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">${prints.map((p, i) => `<div class="rounded-lg border border-slate-200 p-1 text-xs" data-print="${esc(p.id)}">
        <img src="${esc(p.url)}" alt="Print ${i + 1}" class="h-28 w-full rounded bg-white object-contain">
        <div class="mt-1 flex flex-wrap items-center gap-1">${p.codigo ? `<span class="tag tag-info">${esc(p.codigo)}</span>` : ''}${estado(p)}</div>
        <button type="button" class="btn-ghost btn-sm mt-1 w-full" data-borrar-print="${esc(p.id)}"><i class="fa-solid fa-eye-slash"></i> Borrar nome, número e foto</button></div>`).join('')}</div>`
    : '<p class="hint">Nenhum print de cliente ainda. Envie em "Materiais do cliente" e marque "É print de cliente", ou use "Provas sociais" (pergunta 10).</p>'}</div>`;
}

/**
 * Antes de um print sem borrar sair do app: pergunta a autorização uma vez por print (fica registrada nele).
 * Devolve true se pode seguir. `prints` = printsDoCliente(materiais).
 */
export async function autorizarPrints(prints = []) {
  const faltam = printsSemAutorizacao(prints);
  for (const [i, p] of faltam.entries()) {
    const qual = p.foto ? `foto${p.codigo ? ` ${p.codigo}` : ''} que mostra pessoa` : `print${p.codigo ? ` ${p.codigo}` : ''} sem borrar`;
    const ok = await confirmar(`Você tem autorização desses clientes para mostrar ${p.foto ? 'as fotos' : 'os prints'}? (${qual}, ${i + 1} de ${faltam.length}; dá para borrar no painel "Site gerado" > Clientes reais)`, 'Tenho autorização');
    if (!ok) { toast('Nada foi gerado. Borre os dados do print (painel "Site gerado" > Clientes reais) ou confirme a autorização.', 'info'); return false; }
    await db.atualizar(COL.materiais, p.id, { autorizado: true, autorizadoEm: new Date().toISOString() });
    p.autorizado = true;
  }
  return true;
}

/** .zip com os prints que vão para o tema (a cópia borrada quando houver). */
export async function baixarPrintsZip(cliente, prints = []) {
  if (!prints.length) throw new Error('Nenhum print de cliente para baixar.');
  if (!(await autorizarPrints(prints))) return;
  const arquivos = [];
  for (const [i, p] of prints.entries()) {
    const r = await fetch(p.url); if (!r.ok) throw new Error(`Não consegui baixar o print ${i + 1}. Tente de novo.`);
    const bl = await r.blob(); const ext = { 'image/png': 'png', 'image/webp': 'webp' }[bl.type] || 'jpg';
    arquivos.push({ nome: `prints-clientes/print-${String(i + 1).padStart(2, '0')}${p.codigo ? `-${p.codigo}` : ''}.${ext}`, conteudo: new Uint8Array(await bl.arrayBuffer()) });
  }
  baixarTexto(`prints-clientes-${(cliente.nome || 'loja').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.zip`, criarZip(arquivos), 'application/zip');
}

// ---------- borrar ----------
const carregarImg = (src) => new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error('Não consegui abrir o print.')); i.src = src; });
const FOLGA = 0.01;
/** Desenha o print com as áreas borradas: pixela (funciona em qualquer navegador) e, onde houver, desfoca por cima. */
export function desenharBorrado(canvas, img, areas, { marcar = false } = {}) {
  const W = img.naturalWidth, H = img.naturalHeight; canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d'); g.drawImage(img, 0, 0);
  for (const a of areas) {
    const x = Math.max(0, (a.x - FOLGA) * W), y = Math.max(0, (a.y - FOLGA) * H);
    const w = Math.min(W - x, (a.w + 2 * FOLGA) * W), h = Math.min(H - y, (a.h + 2 * FOLGA) * H);
    if (w < 2 || h < 2) continue;
    const t = document.createElement('canvas'); const passo = Math.max(6, Math.round(Math.min(w, h) / 6));
    t.width = Math.max(1, Math.round(w / passo)); t.height = Math.max(1, Math.round(h / passo));
    t.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, t.width, t.height);
    g.save(); g.imageSmoothingEnabled = false; g.drawImage(t, 0, 0, t.width, t.height, x, y, w, h);
    if ('filter' in g) { g.beginPath(); g.rect(x, y, w, h); g.clip(); g.filter = 'blur(8px)'; g.drawImage(canvas, x - 10, y - 10, w + 20, h + 20, x - 10, y - 10, w + 20, h + 20); }
    g.restore();
    if (marcar) { g.save(); g.strokeStyle = '#ef4444'; g.lineWidth = Math.max(2, W / 300); g.setLineDash([8, 6]); g.strokeRect(x, y, w, h); g.restore(); }
  }
}

/** Janela "Borrar nome, número e foto": a IA sugere as áreas, a pessoa ajusta e confirma. `aoSalvar()` roda no fim. */
export async function abrirBorrar(cliente, material, aoSalvar = () => {}) {
  const m = modal('Borrar nome, número e foto', `<div data-borrar>
    <p class="caption mb-2">As áreas marcadas em vermelho vão ser borradas na cópia que vai para o site. <b>Arraste</b> sobre o print para marcar mais uma área; <b>clique</b> numa área para tirá-la. O print original continua guardado.</p>
    <p class="hint" data-status-borrar><i class="fa-solid fa-spinner fa-spin"></i> Procurando nomes, números e fotos de pessoas…</p>
    <canvas class="mt-2 block max-h-[60vh] max-w-full cursor-crosshair rounded border border-slate-200" data-tela-borrar></canvas>
    <div class="mt-3 flex flex-wrap gap-2"><button type="button" class="btn-primary" data-confirmar-borrar><i class="fa-solid fa-check"></i> Confirmar e salvar cópia borrada</button>
      <button type="button" class="btn-ghost" data-limpar-borrar>Tirar todas as áreas</button></div></div>`, { largo: true });
  const raiz = $('[data-borrar]', m.el), tela = $('[data-tela-borrar]', raiz), status = $('[data-status-borrar]', raiz);
  const blob = await (await fetch(material.url)).blob(); // o ORIGINAL (nunca a cópia borrada)
  const urlLocal = URL.createObjectURL(blob);
  const img = await carregarImg(urlLocal);
  let areas = (material.borrada?.areas || []).map(areaValida).filter(Boolean);
  const pintar = (extra) => desenharBorrado(tela, img, extra ? [...areas, extra] : areas, { marcar: true });
  pintar();
  // Sugestão da IA (mesma leitura das provas sociais, que já aponta onde estão os dados pessoais). Sem IA, a pessoa marca.
  (async () => {
    try {
      const prep = await prepararImagem(new File([blob], 'print.jpg', { type: blob.type || 'image/jpeg' }), 1568, 0.9);
      const [lido] = lerRespostaProvas(await lerPrintsProvaSocial({ cliente, imagens: [{ media_type: prep.media_type, data: prep.data }] }), 1);
      const sugeridas = (lido?.dadosPessoais || []).map((d) => areaValida(d.area)).filter(Boolean);
      if (!raiz.isConnected) return;
      areas = [...areas, ...sugeridas]; pintar();
      status.innerHTML = sugeridas.length ? `<i class="fa-solid fa-wand-magic-sparkles"></i> A IA sugeriu ${sugeridas.length} área(s). Confira, ajuste e confirme.` : 'A IA não achou nome, número nem foto de pessoa. Confira e marque à mão se houver.';
      const semLocal = (lido?.dadosPessoais || []).filter((d) => !d.area).map((d) => d.tipo);
      if (semLocal.length) status.innerHTML += ` <b>Ela viu ${esc(semLocal.join(', '))} sem saber onde: marque arrastando.</b>`;
    } catch (e) { if (raiz.isConnected) status.textContent = `Não consegui sugerir as áreas agora (${e.message}). Marque arrastando sobre o print.`; }
  })();

  let ini = null;
  const ponto = (ev) => { const r = tela.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) }; };
  tela.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ini = ponto(ev); });
  tela.addEventListener('pointermove', (ev) => { if (!ini) return; const p = ponto(ev); pintar({ x: Math.min(ini.x, p.x), y: Math.min(ini.y, p.y), w: Math.abs(p.x - ini.x), h: Math.abs(p.y - ini.y) }); });
  tela.addEventListener('pointerup', (ev) => {
    if (!ini) return; const p = ponto(ev); const a = { x: Math.min(ini.x, p.x), y: Math.min(ini.y, p.y), w: Math.abs(p.x - ini.x), h: Math.abs(p.y - ini.y) }; ini = null;
    if (a.w > 0.01 && a.h > 0.01) areas.push(a);
    else { const i = areas.findIndex((x) => p.x >= x.x && p.x <= x.x + x.w && p.y >= x.y && p.y <= x.y + x.h); if (i >= 0) areas.splice(i, 1); } // clique: tira a área
    pintar();
  });
  on(raiz, 'click', '[data-limpar-borrar]', () => { areas = []; pintar(); });
  on(raiz, 'click', '[data-confirmar-borrar]', (b) => ocupado(b, async () => {
    if (!areas.length && !(await confirmar('Nenhuma área marcada: a cópia vai sair igual ao original. Salvar mesmo assim?', 'Salvar'))) return;
    const c = document.createElement('canvas'); desenharBorrado(c, img, areas);
    const saida = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.9));
    if (!saida) throw new Error('Não consegui gerar a cópia borrada. Tente de novo.');
    const caminho = `gcc/${cliente.id}/materiais/borrado-${material.id}-${Date.now()}.jpg`;
    const env = await enviarArquivoOuAvisar(caminho, new File([saida], caminho.split('/').pop(), { type: 'image/jpeg' }));
    if (material.borrada?.path) await removerArquivo(material.borrada.path); // a cópia anterior sai; o original fica
    const borrada = { url: env.url, path: env.path, areas, em: new Date().toISOString() };
    await db.atualizar(COL.materiais, material.id, { borrada });
    material.borrada = borrada;
    URL.revokeObjectURL(urlLocal); m.fechar();
    await aoSalvar(material);
    toast(`Cópia borrada salva (${areas.length} área(s)). O site usa esta cópia; o original continua guardado.`);
  }));
}
