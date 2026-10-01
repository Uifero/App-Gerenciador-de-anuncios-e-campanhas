// Prova social por IMAGEM (print de avaliação do Google/marketplace, elogio no WhatsApp, site de avaliações…) e o
// painel "Material para montar o site". Tudo aqui é puro (sem banco, sem IA, sem DOM) para dar para testar:
//  - lerRespostaProvas: confere a resposta da IA contra as imagens enviadas (nunca confia cegamente);
//  - limparDadosPessoais: tira telefone, e-mail e @ do texto (rede de segurança além do que a IA já omite);
//  - acrescentarProvas: junta as linhas novas ao campo "provas sociais" SEM sobrescrever nada que já estava lá;
//  - tipoMaterial / contarMateriais: classifica os arquivos de Materiais (fotos, vídeos, logo, provas sociais);
//  - resumoMaterialSite: as linhas do painel da aba Site/Loja (só lê dado que já existe; não guarda cópia).
import { rastreamentoDe } from './rastreamento.js';

export const MAX_PROVAS = 6;
export const ORIGEM_PROVA = 'prova_social';
export const ETIQUETA_PROVA = 'prova social';
export const LEGENDA_PROVAS = 'Envie prints de avaliações, elogios ou números (Google, WhatsApp, qualquer lugar). A IA lê e resume no perfil da marca.';

const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
const txt = (v) => String(v ?? '').trim();
const fracao = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/** Telefone, e-mail e @usuário viram "[oculto]" (a IA já é instruída a não copiar; isto é a segunda barreira). */
export function limparDadosPessoais(texto) {
  return txt(texto)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[oculto]')
    .replace(/(?:\+?\d{2}\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g, '[oculto]')
    .replace(/(^|\s)@[\w.]{2,30}/g, '$1[oculto]')
    .replace(/(\[oculto\]\s*){2,}/g, '[oculto] ').trim();
}

/** Área de tarja válida (fração da imagem): descarta área vazia/fora da imagem e corta o que passa da borda. */
export function areaValida(a) {
  if (!a || typeof a !== 'object') return null;
  const x = fracao(a.x), y = fracao(a.y);
  const w = Math.min(fracao(a.w), 1 - x), h = Math.min(fracao(a.h), 1 - y);
  return w > 0.005 && h > 0.005 ? { x, y, w, h } : null;
}

/** Resumo em uma linha montado só com o que foi lido (quando a IA não mandou "resumo"). */
function resumoDe(im) {
  const partes = [];
  if (im.nota) partes.push(`Nota ${String(im.nota).replace('.', ',')}${im.origem ? ` no ${im.origem}` : ''}`);
  if (im.quantidade) partes.push(`${im.quantidade} avaliações`);
  if (im.citacao) partes.push(`cliente diz: "${im.citacao}"`);
  return partes.join('; ');
}

/**
 * Confere a resposta da IA contra as `total` imagens enviadas. Uma leitura por imagem (a que a IA pular fica
 * "não analisada"); sem resumo quando não é legível/relevante; texto sem telefone/e-mail/@; áreas de tarja válidas.
 * Cada item: { numero, legivel, relevante, origem, nota, quantidade, citacao, resumo, dadosPessoais: [{tipo, area}], motivo }.
 */
export function lerRespostaProvas(resposta, total) {
  const lidas = Array.isArray(resposta?.imagens) ? resposta.imagens : [];
  return Array.from({ length: total }, (_, i) => {
    const x = lidas.find((l) => Number(l?.numero) === i + 1);
    if (!x) return { numero: i + 1, legivel: false, relevante: false, resumo: '', citacao: '', dadosPessoais: [], motivo: 'A IA não comentou esta imagem.' };
    const legivel = x.legivel !== false && x.legivel !== 'false', relevante = x.relevante !== false && x.relevante !== 'false';
    const dadosPessoais = (Array.isArray(x.dadosPessoais) ? x.dadosPessoais : []).map((d) => ({ tipo: txt(d?.tipo) || 'dado pessoal', area: areaValida(d?.area) }));
    const im = { numero: i + 1, legivel, relevante, origem: txt(x.origem), nota: num(x.nota), quantidade: num(x.quantidade),
      citacao: limparDadosPessoais(x.citacao).slice(0, 220), dadosPessoais, motivo: txt(x.motivo) };
    im.resumo = legivel && relevante ? limparDadosPessoais(txt(x.resumo) || resumoDe(im)).slice(0, 300) : '';
    if (!legivel || !relevante) { im.citacao = ''; im.motivo = im.motivo || (!legivel ? 'Não deu para ler o print.' : 'O print não parece ser uma avaliação ou elogio desta loja.'); }
    return im;
  });
}

/** "30/09/2026" a partir de uma data ISO (sem depender do fuso: é a data do envio). */
const dataCurta = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR'); };
/** Linha que vai para o campo "provas sociais", com a fonte anotada. */
export const linhaProva = (resumo, emISO) => `${txt(resumo)} (do print enviado em ${dataCurta(emISO)})`;

/**
 * Acrescenta as linhas novas ao texto atual de provas sociais, uma por linha, NUNCA apagando o que já existe.
 * Linha repetida (mesmo texto) não entra de novo. Devolve { texto, acrescentadas }.
 */
export function acrescentarProvas(atual, linhas = []) {
  const base = txt(atual);
  const jaTem = new Set(base.split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean));
  const novas = linhas.map(txt).filter((l) => l && !jaTem.has(l.toLowerCase()) && (jaTem.add(l.toLowerCase()), true));
  return { texto: [base, ...novas].filter(Boolean).join('\n'), acrescentadas: novas.length };
}

// ---------- Materiais ----------
const ehVideo = (m) => /^video\//.test(m?.tipo || m?.mime || '') || /\.(mp4|mov|webm|m4v)$/i.test(m?.nome || m?.url || '');
/** 'prova_social' | 'logo' | 'video' | 'foto' */
export function tipoMaterial(m) {
  if (m?.origem === 'referencia') return 'referencia'; // print do site de referência: só inspiração, nunca vai para o site
  if (m?.origem === ORIGEM_PROVA || (m?.etiquetas || []).includes(ETIQUETA_PROVA)) return 'prova_social';
  if (m?.origem === 'logo' || /(^|[-_\s])logo([-_.\s]|$)/i.test(m?.nome || '')) return 'logo';
  return ehVideo(m) ? 'video' : 'foto';
}
export function contarMateriais(lista = []) {
  const c = { foto: 0, video: 0, logo: 0, prova_social: 0, referencia: 0 };
  for (const m of lista) c[tipoMaterial(m)]++;
  return c;
}
export const provasEmImagem = (materiais = []) => materiais.filter((m) => tipoMaterial(m) === 'prova_social');
/** Linhas de texto (não vazias) no campo de provas sociais. */
export const linhasDeProva = (texto) => txt(texto).split('\n').map((l) => l.trim()).filter(Boolean);

// ---------- depoimento do site a partir de um print ----------
/** Como o print entra nos depoimentos do site: não usar, só o texto reescrito, só o print real, ou os dois. */
export const EXIBICOES_PROVA = [['', 'Não usar no site'], ['texto', 'Só o texto'], ['print', 'Só o print real'], ['ambos', 'Print + texto']];
/** Depoimento (conteudo.depoimentos) de um material de prova social, conforme a escolha. null = não usar. */
export function depoimentoDeProva(material, exibir) {
  if (!exibir) return null;
  return { nome: material.fonteProva || 'Cliente', texto: txt(material.citacao) || txt(material.descricao) || 'Avaliação real de cliente',
    origem: ORIGEM_PROVA, materialId: material.id, exibir, midiaUrl: exibir === 'texto' ? null : material.url, midiaTipo: exibir === 'texto' ? null : 'imagem' };
}
/** Troca só os depoimentos que vieram de prints (origem prova_social); escritos à mão e de criativos ficam. */
export const mesclarProvasNoSite = (atuais = [], novos = []) => [...atuais.filter((d) => d.origem !== ORIGEM_PROVA), ...novos.filter(Boolean)];
/** Depoimentos que o formulário "Conteúdo da loja" NÃO edita (vêm de criativos ou de prints). */
export const depoimentoGerido = (d) => d?.origem === 'criativo' || d?.origem === ORIGEM_PROVA;

// ---------- depoimentos do site: prova real primeiro, modelo só sem nenhuma prova ----------
export const MARCA_MODELO = '[MODELO – substituir por depoimento real]';
/** Depoimento-modelo escrito pela IA (marcado agora com origem 'modelo'; os antigos, pelo texto "[MODELO…"). */
export const ehModelo = (d) => d?.origem === 'modelo' || /^\s*\[\s*MODELO/i.test(String(d?.texto || ''));
const semData = (l) => l.replace(/\s*\(do print enviado em [^)]*\)\s*$/i, '').trim();
const chaveTexto = (t) => txt(t).toLowerCase().replace(/\s+/g, ' ');
const FONTES_TEXTO = [[/google/i, 'Avaliação no Google'], [/whats/i, 'Elogio pelo WhatsApp'], [/mercado\s*livre/i, 'Avaliação no Mercado Livre'], [/reclame\s*aqui/i, 'Reclame Aqui'],
  [/shopee/i, 'Avaliação na Shopee'], [/amazon/i, 'Avaliação na Amazon'], [/instagram/i, 'Comentário no Instagram']];
const nomeDaLinha = (l) => (FONTES_TEXTO.find(([re]) => re.test(l)) || [, 'Clientes da loja'])[1];

/**
 * Provas em texto do perfil de marca que viram depoimento. Fica de fora a linha que veio de um print (mesmo texto do
 * resumo dele) quando esse print já está no site (não repete) ou quando a pessoa escolheu "Não usar" para ele.
 * Print ainda não decidido no cartão: a linha dele entra como texto (é prova real).
 */
export function provasEmTexto(cliente, materiais = [], excluirIds = new Set()) {
  const excluidas = new Set(provasEmImagem(materiais).filter((m) => excluirIds.has(m.id)).map((m) => chaveTexto(m.descricao)).filter(Boolean));
  return linhasDeProva(cliente?.marca?.provasSociais).map(semData).filter((l) => l && !excluidas.has(chaveTexto(l)))
    .map((l) => ({ nome: nomeDaLinha(l), texto: l, origem: 'prova_texto' }));
}

/**
 * Depoimentos ao gerar/regerar o site. Com QUALQUER prova real (provas em texto, prints escolhidos no cartão
 * "Prints de prova social no site", criativos aprovados, depoimentos escritos à mão), a seção usa só o que é real —
 * mesmo que seja um só —, sem misturar modelo inventado. Sem nenhuma prova, cai nos modelos da IA, sempre marcados
 * com MARCA_MODELO para ninguém publicar achando que é real. Devolve { depoimentos, usouModelos }.
 */
export function montarDepoimentos({ cliente, materiais = [], atuais = [], modelosIa = [], provasOcultas = [] }) {
  const geridos = atuais.filter(depoimentoGerido); // criativos + prints (cada print conforme a escolha dele)
  const excluirIds = new Set([...provasOcultas, ...geridos.filter((d) => d.origem === ORIGEM_PROVA).map((d) => d.materialId)]);
  const escritos = atuais.filter((d) => !depoimentoGerido(d) && !ehModelo(d) && d.origem !== 'prova_texto' && txt(d.texto)); // digitados à mão
  const vistos = new Set();
  const unico = (d) => { const k = chaveTexto(d.texto) + '|' + (d.midiaUrl || ''); if (vistos.has(k)) return false; vistos.add(k); return true; };
  const reais = [...escritos, ...provasEmTexto(cliente, materiais, excluirIds), ...geridos].filter(unico);
  if (reais.length) return { depoimentos: reais, usouModelos: false };
  return {
    depoimentos: modelosIa.filter((d) => txt(d?.texto)).map((d) => ({ nome: txt(d.nome) || 'Cliente', texto: ehModelo(d) ? txt(d.texto) : `${MARCA_MODELO} ${txt(d.texto)}`, origem: 'modelo' })),
    usouModelos: true,
  };
}
/** Tem alguma prova real para os depoimentos? (a IA nem escreve modelo quando tem) */
export const temProvaReal = (args) => !montarDepoimentos({ ...args, modelosIa: [] }).usouModelos;

// ---------- painel "Material para montar o site" ----------
/**
 * Resumo do que já existe para montar o site. Só lê (cliente, produtos, materiais, site); nunca guarda cópia.
 * Devolve [{ chave, titulo, linhas: [texto], avisos: [texto], editar: { tipo: 'pergunta'|'rota', alvo } }].
 */
export function resumoMaterialSite({ cliente, produtos = [], materiais = [], site = null, respondidas = 0, totalPerguntas = 18 }) {
  const m = cliente?.marca || {}; const r = rastreamentoDe(cliente); const id = cliente?.id;
  const cheio = (v) => Boolean(txt(v));
  const perfil = [['tomDeVoz', 'Tom de voz', 'tom'], ['usp', 'Diferencial', 'usp'], ['objecoes', 'Objeções', 'objecoes'], ['linguagemDor', 'Linguagem da dor', 'linguagemDor']];
  const faltaPerfil = perfil.filter(([k]) => !cheio(m[k]));
  const provasTexto = linhasDeProva(m.provasSociais).length, provasImg = provasEmImagem(materiais).length;
  const semPreco = produtos.filter((p) => !(Number(p.preco) > 0)).length, comFoto = produtos.filter((p) => (p.fotos || []).length).length;
  const qtd = contarMateriais(materiais);
  const itens = [
    { chave: 'perfil', titulo: 'Perfil de marca', editar: { tipo: 'pergunta', alvo: faltaPerfil[0]?.[2] || 'tom' },
      campos: perfil.map(([k, rot, pergunta]) => ({ rotulo: rot, ok: cheio(m[k]), pergunta })),
      linhas: [`${perfil.length - faltaPerfil.length} de ${perfil.length} preenchidos`],
      avisos: faltaPerfil.length ? [`Falta: ${faltaPerfil.map(([, rot]) => rot.toLowerCase()).join(', ')}`] : [] },
    { chave: 'provas', titulo: 'Provas sociais', editar: { tipo: 'pergunta', alvo: 'provas' },
      linhas: [`${provasTexto} em texto · ${provasImg} print(s) de avaliação`],
      avisos: !provasTexto && !provasImg ? ['Sem provas sociais ainda: o site sai só com depoimentos-modelo'] : [] },
    // Aba Produtos só quando está no escopo do cliente (senão a rota cairia em outra aba): sem ela, a pergunta 7 lista e edita.
    { chave: 'produtos', titulo: 'Produtos', editar: cliente?.escopo?.produtos ? { tipo: 'rota', alvo: `#/c/${id}/produtos` } : { tipo: 'pergunta', alvo: 'produtos' },
      linhas: [`${produtos.length} cadastrado(s) · ${comFoto} com foto · ${semPreco} sem preço`],
      avisos: [!produtos.length && 'Nenhum produto: o site precisa de pelo menos um', semPreco && `${semPreco} produto(s) sem preço`, produtos.length && comFoto < produtos.length && `${produtos.length - comFoto} produto(s) sem foto`].filter(Boolean) },
    { chave: 'referencia', titulo: 'Site de referência', editar: { tipo: 'pergunta', alvo: 'referencia' },
      linhas: [cheio(cliente?.siteReferencia) ? cliente.siteReferencia : 'Não informado'], avisos: [] },
    { chave: 'rastreamento', titulo: 'Rastreamento', editar: { tipo: 'rota', alvo: `#/c/${id}/editar` },
      campos: [['Pixel do Meta', r.metaPixelId], ['Google Ads', r.googleAdsId], ['Hotjar', r.hotjarId], ['Tawk.to', r.tawkPropertyId]].map(([rotulo, v]) => ({ rotulo, ok: cheio(v) })),
      linhas: [], avisos: !r.metaPixelId && !r.googleAdsId && !site?.semPixel ? ['Sem Pixel nem Google Ads: o site não vai medir vendas dos anúncios'] : [] },
    { chave: 'materiais', titulo: 'Materiais gerais (Estúdio)', editar: { tipo: 'pergunta', alvo: 'materiais' },
      linhas: [`${materiais.length} arquivo(s): ${qtd.foto} foto(s), ${qtd.video} vídeo(s), ${qtd.logo} logo, ${qtd.prova_social} prova(s) social(is)`],
      avisos: [!qtd.logo && !cheio(m.logo) && 'Sem logo'].filter(Boolean) },
    { chave: 'questionario', titulo: 'Questionário', editar: { tipo: 'pergunta', alvo: null },
      linhas: [`${respondidas} de ${totalPerguntas} respondidas`], avisos: [] },
  ];
  return itens;
}
