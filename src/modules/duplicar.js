// "Duplicar como base": copia perfil de marca, hooks e estrutura de campanha de um cliente para um cliente novo.
// NÃO copia resultados nem criativos finalizados (nem arquivos): só o ponto de partida editável.
import { db, COL } from '../core/storage.js';

/** Contagens do que pode ser copiado (para mostrar no aviso do formulário). */
export async function resumoBase(baseId) {
  const f = { clienteId: baseId };
  const [hooks, campanhas] = await Promise.all([db.listar(COL.hooks, f), db.listar(COL.campanhas, f)]);
  return { hooks: hooks.length, campanhas: campanhas.length };
}

/** Copia hooks e/ou estruturas de campanha do cliente base para o novo. */
export async function copiarEstrutura(baseId, novo, { hooks = true, campanhas = true } = {}) {
  const f = { clienteId: baseId };
  const [hs, cs] = await Promise.all([hooks ? db.listar(COL.hooks, f) : [], campanhas ? db.listar(COL.campanhas, f) : []]);
  // Gravações em paralelo: com dezenas de itens, uma a uma ficaria lento.
  await Promise.all([
    ...hs.map((h) => db.criar(COL.hooks, {
      texto: h.texto, categoria: h.categoria || '', angulo: h.angulo || null, origemPlaybook: h.origemPlaybook || null,
      clienteId: novo.id, clienteNome: novo.nome, nota: null, // a nota de performance é histórico do cliente antigo
    })),
    ...cs.map((c) => db.criar(COL.campanhas, {
      clienteId: novo.id, nome: c.nome, objetivo: c.objetivo || '', orcamentoDiario: c.orcamentoDiario ?? null, orcamentoNota: c.orcamentoNota || '',
      resumo: c.resumo || '', publicos: c.publicos || [], estruturaTeste: c.estruturaTeste || {}, checklistMeta: c.checklistMeta || [],
      origem: c.origem || 'manual', status: 'planejada', criativos: [], // sem criativos vinculados nem datas de início
    })),
  ]);
  return { hooks: hs.length, campanhas: cs.length };
}
