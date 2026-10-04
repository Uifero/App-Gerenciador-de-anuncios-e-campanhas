// Excluir e arquivar: as regras, sem banco nem tela.
//  - Foto em uso: a confirmação diz ONDE ela está (banner, produto, Clientes reais, link de aprovação de dd/mm...).
//  - Criativo com resultado registrado (gasto, CPA, ROAS...) não se exclui direto: arquiva (sai da lista, fica nos
//    Insights). Excluir de vez só a partir da lista de arquivados, avisando que os resultados saem dos Insights.
//  - Versão do criativo: dá para excluir uma versão antiga; a atual, não (restaure outra antes).
//  - Referência que sobra (campanha, resultado) aponta para um criativo que não existe: mostra "criativo excluído".
import { usosDe, temCodigo, resumoUsos } from './fotos-site.js';
import { tipoMaterial } from './prova-social.js';
import { normalizarLayout } from './site-blocos.js';
import { normalizarVisual } from './visual-site.js';

const dataCurta = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }); };

// ---------- fotos (materiais) ----------
/** Links de aprovação do site cujo conteúdo salvo mostra esta foto (ou a cópia borrada dela). */
export function linksQueUsam(m, aprovacoes = []) {
  const urls = [m?.url, m?.borrada?.url].filter(Boolean);
  if (!urls.length) return [];
  return aprovacoes.filter((l) => l?.tipo === 'site' && urls.some((u) => String(l.html || '').includes(u) || String(l.previa || '').includes(u) || String(l.texto || '').includes(u)));
}

/**
 * Onde a foto está em uso agora, em linguagem simples: ["Banner", "Produto Thermora", "Link de aprovação de 04/10"].
 * ctx: { cliente, site, produtos, aprovacoes }.
 */
export function usosDoMaterial(m, { cliente = {}, site = null, produtos = [], aprovacoes = [] } = {}) {
  if (!m) return [];
  const out = [];
  if (temCodigo(m)) for (const r of resumoUsos(m, produtos)) out.push(r.texto === 'Banner' || r.texto === 'Clientes reais' || r.texto === 'Galeria' || r.texto.startsWith('Sobre') ? r.texto : r.texto === 'Não usar no site' ? null : `Produto ${r.texto.replace(/ \((principal|posição \d+)\)$/, '')}`);
  if (tipoMaterial(m) === 'prova_social' && !usosDe(m).nao) out.push('Clientes reais (print de cliente)');
  if (cliente.logoArquivo?.materialId === m.id) out.push('Logo da loja');
  const L = normalizarLayout(site?.layout), V = normalizarVisual(site?.pacote?.visual);
  if (L.imagens.hero?.materialId === m.id || V.banner?.materialId === m.id) out.push('Imagem do banner (ajustes rápidos)');
  if (L.imagens.marca?.materialId === m.id) out.push('Imagem da história (ajustes rápidos)');
  if ((site?.conteudo?.depoimentos || []).some((d) => d?.materialId === m.id)) out.push('Depoimento do site');
  if (cliente.preferenciasSite?.referenciaPrint?.materialId === m.id) out.push('Print do site de referência');
  for (const l of linksQueUsam(m, aprovacoes)) out.push(`Link de aprovação de ${dataCurta(l.criadoEm)}`);
  return [...new Set(out.filter(Boolean))];
}

/** Texto da confirmação de excluir uma ou várias fotos. */
export function textoExcluirFotos(itens = []) {
  const emUso = itens.filter((x) => x.usos.length);
  const nome = (x) => `${x.material.codigo ? `${x.material.codigo} ` : ''}"${x.material.nomeOriginal || x.material.nome || 'arquivo'}"`;
  const linhas = [itens.length === 1 ? `Excluir ${nome(itens[0])}?` : `Excluir ${itens.length} arquivos?`];
  for (const x of emUso) linhas.push(`${nome(x)} está em uso: ${x.usos.join(', ')}.`);
  if (emUso.length) linhas.push('O site e os produtos deixam de usar a foto. Links de aprovação já enviados continuam mostrando a prévia que foi salva.');
  linhas.push('Esta ação não pode ser desfeita.');
  return linhas.join('\n');
}

// ---------- criativos ----------
/** Resultados registrados para o criativo (o que pesa nos Insights). */
export const resultadosDoCriativo = (criativoId, resultados = []) => resultados.filter((r) => r?.criativoId === criativoId);
/**
 * O que fazer ao pedir "Excluir": criativo com resultado registrado é ARQUIVADO (fica nos Insights); sem resultado,
 * excluído. Já arquivado: só exclusão definitiva, com o aviso de que os resultados saem dos Insights.
 * Devolve { acao: 'excluir'|'arquivar'|'excluirDefinitivo', resultados: n }.
 */
export function acaoAoExcluir(criativo, resultados = []) {
  const n = resultadosDoCriativo(criativo?.id, resultados).length;
  if (criativo?.arquivado) return { acao: 'excluirDefinitivo', resultados: n };
  return { acao: n ? 'arquivar' : 'excluir', resultados: n };
}
/** Plano para vários criativos de uma vez: { excluir, arquivar, excluirDefinitivo, texto } com UMA frase de resumo. */
export function planoCriativos(criativos = [], resultados = [], { definitivo = false } = {}) {
  const plano = { excluir: [], arquivar: [], excluirDefinitivo: [] };
  for (const c of criativos) {
    const a = definitivo ? { acao: 'excluirDefinitivo' } : acaoAoExcluir({ ...c, arquivado: false }, resultados);
    plano[a.acao].push(c);
  }
  const partes = [];
  if (plano.excluir.length) partes.push(`${plano.excluir.length} criativo(s) sem resultado serão excluídos (com arquivo e respostas de aprovação)`);
  if (plano.arquivar.length) partes.push(`${plano.arquivar.length} criativo(s) com resultados registrados serão ARQUIVADOS: saem da lista e continuam nos Insights`);
  if (plano.excluirDefinitivo.length) {
    const comRes = plano.excluirDefinitivo.filter((c) => resultadosDoCriativo(c.id, resultados).length).length;
    partes.push(`${plano.excluirDefinitivo.length} criativo(s) arquivado(s) serão excluídos de vez${comRes ? `: os resultados de ${comRes} deles SAEM dos Insights` : ''}`);
  }
  plano.texto = `${partes.join('. ')}. ${plano.excluir.length || plano.excluirDefinitivo.length ? 'Esta exclusão não pode ser desfeita.' : 'Dá para desarquivar depois.'}`;
  return plano;
}
/** Visível na lista: sem os arquivados (ou só eles, na visão "Mostrar arquivados"). */
export const criativosVisiveis = (criativos = [], { arquivados = false } = {}) => criativos.filter((c) => Boolean(c.arquivado) === arquivados);

/** Excluir uma versão do histórico. A atual (a última) não sai. Devolve { versoes } ou lança Error com o motivo. */
export function semVersao(criativo, n) {
  const versoes = [...(criativo?.versoes || [])];
  if (versoes.length <= 1) throw new Error('É a única versão do criativo: para tirá-lo, exclua o criativo.');
  const atual = Math.max(...versoes.map((v) => v.n));
  if (Number(n) === atual) throw new Error('Esta é a versão atual. Restaure outra versão antes de excluir esta.');
  if (!versoes.some((v) => v.n === Number(n))) throw new Error('Essa versão não existe mais.');
  return { versoes: versoes.filter((v) => v.n !== Number(n)) };
}

/** Nome do criativo para uma referência que sobrou (campanha, resultado). */
export const nomeCriativo = (id, criativos = [], guardado = '') => {
  const c = criativos.find((x) => x.id === id);
  if (!c) return `criativo excluído${guardado ? ` (${guardado})` : ''}`;
  return c.arquivado ? `${c.nome} (arquivado)` : c.nome;
};
