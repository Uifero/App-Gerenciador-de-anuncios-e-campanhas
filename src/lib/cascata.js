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
  const [criativos, hooks, referencias, campanhas, resultados, produtos, sites, aprovacoes, respostas, diagnosticos] = await Promise.all([
    db.listar(COL.criativos, f), db.listar(COL.hooks, f), db.listar(COL.referencias, f), db.listar(COL.campanhas, f),
    db.listar(COL.resultados, f), db.listar(COL.produtos, f), db.listar(COL.sites, f), db.listar(COL.aprovacoes, f), db.listar(COL.respostas, f),
    db.listar(COL.diagnosticos, f),
  ]);
  return {
    criativos: criativos.length, hooks: hooks.length, referencias: referencias.length, campanhas: campanhas.length,
    resultados: resultados.length, produtos: produtos.length, sites: sites.length, aprovacoes: aprovacoes.length, respostas: respostas.length,
    diagnosticos: diagnosticos.length,
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
  await Promise.all(criativos.filter((c) => c.arquivoPath).map((c) => removerArquivo(c.arquivoPath)));
  await Promise.all([
    removerTodos(COL.criativos, f), removerTodos(COL.hooks, f), removerTodos(COL.referencias, f), removerTodos(COL.campanhas, f),
    removerTodos(COL.resultados, f), removerTodos(COL.produtos, f), removerTodos(COL.sites, f),
    removerTodos(COL.aprovacoes, f), removerTodos(COL.respostas, f), removerTodos(COL.diagnosticos, f), removerTodos(COL.diagnosticoImagens, f),
  ]);
  await db.remover(COL.clientes, clienteId);
}

/**
 * Apaga o criativo e o que está ligado só a ele: resultados registrados e respostas de aprovação recebidas para
 * ele. Hooks e campanhas do cliente não são tocados (não pertencem a um criativo específico). Os links de
 * aprovação (`gcc_aprovacoes`) também ficam intocados: guardam uma CÓPIA do criativo no momento do envio, então a
 * página pública continua funcionando mesmo depois que o criativo original é apagado.
 */
export async function apagarCriativoEmCascata(criativoId, arquivoPath) {
  if (arquivoPath) await removerArquivo(arquivoPath);
  await Promise.all([removerTodos(COL.resultados, { criativoId }), removerTodos(COL.respostas, { criativoId })]);
  await db.remover(COL.criativos, criativoId);
}
