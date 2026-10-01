// Embaixo das "Perguntas para montar o site e os anúncios":
//  1) "Copiar perguntas para enviar ao cliente" (todas ou só o que falta), texto leigo pronto para WhatsApp/e-mail;
//  2) "Colar a resposta do cliente": leitura LOCAL pela numeração (sem IA, sem custo) e, se não houver numeração, IA
//     (modelo leve; o mais forte só para a lista de produtos). A IA só aponta trechos que EXISTEM no texto colado;
//  3) revisão linha a linha (nada é salvo antes de "Aplicar as selecionadas"): campo vazio é preenchido, valor diferente
//     vira sugestão ("Usar a sugestão" / "Manter o meu"), nunca sobrescreve em silêncio;
//  4) "Preencher sem IA": o texto colado ao lado de cada pergunta com o campo editável.
// O texto colado é DADO: nada nele dispara ação além de preencher os campos da revisão. Senha/token/cartão são
// mascarados antes de tudo (nem vão para a IA, nem ficam guardados). O texto (mascarado) fica em cliente.respostasCliente.
import { db, COL } from '../core/storage.js';
import { lerRespostaCliente, extrairProdutosResposta } from '../core/ia.js';
import {
  PERGUNTAS, textoParaCliente, lerRespostaLocal, protegerSensivel, AVISO_SENSIVEL, LIMITE_TEXTO, planoDeRevisao, interpretar, mostrarValor,
  PAGAMENTOS_PRETENDIDOS, FORMATOS_SITE, respondidas, precoDigitado, limparRespostasIA,
} from '../lib/questionario.js';
import { normalizarRastreamento } from '../lib/rastreamento.js';
import { esc, $, $$, on, toast, ocupado, copiar, confirmar, dataBR } from '../core/ui.js';

const MAX_GUARDADAS = 5;
const ESTADO = {
  vazio: ['campo vazio, será preenchido', 'tag-ok'], conflito: ['já existe um valor diferente, será sugestão', 'tag-warn'], igual: ['já está assim, nada muda', ''],
  invalido: ['formato inválido, não será salvo', 'tag-bad'], manual: ['precisa de um clique seu', 'tag-info'], sem_resposta: ['sem resposta', ''],
};
// Resumo da última aplicação por cliente (a aba é redesenhada depois de aplicar; o "próximo passo" precisa continuar visível).
const ultimoResumo = new Map();
// Rascunho do texto colado por cliente (sobrevive ao redesenho da aba enquanto a pessoa revisa).
const sessao = new Map();

const variacoesTexto = (vs = []) => vs.map((v) => `${v.nome}: ${v.valores.join(', ')}`).join('; ');
const textoVariacoes = (t) => String(t || '').split(';').map((x) => { const [n, ...r] = x.split(':'); return { nome: n.trim(), valores: r.join(':').split(',').map((v) => v.trim()).filter(Boolean) }; }).filter((v) => v.nome && v.valores.length);

/** ctx: { cliente, produtos, get site(), salvarSite(patch), recarregar(), get qtdMateriais() } */
export function montarRespostasCliente(alvo, ctx) {
  const { cliente, produtos } = ctx;
  const s = sessao.get(cliente.id) || { texto: '', achados: [], respostas: null, entendidos: {}, via: '', manual: false };
  sessao.set(cliente.id, s);

  // ---------- desenho ----------
  function desenhar() {
    const resumo = ultimoResumo.get(cliente.id);
    const guardadas = cliente.respostasCliente || [];
    alvo.innerHTML = `
    <div class="rounded-lg border border-indigo-200 bg-indigo-50/30 p-3" data-copiar-perguntas>
      <p class="text-sm font-semibold"><i class="fa-brands fa-whatsapp mr-1 text-emerald-600"></i> Mandar as perguntas para o cliente responder</p>
      <p class="hint mb-2">Copia um texto simples, sem termos técnicos, com as perguntas numeradas por assunto. Cole no WhatsApp ou e-mail do cliente. Nunca pede senha: no Pixel, pede só o número (ID) ou um convite de administrador.</p>
      <div class="flex flex-wrap items-end gap-2">
        <label class="text-sm">Quais perguntas<select class="input mt-0.5 !w-auto" data-modo-copia><option value="todas">Todas as perguntas</option><option value="faltam">Só o que ainda falta</option></select></label>
        <label class="text-sm">Chamar o cliente de<input class="input mt-0.5 !w-48" data-nome-contato value="${esc(s.nomeContato ?? cliente.nome)}" maxlength="60"></label>
        <button type="button" class="btn-primary btn-sm" data-copiar-perg><i class="fa-solid fa-copy"></i> Copiar perguntas para enviar ao cliente</button></div>
      <p class="hint mt-1" data-qtd-copia></p>
      <div data-copiado></div>
      <details class="mt-1"><summary class="cursor-pointer text-xs text-slate-500">Ver o texto que vai ser copiado</summary><pre class="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-xs" data-previa-copia></pre></details>
    </div>

    <div class="mt-3 rounded-lg border border-slate-200 p-3" data-colar>
      <p class="text-sm font-semibold"><i class="fa-solid fa-paste mr-1 text-indigo-500"></i> Colar a resposta do cliente</p>
      <p class="hint">Cole aqui o que o cliente respondeu (WhatsApp, e-mail ou qualquer texto). O app lê e mostra o que entendeu. Nada é salvo antes de você conferir.</p>
      <p class="hint">Áudio não é lido automaticamente. Ouça e cole o texto, ou use a transcrição do WhatsApp.</p>
      <textarea class="input mt-2" rows="6" data-texto-resposta placeholder="Cole a resposta aqui…">${esc(s.texto)}</textarea>
      <p class="hint" data-contador></p>
      ${s.achados.length ? `<p class="mt-1 rounded bg-rose-50 p-2 text-sm text-rose-700" data-aviso-sensivel><i class="fa-solid fa-shield-halved"></i> ${AVISO_SENSIVEL}. (Encontrado: ${esc(s.achados.join(', '))}; aparece como •••••.)</p>` : ''}
      <p class="caption mt-2">Se a resposta vier com os números das perguntas (1., 2., 3.…), a leitura é feita pelo próprio app, <b>sem IA e sem custo</b>. Sem numeração, a IA separa os trechos (cerca de 15 s; com lista de produtos, até 1 min).</p>
      <div class="mt-1 flex flex-wrap gap-2"><button type="button" class="btn-ia btn-sm" data-ler><i class="fa-solid fa-wand-magic-sparkles"></i> Ler a resposta e mostrar o que entendi</button>
        <button type="button" class="btn-ghost btn-sm" data-sem-ia title="Mostra o texto colado ao lado de cada pergunta, para você copiar e colar"><i class="fa-solid fa-hand"></i> Preencher sem IA</button></div>
    </div>
    ${resumo ? `<div class="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" data-resumo-aplicado><p><i class="fa-solid fa-circle-check"></i> <b>${esc(resumo.texto)}</b></p>
      <p class="mt-1"><b>Próximo passo:</b> nas perguntas abaixo, cada campo que veio da resposta tem a etiqueta amarela "${esc('preenchido automaticamente da resposta do cliente, confirme ou edite')}". Confira e clique em "Confirmar" (ou edite). ${resumo.pendentes ? `Ainda faltam ${resumo.pendentes} pergunta(s): use "Só o que ainda falta" para mandar só elas.` : 'Todas as perguntas estão respondidas.'}</p></div>` : ''}
    <div data-revisao></div>
    ${guardadas.length ? `<details class="mt-3 rounded-lg border border-slate-200 p-3" data-guardadas><summary class="cursor-pointer text-sm font-medium text-slate-600">Respostas do cliente guardadas (${guardadas.length})</summary>
      <p class="hint mt-1">O texto original de cada resposta aplicada, para consulta (senhas e dados sensíveis já vêm mascarados). Entra no backup e é apagado junto com o cliente. Guardamos as últimas ${MAX_GUARDADAS}.</p>
      ${guardadas.slice().reverse().map((g) => `<div class="mt-2 rounded bg-slate-50 p-2"><div class="flex flex-wrap items-center justify-between gap-2 text-xs"><b>${esc(dataBR(g.em))} · ${g.via === 'ia' ? 'lida pela IA' : g.via === 'manual' ? 'preenchida à mão' : 'lida pela numeração'}</b>
        <button type="button" class="btn-danger btn-sm" data-apagar-guardada="${esc(g.id)}"><i class="fa-solid fa-trash"></i> Apagar este texto</button></div><pre class="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs">${esc(g.texto)}</pre></div>`).join('')}</details>` : ''}`;
    atualizarCopia(); contar();
    if (s.respostas) desenharRevisao();
  }

  function atualizarCopia() {
    const r = textoParaCliente({ cliente, site: ctx.site, produtos, materiais: ctx.qtdMateriais, modo: $('[data-modo-copia]', alvo).value, nomeContato: $('[data-nome-contato]', alvo).value.trim() });
    $('[data-previa-copia]', alvo).textContent = r.texto;
    $('[data-qtd-copia]', alvo).textContent = `${r.quantidade} pergunta(s) no texto.`;
    return r;
  }
  function contar() {
    const t = $('[data-texto-resposta]', alvo).value;
    const passou = t.length > LIMITE_TEXTO;
    const c = $('[data-contador]', alvo);
    c.textContent = passou ? `O texto tem ${t.length.toLocaleString('pt-BR')} caracteres; o limite é ${LIMITE_TEXTO.toLocaleString('pt-BR')}. Cole em partes (ex.: primeiro as perguntas 1 a 9, aplique, depois o resto).` : `${t.length.toLocaleString('pt-BR')} de ${LIMITE_TEXTO.toLocaleString('pt-BR')} caracteres.`;
    c.className = passou ? 'hint font-medium text-rose-600' : 'hint';
    $$('[data-ler], [data-sem-ia]', alvo).forEach((b) => { b.disabled = passou || !t.trim(); });
  }

  // ---------- revisão ----------
  function controle(p, v, id) {
    const a = `data-ent="${id}"`;
    switch (p.tipo) {
      case 'produtos': {
        const lista = v?.length ? v : s.manual ? [{ nome: '', descricao: '', preco: null, variacoes: [] }] : [];
        return `<div class="space-y-1" data-produtos>${lista.map((x, i) => `<div class="grid gap-1 rounded border border-slate-200 p-1 sm:grid-cols-[auto_1.2fr_2fr_0.7fr_1.5fr]" data-prod-linha>
          <label class="flex items-center gap-1 text-xs"><input type="checkbox" data-prod-sel checked> ${i + 1}</label>
          <input class="input !py-1 text-sm" data-prod="nome" value="${esc(x.nome)}" placeholder="Nome">
          <input class="input !py-1 text-sm" data-prod="descricao" value="${esc(x.descricao)}" placeholder="Descrição">
          <span class="flex items-center gap-1"><input class="input !py-1 text-sm" data-prod="preco" inputmode="decimal" value="${x.preco ?? ''}" placeholder="Preço">${x.preco == null ? '<span class="tag tag-warn whitespace-nowrap">sem preço</span>' : ''}</span>
          <input class="input !py-1 text-sm" data-prod="variacoes" value="${esc(variacoesTexto(x.variacoes))}" placeholder="Tamanho: P, M; Cor: preto"></div>`).join('')}
          ${s.manual ? '<button type="button" class="btn-ghost btn-sm" data-prod-mais>+ Outro produto</button>' : ''}
          ${s.respostas?.produtos && s.via !== 'ia-produtos' ? '<button type="button" class="btn-ia btn-sm" data-prod-ia title="Usa o modelo mais forte só para esta lista"><i class="fa-solid fa-wand-magic-sparkles"></i> Separar os produtos com IA (mais preciso)</button>' : ''}
          <p class="hint">Preço só entra se o cliente escreveu; sem preço, o produto fica "sob consulta" no site até você completar. Produtos com o mesmo nome de um já cadastrado não são duplicados.</p></div>`;
      }
      case 'anuncios': return `<div class="grid gap-1 sm:grid-cols-3"><select class="input !py-1" ${a} data-sub="anuncia"><option value="">—</option><option value="nao" ${v && !v.anuncia ? 'selected' : ''}>Ainda não anuncia</option><option value="sim" ${v?.anuncia ? 'selected' : ''}>Já anuncia</option></select>
        <input class="input !py-1" ${a} data-sub="orcamentoDiario" inputmode="decimal" value="${v?.orcamentoDiario ?? ''}" placeholder="Por dia (R$)"><input class="input !py-1" ${a} data-sub="cpaMedio" inputmode="decimal" value="${v?.cpaMedio ?? ''}" placeholder="Por venda (R$)"></div>`;
      case 'pixel': return `<div class="grid gap-1 sm:grid-cols-2"><input class="input !py-1" ${a} data-sub="metaPixelId" value="${esc(v?.metaPixelId || '')}" placeholder="ID do Pixel do Meta"><input class="input !py-1" ${a} data-sub="googleAdsId" value="${esc(v?.googleAdsId || '')}" placeholder="AW-123456789"></div>
        <label class="mt-1 flex items-center gap-1 text-xs"><input type="checkbox" ${a} data-sub="semPixel" ${v?.semPixel ? 'checked' : ''}> Cliente disse que ainda não tem</label>`;
      case 'pagamento': return `<select class="input !py-1" ${a}><option value="">—</option>${PAGAMENTOS_PRETENDIDOS.map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
      case 'formato': return `<select class="input !py-1" ${a}><option value="">—</option>${FORMATOS_SITE.map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
      case 'links': return `<p class="text-sm">${esc(mostrarValor(p, v) || '(sem endereço)')}</p>${v?.site ? `<button type="button" class="btn-ia btn-sm mt-1" data-ler-site="${esc(v.site)}"><i class="fa-solid fa-wand-magic-sparkles"></i> Ler o site e preencher o perfil</button><p class="hint">Leva o endereço para a pergunta 11; lá você confirma que é o site do próprio cliente e o app lê.</p>` : ''}`;
      default: return `<textarea class="input !py-1 text-sm" rows="${p.id === 'objecoes' || p.id === 'provas' ? 3 : 2}" ${a}>${esc(v ?? '')}</textarea>`;
    }
  }

  function linhaHTML(l) {
    const p = l.pergunta; const [rot, cor] = ESTADO[l.estado];
    const aplicavel = s.manual || ['vazio', 'conflito', 'invalido'].includes(l.estado); // inválido: dá para corrigir no campo e marcar
    return `<li class="rounded-lg border ${l.estado === 'conflito' ? 'border-amber-300' : l.estado === 'invalido' ? 'border-rose-300' : 'border-slate-200'} p-2" data-linha="${p.id}">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm font-semibold">${aplicavel && l.estado !== 'conflito' ? `<input type="checkbox" class="mr-1" data-sel="${p.id}" ${l.estado === 'vazio' ? 'checked' : ''}>` : ''}${p.n}. ${esc(p.titulo)}</p>${s.manual ? '' : `<span class="tag ${cor}">${rot}</span>`}</div>
      ${l.escrito && !s.manual ? `<p class="mt-1 text-xs text-slate-500">O cliente escreveu:</p><p class="whitespace-pre-wrap rounded bg-slate-50 p-1 text-sm">${esc(l.escrito.length > 700 ? `${l.escrito.slice(0, 700)}…` : l.escrito)}</p>` : ''}
      <p class="mt-1 text-xs text-slate-500">${s.manual ? 'Copie do texto e cole aqui:' : 'O app entendeu (dá para corrigir):'}</p>${controle(p, l.entendido, p.id)}
      <p class="hint mt-1">Vai para: ${esc(p.destino)}</p>
      ${l.motivo ? `<p class="mt-1 text-xs ${l.estado === 'invalido' ? 'text-rose-700' : 'text-slate-600'}">${esc(l.motivo)}</p>` : ''}
      ${l.estado === 'conflito' && !s.manual ? `<div class="mt-1 rounded bg-amber-50 p-2 text-sm text-amber-800"><p>Hoje está: <b>${esc(String(l.atual).slice(0, 300))}</b></p>
        <div class="mt-1 flex flex-wrap gap-3"><label class="flex items-center gap-1"><input type="radio" name="cf_${p.id}" value="manter" data-conflito="${p.id}" checked> Manter o meu</label><label class="flex items-center gap-1"><input type="radio" name="cf_${p.id}" value="usar" data-conflito="${p.id}"> Usar a sugestão</label></div></div>` : ''}</li>`;
  }

  function desenharRevisao() {
    const linhas = planoDeRevisao({ cliente, site: ctx.site, produtos }, s.respostas || {}, s.entendidos);
    const mostrar = s.manual ? linhas : linhas.filter((l) => l.estado !== 'sem_resposta');
    const sem = linhas.filter((l) => l.estado === 'sem_resposta');
    const alvoR = $('[data-revisao]', alvo);
    alvoR.innerHTML = `<div class="mt-3 rounded-lg border-2 border-indigo-300 p-3" data-painel-revisao>
      <p class="text-sm font-semibold"><i class="fa-solid fa-list-check mr-1"></i> ${s.manual ? 'Preencher sem IA' : 'Revisão: confira antes de aplicar'}</p>
      <p class="hint">${s.manual ? 'O texto do cliente fica ao lado. Copie o trecho de cada resposta para o campo da pergunta; marque as que quer aplicar. Campo que já tem valor diferente não é trocado: vira sugestão para você decidir.' : `Lido ${s.via === 'local' ? 'pela numeração, sem IA e sem custo' : 'pela IA'}. Nada foi salvo ainda. Marque o que quer aplicar; onde já existe um valor diferente, escolha "Manter o meu" ou "Usar a sugestão".`}</p>
      <div class="${s.manual ? 'mt-2 grid gap-3 lg:grid-cols-2' : 'mt-2'}">
        ${s.manual ? `<div><p class="text-xs text-slate-500">Texto do cliente:</p><pre class="sticky top-20 max-h-[70vh] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-sm" data-texto-lado>${esc(s.texto)}</pre></div>` : ''}
        <ol class="space-y-2">${mostrar.map(linhaHTML).join('')}</ol></div>
      ${!s.manual && sem.length ? `<p class="mt-2 text-sm text-slate-600"><b>Sem resposta (${sem.length}):</b> ${sem.map((l) => l.pergunta.n).join(', ')}. Nada foi preenchido nelas por suposição.</p>` : ''}
      <div class="mt-3 flex flex-wrap items-center gap-2"><button type="button" class="btn-primary" data-aplicar><i class="fa-solid fa-check"></i> Aplicar as selecionadas</button>
        <button type="button" class="btn-ghost" data-cancelar-revisao>Cancelar (não salva nada)</button></div></div>`;
  }

  /** Lê da tela o que a pessoa corrigiu em cada linha. */
  function coletar() {
    const ent = {};
    for (const p of PERGUNTAS) {
      const li = $(`[data-linha="${p.id}"]`, alvo); if (!li) continue;
      const campos = $$(`[data-ent="${p.id}"]`, li);
      if (p.tipo === 'produtos') {
        ent[p.id] = $$('[data-prod-linha]', li).filter((d) => $('[data-prod-sel]', d).checked).map((d) => {
          const g = (k) => $(`[data-prod="${k}"]`, d).value.trim();
          const preco = precoDigitado(g('preco'));
          return { nome: g('nome'), descricao: g('descricao'), preco: preco > 0 ? preco : null, variacoes: textoVariacoes(g('variacoes')) };
        }).filter((x) => x.nome);
      } else if (['anuncios', 'pixel'].includes(p.tipo)) {
        const o = {}; campos.forEach((c) => { o[c.dataset.sub] = c.type === 'checkbox' ? c.checked : c.value.trim(); });
        if (p.tipo === 'anuncios') ent[p.id] = o.anuncia ? { anuncia: o.anuncia === 'sim', orcamentoDiario: Number(String(o.orcamentoDiario).replace(',', '.')) || null, cpaMedio: Number(String(o.cpaMedio).replace(',', '.')) || null } : null;
        else ent[p.id] = o.semPixel ? { semPixel: true } : (o.metaPixelId || o.googleAdsId) ? { metaPixelId: o.metaPixelId, googleAdsId: o.googleAdsId } : null;
      } else if (p.tipo === 'links') ent[p.id] = s.entendidos[p.id] ?? interpretar(p, s.respostas?.[p.id] || '');
      else ent[p.id] = campos[0] ? (campos[0].value.trim() || null) : null;
    }
    return ent;
  }

  // ---------- aplicar ----------
  async function aplicar() {
    const ent = coletar();
    Object.assign(s.entendidos, ent);
    // No modo manual, o que foi digitado é a própria resposta.
    const respostas = { ...(s.respostas || {}) };
    if (s.manual) for (const p of PERGUNTAS) if (ent[p.id] != null && !(Array.isArray(ent[p.id]) && !ent[p.id].length)) respostas[p.id] = respostas[p.id] || mostrarValor(p, ent[p.id]) || 'preenchido à mão';
    const linhas = planoDeRevisao({ cliente, site: ctx.site, produtos }, respostas, ent);
    const sel = (id) => $(`[data-sel="${id}"]`, alvo)?.checked;
    const usar = (id) => $(`[data-conflito="${id}"]:checked`, alvo)?.value === 'usar';
    const agora = new Date().toISOString();
    const marcaAuto = { origem: 'resposta', em: agora };
    const patch = { marca: { ...(cliente.marca || {}) }, autoPreenchido: { ...(cliente.autoPreenchido || {}) } };
    const sitePatch = {};
    const novos = [];
    let feitos = 0; const ignorados = [], invalidos = [];
    for (const l of linhas) {
      const p = l.pergunta, v = l.entendido;
      const vai = (l.estado === 'vazio' && sel(p.id)) || (l.estado === 'conflito' && usar(p.id));
      if (l.estado === 'conflito' && !usar(p.id) && (sel(p.id) || !s.manual)) ignorados.push(p.n);
      if (l.estado === 'invalido' && sel(p.id)) invalidos.push(p.n);
      if (!vai) continue;
      feitos++;
      switch (p.tipo) {
        case 'texto': patch.marca[p.campo] = v; patch.autoPreenchido[p.campo] = marcaAuto; break;
        case 'url': patch.siteReferencia = v; patch.autoPreenchido.siteReferencia = marcaAuto; break;
        case 'anuncios':
          patch.estagio = v.anuncia ? 'rodando' : cliente.estagio === 'rodando' ? 'novo' : cliente.estagio || 'novo';
          patch.historico = v.anuncia ? { ...(cliente.historico || {}), ...(v.orcamentoDiario ? { orcamentoDiario: v.orcamentoDiario } : {}), ...(v.cpaMedio ? { cpaMedio: v.cpaMedio } : {}) } : cliente.historico || {};
          patch.marca.jaAnuncia = v.anuncia ? 'sim' : 'nao'; patch.autoPreenchido.anuncios = marcaAuto; break;
        case 'pixel':
          if (v.semPixel) sitePatch.semPixel = true;
          else { const { valor } = normalizarRastreamento({ metaPixelId: v.metaPixelId, googleAdsId: v.googleAdsId }); patch.rastreamento = { ...(cliente.rastreamento || {}), metaPixelId: valor.metaPixelId, googleAdsId: valor.googleAdsId, googleAdsRotulo: valor.googleAdsRotulo }; }
          patch.autoPreenchido.pixel = marcaAuto; break;
        case 'pagamento': sitePatch.pagamentoPreferido = v; patch.autoPreenchido.pagamento = marcaAuto; break;
        case 'formato': Object.assign(sitePatch, FORMATOS_SITE.find(([k]) => k === v)[2]); patch.autoPreenchido.formato = marcaAuto; break;
        case 'produtos': {
          const existentes = new Set(produtos.map((x) => x.nome.trim().toLowerCase()));
          for (const x of v) if (!existentes.has(x.nome.trim().toLowerCase())) { novos.push(x); existentes.add(x.nome.trim().toLowerCase()); }
          break;
        }
        default: break;
      }
    }
    if (invalidos.length) toast(`Pergunta(s) ${invalidos.join(', ')}: formato inválido, não foi salvo. Corrija o valor ou deixe para depois.`, 'erro');
    if (!feitos) return toast('Nada marcado para aplicar. Marque as linhas (ou escolha "Usar a sugestão") e tente de novo.', 'erro');
    const guardada = { id: `r${Date.now().toString(36)}`, em: agora, via: s.manual ? 'manual' : s.via === 'local' ? 'local' : 'ia', texto: s.texto.slice(0, LIMITE_TEXTO) };
    patch.respostasCliente = [...(cliente.respostasCliente || []), guardada].slice(-MAX_GUARDADAS);
    await db.atualizar(COL.clientes, cliente.id, patch);
    Object.assign(cliente, patch);
    if (Object.keys(sitePatch).length) await ctx.salvarSite(sitePatch);
    for (const x of novos) {
      const criado = await db.criar(COL.produtos, { clienteId: cliente.id, nome: x.nome, descricao: x.descricao || '', preco: x.preco ?? '', precoPromocional: '', categoria: '', variacoes: x.variacoes || [], fotos: [], destaque: false, origemAuto: { origem: 'resposta', em: agora } });
      produtos.push(criado);
    }
    const pendentes = 18 - Object.values(respondidas(cliente, ctx.site, produtos, ctx.qtdMateriais)).filter(Boolean).length;
    ultimoResumo.set(cliente.id, { texto: `Aplicado: ${feitos} resposta(s)${novos.length ? `, com ${novos.length} produto(s) novo(s)` : ''}.${ignorados.length ? ` Mantidos os seus valores nas perguntas ${ignorados.join(', ')}.` : ''}`, pendentes });
    sessao.set(cliente.id, { texto: '', achados: [], respostas: null, entendidos: {}, via: '', manual: false });
    toast('Respostas aplicadas.');
    ctx.recarregar();
  }

  // ---------- leitura ----------
  function prepararTexto() {
    const bruto = $('[data-texto-resposta]', alvo).value;
    if (bruto.length > LIMITE_TEXTO) { toast(`O texto passou do limite de ${LIMITE_TEXTO.toLocaleString('pt-BR')} caracteres. Cole em partes.`, 'erro'); return null; }
    const prot = protegerSensivel(bruto);
    Object.assign(s, { texto: prot.texto, achados: prot.achados, entendidos: {} });
    return prot.texto;
  }
  async function ler(b) {
    const texto = prepararTexto(); if (!texto?.trim()) return;
    await ocupado(b, async () => {
      const local = lerRespostaLocal(texto);
      if (local.numerada && Object.keys(local.respostas).length) Object.assign(s, { respostas: local.respostas, via: 'local', manual: false });
      else {
        const r = await lerRespostaCliente({ cliente, texto, perguntas: PERGUNTAS.map(({ id, n, titulo }) => ({ id, n, titulo })) });
        Object.assign(s, { respostas: limparRespostasIA(r.respostas, texto), via: 'ia', manual: false });
        if (s.respostas.produtos) {
          const lista = await extrairProdutosResposta({ cliente, trecho: s.respostas.produtos });
          if (lista.length) { s.entendidos.produtos = lista; s.via = 'ia-produtos'; }
        }
      }
      desenhar();
      $('[data-painel-revisao]', alvo)?.scrollIntoView({ block: 'start' });
      toast(Object.keys(s.respostas).length ? 'Pronto. Confira a revisão e clique em "Aplicar as selecionadas".' : 'Não encontrei respostas nesse texto. Tente "Preencher sem IA".', Object.keys(s.respostas).length ? 'info' : 'erro');
    });
  }

  // ---------- eventos ----------
  // Digitar/corrigir numa linha já marca a linha para aplicar.
  on(alvo, 'input', '[data-ent], [data-prod]', (el) => { const cb = el.closest('[data-linha]')?.querySelector('[data-sel]'); if (cb) cb.checked = true; });
  on(alvo, 'change', '[data-modo-copia]', atualizarCopia);
  on(alvo, 'input', '[data-nome-contato]', (i) => { s.nomeContato = i.value; atualizarCopia(); });
  on(alvo, 'click', '[data-copiar-perg]', async () => {
    const r = atualizarCopia();
    if (!(await copiar(r.texto))) {
      $('[data-copiado]', alvo).innerHTML = '<p class="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-800">Não consegui copiar sozinho. Abra "Ver o texto que vai ser copiado", selecione tudo e copie com Ctrl+C.</p>';
      alvo.querySelector('[data-previa-copia]')?.closest('details')?.setAttribute('open', '');
      return;
    }
    $('[data-copiado]', alvo).innerHTML = `<p class="mt-2 rounded bg-emerald-50 p-2 text-sm text-emerald-800"><i class="fa-solid fa-circle-check"></i> <b>Copiado. Cole no WhatsApp ou e-mail do cliente.</b><br>Próximo passo: quando ele responder, cole a resposta aqui embaixo.</p>`;
  });
  on(alvo, 'input', '[data-texto-resposta]', (t) => { s.texto = t.value; contar(); });
  on(alvo, 'click', '[data-ler]', (b) => ler(b));
  on(alvo, 'click', '[data-sem-ia]', () => {
    const texto = prepararTexto(); if (!texto?.trim()) return;
    const local = lerRespostaLocal(texto); // se vier numerado, já adianta os campos (sem custo)
    Object.assign(s, { respostas: local.respostas, via: 'manual', manual: true });
    desenhar(); $('[data-painel-revisao]', alvo)?.scrollIntoView({ block: 'start' });
  });
  on(alvo, 'click', '[data-cancelar-revisao]', () => { Object.assign(s, { respostas: null, entendidos: {}, manual: false }); desenhar(); toast('Revisão cancelada. Nada foi salvo.', 'info'); });
  on(alvo, 'click', '[data-aplicar]', (b) => ocupado(b, aplicar));
  on(alvo, 'click', '[data-prod-mais]', () => { Object.assign(s.entendidos, coletar()); s.entendidos.produtos = [...(s.entendidos.produtos || []), { nome: '', descricao: '', preco: null, variacoes: [] }]; desenharRevisao(); });
  on(alvo, 'click', '[data-prod-ia]', (b) => ocupado(b, async () => {
    const lista = await extrairProdutosResposta({ cliente, trecho: s.respostas.produtos });
    if (!lista.length) return toast('A IA não encontrou produtos nesse trecho. Corrija à mão nas linhas.', 'erro');
    Object.assign(s.entendidos, coletar(), { produtos: lista }); s.via = 'ia-produtos'; desenharRevisao();
    toast(`${lista.length} produto(s) separados pela IA. Confira preço e variações antes de aplicar.`, 'info');
  }));
  on(alvo, 'click', '[data-ler-site]', (b) => {
    const input = document.querySelector('[data-link-presenca]');
    if (!input) return toast('Abra a pergunta 11 para ler o site.', 'erro');
    input.value = b.dataset.lerSite;
    input.closest('li')?.scrollIntoView({ block: 'center' });
    input.closest('li')?.classList.add('ring-2', 'ring-indigo-400');
    toast('Endereço levado para a pergunta 11. Marque "Confirmo que é o site do próprio cliente" e clique em "Ler o site e preencher o perfil".', 'info');
  });
  on(alvo, 'click', '[data-apagar-guardada]', async (b) => {
    if (!(await confirmar('Apagar este texto guardado? As respostas que já foram aplicadas continuam nos campos.', 'Apagar texto'))) return;
    const respostasCliente = (cliente.respostasCliente || []).filter((g) => g.id !== b.dataset.apagarGuardada);
    await db.atualizar(COL.clientes, cliente.id, { respostasCliente }); cliente.respostasCliente = respostasCliente;
    toast('Texto apagado.'); desenhar();
  });

  desenhar();
}
