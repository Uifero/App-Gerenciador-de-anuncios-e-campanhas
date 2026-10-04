// "Excluir" foto/arquivo do cliente — o mesmo em todo lugar onde uma foto aparece (Materiais e "Usar em", passo 2 do
// "Montar site", formulário do produto, Estúdio). Sempre pelo removerMaterial (lib/materiais.js), o único caminho de
// apagar. A confirmação diz onde a foto está em uso; se um link de aprovação já enviado mostra a foto, o arquivo fica
// no Storage (só o registro sai) para o link continuar com a prévia que foi salva.
import { db, COL } from '../core/storage.js';
import { removerMaterial } from '../lib/materiais.js';
import { usosDoMaterial, linksQueUsam, textoExcluirFotos } from '../lib/exclusao.js';
import { confirmar, toast } from '../core/ui.js';

/** Onde cada material está em uso agora (lê site, produtos e links de aprovação da fonte). */
export async function usosAgora(cliente, materiais = []) {
  const [sites, produtos, aprovacoes] = await Promise.all([
    db.listar(COL.sites, { clienteId: cliente.id }).catch(() => []), db.listar(COL.produtos, { clienteId: cliente.id }).catch(() => []),
    db.listar(COL.aprovacoes, { clienteId: cliente.id }).catch(() => []),
  ]);
  const ctx = { cliente, site: sites[0] || null, produtos, aprovacoes };
  return materiais.map((m) => ({ material: m, usos: usosDoMaterial(m, ctx), links: linksQueUsam(m, aprovacoes) }));
}

/**
 * Pergunta (uma vez, listando os usos) e exclui. Devolve quantos saíram (0 = cancelado). `aoExcluir(listaNova)` roda
 * no fim, e o evento gcc:materiais avisa as outras telas abertas.
 */
export async function excluirMateriais(cliente, materiais = [], { aoExcluir = () => {} } = {}) {
  if (!materiais.length) return 0;
  const itens = await usosAgora(cliente, materiais);
  if (!(await confirmar(textoExcluirFotos(itens), itens.length > 1 ? `Excluir ${itens.length} arquivos` : 'Excluir'))) return 0;
  let n = 0; const falhas = [];
  for (const x of itens) {
    try { await removerMaterial(cliente, x.material, { confirmado: true, manterArquivo: x.links.length > 0 }); n++; } catch (e) { falhas.push(`${x.material.nomeOriginal || x.material.nome}: ${e.message}`); }
  }
  const lista = await db.listar(COL.materiais, { clienteId: cliente.id });
  document.dispatchEvent(new CustomEvent('gcc:materiais', { detail: { clienteId: cliente.id, lista } }));
  if (falhas.length) toast(`Não consegui excluir ${falhas.length} arquivo(s):\n${falhas.join('\n')}`, 'erro');
  if (n) toast(n === 1 ? 'Arquivo excluído.' : `${n} arquivos excluídos.`);
  await aoExcluir(lista);
  return n;
}
