// Exclusão em cascata: ao apagar um cliente ou um criativo, remove também o que está ligado a ele, para não
// deixar registros órfãos (hooks, campanhas, resultados, respostas de aprovação...). Usado por clientes.js e
// criativos.js na hora de apagar. Não depende de DOM — só de core/storage.js (não alterado por esta função).
import { db, COL, removerArquivo } from '../core/storage.js';

async function removerTodos(col, filtro) {
  const itens = await db.listar(col, filtro);
  await Promise.all(itens.map((d) => db.remover(col, d.id)));
  return itens.length;
}

/** Conta (sem apagar nada) o que seria removido ao apagar o cliente — para mostrar antes de confirmar. */
export async function contarDependentesCliente(clienteId) {
  const f = { clienteId };
  const [criativos, hooks, referencias, campanhas, resultados, produtos, sites, aprovacoes, respostas, diagnosticos, materiais, analises, tarefas, prints, documentos] = await Promise.all([
    db.listar(COL.criativos, f), db.listar(COL.hooks, f), db.listar(COL.referencias, f), db.listar(COL.campanhas, f),
    db.listar(COL.resultados, f), db.listar(COL.produtos, f), db.listar(COL.sites, f), db.listar(COL.aprovacoes, f), db.listar(COL.respostas, f),
    db.listar(COL.diagnosticos, f), db.listar(COL.materiais, f),
    db.listar(COL.analises, f), db.listar(COL.tarefas, f), db.listar(COL.printsResultado, f), db.listar(COL.documentos, f),
  ]);
  return {
    criativos: criativos.length, hooks: hooks.length, referencias: referencias.length, campanhas: campanhas.length,
    resultados: resultados.length, produtos: produtos.length, sites: sites.length, aprovacoes: aprovacoes.length, respostas: respostas.length,
    diagnosticos: diagnosticos.length, materiais: materiais.length,
    analises: analises.length, tarefas: tarefas.length, prints: prints.length, documentos: documentos.length,
  };
}

/**
 * Apaga o cliente e tudo o que está ligado a ele: criativos (e os arquivos deles no Storage), hooks, referências,
 * campanhas, resultados, produtos, sites, links de aprovação, as respostas do cliente final e os diagnósticos de
 * campanha (com as imagens anexadas a eles).
 * NÃO apaga `gcc_uso_api` (custo de IA já gasto): é histórico de despesa, não um dado operacional do cliente.
 * NÃO apaga playbooks: são receitas reaproveitáveis, não pertencem a um cliente.
 */
export async function apagarClienteEmCascata(clienteId) {
  const f = { clienteId };
  const criativos = await db.listar(COL.criativos, f);
  const materiais = await db.listar(COL.materiais, f);
  const cli = await db.obter(COL.clientes, clienteId).catch(() => null);
  // Arquivos guardados só para links de aprovação já enviados (foto excluída em uso): saem junto com o cliente.
  await Promise.all((cli?.arquivosRetidos || []).map((a) => a?.path && removerArquivo(a.path)));
  await Promise.all([...criativos.flatMap((c) => [c.arquivoPath, c.previaPath]), ...materiais.flatMap((m) => [m.path, m.borrada?.path])].filter(Boolean).map((p) => removerArquivo(p))); // peça final + prévia reduzida + fotos salvas (e a cópia borrada dos prints)
  await Promise.all([
    removerTodos(COL.criativos, f), removerTodos(COL.hooks, f), removerTodos(COL.referencias, f), removerTodos(COL.campanhas, f),
    removerTodos(COL.resultados, f), removerTodos(COL.produtos, f), removerTodos(COL.sites, f),
    removerTodos(COL.aprovacoes, f), removerTodos(COL.respostas, f), removerTodos(COL.diagnosticos, f), removerTodos(COL.diagnosticoImagens, f),
    removerTodos(COL.materiais, f),
    // Análises/recomendações, tarefas aceitas, prints de resultado (o arquivo saiu com os materiais) e documentos só deste cliente.
    removerTodos(COL.analises, f), removerTodos(COL.tarefas, f), removerTodos(COL.printsResultado, f), removerTodos(COL.documentos, f),
  ]);
  // Cache da pesquisa web do nicho feito por este cliente: sai se nenhum outro cliente usa o mesmo nicho (senão fica, é do nicho).
  const outros = (await db.listar(COL.clientes)).filter((c) => c.id !== clienteId);
  const norm = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  for (const pq of await db.listar(COL.pesquisas, f)) if (!outros.some((c) => norm(c.nicho) === norm(pq.nicho))) await db.remover(COL.pesquisas, pq.id);
  await db.remover(COL.clientes, clienteId);
}

/**
 * Apaga o criativo e o que está ligado só a ele: resultados registrados e respostas de aprovação recebidas para
 * ele. Hooks e campanhas do cliente não são tocados (não pertencem a um criativo específico). Os links de
 * aprovação (`gcc_aprovacoes`) também ficam intocados: guardam uma CÓPIA do criativo no momento do envio, então a
 * página pública continua funcionando mesmo depois que o criativo original é apagado.
 */
export async function apagarCriativoEmCascata(criativoId, arquivoPath, previaPath = null, { manterArquivos = false, clienteId = null } = {}) {
  // Criativo que já foi para um link de aprovação: o arquivo e a prévia ficam no Storage para o link continuar mostrando
  // a peça (anotados em cliente.arquivosRetidos e apagados junto com o cliente).
  if (manterArquivos && clienteId) {
    const cli = await db.obter(COL.clientes, clienteId).catch(() => null);
    const atuais = cli?.arquivosRetidos || [];
    const novos = [arquivoPath, previaPath].filter((x) => x && !atuais.some((a) => a.path === x)).map((path) => ({ path, motivo: 'link de aprovação de criativo já enviado', em: new Date().toISOString() }));
    if (novos.length) await db.atualizar(COL.clientes, clienteId, { arquivosRetidos: [...atuais, ...novos] });
  } else {
    if (arquivoPath) await removerArquivo(arquivoPath);
    if (previaPath) await removerArquivo(previaPath); // prévia reduzida do link de aprovação
  }
  await Promise.all([removerTodos(COL.resultados, { criativoId }), removerTodos(COL.respostas, { criativoId })]);
  await db.remover(COL.criativos, criativoId);
}
