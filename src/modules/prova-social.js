// "Prova social (imagem)": prints de avaliação/elogio (Google, marketplace, WhatsApp, qualquer lugar). Aparece na
// pergunta 10 do questionário e no painel "Material para montar o site" (aba Site/Loja) — o mesmo componente.
// Com IA: a IA lê cada print (mesmo mecanismo de imagem do Diagnóstico e dos prints do Instagram), resume em uma
// linha e aponta onde há dado pessoal de terceiros (nome, telefone, foto). Sem IA: a pessoa escreve o resumo.
// Nos dois casos há uma revisão antes de gravar: o resumo é editável e o print mostra as tarjas pretas que serão
// gravadas (dá para desenhar mais arrastando o mouse). Ao confirmar: as linhas são ACRESCENTADAS ao campo
// "provas sociais" (nunca sobrescreve) e o print JÁ COM TARJA vai para Materiais do cliente, etiquetado "prova social".
// O print original, sem tarja, nunca é guardado.
import { db, COL } from '../core/storage.js';
import { lerPrintsProvaSocial } from '../core/ia.js';
import { prepararImagem } from './diagnostico.js';
import { salvarMaterial } from './leitura-site.js';
import { MAX_PROVAS, LEGENDA_PROVAS, ORIGEM_PROVA, ETIQUETA_PROVA, lerRespostaProvas, linhaProva, acrescentarProvas, limparDadosPessoais } from '../lib/prova-social.js';
import { $, esc, on, modal, toast, ocupado, campoArquivo } from '../core/ui.js';

/** HTML do envio. `id` distingue as duas instâncias quando as duas estão na mesma página. */
export function provaSocialHtml(id = 'q') {
  return `<div class="mt-2 rounded-lg border border-dashed border-slate-300 p-2" data-prova-img="${id}" data-soltar>
    <p class="text-sm font-medium"><i class="fa-solid fa-star-half-stroke text-amber-500"></i> Prova social (imagem)</p>
    <p class="hint !mt-0 mb-1">${esc(LEGENDA_PROVAS)} Clique no botão ou arraste os prints para esta área. Até ${MAX_PROVAS} por vez.</p>
    ${campoArquivo({ attrs: 'data-provas-arquivos', accept: 'image/png,image/jpeg,image/webp', multiple: true, icone: 'image', texto: 'Enviar prints de avaliações', destaque: false })}
    <div class="mt-1 flex flex-wrap gap-2"><button type="button" class="btn-ia btn-sm" data-provas-ia><i class="fa-solid fa-wand-magic-sparkles"></i> Ler os prints com IA</button>
      <button type="button" class="btn-ghost btn-sm" data-provas-manual title="Você escreve o resumo de cada print; nada é lido automaticamente">Guardar sem IA (eu escrevo o resumo)</button></div>
    <p class="hint">Antes de gravar você revisa: o texto que vai para o perfil e as tarjas pretas sobre nomes, telefones e fotos de pessoas (o print guardado já sai com tarja). Com IA leva cerca de 1 min. Prefere digitar? Use o campo de texto acima.</p></div>`;
}

/** Liga os botões de `alvo` (que contém provaSocialHtml). ctx = { cliente, recarregar }. */
export function ligarProvaSocial(alvo, ctx) {
  const arquivos = () => [...($('[data-provas-arquivos]', alvo)?.files || [])].filter((f) => f.type.startsWith('image/'));
  const iniciar = (b, comIa) => {
    const arqs = arquivos();
    if (!arqs.length) return toast('Envie pelo menos um print (avaliação, elogio, número de vendas).', 'erro');
    if (arqs.length > MAX_PROVAS) return toast(`Envie no máximo ${MAX_PROVAS} prints por vez.`, 'erro');
    return ocupado(b, () => lerERevisar(arqs, comIa, ctx, () => { const i = $('[data-provas-arquivos]', alvo); i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })); }));
  };
  on(alvo, 'click', '[data-provas-ia]', (b) => iniciar(b, true));
  on(alvo, 'click', '[data-provas-manual]', (b) => iniciar(b, false));
}

async function lerERevisar(arqs, comIa, ctx, limparEnvio) {
  const preparados = await Promise.all(arqs.map((f) => prepararImagem(f, 1568, 0.9)));
  const leituras = comIa
    ? lerRespostaProvas(await lerPrintsProvaSocial({ cliente: ctx.cliente, imagens: preparados.map(({ media_type, data }) => ({ media_type, data })) }), arqs.length)
    : arqs.map((_, i) => ({ numero: i + 1, legivel: true, relevante: true, resumo: '', citacao: '', dadosPessoais: [], manual: true }));
  abrirRevisao(preparados, leituras, comIa, ctx, limparEnvio);
}

// ---------- tarjas (canvas) ----------
const FOLGA = 0.008;
/** Desenha a imagem e as tarjas (áreas em fração) no canvas, no tamanho real da imagem. */
function desenhar(canvas, img, areas) {
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const g = canvas.getContext('2d');
  g.drawImage(img, 0, 0);
  g.fillStyle = '#111';
  for (const a of areas) {
    const x = Math.max(0, a.x - FOLGA), y = Math.max(0, a.y - FOLGA);
    g.fillRect(x * canvas.width, y * canvas.height, Math.min(1 - x, a.w + 2 * FOLGA) * canvas.width, Math.min(1 - y, a.h + 2 * FOLGA) * canvas.height);
  }
}
const carregarImg = (src) => new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error('Não consegui abrir a imagem.')); i.src = src; });

function abrirRevisao(preparados, leituras, comIa, ctx, limparEnvio) {
  const { cliente } = ctx;
  // Estado por imagem: áreas da IA + áreas desenhadas à mão (as duas viram tarja no print guardado).
  const est = leituras.map((l) => ({ ia: l.dadosPessoais.filter((d) => d.area).map((d) => d.area), mao: [], semLocal: l.dadosPessoais.filter((d) => !d.area).map((d) => d.tipo) }));
  const util = (l) => l.legivel && l.relevante;
  const m = modal(comIa ? 'Revisar a leitura dos prints de prova social' : 'Guardar prints de prova social (sem IA)', `<div class="space-y-3" data-revisao-provas>
    <p class="caption">${comIa ? 'Confira cada print: o texto abaixo dele é o que entra no campo "provas sociais" do perfil de marca (acrescentado, sem apagar o que já existe). Pode editar.' : 'Escreva em uma linha o que cada print mostra (nota, número de avaliações, o elogio). Ele entra no campo "provas sociais" do perfil de marca, sem apagar o que já existe.'}
      As tarjas pretas cobrem nomes, telefones e fotos de pessoas: <b>arraste o mouse sobre o print</b> para cobrir mais alguma coisa.</p>
    ${leituras.map((l, i) => `<div class="rounded-lg border ${util(l) || l.manual ? 'border-slate-200' : 'border-amber-300 bg-amber-50'} p-2" data-prova="${i}">
      <p class="text-sm font-semibold">Print ${i + 1}${l.origem ? ` · ${esc(l.origem)}` : ''}${l.nota ? ` · nota ${esc(String(l.nota).replace('.', ','))}` : ''}${l.quantidade ? ` · ${esc(l.quantidade)} avaliações` : ''}</p>
      ${!util(l) && !l.manual ? `<p class="text-sm text-amber-800"><i class="fa-solid fa-circle-info"></i> <b>Nada legível ou relevante encontrado</b>: ${esc(l.motivo)} Nenhum texto foi criado para este print.</p>` : ''}
      <canvas class="mt-1 block max-h-72 max-w-full cursor-crosshair rounded border border-slate-200" data-tela="${i}" title="Arraste para cobrir um dado pessoal"></canvas>
      <p class="hint" data-tarjas="${i}"></p>
      ${est[i].semLocal.length ? `<p class="text-xs font-medium text-amber-800"><i class="fa-solid fa-triangle-exclamation"></i> A IA viu ${esc(est[i].semLocal.join(', '))} de uma pessoa, mas não soube apontar onde. Cubra arrastando o mouse antes de guardar o print.</p>` : ''}
      <label class="label mt-1">Texto para o perfil de marca</label>
      <textarea class="input" rows="2" data-resumo="${i}" placeholder="Ex.: Nota 4,9 no Google com 210 avaliações; cliente elogia o atendimento">${esc(l.resumo)}</textarea>
      <div class="mt-1 flex flex-wrap items-center gap-3 text-sm"><label class="flex items-center gap-1"><input type="checkbox" data-guardar="${i}" ${util(l) || l.manual ? 'checked' : ''}> Guardar este print (com tarja) em Materiais, como "prova social"</label>
        <button type="button" class="text-xs text-indigo-600 underline" data-desfazer="${i}">Tirar as tarjas que eu desenhei</button></div></div>`).join('')}
    <div class="flex flex-wrap gap-2"><button class="btn-primary" data-aplicar-provas><i class="fa-solid fa-check"></i> Acrescentar ao perfil e guardar os prints</button></div>
    <p class="hint">Próximo passo: os prints guardados aparecem no painel "Material para montar o site" e no cartão "Prints de prova social no site", onde você escolhe se entram no site como imagem real, como texto ou os dois.</p></div>`, { largo: true });

  const imgs = [];
  const pintar = (i) => {
    const c = $(`[data-tela="${i}"]`, m.el); if (!c || !imgs[i]) return;
    desenhar(c, imgs[i], [...est[i].ia, ...est[i].mao]);
    const n = est[i].ia.length + est[i].mao.length;
    $(`[data-tarjas="${i}"]`, m.el).textContent = n ? `${n} tarja(s): ${est[i].ia.length} da IA, ${est[i].mao.length} sua(s).` : 'Nenhuma tarja. Se houver nome, telefone ou foto de alguém, arraste sobre a área para cobrir.';
  };
  preparados.forEach((p, i) => carregarImg(p.dataUrl).then((img) => { imgs[i] = img; pintar(i); }).catch(() => {}));

  // Desenhar tarja: arrastar sobre o canvas (coordenadas convertidas para fração da imagem).
  let arrasto = null;
  const ponto = (c, ev) => { const r = c.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) }; };
  m.el.addEventListener('pointerdown', (ev) => { const c = ev.target.closest?.('[data-tela]'); if (!c) return; ev.preventDefault(); arrasto = { c, i: Number(c.dataset.tela), ini: ponto(c, ev) }; });
  m.el.addEventListener('pointermove', (ev) => {
    if (!arrasto) return; const p = ponto(arrasto.c, ev); const { i, ini } = arrasto;
    desenhar(arrasto.c, imgs[i], [...est[i].ia, ...est[i].mao, { x: Math.min(ini.x, p.x), y: Math.min(ini.y, p.y), w: Math.abs(p.x - ini.x), h: Math.abs(p.y - ini.y) }]);
  });
  const soltar = (ev) => {
    if (!arrasto) return; const p = ponto(arrasto.c, ev); const { i, ini } = arrasto; arrasto = null;
    const a = { x: Math.min(ini.x, p.x), y: Math.min(ini.y, p.y), w: Math.abs(p.x - ini.x), h: Math.abs(p.y - ini.y) };
    if (a.w > 0.01 && a.h > 0.01) est[i].mao.push(a);
    pintar(i);
  };
  m.el.addEventListener('pointerup', soltar); m.el.addEventListener('pointerleave', soltar);
  on(m.el, 'click', '[data-desfazer]', (b) => { est[Number(b.dataset.desfazer)].mao = []; pintar(Number(b.dataset.desfazer)); });

  on(m.el, 'click', '[data-aplicar-provas]', (b) => ocupado(b, async () => {
    const em = new Date().toISOString();
    const escolhas = leituras.map((l, i) => ({ l, i, resumo: limparDadosPessoais($(`[data-resumo="${i}"]`, m.el).value), guardar: $(`[data-guardar="${i}"]`, m.el).checked }));
    // Dado pessoal que a IA viu sem saber onde: só guarda o print se a pessoa desenhou alguma tarja nele.
    const pendente = escolhas.find((e) => e.guardar && est[e.i].semLocal.length && !est[e.i].mao.length);
    if (pendente) throw new Error(`Cubra o dado pessoal do print ${pendente.i + 1} arrastando o mouse sobre ele, ou desmarque "Guardar este print".`);
    if (!escolhas.some((e) => e.resumo || e.guardar)) throw new Error('Nada para guardar: escreva o texto de algum print ou marque "Guardar este print".');
    // 1) Texto: acrescenta ao campo de provas sociais (nunca sobrescreve).
    const linhas = escolhas.filter((e) => e.resumo).map((e) => linhaProva(e.resumo, em));
    const { texto, acrescentadas } = acrescentarProvas(cliente.marca?.provasSociais, linhas);
    if (acrescentadas) {
      const marca = { ...(cliente.marca || {}), provasSociais: texto };
      Object.assign(cliente, { marca }); await db.atualizar(COL.clientes, cliente.id, { marca });
    }
    // 2) Prints: a versão COM TARJA (o canvas) vai para Materiais, etiquetada "prova social".
    let salvos = 0;
    for (const e of escolhas.filter((x) => x.guardar)) {
      const c = $(`[data-tela="${e.i}"]`, m.el);
      pintarFinal(c, imgs[e.i], [...est[e.i].ia, ...est[e.i].mao]);
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
      if (!blob) continue;
      await salvarMaterial(cliente, blob, ORIGEM_PROVA, {
        etiquetas: [ETIQUETA_PROVA], descricao: e.resumo || `Print de prova social enviado em ${new Date(em).toLocaleDateString('pt-BR')}`, citacao: e.l.citacao || '',
        fonteProva: e.l.origem ? (/whats/i.test(e.l.origem) ? 'Elogio pelo WhatsApp' : `Avaliação no ${e.l.origem}`) : 'Cliente', nota: e.l.nota || null, provaEm: em,
        tarjas: est[e.i].ia.length + est[e.i].mao.length, lidoPor: comIa ? 'ia' : 'manual',
      });
      salvos++;
    }
    m.fechar(); limparEnvio?.();
    toast(`${acrescentadas} linha(s) acrescentada(s) às provas sociais${salvos ? ` e ${salvos} print(s) guardado(s) em Materiais (com tarja)` : ''}.`);
    ctx.recarregar?.();
  }));
}
/** Redesenha sem o retângulo "fantasma" do arrasto, só com as tarjas confirmadas (é isso que vai para Materiais). */
function pintarFinal(canvas, img, areas) { if (img) desenhar(canvas, img, areas); }
