// Aba Site/Loja = "Montar site": um fluxo guiado de 6 passos (lib/etapas-site.js) para os dois modos — "custom" (site
// HTML exportável) e "pacote_plataforma" (CSV + textos para Shopify/Nuvemshop). Os passos reaproveitam os componentes
// de sempre (questionário, Materiais, "Como eu quero o site", ajustes rápidos, "Ajustar este site", Clientes reais,
// Aprovações do site); nenhum passo é trancado. Rota: #/c/<cliente>/site/<1-6>; sem número, abre no 1º com "Falta algo".
// Nunca processa pagamento: só marca o ponto de encaixe de checkout de terceiros.
import { db, COL } from '../core/storage.js';
import { gerarConteudoSite, gerarTextosPacote, gerarFaqSite, objecoesDe, ajustarSite } from '../core/ia.js';
import { gerarSiteHTML, faqValida, FORMAS_PAGAMENTO, PAGAMENTOS_PADRAO } from '../lib/sitegen.js';
import { montarPerguntasSite, progressoSite, PAGAMENTOS_PRETENDIDOS, TOTAL_PERGUNTAS } from './perguntas-site.js';
import { csvShopify, csvNuvemshop, slug, comTextosDoPacote } from '../lib/csv.js';
import { criarPdf } from '../lib/pdf.js';
import { rastreamentoDe, passosRastreamentoPacote, passosExtrasPacote, indicadorPixel } from '../lib/rastreamento.js';
import { temCustom, temPacote, baseDoCustom, baseDoPacote, aplicarBaseNoPacote, aplicarBaseNoCustom, divergencias, baseParaGerar, AVISO_MODOS } from '../lib/site-modos.js';
import { criarZip } from '../lib/zip.js';
import { etiquetaSite } from '../lib/aprovacao-site.js';
import { estadoDoSite, registrarVersao, versoesDoModo, aplicarOperacoes, resumoMudancas, normalizarLayout, nomeBloco } from '../lib/site-blocos.js';
import { normalizarVisual, nomeSecaoLoja, imagensParaBanner, printsDoCliente, semRepetirDepoimentos, AJUSTES_FOTO } from '../lib/visual-site.js';
import { printsPainelHtml, abrirBorrar, autorizarPrints, baixarPrintsZip } from './prints-clientes.js';
import { montarAjusteSite } from './ajuste-site.js';
import { provasEmImagem, depoimentoDeProva, mesclarProvasNoSite, depoimentoGerido, EXIBICOES_PROVA, ORIGEM_PROVA, montarDepoimentos, temProvaReal, resumoMaterialSite, linhasDeProva, ehModelo } from '../lib/prova-social.js';
import { PLATAFORMAS, STATUS_SITE } from '../lib/constantes.js';
import { esc, $, on, montar, cabecalho, iaNota, tag, dataBR, moeda, toast, ocupado, lerForm, opcoes, baixarTexto, listaDeLinhas, copiar, mostrarResultado, confirmar } from '../core/ui.js';
import { dadosDoPacote, gruposPlataforma, gerarPreviaLojaHTML } from '../lib/pacote-loja.js';
import { previaLojaHtml, ligarPreviaLoja } from './previa-loja.js';
import { lerReferencias, aplicarReferencias, comUsos, produtosComFotos, imagemDoLugar, arquivosPorPasta, rotuloFoto, temCodigo, resumoUsos, porCodigo, slidesDoBanner } from '../lib/fotos-site.js';
import { desenharArquivo, limparCache } from '../lib/recortes-canvas.js';
import { garantirCodigos, salvarUsos, desfazerMigracaoFotos } from '../lib/materiais.js';
import { preferenciasHtml, referenciaExtraHtml, ligarPreferencias, resultadoFotosTextoHtml } from './preferencias-site.js';
import { provaSocialHtml, ligarProvaSocial } from './prova-social.js';
import { logoHtml, ligarLogo } from './logo-cliente.js';
import { abrirMateriais } from './materiais-cliente.js';
import { excluirMateriais } from './excluir-material.js';
import { abrirProduto, garantirMigracaoFotos } from './produtos.js';
import { ETAPAS, STATUS_ETAPA, statusEtapas, primeiraEtapaComFalta, plataformaDoSite, patchPlataforma, PLATAFORMAS_SITE, TEMAS_SHOPIFY, nomeTema } from '../lib/etapas-site.js';
import { itensAceitos, aplicacaoDoPlano, checklistObrigatorio, itensFaltando, recursosDoSite, TIPOS_PEDIDO } from '../lib/plano-site.js';
import { blocoAnaliseHtml, ligarAnalise, planoAplicado, conferenciaHtml, conferirPlano, abrirPlanoDaVersao, tarefasLojaHtml } from './plano-site.js';
import { resumoBlocosSite } from './ajuste-site.js';

/** { materialId: usos } (rascunho do "Ajustar este site") -> patches para comUsos. */
const patchesDe = (usosFotos) => Object.entries(usosFotos || {}).map(([id, usos]) => ({ id, usos }));

/** `visual` devolvido pela IA na geração (só quando as preferências pedem) -> operações validadas por aplicarOperacoes. */
// Só preenche o que ainda não foi escolhido (mesma regra do app de "só preencher o vazio"): uma escolha feita à mão
// (ajustes rápidos ou "Ajustar este site") nunca é desfeita por uma geração nova.
function opsDoVisual(v, modo, site, materiais = []) {
  if (!v || typeof v !== 'object') return [];
  const salvo = (modo === 'custom' ? site?.layout : site?.pacote?.visual) || {};
  const temBanner = modo === 'custom' ? Boolean(salvo.imagens?.hero) : Boolean(salvo.banner);
  const ops = [];
  if (['contain', 'cover'].includes(v.ajusteFotos) && !salvo.ajusteFotos) ops.push({ op: 'fotos', ajuste: v.ajusteFotos });
  if (v.bannerMaterialId && !temBanner && !imagemDoLugar(materiais, 'banner')) ops.push({ op: 'imagem', bloco: modo === 'custom' ? 'hero' : 'banner', materialId: String(v.bannerMaterialId) });
  if (!Array.isArray(salvo.ordem) || !salvo.ordem.length) {
    const ordem = Array.isArray(v.ordem) ? v.ordem.map(String) : [];
    for (let i = 1; i < ordem.length; i++) ops.push({ op: 'mover', bloco: ordem[i], depoisDe: ordem[i - 1] });
    for (const k of Array.isArray(v.ocultar) ? v.ocultar : []) ops.push({ op: 'ocultar', bloco: String(k) });
  }
  return ops;
}

// Depois de "Gerar site" a aba é redesenhada: o pedido de rolar até a prévia sobrevive aqui.
const mostrarDepoisDeGerar = new Set();

const nomePlat = (v) => (PLATAFORMAS.find(([k]) => k === v) || [, v])[1];

const extDoArquivo = (nome) => String(nome || '').split('.').pop().toLowerCase();
/** Criativo aprovado -> depoimento (nome do cliente, hook como texto, mídia anexada se houver). */
export function criativoParaDepoimento(cliente, criativo) {
  return {
    nome: cliente.nome, texto: criativo.hook || criativo.copy?.slice(0, 200) || '', origem: 'criativo', criativoId: criativo.id,
    midiaUrl: criativo.arquivoUrl || null, midiaTipo: criativo.arquivoUrl ? (['mp4', 'mov', 'webm'].includes(extDoArquivo(criativo.arquivoNome)) ? 'video' : 'imagem') : null,
  };
}
/** Substitui só os depoimentos de origem "criativo" pelos novos; os escritos à mão (sem origem) ficam intactos. */
export function mesclarDepoimentos(atuais = [], novos = []) {
  return [...atuais.filter((d) => d.origem !== 'criativo'), ...novos];
}

/** FAQ <-> texto do formulário: uma pergunta por linha, "pergunta | resposta". */
export const faqParaTexto = (faq = []) => faq.map((f) => `${f.p} | ${f.r}`).join('\n');
export const textoParaFaq = (txt) => listaDeLinhas(txt).map((l) => { const [p, ...r] = l.split('|'); return { p: p.trim(), r: r.join('|').trim() }; }).filter((f) => f.p);
/** Sem IA: uma linha por objeção, já em forma de pergunta, com a resposta em branco para completar. */
export const perguntasDasObjecoes = (cliente) => objecoesDe(cliente).map((o) => `${/[?？]$/.test(o) ? o : o.charAt(0).toUpperCase() + o.slice(1) + '?'} | `).join('\n');

/** Passo pedido na rota (#/c/<id>/site/<n>), ou null. */
export const passoDaRota = (hash = typeof location !== 'undefined' ? location.hash : '') => { const n = Number((/^#\/c\/[^/]+\/site\/(\d)/.exec(hash) || [])[1]); return n >= 1 && n <= 6 ? n : null; };
export const rotaDoPasso = (clienteId, n) => `#/c/${clienteId}/site/${n}`;

const COR_STATUS = { completo: 'bg-emerald-50 text-emerald-800 border-emerald-300', falta: 'bg-amber-50 text-amber-800 border-amber-300', opcional: 'bg-slate-100 text-slate-600 border-slate-300' };
const ICONE_STATUS = { completo: 'circle-check', falta: 'circle-exclamation', opcional: 'circle-minus' };

export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  await garantirMigracaoFotos(cliente); // fotos dos produtos: um lugar só (Materiais), mesmos arquivos
  const [produtosBase, sites, criativos, materiais, aprovacoes, respostasAprov] = await Promise.all([
    db.listar(COL.produtos, { clienteId: cliente.id }), db.listar(COL.sites, { clienteId: cliente.id }), db.listar(COL.criativos, { clienteId: cliente.id }),
    db.listar(COL.materiais, { clienteId: cliente.id }), db.listar(COL.aprovacoes, { clienteId: cliente.id }).catch(() => []), db.listar(COL.respostas, { clienteId: cliente.id }).catch(() => []),
  ]);
  materiais.splice(0, materiais.length, ...(await garantirCodigos(cliente, materiais).catch(() => materiais))); // F1, F2... (lib/fotos-site.js)
  // Produtos como o site os vê: fotos lidas de Materiais ("Usar em"), nunca uma cópia.
  const produtosComF = () => produtosComFotos(produtosBase, materiais);
  const produtos = produtosBase; // nomes, preços, variações: a fonte é a aba Produtos
  const etiquetaAprov = etiquetaSite(aprovacoes, respostasAprov); // "Aprovado v3", "Ajuste pedido v3"... (passo 5)
  let site = sites[0] || null;
  const marcados = criativos.filter((c) => c.provaSocial && ['aprovado', 'em_uso', 'pausado'].includes(c.status));

  const salvarSite = async (patch) => {
    if (site) { await db.atualizar(COL.sites, site.id, patch); Object.assign(site, patch); }
    else site = await db.criar(COL.sites, { clienteId: cliente.id, status: 'rascunho', versaoManual: 0, ...patch });
  };
  // Mudança de conteúdo fora do "Ajustar este site" (formulário, geração com IA, sincronizar): se o site já tem versões,
  // vira versão também (o "Voltar para esta versão" continua fiel); uma mudança proposta em aberto é descartada.
  const salvarEVersionar = async (patch, resumo, modo = site?.modo === 'custom' ? 'custom' : 'pacote') => {
    const extra = {};
    if (site?.rascunhoAjuste?.modo === modo) { extra.rascunhoAjuste = null; toast('A mudança proposta em "Ajustar este site" foi descartada, porque o conteúdo mudou por outro caminho.', 'info'); }
    if (versoesDoModo(site, modo).length) Object.assign(extra, registrarVersao(site, { modo, estadoAntes: estadoDoSite(site, modo), estadoDepois: estadoDoSite({ ...site, ...patch }, modo), resumo, origem: 'formulario' }));
    await salvarSite({ ...patch, ...extra });
  };

  // ---------- navegação entre os passos ----------
  const etapas = statusEtapas({ cliente, site, produtos: produtosComF(), materiais, etiquetaAprov });
  const pedido = passoDaRota();
  const passo = pedido || primeiraEtapaComFalta(etapas);
  if (!pedido && typeof history !== 'undefined') history.replaceState(null, '', rotaDoPasso(cliente.id, passo)); // sem recarregar
  const irPara = (n) => { location.hash = rotaDoPasso(cliente.id, n); };
  const irParaGerar = () => irPara(4);
  const custom = site?.modo === 'custom';
  const plat = plataformaDoSite(site);
  const gerado = plat ? (custom ? temCustom(site) : temPacote(site)) : false;
  const modoV = custom ? 'custom' : 'pacote';

  // "F3 no banner, F5 no Thermora" (texto "Como eu quero o site"): aplica como se fosse o seletor "Usar em", marcado
  // "definido pelo texto". Sem IA. O seletor e a escolha direta do modo vencem; conflito e código que não existe ficam
  // guardados no site (site.fotosTexto) e aparecem no passo 4 até a próxima aplicação.
  // Com um plano aplicado para o texto atual ("Analisar meu pedido"), as fotos vêm SÓ dos itens aceitos do plano.
  const aplicarFotosTexto = async () => {
    const mats = await garantirCodigos(cliente, await db.listar(COL.materiais, { clienteId: cliente.id }));
    const pl = planoAplicado(site);
    const doPlano = pl && pl.base?.texto === String(cliente.preferenciasSite?.texto || '').trim();
    const { refs, avisos } = doPlano ? { refs: aplicacaoDoPlano(itensAceitos(pl), { modo: modoV, materiais: mats, produtos }).refs, avisos: [] } : lerReferencias(cliente.preferenciasSite?.texto || '', { materiais: mats, produtos });
    const L = normalizarLayout(site?.layout);
    const direta = site?.modo === 'custom' ? { banner: L.imagens.hero || null, sobre: L.imagens.marca || null } : { banner: normalizarVisual(site?.pacote?.visual).banner };
    const r = aplicarReferencias(mats, refs, { direta, produtos });
    await salvarUsos(r.patches);
    materiais.splice(0, materiais.length, ...comUsos(mats, r.patches));
    const fotosTexto = { em: new Date().toISOString(), aplicadas: r.aplicadas, conflitos: r.conflitos, avisos };
    if (site) await salvarSite({ fotosTexto });
    document.dispatchEvent(new CustomEvent('gcc:materiais', { detail: { clienteId: cliente.id, lista: [...materiais] } }));
    return fotosTexto;
  };

  // O ÚNICO "Gerar site" (passo 4). Se o OUTRO modo já foi gerado e este ainda não, a base (textos principais, cores,
  // FAQ, depoimentos) vem de lá e é reaplicada por cima do que a IA escrever (lib/site-modos.js).
  const gerarComIa = (b) => ocupado(b, () => gerarConteudo());
  async function gerarConteudo({ irParaPasso4 = true } = {}) {
    if (!plat) { toast('Escolha a plataforma no passo 3 ("Como quero") antes de gerar.', 'erro'); return; }
    if (!produtos.length && !custom) { toast('Cadastre pelo menos um produto (passo 2) antes de gerar o pacote.', 'erro'); return; }
    await aplicarFotosTexto(); // antes da IA: a imagem do banner escolhida pelo texto não é trocada por ela
    // Plano aplicado: os itens aceitos entram como lista OBRIGATÓRIA (lib/plano-site.js checklistObrigatorio).
    // Com plano aplicado para o texto atual, só os itens aceitos valem: o texto bruto e as escolhas visuais da IA ficam de fora.
    const plAplic = planoAplicado(site);
    const planoVale = Boolean(plAplic && plAplic.base?.texto === String(cliente.preferenciasSite?.texto || '').trim());
    const obrigatorios = checklistObrigatorio(itensAceitos(plAplic));
    const base = baseParaGerar(site, custom ? 'custom' : 'pacote');
    const reaproveitou = base ? { avisoModosVisto: false, baseReaproveitadaEm: new Date().toISOString() } : {};
    if (custom) {
      const atual = site.conteudo || {};
      // Depoimentos: com prova social real (texto, prints, criativos, escritos à mão), só o real — a IA nem escreve
      // modelo. Sem nenhuma prova, os modelos da IA, sempre marcados "[MODELO – substituir…]" (lib/prova-social.js).
      const argsProva = { cliente, materiais, atuais: atual.depoimentos || [], provasOcultas: atual.provasOcultas || [] };
      const { visual, ...r } = await gerarConteudoSite({ cliente, produtos, base, semDepoimentos: temProvaReal(argsProva), materiais: imagensParaBanner(materiais), obrigatorios, semPreferencias: planoVale });
      const { depoimentos, usouModelos } = montarDepoimentos({ ...argsProva, modelosIa: r.depoimentos || [] });
      const gerado2 = { ...atual, ...r, depoimentos };
      const patch = base ? aplicarBaseNoCustom(gerado2, site.config || {}, base) : { conteudo: gerado2 };
      const vis = aplicarOperacoes({ conteudo: patch.conteudo, config: patch.config || site.config || {}, layout: site.layout }, opsDoVisual(planoVale ? null : visual, 'custom', site, materiais), { modo: 'custom', materiais });
      await salvarEVersionar({ ...patch, ...(vis.mudancas.length ? { layout: vis.estado.layout } : {}), ...reaproveitou }, 'Textos gerados de novo pela IA');
      toast(base ? 'Site gerado reaproveitando o texto, as cores e a FAQ do pacote que o cliente já viu. A IA só completou o que faltava.'
        : `Textos gerados pela IA${faqValida(r.faq).length ? ` (com ${faqValida(r.faq).length} pergunta(s) frequente(s))` : ''}. ${usouModelos ? 'Sem prova social cadastrada: os depoimentos são MODELOS marcados para substituir.' : `Depoimentos: só as ${depoimentos.length} prova(s) social(is) reais do cliente.`}`);
    } else {
      const { visual, ...gerado2 } = await gerarTextosPacote({ cliente, produtos, plataforma: nomePlat(site.plataforma), base, materiais: imagensParaBanner(materiais), obrigatorios, semPreferencias: planoVale });
      // Descrições presas ao produto pelo id (renomear o produto não perde a descrição).
      const descricoesProdutos = (gerado2.descricoesProdutos || []).map((d) => ({ ...d, produtoId: produtos.find((p) => String(p.nome || '').toLowerCase() === String(d.nome || '').toLowerCase())?.id || null }));
      // As escolhas da prévia (banner, fotos, seções) continuam; as que as preferências pedirem entram por cima.
      const novo = { ...(base ? aplicarBaseNoPacote({ ...gerado2, descricoesProdutos }, base) : { ...gerado2, descricoesProdutos }), ...(site.pacote?.visual ? { visual: site.pacote.visual } : {}), ...(site.pacote?.recursos ? { recursos: site.pacote.recursos } : {}) };
      const vis = aplicarOperacoes({ pacote: novo }, opsDoVisual(planoVale ? null : visual, 'pacote', site, materiais), { modo: 'pacote', materiais });
      await salvarEVersionar({ pacote: vis.estado.pacote, ...reaproveitou }, 'Pacote gerado de novo pela IA');
      toast(base ? 'Pacote gerado reaproveitando o texto, as cores e a FAQ do site personalizado.' : 'Banners, briefing do tema e textos gerados.');
    }
    if (planoAplicado(site)) await conferirDoSite(); // "Conferência do pedido" logo depois de gerar
    mostrarDepoisDeGerar.add(cliente.id);
    if (!irParaPasso4) return;
    if (passoDaRota() === 4) recarregar(); else irPara(4);
  }

  // ---------- plano do pedido ("Analisar meu pedido", modules/plano-site.js) ----------
  const ctxConferir = async () => {
    const mats = await db.listar(COL.materiais, { clienteId: cliente.id });
    materiais.splice(0, materiais.length, ...mats);
    return { cliente, get site() { return site; }, salvarSite, modo: modoV, materiais: mats, produtos: produtosComFotos(produtosBase, mats) };
  };
  const conferirDoSite = async (op = {}) => conferirPlano(await ctxConferir(), op);
  /** Aplica a ESTRUTURA dos itens (fotos por código, seções, recursos de loja) como uma versão nova. */
  async function aplicarEstrutura(itens, resumo, extra = {}) {
    const mats = await garantirCodigos(cliente, await db.listar(COL.materiais, { clienteId: cliente.id }));
    const a = aplicacaoDoPlano(itens, { modo: modoV, materiais: mats, produtos, recursosAtuais: recursosDoSite(site, modoV) });
    const L = normalizarLayout(site?.layout);
    const direta = custom ? { banner: L.imagens.hero || null, sobre: L.imagens.marca || null } : { banner: normalizarVisual(site?.pacote?.visual).banner };
    // Fotos: só as dos itens aceitos (as marcas antigas "definido pelo texto" saem); a escolha manual em "Usar em" vence.
    // As refs de foto vêm do plano INTEIRO (aplicarReferencias troca todas as marcas de texto de uma vez).
    const comFoto = itens.some((x) => ['banner_fotos', 'clientes_fotos', 'produto_fotos'].includes(x.tipo));
    const refs = comFoto ? aplicacaoDoPlano(planoAplicado(site) ? itensAceitos(planoAplicado(site)) : itens, { modo: modoV, materiais: mats, produtos }).refs : [];
    const rf = comFoto ? aplicarReferencias(mats, refs, { direta, produtos }) : { patches: [], conflitos: [], aplicadas: [] };
    await salvarUsos(rf.patches);
    materiais.splice(0, materiais.length, ...comUsos(mats, rf.patches));
    document.dispatchEvent(new CustomEvent('gcc:materiais', { detail: { clienteId: cliente.id, lista: [...materiais] } }));
    const antes = estadoDoSite(site, modoV);
    const comRec = custom ? { ...antes, config: { ...antes.config, recursos: a.recursos, ...(a.pagamentosConfig ? { pagamentos: a.pagamentosConfig } : {}) } } : { pacote: { ...antes.pacote, recursos: a.recursos } };
    const r = aplicarOperacoes(comRec, a.ops, { modo: modoV, materiais, produtos });
    const v = registrarVersao(site, { modo: modoV, estadoAntes: antes, estadoDepois: r.estado, resumo, origem: 'plano', extra });
    await salvarSite({ ...r.estado, ...v, ...(comFoto ? { fotosTexto: { em: new Date().toISOString(), aplicadas: rf.aplicadas, conflitos: rf.conflitos, avisos: [] } } : {}) });
    return { conflitos: rf.conflitos, recusadas: r.descartadas.filter((d) => !/já est|já aparece|já é|já usa/.test(d.motivo)).map((d) => d.motivo) };
  }
  // "Aplicar o plano": só os itens e sugestões marcados. Estrutura primeiro (versão nova), depois os textos com a lista
  // obrigatória ("Gerar site") e a conferência. Nada disso acontece antes deste clique.
  async function aplicarPlano(plano) {
    if (!plat) throw new Error('Escolha a plataforma (acima, em "Plataforma e tema") antes de aplicar o plano.');
    const itens = itensAceitos(plano);
    if (!itens.length) throw new Error('Marque pelo menos um item do plano para aplicar.');
    if (!produtos.length && !custom) throw new Error('Cadastre pelo menos um produto (passo 2) antes de aplicar o plano.');
    await salvarSite({ planoAplicado: plano.id, conferencia: null, planos: (site.planos || []).map((p) => (p.id === plano.id ? { ...p, aplicadoEm: new Date().toISOString() } : p)) });
    const r = await aplicarEstrutura(itens, `Plano #${plano.n || ''} aplicado: ${itens.length} item(ns)`, { planoId: plano.id });
    await gerarConteudo({ irParaPasso4: false });
    const versao = Math.max(0, ...(site.versoesAjuste || []).filter((v) => v.modo === modoV).map((v) => v.n));
    await salvarSite({ planos: (site.planos || []).map((p) => (p.id === plano.id ? { ...p, versao } : p)), versoesAjuste: (site.versoesAjuste || []).map((v) => (v.n === versao && v.modo === modoV ? { ...v, planoId: plano.id } : v)) });
    if (r.conflitos.length || r.recusadas.length) await salvarSite({ conferencia: { ...site.conferencia, notas: [...(site.conferencia?.notas || []), ...r.conflitos, ...r.recusadas] } });
    mostrarDepoisDeGerar.add(cliente.id);
    if (passoDaRota() === 4) recarregar(); else irPara(4);
  }
  // "Corrigir o que faltou": só os itens Parcial/Não atendido. Estrutura: aplica de novo. Texto: a IA propõe uma mudança
  // em "Ajustar este site" (Atual × Com a mudança), para aceitar. Dado que só o operador tem (fórmula etc.): diz onde preencher.
  async function corrigirFaltou() {
    const p = planoAplicado(site), conf = site?.conferencia;
    if (!p || !conf) return;
    const faltando = itensFaltando(itensAceitos(p), conf.resultados);
    const ligada = (x) => !/não está ligada/.test(conf.resultados[x.id]?.motivo || '');
    const semDado = faltando.filter((x) => x.tipo === 'secoes_produto' || (custom && x.tipo === 'pagina_produto' && ligada(x)));
    const deTexto = faltando.filter((x) => !semDado.includes(x) && (conf.resultados[x.id]?.por !== 'codigo' || (x.tipo === 'pagina_produto' && ligada(x))));
    const deEstrutura = faltando.filter((x) => !semDado.includes(x) && !deTexto.includes(x));
    const avisos = [];
    if (deEstrutura.length) { const r = await aplicarEstrutura(deEstrutura, `Corrigir o que faltou: ${deEstrutura.length} item(ns) do plano #${p.n || ''}`, { planoId: p.id }); avisos.push(...r.conflitos, ...r.recusadas); }
    if (deTexto.length) {
      const e = estadoDoSite(site, modoV);
      const mensagem = `Corrija SÓ estes pedidos do plano, sem mexer em mais nada: ${deTexto.map((x) => `"${x.pedido || TIPOS_PEDIDO[x.tipo]}" (${x.como}; hoje: ${conf.resultados[x.id]?.motivo || 'não atendido'})`).join('; ')}`;
      const ia = await ajustarSite({ cliente, modo: modoV, estado: e, mensagem: mensagem.slice(0, 1500), materiais: imagensParaBanner(materiais), produtos, resumoBlocos: custom ? resumoBlocosSite(e) : '' });
      const r = ia.tipo === 'proposta' ? aplicarOperacoes({ ...e, usosFotos: {} }, ia.operacoes, { modo: modoV, materiais, produtos }) : null;
      if (r?.aplicadas.length) {
        const { usosFotos, ...estado } = r.estado;
        await salvarSite({ rascunhoAjuste: { modo: modoV, estado, usosFotos: usosFotos || {}, origem: 'ia', criadoEm: new Date().toISOString(), mudancas: r.mudancas, descartadas: r.descartadas.map((d) => ({ op: d.op, motivo: d.motivo })) } });
        avisos.push(`Os itens de texto (${deTexto.length}) viraram uma mudança proposta em "Ajustar este site", logo abaixo: confira "Atual × Com a mudança" e aceite. A conferência roda de novo ao aceitar.`);
      } else avisos.push(`A IA não conseguiu corrigir o texto agora: ${ia.resposta}`);
    }
    if (semDado.length) avisos.push(`Precisa de dado real (a IA não inventa): ${semDado.map((x) => conf.resultados[x.id]?.motivo).join('; ')}. Preencha no produto (aba Produtos > Mais opções).`);
    await conferirDoSite();
    if (avisos.length) await salvarSite({ conferencia: { ...site.conferencia, notas: [...(site.conferencia?.notas || []), ...avisos] } });
    recarregar();
    mostrarResultado('[data-conferencia]', 'Correção feita: a conferência foi refeita.');
  }


  // ---------- partes comuns ----------
  const matsCom = (usosFotos) => (usosFotos ? comUsos(materiais, patchesDe(usosFotos)) : materiais);
  // Sempre o estado ACEITO (conteúdo + cores + layout dos ajustes); uma mudança proposta em aberto nunca entra no download.
  const htmlDe = (e, extra = {}) => { const mats = matsCom(e.usosFotos); return gerarSiteHTML({ cliente, produtos, conteudo: e.conteudo || {}, config: e.config || {}, layout: e.layout || null, url: site?.linkPublicado || '', provas: semRepetirDepoimentos(printsDoCliente(mats), e.conteudo?.depoimentos), materiais: mats, ...extra }); };
  const previaPacote = (pacote, usosFotos) => { const mats = matsCom(usosFotos); return gerarPreviaLojaHTML(dadosDoPacote({ cliente, site: { ...site, pacote }, produtos, provas: printsDoCliente(mats), materiais: mats })); };
  const html = (extra) => htmlDe({ conteudo: site.conteudo, config: site.config, layout: site.layout }, extra);
  const dadosPacote = () => dadosDoPacote({ cliente, site, produtos, provas: printsDoCliente(materiais), materiais });
  const irParaPergunta = (id) => {
    const card = $('[data-perguntas-site]', root); if (!card) { irPara(1); return; }
    card.open = true;
    const alvoP = id ? $(`[data-pergunta="${id}"]`, card) : card;
    (alvoP || card).scrollIntoView({ block: 'center' });
    alvoP?.querySelector?.('textarea, input:not([type=checkbox]):not([type=radio]):not([type=file]), select')?.focus({ preventScroll: true });
  };

  // ---------- barra de progresso + o que falta ----------
  const barraHtml = (etapas) => `<nav class="mb-4" aria-label="Passos para montar o site" data-barra-passos><ol class="flex gap-2 overflow-x-auto pb-1" data-progresso-site>${etapas.map((x) => `<li class="shrink-0">
      <a href="${rotaDoPasso(cliente.id, x.n)}" class="flex min-w-[8.5rem] items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${x.n === passo ? 'ring-2 ring-indigo-500' : ''} ${COR_STATUS[x.status]}" data-ir-passo="${x.n}" data-status-passo="${x.status}" title="${esc(x.legenda)}" ${x.n === passo ? 'aria-current="step"' : ''}>
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current font-bold">${x.n}</span>
        <span class="min-w-0"><span class="block font-semibold leading-tight">${esc(x.titulo)}</span><span class="block"><i class="fa-solid fa-${ICONE_STATUS[x.status]}"></i> ${STATUS_ETAPA[x.status]}</span></span></a></li>`).join('')}</ol></nav>`;
  let atual = etapas[passo - 1];
  const botaoAcao = (f, i) => {
    const a = f.acao; if (!a) return '';
    const rot = { pergunta: 'Responder', etapa: `Ir para o passo ${a.alvo}`, produto: 'Abrir o produto', novoProduto: 'Cadastrar produto', ancora: 'Resolver aqui', rota: 'Abrir' }[a.tipo] || 'Resolver';
    return `<button type="button" class="btn-ghost btn-sm shrink-0" data-resolver="${i}">${rot}</button>`;
  };
  const faltasHtml = (atual) => `<div data-faltas-wrap>${atual.faltas.length || atual.dicas.length ? `<div class="mb-4 rounded-lg border ${atual.faltas.length ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'} p-3 text-sm" data-faltas-passo>
      ${atual.faltas.length ? `<p class="font-semibold text-amber-800"><i class="fa-solid fa-list-check mr-1"></i> O que falta neste passo</p>
      <ul class="mt-1 space-y-1">${atual.faltas.map((f, i) => `<li class="flex flex-wrap items-center justify-between gap-2 text-amber-800" data-falta><span class="min-w-0 flex-1">${esc(f.texto)}</span>${botaoAcao(f, i)}</li>`).join('')}</ul>` : ''}
      ${atual.dicas.map((d) => `<p class="mt-1 text-xs text-slate-600" data-dica-passo><i class="fa-solid fa-circle-info"></i> ${esc(d)}</p>`).join('')}</div>`
    : `<p class="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800" data-passo-ok><i class="fa-solid fa-circle-check"></i> ${atual.status === 'opcional' ? 'Passo opcional: nada obrigatório aqui.' : 'Nada faltando neste passo.'}</p>`}</div>`;
  const continuar = passo < 6
    ? `<div class="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">${passo > 1 ? `<a class="btn-ghost" href="${rotaDoPasso(cliente.id, passo - 1)}"><i class="fa-solid fa-arrow-left"></i> Voltar</a>` : '<span></span>'}
        <button type="button" class="btn-primary" data-continuar>Continuar <i class="fa-solid fa-arrow-right"></i></button></div>`
    : `<div class="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4"><a class="btn-ghost" href="${rotaDoPasso(cliente.id, 5)}"><i class="fa-solid fa-arrow-left"></i> Voltar</a>
        <button type="button" class="btn-primary" data-concluir><i class="fa-solid fa-flag-checkered"></i> Concluir</button></div>`;

  root.innerHTML = `${cabecalho('Montar site', 'Seis passos, na ordem que quiser: nenhum fica trancado. Cada passo diz o que falta e tem o botão para resolver.')}
    ${barraHtml(etapas)}
    <section data-passo="${passo}"><h2 class="mb-1 text-lg font-semibold"><span class="text-indigo-600">${passo}.</span> ${esc(atual.titulo)} <span class="text-sm font-normal text-slate-500">· ${esc(atual.legenda)}</span></h2>
      ${faltasHtml(atual)}<div data-conteudo-passo></div>${continuar}</section>`;
  const alvo = $('[data-conteudo-passo]', root);

  on(root, 'click', '[data-continuar]', () => irPara(passo + 1));
  on(root, 'click', '[data-resolver]', (b) => {
    const a = atual.faltas[Number(b.dataset.resolver)]?.acao; if (!a) return;
    if (a.tipo === 'pergunta') return irParaPergunta(a.alvo);
    if (a.tipo === 'etapa') return irPara(a.alvo);
    if (a.tipo === 'produto') return abrirProduto(cliente, produtos.find((p) => p.id === a.alvo), recarregar);
    if (a.tipo === 'novoProduto') return abrirProduto(cliente, null, recarregar);
    if (a.tipo === 'rota') { location.hash = a.alvo; return; }
    if (a.tipo === 'ancora') { const x = $(`[data-ancora="${a.alvo}"]`, root); if (x) { x.scrollIntoView({ block: 'center' }); x.classList.add('ring-2', 'ring-amber-400'); setTimeout(() => x.classList.remove('ring-2', 'ring-amber-400'), 2500); } }
  });
  // Materiais mudaram (Materiais do cliente, envio de print, logo): o passo se redesenha com o status novo.
  let tMat;
  const ouvirMateriais = (e) => {
    if (!root.isConnected) { document.removeEventListener('gcc:materiais', ouvirMateriais); return; }
    if (e.detail?.clienteId !== cliente.id || ![2, 4].includes(passo)) return;
    clearTimeout(tMat); tMat = setTimeout(() => recarregar(), 400); // a janela de Materiais fica aberta por cima
  };
  document.addEventListener('gcc:materiais', ouvirMateriais);
  // Qualquer gravação (resposta do questionário, produto, plataforma...): a barra e o "O que falta" se recalculam sem
  // redesenhar o passo (o campo em edição não perde o foco). Lê de novo do banco: o status vem sempre da fonte.
  let tStatus;
  const atualizarStatus = () => {
    if (!root.isConnected) { window.removeEventListener('gcc:mudou', atualizarStatus); return; }
    clearTimeout(tStatus);
    tStatus = setTimeout(async () => {
      const [cl, prods, mats, sts, aprs, resps] = await Promise.all([db.obter(COL.clientes, cliente.id), db.listar(COL.produtos, { clienteId: cliente.id }), db.listar(COL.materiais, { clienteId: cliente.id }),
        db.listar(COL.sites, { clienteId: cliente.id }), db.listar(COL.aprovacoes, { clienteId: cliente.id }).catch(() => []), db.listar(COL.respostas, { clienteId: cliente.id }).catch(() => [])]);
      if (!root.isConnected) return;
      const novas = statusEtapas({ cliente: cl || cliente, site: sts[0] || null, produtos: produtosComFotos(prods, mats), materiais: mats, etiquetaAprov: etiquetaSite(aprs, resps) });
      atual = novas[passo - 1];
      $('[data-barra-passos]', root).outerHTML = barraHtml(novas);
      $('[data-faltas-wrap]', root).outerHTML = faltasHtml(atual);
    }, 500);
  };
  window.addEventListener('gcc:mudou', atualizarStatus);


  // ==================== 1. Informações ====================
  async function passo1() {
    const itens = resumoMaterialSite({ cliente, produtos: produtosComF(), materiais, site, respondidas: progressoSite(cliente, site, produtos, materiais.length), totalPerguntas: TOTAL_PERGUNTAS });
    const it = (k) => itens.find((x) => x.chave === k);
    const r = rastreamentoDe(cliente);
    const campos = (x) => (x.campos || []).map((c) => `<span class="tag ${c.ok ? 'tag-ok' : ''}" ${c.pergunta ? `data-ir-pergunta="${esc(c.pergunta)}" role="button" title="Ir para a pergunta"` : ''}>${c.ok ? '<i class="fa-solid fa-check mr-1"></i>' : '<i class="fa-regular fa-circle mr-1"></i>'}${esc(c.rotulo)}${c.ok ? '' : ': não'}</span>`).join(' ');
    alvo.innerHTML = `<div class="grid gap-3 md:grid-cols-2">
      <div class="card" data-resumo-perfil><h3 class="font-semibold">Perfil de marca</h3><p class="caption">${esc(it('perfil').linhas.join(' · '))}. Responda no questionário abaixo: cada resposta grava direto no perfil.</p><div class="mt-2 flex flex-wrap gap-1">${campos(it('perfil'))}</div>
        <p class="mt-2 text-sm">${esc(it('provas').titulo)}: ${esc(it('provas').linhas.join(' · '))}</p></div>
      <div class="card" data-resumo-rastreamento><h3 class="font-semibold">Rastreamento</h3><div class="mt-1">${indicadorPixel(cliente)}</div>
        <div class="mt-2 flex flex-wrap gap-1">${campos(it('rastreamento'))}</div>
        <p class="hint mt-2">Pixel e Google Ads: pergunta 16 abaixo. Hotjar e Tawk.to: <a class="underline" href="#/c/${esc(cliente.id)}/editar">cadastro do cliente → Rastreamento</a>. ${r.metaPixelId || r.googleAdsId ? 'Entram sozinhos no site gerado (depois do "Aceitar" dos cookies).' : ''}</p></div></div>
      <div class="mt-4" data-perguntas></div>`;
    montarPerguntasSite($('[data-perguntas]', alvo), { cliente, produtos: produtosComF(), salvarSite, recarregar, irParaGerar, get site() { return site; } }, { aberto: true });
    on(alvo, 'click', '[data-ir-pergunta]', (b) => irParaPergunta(b.dataset.irPergunta || null));
  }

  // ==================== 2. Materiais ====================
  async function passo2() {
    const prints = printsDoCliente(materiais);
    const fotos = materiais.filter((m) => temCodigo(m) && m.codigo).sort(porCodigo);
    const provasTexto = linhasDeProva(cliente.marca?.provasSociais).length;
    const lista = produtosComF();
    const mig = cliente.migracaoFotos;
    alvo.innerHTML = `<div class="grid gap-4 lg:grid-cols-2">
      <div class="card" data-ancora="logo"><h3 class="font-semibold">Logo</h3><div class="mt-2" data-logo-passo>${logoHtml(cliente)}</div></div>
      <div class="card" data-ancora="produtos"><div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-semibold">Produtos (${lista.length})</h3>
          <button type="button" class="btn-ghost btn-sm" data-novo-produto><i class="fa-solid fa-plus"></i> Cadastrar produto</button></div>
        ${lista.length ? `<ul class="mt-2 space-y-1 text-sm" data-lista-produtos>${lista.map((p) => `<li class="flex items-center gap-2 rounded bg-slate-50 p-1">
          ${p.fotos[0] ? `<img src="${esc(p.fotos[0].url)}" alt="" class="h-10 w-10 shrink-0 rounded object-cover">` : '<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-amber-100 text-amber-700"><i class="fa-solid fa-image"></i></span>'}
          <span class="min-w-0 flex-1"><b>${esc(p.nome)}</b> <span class="hint">${Number(p.preco) > 0 ? moeda(p.precoPromocional || p.preco) : '<span class="text-amber-700">sem preço</span>'} · ${p.fotos.length ? `${p.fotos.length} foto(s)${p.fotos[0].codigo ? `, principal ${esc(p.fotos[0].codigo)}` : ''}` : '<span class="text-amber-700">sem foto</span>'}</span></span>
          <button type="button" class="btn-ghost btn-sm" data-editar-produto="${esc(p.id)}">Editar</button></li>`).join('')}</ul>` : '<p class="hint mt-2">Nenhum produto ainda.</p>'}
        <p class="hint mt-2">As fotos dos produtos ficam em Materiais do cliente. Enviar foto dentro do produto já liga ela ao produto ("Usar em").</p>
        ${mig?.fotos ? `<p class="mt-1 text-xs text-slate-600" data-migracao-fotos><i class="fa-solid fa-right-left"></i> Em ${esc(dataBR(mig.em))}, ${mig.fotos} foto(s) de ${mig.produtos} produto(s) passaram do cadastro do produto para Materiais (mesmos arquivos, mesma ordem e foto principal). <button type="button" class="underline" data-desfazer-migracao>Desfazer</button></p>` : ''}</div></div>
      <div class="card mt-4" data-ancora="fotos"><div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-semibold">Fotos e vídeos (${materiais.length} arquivo(s))</h3>
          <button type="button" class="btn-primary btn-sm" data-abrir-materiais><i class="fa-solid fa-upload"></i> Enviar e escolher onde cada foto vai ("Usar em")</button></div>
        <p class="hint">Cada foto tem um código (F1, F2…). Em "Usar em" você diz se ela vai no banner, num produto, em Clientes reais, no Sobre ou na Galeria.</p>
        ${fotos.length ? `<div class="mt-2 flex gap-2 overflow-x-auto pb-1" data-fotos-passo>${fotos.map((m) => { const u = resumoUsos(m, produtos); return `<div class="w-24 shrink-0 text-[11px]" title="${esc(m.nomeOriginal || m.nome || '')}"><div class="relative"><img src="${esc(m.url)}" alt="${esc(m.codigo)}" loading="lazy" class="h-20 w-24 rounded border border-slate-200 object-cover"><span class="absolute left-0.5 top-0.5 rounded px-1 text-[10px] font-bold" style="background:rgba(0,0,0,.78);color:#fff">${esc(m.codigo)}</span>
          <button type="button" class="absolute bottom-0.5 right-0.5 rounded bg-rose-600 px-1 text-[10px] text-white" data-excluir-foto="${esc(m.id)}" title="Excluir esta foto" aria-label="Excluir ${esc(m.codigo)}"><i class="fa-solid fa-trash"></i></button></div><p class="mt-0.5 line-clamp-2 ${u.length ? 'text-slate-700' : 'text-slate-400'}">${u.length ? esc(u.map((x) => x.texto).join(' · ')) : 'sem uso'}</p></div>`; }).join('')}</div>` : '<p class="hint mt-2">Nenhuma foto ainda.</p>'}</div>
      <div class="card mt-4" data-ancora="provas"><h3 class="font-semibold">Provas sociais</h3>
        <p class="caption">${provasTexto} em texto (perfil de marca, pergunta 10 do passo 1) · ${provasEmImagem(materiais).length} print(s). O texto é lido de lá na hora de mostrar o site: mudou o perfil, mudou o site.</p>
        <details class="mt-2" ${provasTexto || provasEmImagem(materiais).length ? '' : 'open'}><summary class="cursor-pointer text-sm text-indigo-600">Chegou prova nova? Enviar prints aqui</summary>${provaSocialHtml('passo')}</details></div>
      <div class="card mt-4" data-ancora="prints"><h3 class="font-semibold">Clientes reais (prints e fotos de clientes)</h3>${printsPainelHtml(cliente, prints)}</div>`;
    ligarLogo($('[data-logo-passo]', alvo), cliente, () => recarregar());
    ligarProvaSocial($('[data-prova-img="passo"]', alvo), { cliente, produtos, materiais, site, recarregar });
    on(alvo, 'click', '[data-abrir-materiais]', (b) => ocupado(b, () => abrirMateriais(cliente)));
    on(alvo, 'click', '[data-excluir-foto]', (b) => ocupado(b, async () => { const x = materiais.find((y) => y.id === b.dataset.excluirFoto); if (x) await excluirMateriais(cliente, [x], { aoExcluir: () => recarregar() }); }));
    on(alvo, 'click', '[data-novo-produto]', () => abrirProduto(cliente, null, recarregar));
    on(alvo, 'click', '[data-editar-produto]', (b) => abrirProduto(cliente, produtos.find((p) => p.id === b.dataset.editarProduto), recarregar));
    on(alvo, 'click', '[data-borrar-print]', (b) => ocupado(b, async () => {
      const mat = materiais.find((x) => x.id === b.dataset.borrarPrint); if (!mat) return;
      await abrirBorrar(cliente, mat, async () => recarregar());
    }));
    on(alvo, 'click', '[data-desfazer-migracao]', async (b) => {
      if (!(await confirmar('Desfazer a passagem das fotos dos produtos para Materiais? Os registros criados por ela saem de Materiais (os arquivos continuam no produto) e o produto volta a usar o campo antigo de fotos. Escolhas de "Usar em" feitas nessas fotos se perdem.', 'Desfazer'))) return;
      await ocupado(b, async () => { const r = await desfazerMigracaoFotos(cliente); toast(`Desfeito: ${r.fotos} registro(s) tirados de Materiais. Os arquivos continuam no produto.`, 'info'); location.reload(); });
    });
  }

  // ==================== 3. Como quero ====================
  async function passo3() {
    const tema = String(site?.tema || '');
    const doisModos = temCustom(site) && temPacote(site);
    alvo.innerHTML = `<div class="card" data-ancora="plataforma"><h3 class="font-semibold">Plataforma e tema</h3>
        <p class="caption">Onde a loja vai ficar. Define o modo (pacote para a plataforma, ou site personalizado) e os caminhos de menu do passo 6. É o mesmo dado da pergunta 18.</p>
        ${site?.modo === 'pacote_plataforma' && !plat ? '<p class="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-800" data-confirmar-plataforma><i class="fa-solid fa-circle-question"></i> Este cliente estava marcado como "Nuvemshop" automaticamente, sem ninguém escolher. Confirme a plataforma certa (uma vez só).</p>' : ''}
        <div class="mt-2 flex flex-wrap gap-3 text-sm" role="radiogroup" aria-label="Plataforma">${PLATAFORMAS_SITE.map(([k, t]) => `<label class="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2"><input type="radio" name="plataformaSite" value="${k}" data-plataforma ${plat === k ? 'checked' : ''}> ${t}</label>`).join('')}</div>
        ${plat === 'shopify' ? `<div class="mt-3 text-sm"><p class="font-medium">Tema da Shopify</p><div class="mt-1 flex flex-wrap gap-3">${TEMAS_SHOPIFY.map(([k, t]) => `<label class="flex items-center gap-1"><input type="radio" name="temaShopify" value="${k}" data-tema ${tema === k ? 'checked' : ''}> ${t}</label>`).join('')}</div>
          <p class="hint">Os caminhos do passo 6 mudam entre Horizon e Dawn; em "Outro" o app avisa onde conferir no editor do tema.</p></div>` : ''}
        ${plat === 'nuvemshop' ? `<label class="mt-3 block text-sm">Tema da Nuvemshop (opcional)<input class="input mt-1" data-tema-texto value="${esc(tema)}" placeholder="Ex.: Amazonas, Rio, Lima…" maxlength="60"></label>` : ''}
        ${doisModos ? `<p class="hint mt-2">${esc(AVISO_MODOS)}</p>` : ''}</div>
      <div class="mt-4" data-como-quero>${preferenciasHtml(cliente, site?.fotosTexto)}
        <div class="card mt-4" data-ancora="referencia"><h3 class="font-semibold">Site de referência</h3>
          <input class="input mt-1" data-referencia-site value="${esc(cliente.siteReferencia || '')}" placeholder="https://… (um site que o cliente acha bonito)">
          <p class="hint">O mesmo campo da pergunta 12. A IA usa só a estrutura e o estilo dele, nunca textos, imagens ou marca.</p>${referenciaExtraHtml(cliente)}</div></div>
      ${blocoAnaliseHtml(cliente, site)}`;
    const caixa = $('[data-como-quero]', alvo);
    ligarPreferencias(caixa, cliente, () => { const x = $('[data-referencia-extra]', caixa); if (x) x.outerHTML = referenciaExtraHtml(cliente); }, { aplicarFotosTexto: site?.modo ? aplicarFotosTexto : null });
    ligarAnalise($('[data-analise-pedido]', alvo), { cliente, get site() { return site; }, salvarSite, produtos: produtosComF(), materiais, plataforma: plat, tema: String(site?.tema || ''), modo: modoV, aplicar: aplicarPlano });
    on(alvo, 'change', '[data-plataforma]', (i) => ocupado(i, async () => {
      const novo = i.value;
      await salvarSite({ ...patchPlataforma(novo), ...(novo === 'shopify' && !TEMAS_SHOPIFY.some(([k]) => k === site?.tema) ? { tema: null } : {}), ...(novo !== 'shopify' && TEMAS_SHOPIFY.some(([k]) => k === site?.tema) ? { tema: null } : {}) });
      toast(`Plataforma: ${PLATAFORMAS_SITE.find(([k]) => k === novo)[1]}. ${novo === 'custom' ? 'Modo: site personalizado.' : 'Modo: pacote para a plataforma.'} Nada se perde ao trocar.`);
      recarregar();
    }));
    on(alvo, 'change', '[data-tema]', (i) => ocupado(i, async () => { await salvarSite({ tema: i.value }); toast(`Tema: ${TEMAS_SHOPIFY.find(([k]) => k === i.value)[1]}.`); recarregar(); }));
    on(alvo, 'change', '[data-tema-texto]', async (i) => { await salvarSite({ tema: i.value.trim() || null }); toast('Tema anotado.'); });
    on(alvo, 'change', '[data-referencia-site]', async (i) => {
      cliente.siteReferencia = i.value.trim();
      await db.atualizar(COL.clientes, cliente.id, { siteReferencia: cliente.siteReferencia }); toast('Site de referência salvo no cadastro do cliente.');
    });
  }

  // ==================== 4. Gerar e ajustar ====================
  async function passo4() {
    const c = site?.conteudo || {}, cfg = site?.config || {};
    const provas = provasEmImagem(materiais);
    const exibirAtual = (m) => (c.depoimentos || []).find((d) => d.origem === ORIGEM_PROVA && d.materialId === m.id)?.exibir || '';
    const dif = site ? divergencias(site) : [];
    alvo.innerHTML = `<div class="card border-violet-200" data-ancora="gerar">
        <div class="flex flex-wrap items-center justify-between gap-2"><div><h3 class="font-semibold">${gerado ? 'Site gerado' : 'Gerar o site'}</h3>
          <p class="caption">${plat ? `${custom ? 'Site personalizado' : `Pacote para ${esc(nomePlat(site.plataforma))}${nomeTema(site) ? ` · tema ${esc(nomeTema(site))}` : ''}`}. A IA escreve banner, história, FAQ e textos com tudo dos passos 1 a 3. Escolhas feitas à mão (fotos, banner, seções, ajustes) nunca são desfeitas.` : 'Escolha a plataforma no passo 3 antes de gerar.'}</p></div>
          <button type="button" class="btn-ia" data-gerar-site ${plat ? '' : 'disabled'}><i class="fa-solid fa-wand-magic-sparkles"></i> ${gerado ? 'Gerar site de novo' : 'Gerar site'}</button></div>
        ${!plat ? `<a class="btn-ghost btn-sm mt-2" href="${rotaDoPasso(cliente.id, 3)}">Ir para o passo 3</a>` : ''}
        ${dif.length ? `<div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800" data-divergencia><p><b><i class="fa-solid fa-code-compare mr-1"></i> O texto do site personalizado está diferente do pacote em: ${esc(dif.join(', '))}.</b> Nada é copiado sozinho.</p>
          <div class="mt-2 flex flex-wrap gap-2"><button class="${custom ? 'btn-primary' : 'btn-ghost'} btn-sm" data-sincronizar-modos><i class="fa-solid fa-arrows-rotate"></i> Levar o texto do site personalizado para o pacote</button>
          <button class="${custom ? 'btn-ghost' : 'btn-primary'} btn-sm" data-sincronizar-inverso><i class="fa-solid fa-arrows-rotate"></i> Levar o texto do pacote para o site personalizado</button></div></div>` : ''}
        ${gerado ? `<div class="mt-4" data-area-resultado>
          <div class="flex flex-wrap gap-2"><button type="button" class="btn-ghost btn-sm" data-mostrar-previa-loja><i class="fa-solid fa-eye-slash"></i> Esconder prévia</button>${custom ? '<button type="button" class="btn-ghost btn-sm" data-preview><i class="fa-solid fa-up-right-from-square"></i> Abrir em nova aba</button>' : ''}</div>
          <div class="mt-2" data-area-previa-loja>${custom ? '<iframe title="Prévia do site" sandbox="allow-scripts allow-popups allow-forms" class="h-[70vh] w-full rounded-lg border border-slate-200 bg-white" data-previa-custom></iframe>' : previaLojaHtml()}</div>
          ${ajustesRapidosHtml()}
          ${resultadoFotosTextoHtml(site.fotosTexto)}${conferenciaHtml(site)}</div>` : ''}</div>
      <details class="card mt-4" data-conteudo-manual ${!gerado && plat ? '' : ''}><summary class="cursor-pointer font-semibold">Editar os textos à mão (sem IA)</summary>
        ${plat ? formularioConteudoHtml(c, cfg) : '<p class="hint mt-2">Escolha a plataforma no passo 3.</p>'}</details>
      ${plat ? `<div class="card mt-4" data-cartao-depoimentos><h3 class="mb-1 font-semibold"><i class="fa-solid fa-star-half-stroke mr-1 text-amber-500"></i> Depoimentos do site</h3>
        <p class="caption mb-2">As provas em texto do perfil de marca entram sozinhas e sempre atualizadas. Aqui você escolhe como cada print aparece e traz criativos aprovados.</p>
        ${!provas.length ? '<p class="hint">Nenhum print de prova social guardado ainda (passo 2).</p>'
          : !custom ? '<p class="hint">No pacote, os prints vão para a seção "Clientes reais" do tema (passo 6 diz onde).</p>'
          : `<div class="grid gap-2 sm:grid-cols-2">${provas.map((m) => `<div class="flex gap-2 rounded-lg border border-slate-200 p-2 text-sm"><img src="${esc(m.borrada?.url || m.url)}" alt="Print de prova social" class="h-20 w-20 shrink-0 rounded border object-cover" loading="lazy">
            <div class="min-w-0 flex-1"><p class="line-clamp-2 text-slate-600">${esc(m.citacao || m.descricao || 'Print de prova social')}</p>
              <select class="input mt-1 !py-1 text-xs" data-exibir-prova="${esc(m.id)}" title="Como este print aparece nos depoimentos do site">${opcoes(EXIBICOES_PROVA, exibirAtual(m))}</select></div></div>`).join('')}</div>
            <button class="btn-primary btn-sm mt-3" data-salvar-provas-site><i class="fa-solid fa-floppy-disk"></i> Salvar a escolha nos depoimentos</button>`}
        <div class="mt-3 border-t border-slate-100 pt-3"><p class="text-sm font-medium">Criativos aprovados como prova social</p>
          ${marcados.length ? `<p class="hint">${marcados.map((cr) => esc(cr.nome)).join(', ')}</p><button class="btn-ghost btn-sm mt-1" data-sync-prova><i class="fa-solid fa-arrows-rotate"></i> Atualizar depoimentos com estes ${marcados.length} criativo(s)</button>`
            : '<p class="hint">Nenhum criativo aprovado marcado "Usar como prova social no site" (aba Criativos).</p>'}</div></div>` : ''}
      ${site?.pacote ? `<details class="card mt-4"><summary class="cursor-pointer font-semibold">Banners e briefing do tema${custom ? ' <span class="text-sm font-normal text-slate-500">(do pacote, não aparece neste site)</span>' : ''}</summary>${pacoteHTML(site.pacote)}</details>` : ''}
      <div data-ancora="ajuste" data-ajuste></div>`;

    on(alvo, 'click', '[data-gerar-site]', (b) => gerarComIa(b));
    if (gerado) {
      if (custom) { const ifr = $('[data-previa-custom]', alvo); if (ifr) ifr.srcdoc = html(); } else ligarPreviaLoja(alvo, gerarPreviaLojaHTML(dadosPacote()));
      ligarAjustesRapidos();
      if (mostrarDepoisDeGerar.has(cliente.id)) { mostrarDepoisDeGerar.delete(cliente.id); mostrarResultado($('[data-area-resultado]', alvo), 'Pronto: site gerado. A prévia está aqui; ajuste à vontade e depois vá para "Aprovar".'); }
    }
    on(alvo, 'click', '[data-corrigir-faltou]', (b) => ocupado(b, () => corrigirFaltou()));
    on(alvo, 'click', '[data-conferir-de-novo]', (b) => ocupado(b, async () => { await conferirDoSite(); recarregar(); mostrarResultado('[data-conferencia]', 'Conferência refeita.'); }));
    on(alvo, 'click', '[data-ver-plano]', (b) => abrirPlanoDaVersao(site, b.dataset.verPlano, site.conferencia?.versao || null));
    on(alvo, 'click', '[data-mostrar-previa-loja]', (b) => { const a = $('[data-area-previa-loja]', alvo); a.classList.toggle('hidden'); b.innerHTML = a.classList.contains('hidden') ? '<i class="fa-solid fa-eye"></i> Ver prévia' : '<i class="fa-solid fa-eye-slash"></i> Esconder prévia'; });
    on(alvo, 'click', '[data-preview]', () => abrirNovaAba());
    if (plat) ligarFormularioConteudo(c, cfg);
    on(alvo, 'click', '[data-salvar-provas-site]', (b) => ocupado(b, async () => {
      const novos = provas.map((m) => depoimentoDeProva(m, $(`[data-exibir-prova="${m.id}"]`, alvo)?.value || ''));
      const depoimentos = mesclarProvasNoSite(c.depoimentos, novos);
      const provasOcultas = provas.filter((m, i) => !novos[i]).map((m) => m.id); // "Não usar": nem o print, nem o texto dele
      await salvarEVersionar({ conteudo: { ...c, depoimentos, provasOcultas } }, 'Depoimentos a partir de prints de prova social');
      toast(`Depoimentos atualizados: ${novos.filter(Boolean).length} print(s) no site.`); recarregar();
    }));
    on(alvo, 'click', '[data-sync-prova]', (b) => ocupado(b, async () => {
      const novos = marcados.map((cr) => criativoParaDepoimento(cliente, cr));
      await salvarSite({ conteudo: { ...c, depoimentos: mesclarDepoimentos(c.depoimentos, novos) } });
      toast(`Prova social atualizada: ${novos.length} criativo(s).`); recarregar();
    }));
    on(alvo, 'click', '[data-sincronizar-modos]', (b) => ocupado(b, async () => {
      await salvarEVersionar({ pacote: aplicarBaseNoPacote(site.pacote, baseDoCustom(site)) }, 'Recebeu o texto e as cores do site personalizado', 'pacote');
      toast('Pacote atualizado com o texto e as cores do site personalizado.'); recarregar();
    }));
    on(alvo, 'click', '[data-sincronizar-inverso]', (b) => ocupado(b, async () => {
      await salvarEVersionar(aplicarBaseNoCustom(site.conteudo || {}, site.config || {}, baseDoPacote(site)), 'Recebeu o texto e as cores do pacote', 'custom');
      toast('Site personalizado atualizado com o texto e as cores do pacote.'); recarregar();
    }));
    if (gerado || (custom && produtos.length)) {
      montarAjusteSite($('[data-ajuste]', alvo), { cliente, produtos, modo: modoV, get site() { return site; }, salvarSite, recarregar, htmlDe, pacoteHTML, previaPacote,
        depoisDeMudar: async () => { if (planoAplicado(site)) await conferirDoSite().catch((e) => toast(`A conferência do pedido não rodou: ${e.message}`, 'erro')); },
        verPlano: (id, n) => abrirPlanoDaVersao(site, id, n) })
        .catch((e) => { console.warn('[ajuste do site]', e); $('[data-ajuste]', alvo).innerHTML = '<p class="hint text-rose-600">Não consegui abrir "Ajustar este site". Recarregue a página.</p>'; });
    }
  }

  // ---------- ajustes rápidos (sem IA): cada mudança vira versão nova e a prévia atualiza na hora ----------
  const ordemAtual = () => (custom ? normalizarLayout(site.layout).ordem : normalizarVisual(site.pacote?.visual).ordem);
  const ocultasAtuais = () => (custom ? normalizarLayout(site.layout).ocultos : normalizarVisual(site.pacote?.visual).ocultas);
  const nomeSecao = (k) => (custom ? nomeBloco(k) : nomeSecaoLoja(k));
  function ajustesRapidosHtml() {
    const imgs = imagensParaBanner(materiais);
    const bannerAtual = custom ? normalizarLayout(site.layout).imagens.hero?.materialId : normalizarVisual(site.pacote?.visual).banner?.materialId;
    const bannerUsarEm = imagemDoLugar(materiais, 'banner', custom ? normalizarLayout(site.layout).imagens.hero : normalizarVisual(site.pacote?.visual).banner);
    const slidesBanner = slidesDoBanner(materiais, custom ? normalizarLayout(site.layout).imagens.hero : normalizarVisual(site.pacote?.visual).banner);
    const codigosSlides = slidesBanner.map((sl, i) => `${i + 1}) ${sl.fotos.map((f) => f.codigo || f.nome).join(' + ')}`).join(', ');
    const fotos = custom ? normalizarLayout(site.layout).ajusteFotos : normalizarVisual(site.pacote?.visual).ajusteFotos;
    const ordem = ordemAtual(), ocultas = ocultasAtuais();
    return `<details class="mt-3 rounded-lg border border-indigo-200 p-3" open data-ajustes-rapidos><summary class="cursor-pointer text-sm font-semibold"><i class="fa-solid fa-sliders"></i> Ajustes rápidos (sem IA)</summary>
      <p class="hint mt-1">Cada escolha muda a prévia na hora e vira uma versão nova (dá para voltar em "Ajustar este site", abaixo).</p>
      <div class="mt-2 grid gap-3 sm:grid-cols-2">
        <label class="text-sm">Imagem do banner<select class="input mt-0.5" data-ctl-banner ${bannerUsarEm?.por === 'manual' ? 'disabled' : ''}><option value="">Sem imagem (fundo de cor)</option>${imgs.map((m) => `<option value="${esc(m.id)}" ${m.id === bannerAtual ? 'selected' : ''}>${esc(rotuloFoto(m))}</option>`).join('')}</select>
          <span class="hint" data-banner-origem>${bannerUsarEm && slidesBanner.length > 1 ? `Carrossel com ${slidesBanner.length} slides (${esc(codigosSlides)}), ${bannerUsarEm.por === 'manual' ? 'definido em Materiais do cliente ("Usar em: Banner"). Ordem e "Juntar fotos": em Materiais (passo 2).' : 'definido pelo texto "Como eu quero o site". Escolher aqui vale mais que o texto.'}`
            : bannerUsarEm?.por === 'manual' ? `Definida em Materiais do cliente: ${esc(rotuloFoto(bannerUsarEm))} ("Usar em: Banner"). Para trocar, mude lá (passo 2).`
            : bannerUsarEm ? `No banner agora: ${esc(rotuloFoto(bannerUsarEm))} (definido pelo texto "Como eu quero o site"). Escolher aqui vale mais que o texto.`
            : imgs.length ? 'Imagens de "Materiais do cliente".' : 'Envie uma imagem em "Materiais do cliente" (passo 2) para usar aqui.'}</span></label>
        <fieldset class="text-sm"><legend>Fotos dos produtos</legend>${Object.entries(AJUSTES_FOTO).map(([k, t]) => `<label class="mr-3 inline-flex items-center gap-1"><input type="radio" name="ctl-fotos" value="${k}" data-ctl-fotos ${fotos === k ? 'checked' : ''}> ${t}</label>`).join('')}
          <span class="hint block">Inteiras: sem cortar nada. Preencher: ocupa o quadro (as bordas podem ser cortadas).</span></fieldset></div>
      <p class="mt-3 text-sm font-medium">Seções (ordem e visibilidade)</p>
      <ol class="mt-1 space-y-1" data-ctl-secoes>${ordem.map((k, i) => `<li class="flex items-center gap-2 rounded bg-slate-50 px-2 py-1 text-sm" data-secao="${k}">
        <label class="flex flex-1 items-center gap-2"><input type="checkbox" data-ctl-mostrar="${k}" ${ocultas.includes(k) ? '' : 'checked'}> ${esc(nomeSecao(k))}</label>
        <button type="button" class="btn-ghost btn-sm !px-2" data-ctl-subir="${k}" ${i ? '' : 'disabled'} aria-label="Subir ${esc(nomeSecao(k))}"><i class="fa-solid fa-arrow-up"></i></button>
        <button type="button" class="btn-ghost btn-sm !px-2" data-ctl-descer="${k}" ${i < ordem.length - 1 ? '' : 'disabled'} aria-label="Descer ${esc(nomeSecao(k))}"><i class="fa-solid fa-arrow-down"></i></button></li>`).join('')}</ol></details>`;
  }
  function ligarAjustesRapidos() {
    const aplicarControle = async (ops) => {
      const antes = estadoDoSite(site, modoV);
      const r = aplicarOperacoes(antes, ops, { modo: modoV, materiais, produtos });
      if (!r.mudancas.length) { toast(r.descartadas[0]?.motivo ? `Nada mudou: ${r.descartadas[0].motivo}.` : 'Nada mudou.', 'info'); return; }
      const v = registrarVersao(site, { modo: modoV, estadoAntes: antes, estadoDepois: r.estado, resumo: resumoMudancas(r.mudancas), origem: 'controle' });
      await salvarSite({ ...r.estado, ...v });
      if (planoAplicado(site)) await conferirDoSite().catch(() => {});
      toast(`${resumoMudancas(r.mudancas)} (v${v.proximaVersao - 1}).`);
      recarregar();
    };
    on(alvo, 'change', '[data-ctl-banner]', (s) => aplicarControle([{ op: 'imagem', bloco: custom ? 'hero' : 'banner', materialId: s.value || null }]));
    on(alvo, 'change', '[data-ctl-fotos]', (r) => aplicarControle([{ op: 'fotos', ajuste: r.value }]));
    on(alvo, 'change', '[data-ctl-mostrar]', (c) => aplicarControle([{ op: c.checked ? 'mostrar' : 'ocultar', bloco: c.dataset.ctlMostrar }]));
    on(alvo, 'click', '[data-ctl-subir]', (b) => { const o = ordemAtual(), k = b.dataset.ctlSubir; aplicarControle([{ op: 'mover', bloco: k, antesDe: o[o.indexOf(k) - 1] }]); });
    on(alvo, 'click', '[data-ctl-descer]', (b) => { const o = ordemAtual(), k = b.dataset.ctlDescer; aplicarControle([{ op: 'mover', bloco: k, depoisDe: o[o.indexOf(k) + 1] }]); });
  }

  // ---------- "Conteúdo da loja" (o caminho sem IA) ----------
  function formularioConteudoHtml(c, cfg) {
    return `<form id="fc" class="mt-3 space-y-3"><p class="caption">Preencha à mão e clique em "Salvar conteúdo". "Gerar site" (acima) escreve estes campos com a IA. Depoimentos: os reais (provas em texto, prints, criativos) entram sozinhos; sem nenhuma prova, a IA escreve modelos marcados "[MODELO – substituir]".</p>
      <div><label class="label">Título do banner (hero)</label><input class="input" name="heroTitulo" value="${esc(c.heroTitulo)}"></div>
      <div><label class="label">Subtítulo</label><input class="input" name="heroSubtitulo" value="${esc(c.heroSubtitulo)}"></div>
      <div><label class="label">Texto do botão do banner</label><input class="input" name="heroCta" value="${esc(c.heroCta)}"></div>
      <div><label class="label">História da marca</label><textarea class="input" rows="4" name="storytelling">${esc(c.storytelling)}</textarea></div>
      <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Mais opções</summary><div class="mt-3 space-y-3">
        ${custom ? `<div class="grid grid-cols-2 gap-3"><div><label class="label">Cor principal</label><input type="color" class="h-10 w-full rounded" name="corPrimaria" value="${esc(cfg.corPrimaria || '#4f46e5')}"></div>
          <div><label class="label">Cor de fundo</label><input type="color" class="h-10 w-full rounded" name="corFundo" value="${esc(cfg.corFundo || '#ffffff')}"></div></div>
          <div><label class="label">WhatsApp (com DDD)</label><input class="input" name="whatsapp" value="${esc(cfg.whatsapp)}" placeholder="5511999999999"></div>` : ''}
        <div><label class="label">Depoimentos escritos (um por linha: Nome | texto)</label><textarea class="input" rows="3" name="depoimentos" placeholder="Ana | Chegou rápido e serviu certinho">${esc((c.depoimentos || []).filter((d) => !depoimentoGerido(d) && d.origem !== 'prova_texto').map((d) => `${d.nome} | ${d.texto}`).join('\n'))}</textarea>
          <p class="hint">Use depoimentos reais. Os que começam com "[MODELO" foram escritos pela IA só porque ainda não havia prova social: troque por reais. As provas em texto do perfil de marca, os prints e os criativos não aparecem aqui: são lidos da fonte.</p></div>
        ${custom ? `<div><label class="label">Perguntas frequentes (uma por linha: pergunta | resposta)</label><textarea class="input" rows="4" name="faq" placeholder="E se não servir? | A troca é grátis em até 30 dias.">${esc(faqParaTexto(c.faq || []))}</textarea>
          <p class="hint">Pergunta sem resposta não aparece. ${objecoesDe(cliente).length ? `Base: as ${objecoesDe(cliente).length} objeção(ões) do perfil de marca.` : 'Sem objeções no perfil de marca: com o campo vazio, a seção não aparece.'}</p>
          ${objecoesDe(cliente).length ? `<div class="mt-1 flex flex-wrap gap-2"><button type="button" class="btn-ia btn-sm" data-faq-ia title="Só a FAQ: não mexe no resto do conteúdo"><i class="fa-solid fa-wand-magic-sparkles"></i> Escrever só a FAQ com IA</button>
            <button type="button" class="btn-ghost btn-sm" data-faq-manual title="Coloca as objeções como perguntas; você escreve as respostas">Montar perguntas das objeções (sem IA)</button></div>` : ''}</div>
        <div><label class="label">Formas de pagamento no selo "Compra segura"</label><div class="flex flex-wrap gap-3 text-sm">${FORMAS_PAGAMENTO.map(([k, t]) => `<label class="flex items-center gap-1"><input type="checkbox" name="pag_${k}" ${(cfg.pagamentos || PAGAMENTOS_PADRAO).includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}</div>
          <p class="hint">Marque só o que o checkout do cliente aceita de verdade.</p></div>` : ''}
        <div><label class="label">Newsletter — título</label><input class="input" name="newsletterTitulo" value="${esc(c.newsletterTitulo)}"></div>
        <div><label class="label">Política de trocas</label><textarea class="input" rows="2" name="trocas">${esc(c.politicas?.trocas)}</textarea></div>
        <div><label class="label">Política de envio</label><textarea class="input" rows="2" name="envio">${esc(c.politicas?.envio)}</textarea></div>
        <div><label class="label">Política de privacidade</label><textarea class="input" rows="2" name="privacidade">${esc(c.politicas?.privacidade)}</textarea></div>
      </div></details>
      <button class="btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar conteúdo</button></form>`;
  }
  function ligarFormularioConteudo(c, cfg) {
    const lerConteudo = () => {
      const v = lerForm($('#fc', alvo));
      const escritos = listaDeLinhas(v.depoimentos).map((l) => { const [nome, ...t] = l.split('|'); return { nome: nome.trim(), texto: t.join('|').trim() }; }).filter((d) => d.texto);
      // Este formulário só edita os escritos à mão: criativos, prints e provas do perfil continuam como estão.
      const dep = [...escritos, ...(c.depoimentos || []).filter((d) => depoimentoGerido(d) || d.origem === 'prova_texto')];
      return {
        conteudo: { ...c, heroTitulo: v.heroTitulo, heroSubtitulo: v.heroSubtitulo, heroCta: v.heroCta, storytelling: v.storytelling, depoimentos: dep,
          newsletterTitulo: v.newsletterTitulo, politicas: { trocas: v.trocas, envio: v.envio, privacidade: v.privacidade }, ...(custom ? { faq: textoParaFaq(v.faq) } : {}) },
        config: { ...cfg, ...(custom ? { corPrimaria: v.corPrimaria, corFundo: v.corFundo, whatsapp: v.whatsapp, pagamentos: FORMAS_PAGAMENTO.map(([k]) => k).filter((k) => $('#fc', alvo).elements['pag_' + k]?.checked) } : {}) },
      };
    };
    on(alvo, 'submit', '#fc', async (f, ev) => { ev.preventDefault(); await ocupado(f.querySelector('[type=submit]'), async () => { await salvarEVersionar(lerConteudo(), 'Edição no formulário "Conteúdo da loja"'); toast('Conteúdo salvo.'); recarregar(); }); });
    on(alvo, 'click', '[data-faq-manual]', () => {
      const t = $('#fc [name=faq]', alvo);
      t.value = [t.value.trim(), perguntasDasObjecoes(cliente)].filter(Boolean).join('\n');
      toast('Perguntas colocadas. Escreva a resposta depois do | e clique em "Salvar conteúdo".', 'info');
    });
    on(alvo, 'click', '[data-faq-ia]', (b) => ocupado(b, async () => {
      const faq = await gerarFaqSite({ cliente, produtos, politicas: c.politicas || {} });
      $('#fc [name=faq]', alvo).value = faqParaTexto(faq);
      toast(`A IA escreveu ${faq.length} pergunta(s). Revise e clique em "Salvar conteúdo".`, 'info');
    }));
  }

  // Prévia isolada: o site roda num iframe sandbox (origem própria, sem acesso aos dados/login do painel).
  function abrirNovaAba() {
    const w = window.open('', '_blank');
    if (!w) return toast('O navegador bloqueou a nova aba. Libere pop-ups para este endereço e tente de novo.', 'erro');
    w.document.open();
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Prévia — ${esc(cliente.nome)}</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style>
<iframe sandbox="allow-scripts allow-popups allow-forms allow-modals" srcdoc="${esc(html())}"></iframe>`);
    w.document.close();
  }

  // ==================== 5. Aprovar ====================
  async function passo5() {
    alvo.innerHTML = `<p class="caption mb-3">O link mostra o site como está agora; o cliente abre sem login e clica em Aprovar ou Pedir ajuste. ${!gerado ? '<b>Gere o site no passo 4 antes de mandar o link.</b>' : ''}</p><div data-aprovacoes-passo></div>`;
    const { view: aprovacoesView } = await import('./aprovacoes-site.js');
    await aprovacoesView($('[data-aprovacoes-passo]', alvo), cliente);
  }

  // ==================== 6. Subir na plataforma ====================
  async function passo6() {
    const lista = etapas[5].checklist || [];
    const prints = printsDoCliente(materiais);
    const d = !custom && gerado ? dadosPacote() : null;
    const grupos = d ? gruposPlataforma(d) : [];
    const nomeP = plat ? PLATAFORMAS_SITE.find(([k]) => k === plat)[1] : '';
    const grupoHTML = (g, gi) => `<details class="rounded-lg border border-slate-200 p-2" ${gi < 3 ? 'open' : ''} data-grupo-plataforma="${esc(g.id)}"><summary class="cursor-pointer text-sm font-semibold">${esc(g.titulo)}</summary>
      <p class="hint mt-1"><i class="fa-solid fa-location-arrow"></i> Onde colocar: <b data-caminho>${esc(g.caminho)}</b></p>
      <ul class="mt-1 space-y-1">${g.itens.map((it, ii) => `<li class="flex items-start justify-between gap-2 rounded bg-slate-50 p-2 text-sm"><div class="min-w-0"><p class="text-xs text-slate-500">${esc(it.rotulo)}</p>
        ${it.tipo === 'imagem' ? `<img src="${esc(it.valor)}" alt="" class="mt-1 max-h-12" style="background:repeating-conic-gradient(#cbd5e1 0% 25%,#fff 0% 50%) 50%/12px 12px">` : `<p class="whitespace-pre-wrap">${esc(it.valor.length > 400 ? it.valor.slice(0, 400) + '…' : it.valor)}</p>`}</div>
        ${it.tipo === 'imagem' ? '' : `<button type="button" class="btn-ghost btn-sm shrink-0" data-copiar-item="${gi}-${ii}"><i class="fa-solid fa-copy"></i> Copiar</button>`}</li>`).join('')}</ul></details>`;
    alvo.innerHTML = `<div class="card"><h3 class="font-semibold">${plat ? `${esc(nomeP)}${nomeTema(site) ? ` · tema ${esc(nomeTema(site))}` : ''}` : 'Plataforma não escolhida'}</h3>
        ${!plat ? `<p class="mt-1 text-sm text-amber-800">Escolha a plataforma no passo 3 para ver os caminhos certos. <a class="underline" href="${rotaDoPasso(cliente.id, 3)}">Ir para o passo 3</a></p>`
          : custom ? '<p class="caption">Site personalizado: não há plataforma. Baixe a pasta e siga "Como publicar este site", abaixo.</p>'
          : !gerado ? `<p class="mt-1 text-sm text-amber-800">Gere o pacote no passo 4 para ver o que colocar em cada lugar. <a class="underline" href="${rotaDoPasso(cliente.id, 4)}">Ir para o passo 4</a></p>`
          : `<p class="hint mb-2">Cada conteúdo, agrupado pelo lugar onde entra na ${esc(nomeP)}. Os produtos também vão no CSV.</p><div class="space-y-2" data-o-que-colocar>${grupos.map(grupoHTML).join('')}</div>`}</div>
      <div class="card mt-4"><h3 class="font-semibold">Downloads</h3><div class="mt-2 flex flex-wrap gap-2" data-downloads>
        ${custom ? `<button type="button" class="btn-primary" data-baixar-zip ${produtos.length && gerado ? '' : 'disabled'}><i class="fa-solid fa-file-zipper"></i> Pasta do site (.zip)</button>
          <button type="button" class="btn-ghost" data-baixar-site ${produtos.length && gerado ? '' : 'disabled'}><i class="fa-solid fa-download"></i> Só o index.html</button>
          <button type="button" class="btn-ghost" data-preview ${gerado ? '' : 'disabled'}><i class="fa-solid fa-eye"></i> Ver prévia em nova aba</button>`
        : `<button type="button" class="btn-primary" data-csv ${produtos.length && plat ? '' : 'disabled'}><i class="fa-solid fa-file-csv"></i> Catálogo (CSV${plat ? ` ${esc(nomeP)}` : ''})</button>
          ${site?.pacote ? '<button type="button" class="btn-ghost" data-baixar-pacote><i class="fa-solid fa-download"></i> Banners e briefing (.txt)</button>' : ''}
          ${cliente.logoArquivo ? '<button type="button" class="btn-ghost" data-baixar-logo><i class="fa-solid fa-copyright"></i> Logo (original)</button>' : ''}
          ${d?.visual?.banner?.url ? '<button type="button" class="btn-ghost" data-baixar-banner><i class="fa-solid fa-image"></i> Imagem do banner</button>' : ''}
          ${prints.length ? '<button type="button" class="btn-ghost" data-baixar-prints><i class="fa-solid fa-images"></i> Prints de clientes (.zip)</button>' : ''}
          ${d && arquivosPorPasta(d).length ? `<button type="button" class="btn-primary" data-baixar-por-lugar title="Cada foto já recortada no tamanho do lugar e do aparelho: banner/ (banner-1-desktop.jpg, banner-1-mobile.jpg...), produtos/<nome do produto>/, clientes-reais/ (cópias borradas), sobre/ e galeria/"><i class="fa-solid fa-folder-tree"></i> Imagens por lugar (.zip, ${arquivosPorPasta(d).length} arquivo(s))</button>` : ''}`}
        <button type="button" class="btn-ghost" data-manual ${plat ? '' : 'disabled'}><i class="fa-solid fa-file-pdf"></i> Manual de entrega (PDF)</button></div></div>
      ${custom ? comoPublicarHTML(cliente) : ''}
      <div class="card mt-4" data-ancora="publicado"><h3 class="font-semibold">Loja no ar</h3>
        <div class="mt-2 grid gap-3 sm:grid-cols-2"><div><label class="label">Endereço da loja já publicada</label><input class="input" name="link" data-link value="${esc(site?.linkPublicado)}" placeholder="https://…">
          <p class="hint">A aba Campanhas sugere este link como destino dos anúncios${custom ? ', e o site baixado de novo já sai com a prévia certa para o WhatsApp' : ''}.</p></div>
          <div><label class="label">Status</label><select class="input" data-status ${site ? '' : 'disabled'}>${opcoes(STATUS_SITE, site?.status)}</select></div></div></div>
      ${tarefasLojaHtml(site, plat, site?.tema)}
      <div class="card mt-4" data-checklist-final><h3 class="font-semibold">Checklist final</h3><ul class="mt-2 space-y-1 text-sm">${lista.map((x) => `<li class="flex flex-wrap items-center gap-2" data-check="${x.id}" data-ok="${x.ok}">
        <i class="fa-solid ${x.ok ? 'fa-circle-check text-emerald-600' : 'fa-circle-xmark text-amber-600'}"></i><span class="flex-1">${esc(x.texto)}</span>${x.ok ? '' : `<span class="text-xs text-amber-800">${esc(x.falta)}</span>`}</li>`).join('')}</ul></div>`;
    const marcarExportado = () => salvarSite({ exportadoEm: new Date().toISOString(), status: site?.status === 'rascunho' ? 'pronto' : site?.status });
    on(alvo, 'click', '[data-copiar-item]', (b) => { const [gi, ii] = b.dataset.copiarItem.split('-').map(Number); const it = grupos[gi]?.itens[ii]; if (it) copiar(it.valor); });
    on(alvo, 'click', '[data-baixar-site]', async () => { baixarTexto(`${slug(cliente.nome) || 'loja'}-index.html`, html(), 'text/html;charset=utf-8'); await marcarExportado(); recarregar(); });
    on(alvo, 'click', '[data-baixar-zip]', async () => {
      if (!(await autorizarPrints(printsDoCliente(materiais)))) return; // prints sem borrar só com autorização
      const pasta = pastaDoSite(cliente);
      const logo = await arquivoDoLogo(cliente); // o logo vai DENTRO da pasta, com os bytes originais
      if (cliente.logoArquivo && !logo) toast('Não consegui baixar o arquivo do logo agora: o site aponta para o endereço dele na internet.', 'info');
      baixarTexto(`${pasta}.zip`, criarZip([{ nome: `${pasta}/index.html`, conteudo: html(logo ? { logoUrl: logo.nome } : {}) }, ...(logo ? [{ nome: `${pasta}/${logo.nome}`, conteudo: logo.bytes }] : [])]), 'application/zip');
      await marcarExportado(); toast('Pasta do site baixada. Próximo passo: "Como publicar este site", logo abaixo.', 'info'); recarregar();
    });
    on(alvo, 'click', '[data-preview]', () => abrirNovaAba());
    on(alvo, 'click', '[data-csv]', async () => {
      if (!plat || custom) return toast('Escolha a plataforma (Shopify ou Nuvemshop) no passo 3: o CSV muda de formato.', 'erro');
      const listaCsv = comTextosDoPacote(produtosComF(), site.pacote); // descrições/SEO do pacote; fotos na ordem de "Usar em"
      const csv = plat === 'shopify' ? csvShopify(listaCsv, cliente) : csvNuvemshop(listaCsv, cliente);
      baixarTexto(`catalogo-${plat}-${slug(cliente.nome)}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
      await salvarSite({ exportadoEm: new Date().toISOString() }); toast('CSV gerado. Confira as colunas no passo a passo do manual.'); recarregar();
    });
    on(alvo, 'click', '[data-baixar-logo]', (b) => ocupado(b, async () => {
      const logo = await arquivoDoLogo(cliente);
      if (!logo) throw new Error('Não consegui baixar o logo agora. Tente de novo.');
      baixarTexto(`${slug(cliente.nome) || 'loja'}-${logo.nome}`, logo.bytes, cliente.logoArquivo.tipo);
    }));
    on(alvo, 'click', '[data-baixar-pacote]', () => baixarTexto(`pacote-${slug(cliente.nome)}.txt`, pacoteTexto(site.pacote), 'text/plain;charset=utf-8'));
    on(alvo, 'click', '[data-baixar-prints]', (b) => ocupado(b, async () => baixarPrintsZip(cliente, printsDoCliente(materiais))));
    on(alvo, 'click', '[data-baixar-banner]', (b) => ocupado(b, async () => {
      const ban = dadosPacote().visual.banner; const r = await fetch(ban.url); if (!r.ok) throw new Error('Não consegui baixar a imagem do banner. Tente de novo.');
      const bl = await r.blob(); baixarTexto(`banner-${slug(cliente.nome) || 'loja'}.${{ 'image/png': 'png', 'image/webp': 'webp' }[bl.type] || 'jpg'}`, new Uint8Array(await bl.arrayBuffer()), bl.type);
    }));
    on(alvo, 'click', '[data-baixar-por-lugar]', (b) => ocupado(b, async () => {
      if (!(await autorizarPrints(printsDoCliente(materiais)))) return; // prints e fotos com pessoa sem borrar: só com autorização
      const arquivos = arquivosPorPasta(dadosPacote());
      const pasta = `imagens-${slug(cliente.nome) || 'loja'}`, falhas = [], itens = [];
      // Cada arquivo já recortado no tamanho do lugar e do aparelho (ponto focal dentro); os originais não mudam.
      const prog = b.closest('[data-downloads]')?.parentElement;
      try {
        for (const [i, a] of arquivos.entries()) {
          b.textContent = `Recortando ${i + 1} de ${arquivos.length}…`;
          try { itens.push({ nome: `${pasta}/${a.caminho}`, conteudo: await desenharArquivo(a) }); } catch { falhas.push(a.caminho); }
        }
      } finally { limparCache(); }
      if (prog && itens.length) mostrarResultado(prog, `Baixado: ${itens.length} arquivo(s) já no tamanho de cada lugar (banner-1-desktop.jpg, banner-1-mobile.jpg, produto-1.jpg...). Os originais continuam em Materiais.`);
      if (!itens.length) throw new Error('Não consegui baixar nenhuma imagem agora. Tente de novo em instantes.');
      baixarTexto(`${pasta}.zip`, criarZip(itens), 'application/zip');
      if (falhas.length) toast(`${falhas.length} imagem(ns) não baixaram e ficaram fora do .zip:\n${falhas.join('\n')}`, 'erro');
      else toast(`Baixado: ${itens.length} imagem(ns) recortadas por lugar e aparelho (banner, produtos, clientes-reais, sobre, galeria). Veja em "O que colocar na plataforma" qual arquivo vai em cada slide e posição.`);
    }));
    on(alvo, 'click', '[data-manual]', async () => {
      if (!plat) return toast('Escolha a plataforma no passo 3: o manual muda conforme ela.', 'erro');
      const versao = (site.versaoManual || 0) + 1;
      (await (custom ? manualCustom : manualPacote)({ cliente, site, produtos: produtosComF(), versao })).salvar(`manual-entrega-${slug(cliente.nome)}-v${versao}.pdf`);
      await salvarSite({ versaoManual: versao }); toast(`Manual v${versao} gerado.`); recarregar();
    });
    on(alvo, 'change', '[data-link]', (i) => salvarSite({ linkPublicado: i.value.trim(), ...(i.value.trim() ? { status: 'publicado' } : {}) }).then(() => { toast('Link salvo.'); recarregar(); }));
    on(alvo, 'change', '[data-status]', (s) => salvarSite({ status: s.value }).then(recarregar));
    on(root, 'click', '[data-concluir]', () => {
      const pend = lista.filter((x) => !x.ok);
      if (pend.length) { toast(`Ainda falta: ${pend.map((x) => x.texto.toLowerCase()).join('; ')}.`, 'erro'); $('[data-checklist-final]', alvo)?.scrollIntoView({ block: 'center' }); return; }
      mostrarResultado($('[data-checklist-final]', alvo), 'Tudo certo: a loja deste cliente está montada e no ar.');
    });
  }

  // Por último: os passos usam as funções e constantes definidas acima.
  const PASSOS = { 1: passo1, 2: passo2, 3: passo3, 4: passo4, 5: passo5, 6: passo6 };
  await PASSOS[passo]();
});

/** Nome da pasta do site dentro do .zip (e do .zip em si). */
const pastaDoSite = (cliente) => `site-${slug(cliente.nome) || 'loja'}`;

/** Bytes ORIGINAIS do logo salvo (sem converter) e o nome do arquivo na pasta: { nome: 'logo.png', bytes } ou null. */
async function arquivoDoLogo(cliente) {
  const l = cliente.logoArquivo; if (!l?.url) return null;
  try {
    const r = await fetch(l.url); if (!r.ok) return null;
    const ext = { 'image/svg+xml': 'svg', 'image/jpeg': 'jpg' }[l.tipo] || 'png';
    return { nome: `logo.${ext}`, bytes: new Uint8Array(await r.arrayBuffer()) };
  } catch { return null; }
}

/**
 * "Como publicar este site" (modo custom). Política: o site do CLIENTE nunca roda no servidor/VM nem no projeto
 * Firebase do painel — cada cliente numa hospedagem própria e separada (isola problema técnico e pico de tráfego de
 * um cliente do painel de trabalho, e deixa claro de quem é o site). Este app só gera o arquivo; não publica.
 */
function comoPublicarHTML(cliente) {
  return `<div class="card mt-4" data-como-publicar><h3 class="mb-1 font-semibold"><i class="fa-solid fa-globe mr-1 text-indigo-500"></i> Como publicar este site</h3>
    <p class="caption mb-3">Publicar = colocar o site na internet com um endereço (ex.: <code>loja-da-ana.netlify.app</code>). Este app não faz isso sozinho: você envia a pasta baixada para uma hospedagem gratuita. Leva uns 5 minutos na primeira vez.</p>
    <ol class="list-decimal space-y-1 pl-5 text-sm">
      <li>Clique em <b>"Baixar pasta do site pronta para publicar (.zip)"</b>, acima.</li>
      <li>No computador, abra a pasta Downloads, clique com o botão direito no arquivo <code>${esc(pastaDoSite(cliente))}.zip</code> e escolha <b>"Extrair tudo"</b> (no Mac, dois cliques). Aparece a pasta <code>${esc(pastaDoSite(cliente))}</code>, com o site dentro.</li>
      <li>Entre em <a class="text-indigo-600 underline" href="https://app.netlify.com/drop" target="_blank" rel="noopener">app.netlify.com/drop</a> e crie uma conta grátis (sem conta, o site sai do ar depois de pouco tempo). O ideal é uma conta <b>no e-mail do cliente</b>, ou uma conta sua separada só para ele.</li>
      <li><b>Arraste a pasta</b> (não o .zip) para o quadro da página. Em poucos segundos aparece o endereço do site.</li>
      <li>Abra o endereço para conferir e cole ele no campo <b>"Endereço do site já publicado"</b>, acima.</li>
      <li>Opcional: para usar um domínio próprio (ex.: <code>lojadaana.com.br</code>), siga "Domain management" no Netlify.</li></ol>
    <p class="hint mt-2">Para atualizar depois: baixe a pasta de novo e, no Netlify, abra o mesmo site > aba "Deploys" e arraste a pasta nova. Funciona igual em outras hospedagens gratuitas (Cloudflare Pages, Vercel).</p>
    <div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800" data-politica-hospedagem>
      <p><b><i class="fa-solid fa-shield-halved mr-1"></i> Regra: cada cliente numa hospedagem própria, nunca no servidor deste painel.</b></p>
      <p class="mt-1">Não publique o site do cliente no mesmo servidor (VM) nem no mesmo projeto Firebase deste painel. Assim, se o site de um cliente tiver um problema ou muitas visitas de uma vez, o painel de trabalho não é afetado, e fica claro que o site é do cliente. Depois de entregue, manter o site no ar é responsabilidade de quem é dono da hospedagem, a não ser que você tenha combinado outra coisa com o cliente (o manual de entrega explica isso a ele).</p></div></div>`;
}

function pacoteHTML(p) {
  const banners = (p.banners || []).map((b) => `<li><b>${esc(b.titulo)}</b> — ${esc(b.subtitulo)} <span class="tag">${esc(b.cta)}</span> <span class="hint">${esc(b.uso)}</span></li>`).join('');
  const t = p.briefingTema || {};
  return `<div class="mt-3 grid gap-4 md:grid-cols-2"><div><h4 class="text-sm font-semibold">Banners</h4><ul class="list-disc space-y-1 pl-5 text-sm">${banners}</ul></div>
    <div><h4 class="text-sm font-semibold">Briefing do tema</h4><p class="text-sm">Estilo: ${esc(t.estilo)}</p><p class="text-sm">Tipografia: ${esc(t.tipografia)}</p>
    <p class="mt-1 flex gap-1">${(t.paletaSugerida || []).map((h) => `<span class="inline-block h-6 w-6 rounded border" style="background:${esc(h)}" title="${esc(h)}"></span>`).join('')}</p>
    <p class="text-sm">Seções da home: ${esc((t.secoesHome || []).join(' → '))}</p><p class="text-sm">${esc(t.observacoes)}</p></div></div>`;
}
export function pacoteTexto(p) {
  const t = p.briefingTema || {};
  return ['BANNERS', ...(p.banners || []).map((b) => `- ${b.titulo} | ${b.subtitulo} | CTA: ${b.cta} | ${b.uso}`), '', 'BRIEFING DO TEMA',
    `Estilo: ${t.estilo}`, `Tipografia: ${t.tipografia}`, `Paleta: ${(t.paletaSugerida || []).join(', ')}`, `Seções: ${(t.secoesHome || []).join(' > ')}`, `Obs.: ${t.observacoes}`, '',
    'SOBRE', p.textosPagina?.sobre || '', '', 'FAQ', ...(p.textosPagina?.faq || []).map((f) => `P: ${f.p}\nR: ${f.r}`), '', 'DESCRIÇÕES DE PRODUTO',
    ...(p.descricoesProdutos || []).map((d) => `${d.nome}\n${d.descricao}\nSEO: ${d.seoTitulo} — ${d.seoDescricao}`),
    ...(p.depoimentos?.length ? ['', 'DEPOIMENTOS (os mesmos do site personalizado)', ...p.depoimentos.map((d) => `"${d.texto}" — ${d.nome}${d.midiaUrl ? ` (mídia: ${d.midiaUrl})` : ''}`)] : [])].join('\n');
}

// ---------- manuais de entrega (PDF) ----------
async function manualCustom({ cliente, site, produtos, versao }) {
  const pdf = await criarPdf(`Manual de entrega — ${cliente.nome}`, `Site personalizado · versão ${versao} · gerado em ${new Date().toLocaleDateString('pt-BR')} · ${produtos.length} produto(s)`);
  pdf.secao('Resumo para o dono da loja')
    .lista(['Seu site está pronto: é uma pasta com todos os produtos, fotos, textos e o carrinho de compras.', 'Antes de vender, faltam 2 coisas: colocar o site no ar (seção 2, dá para fazer sozinho em uns 5 minutos) e ligar a forma de pagamento (seção 3, é a parte técnica: pode encaminhar este manual para quem vai fazer).', 'O site fica numa hospedagem em seu nome, separada de tudo da agência. Quem é dono dessa conta cuida para ele continuar no ar.'])
    .texto('As seções marcadas como (parte técnica) são para quem vai fazer a instalação; você não precisa entendê-las.');
  pdf.secao('1. O que você recebeu')
    .texto(`Uma pasta chamada ${pastaDoSite(cliente)} (entregue compactada em .zip) com o site inteiro num único arquivo, index.html (HTML, CSS e JavaScript no mesmo arquivo), com: banner principal, categorias, mais vendidos, sale, catálogo, história da marca, depoimentos, perguntas frequentes (quando há), newsletter, rodapé com políticas, botão flutuante de WhatsApp, carrinho que funciona no navegador do visitante, selo de compra segura perto do "Finalizar compra" e aviso de cookies (LGPD).`)
    .texto('Quando alguém compartilhar o link do site no WhatsApp ou nas redes, aparecem o nome da loja, uma descrição e a foto do 1º produto (tecnicamente: tags Open Graph no <head>; o endereço final entra quando quem gerou o site informa o link publicado e gera de novo).')
    .texto('IMPORTANTE: sozinho, o site ainda NÃO recebe pagamentos. O botão "Finalizar compra" precisa ser ligado a um serviço de pagamento (Mercado Pago, Stripe ou Shopify), explicado na seção 3. Para quem vai instalar: o ponto de encaixe é a função window.checkoutHandler(itens), no fim do arquivo.');
  pdf.secao('2. Como publicar o site')
    .lista(['Extraia o .zip (botão direito > "Extrair tudo") e abra o index.html da pasta no navegador para conferir textos, preços, fotos e cores.', 'Troque os depoimentos-modelo por depoimentos reais e revise as políticas com um profissional (texto-base, sem valor jurídico).',
      'Crie uma conta grátis em app.netlify.com/drop (de preferência no e-mail do dono da loja) e arraste a PASTA (não o .zip) para o quadro da página. Em segundos aparece o endereço do site. Outras hospedagens gratuitas funcionam igual (Cloudflare Pages, Vercel).', 'Para usar um domínio próprio (ex.: lojadaana.com.br), siga as instruções de "domínio" da hospedagem.',
      'Para atualizar o site depois: gere a pasta de novo e envie para o MESMO site na hospedagem (no Netlify: aba "Deploys", arrastar a pasta nova).'], true)
    .texto('Hospedagem e responsabilidade', { negrito: true })
    .lista(['Cada site de cliente tem a sua própria hospedagem, separada. Ele nunca é publicado no servidor nem no projeto do painel de trabalho da agência: assim um problema técnico ou um pico de visitas neste site não afeta nenhum outro sistema, e fica claro que o site pertence ao cliente.',
      'Depois de entregue, manter o site no ar (hospedagem, domínio, renovações) é responsabilidade de quem é dono da conta de hospedagem. A agência não é responsável por manter o site no ar, a não ser que isso tenha sido combinado explicitamente com o cliente.']);
  pdf.secao('3. Ligando o pagamento (parte técnica, escolha UMA opção)')
    .texto('Em todos os casos, o pagamento acontece na página segura do provedor. Nunca coloque chaves secretas dentro do index.html — ele é público.', { negrito: true });
  const pref = site.pagamentoPreferido;
  if (pref && pref !== 'nao_sei') pdf.texto(`Forma de pagamento pretendida pelo cliente: ${(PAGAMENTOS_PRETENDIDOS.find(([k]) => k === pref) || [, pref])[1]}${pref === 'nativa' ? ' — no site personalizado não há checkout nativo; considere o modo pacote (Nuvemshop/Shopify) ou uma das opções abaixo.' : ' — essa opção vem primeiro abaixo.'}`);
  const checkouts = [];
  checkouts.push(['shopify', () => pdf.texto('Opção A — Shopify Buy Button', { negrito: true }).lista(['Crie uma conta Shopify e cadastre os mesmos produtos (dá para usar o CSV do modo pacote).', 'Instale/ative o canal "Buy Button" no admin da Shopify.',
    'Crie um Buy Button para cada produto (ou uma coleção) e copie o código gerado.', 'No index.html, cole o código do botão no ponto marcado como PONTO DE ENCAIXE DO CHECKOUT, ou faça o checkoutHandler redirecionar para a URL de checkout do produto.',
    'Teste uma compra em modo de teste antes de divulgar.'], true)]);
  checkouts.push(['mercado_pago', () => pdf.texto('Opção B — Mercado Pago Checkout Pro', { negrito: true }).lista(['Crie uma conta de vendedor no Mercado Pago e uma aplicação em "Suas integrações" para obter as credenciais.',
    'Como a criação da "preferência de pagamento" exige o Access Token (SECRETO), ela precisa rodar em um servidor seu (ex.: função serverless). Nunca no navegador.', 'Esse servidor recebe os itens do carrinho, cria a preferência via API e devolve a URL (init_point).',
    'No index.html, faça o window.checkoutHandler chamar seu servidor e redirecionar o cliente para o init_point.', 'Configure as URLs de retorno (sucesso/falha) e teste com usuários de teste do Mercado Pago.'], true)]);
  checkouts.push(['stripe', () => pdf.texto('Opção C — Stripe Payment Links', { negrito: true }).lista(['Crie uma conta Stripe e, no Dashboard, crie um Payment Link para cada produto (preço fixo).', 'Copie a URL de cada Payment Link (algo como buy.stripe.com/...).',
    'No index.html, associe cada produto ao seu link e faça o checkoutHandler redirecionar para ele. Payment Links não exigem servidor, mas atendem 1 produto por link (não o carrinho inteiro).', 'Para carrinho com vários itens, use Stripe Checkout Sessions em um servidor seu.', 'Teste com cartões de teste do Stripe antes de ativar o modo real.'], true)]);
  // A opção que o cliente pretende usar (pergunta "h") sai primeiro; as demais seguem na ordem de sempre.
  [...checkouts.filter(([k]) => k === pref), ...checkouts.filter(([k]) => k !== pref)].forEach(([, escrever]) => escrever());
  const r = rastreamentoDe(cliente);
  pdf.secao('4. Pixel, Hotjar e chat ao vivo (parte técnica)');
  if (r.metaPixelId || r.googleAdsId) {
    pdf.lista([
      ...(r.metaPixelId ? [`Pixel do Meta ${r.metaPixelId}: já instalado no <head> do index.html, com PageView em cada visita e InitiateCheckout no botão "Finalizar compra".`] : []),
      ...(r.googleAdsId ? [`Google Ads ${r.googleAdsId}: tag já instalada no <head>${r.googleAdsRotulo ? `, com a conversão ${r.googleAdsId}/${r.googleAdsRotulo} no botão "Finalizar compra"` : ', com o evento begin_checkout no botão "Finalizar compra" (para contar como conversão, cadastre o ID com o rótulo: AW-.../rótulo)'}.`] : []),
      'LGPD: o Pixel e a tag só carregam depois que o visitante clica em "Aceitar" no aviso de cookies do site. Quem recusa não é rastreado — por isso os números do Meta/Google ficam um pouco abaixo das visitas reais.',
      'A compra (Purchase) acontece no checkout do provedor: ative lá a integração com o Pixel/Google Ads (Shopify, Mercado Pago e Stripe têm).',
      'Depois de publicar, confira no Gerenciador de Eventos do Meta (aba "Testar eventos") e no Google Ads (Conversões) se as visitas estão chegando.',
    ]);
  } else pdf.texto('Nenhum ID de Pixel/Google Ads cadastrado: o site foi gerado sem código de rastreamento. Para medir conversões, preencha em Editar cliente > Rastreamento e gere o site de novo.');
  if (r.hotjarId || r.tawkPropertyId) {
    pdf.texto('Hotjar e chat ao vivo', { negrito: true }).lista([
      ...(r.hotjarId ? [`Hotjar (site ${r.hotjarId}): já instalado. Mostra como as pessoas navegam e onde desistem (mapas de clique e gravações). Veja em hotjar.com, na conta dona desse ID.`] : []),
      ...(r.tawkPropertyId ? ['Tawk.to: o chat ao vivo já aparece no canto do site. As mensagens chegam no painel/app do Tawk.to (tawk.to), na conta dona desse chat: instale o app no celular para responder na hora.'] : []),
      'Assim como o Pixel, eles só carregam depois que o visitante clica em "Aceitar" no aviso de cookies. Quem recusa navega normalmente, mas sem gravação e sem o chat.',
    ]);
  }
  pdf.secao('5. Newsletter e WhatsApp')
    .lista(['Newsletter: o formulário só mostra confirmação local. Ligue-o ao Mailchimp, Brevo ou ferramenta similar (embed/ação do formulário).', `WhatsApp: ${site.config?.whatsapp ? 'já configurado (' + site.config.whatsapp + ').' : 'informe o número em "Configurar loja" e gere o site de novo.'}`]);
  pdf.secao('6. Checklist final').lista(['Fotos e preços conferidos', 'Depoimentos reais', 'Respostas da FAQ conferidas', 'Formas de pagamento do selo iguais às do checkout', 'Políticas revisadas', 'Checkout testado de ponta a ponta', 'Site publicado numa hospedagem própria do cliente (fora do servidor da agência)', 'Domínio e HTTPS funcionando', 'Pixel/analytics instalados (se houver)']);
  return pdf;
}

async function manualPacote({ cliente, site, produtos, versao }) {
  const plat = nomePlat(site.plataforma);
  const pdf = await criarPdf(`Manual de entrega — ${cliente.nome}`, `Pacote ${plat} · versão ${versao} · gerado em ${new Date().toLocaleDateString('pt-BR')} · ${produtos.length} produto(s)`);
  pdf.secao('Resumo para o dono da loja').lista([`Sua loja vai funcionar dentro da ${plat}, numa conta em seu nome: o pagamento, o frete e a hospedagem são da própria ${plat}.`, 'Este manual é o passo a passo para montar a loja lá com os arquivos entregues: catálogo de produtos, textos, banners e as cores do tema.', `Depois de montada, quem cuida da loja no ar é o dono da conta na ${plat}.`]);
  pdf.secao('1. O que você recebeu').lista(['Catálogo de produtos em CSV, no formato de importação da ' + plat + '.', 'Banners e textos prontos (título, subtítulo, CTA e onde usar).', 'Briefing do tema: estilo, paleta, tipografia e seções da home.', 'Textos de página (sobre, FAQ) e descrições/SEO dos produtos, quando gerados.']);
  if (site.pagamentoPreferido && site.pagamentoPreferido !== 'nao_sei') pdf.texto(`Forma de pagamento pretendida pelo cliente: ${(PAGAMENTOS_PRETENDIDOS.find(([k]) => k === site.pagamentoPreferido) || [, site.pagamentoPreferido])[1]}. Ative-a primeiro em "Configurando a loja" (meios de pagamento).`);
  if (site.plataforma === 'shopify') {
    pdf.secao('2. Importando o catálogo na Shopify').lista(['No admin, vá em Produtos > Importar e selecione o CSV.', 'Marque a opção de sobrescrever apenas se já existirem produtos com o mesmo Handle.', 'Revise a prévia da importação e conclua.',
      'Confira preços, variações e imagens (as imagens são baixadas das URLs do CSV; elas precisam estar acessíveis).', 'Ajuste estoque, peso e categoria de produto, que vão em branco.'], true);
    pdf.secao('3. Configurando a loja').lista(['Escolha um tema em Loja virtual > Temas e aplique a paleta e a tipografia do briefing.', 'Suba os banners no bloco de imagem/slideshow da home.', 'Crie as páginas Sobre e FAQ com os textos fornecidos.', 'Cadastre as políticas em Configurações > Políticas.', 'Configure frete e meios de pagamento (Shopify Payments ou provedor local).'], true);
  } else {
    pdf.secao('2. Importando o catálogo na Nuvemshop').lista(['No admin, vá em Produtos > Importar/Exportar e baixe a planilha modelo da própria Nuvemshop para comparar as colunas com o CSV gerado.', 'Se os nomes de colunas divergirem, ajuste o CSV para o modelo oficial (a plataforma pode alterar o formato).',
      'Envie o CSV e siga o assistente de importação.', 'Adicione as fotos dos produtos (a importação por planilha usa as fotos já hospedadas; envie manualmente se necessário).', 'Revise preços, variações, estoque e categorias.'], true);
    pdf.secao('3. Configurando a loja').lista(['Escolha um tema e aplique a paleta e a tipografia do briefing (Design > Personalizar).', 'Suba os banners no carrossel/banner principal.', 'Crie as páginas Sobre e FAQ com os textos fornecidos.', 'Cadastre as políticas de trocas, envio e privacidade.', 'Ative os meios de pagamento (Nuvempago, Mercado Pago, etc.) e de envio.'], true);
  }
  const t = site.pacote?.briefingTema;
  if (t) pdf.secao('4. Briefing do tema').texto(`Estilo: ${t.estilo}`).texto(`Tipografia: ${t.tipografia}`).texto(`Paleta: ${(t.paletaSugerida || []).join(', ')}`).texto(`Seções da home: ${(t.secoesHome || []).join(' > ')}`).texto(t.observacoes || '');
  const passosPixel = passosRastreamentoPacote(rastreamentoDe(cliente), site.plataforma, plat);
  pdf.secao('Rastreamento (Pixel do Meta e Google Ads)');
  if (passosPixel.length) pdf.lista(passosPixel, true);
  else pdf.texto('Nenhum ID de Pixel/Google Ads cadastrado para este cliente. Sem isso, as campanhas não medem conversão na loja: cadastre em Editar cliente > Rastreamento e gere o manual de novo.');
  const passosExtras = passosExtrasPacote(rastreamentoDe(cliente), site.plataforma, plat);
  if (passosExtras.length) pdf.secao('Hotjar (como as pessoas navegam) e Tawk.to (chat ao vivo)').lista(passosExtras, true);
  pdf.secao('Hospedagem e responsabilidade').lista([`A loja fica hospedada na própria ${plat}, na conta do dono da loja: o plano, o domínio e as renovações são dessa conta.`,
    'Ela não depende de nenhum servidor da agência. Depois de entregue, manter a loja no ar é responsabilidade do dono da conta; a agência não responde por isso, a não ser que tenha sido combinado explicitamente com o cliente.']);
  if (site.pacote?.banners?.length) pdf.secao('5. Banners').lista(site.pacote.banners.map((b) => `${b.uso}: "${b.titulo}" / "${b.subtitulo}" [${b.cta}]`));
  pdf.secao('Checklist final').lista(['Produtos e preços conferidos', 'Banners e textos publicados', 'Pagamento e frete configurados', 'Pedido de teste realizado', 'Domínio conectado']);
  return pdf;
}
