// "Documentos de referência" (Configurações; opcionalmente de um cliente só): cada documento é resumido UMA vez
// (IA ou à mão) numa referência compacta guardada em gcc_documentos e citada pelas análises ("documento X, parte Y").
// O arquivo original não é guardado nem relido. A Metodologia Vortex aparece como entrada fixa (o texto dela vai pelo
// servidor nas tarefas com `metodologia: true`). Documentos são internos: nunca vão para o site nem para link de aprovação.
import { METODOLOGIA_VORTEX } from '../../server/referencias/metodologia-vortex.js';

const txt = (v) => String(v ?? '').trim();
export const ID_VORTEX = 'vortex';
export const LIMITE_TEXTO = 60000; // caracteres mandados para o resumo (o resto do documento fica de fora, com aviso)
export const ACEITA_DOCUMENTO = 'application/pdf,text/plain,text/markdown,.pdf,.txt,.md';

/** Partes da Metodologia Vortex (os itens "- Nome: ..." do texto de referência). */
export const partesVortex = () => METODOLOGIA_VORTEX.split('\n').map((l) => /^-\s*([^:]{3,60}):/.exec(l)?.[1]).filter(Boolean).map((parte) => ({ parte, pontos: '' }));
/** Entrada fixa da Metodologia Vortex (só leitura). */
export const DOC_VORTEX = {
  id: ID_VORTEX, fixo: true, titulo: 'Metodologia Vortex', clienteId: null,
  resumo: 'Referência opcional de criativos para e-commerce (dor x desejo, consciência do público, narrativas por etapa do funil, formatos, multiplicar o que vence, cobrir topo/meio/fundo). O texto completo vai junto no contexto das análises.',
  partes: partesVortex(),
};

/** Documentos que valem para um cliente: os gerais (clienteId vazio) + os dele, com resumo, e a Vortex fixa no início. */
export function documentosParaAnalise(docs = [], clienteId = null) {
  const validos = docs.filter((d) => txt(d.resumo) && (!d.clienteId || d.clienteId === clienteId));
  return [DOC_VORTEX, ...validos.map((d) => ({ id: d.id, titulo: txt(d.titulo) || 'documento', resumo: txt(d.resumo), partes: Array.isArray(d.partes) ? d.partes : [] }))];
}

/** Texto do documento cabe no resumo? Devolve { texto, cortado }. */
export function prepararTexto(texto) {
  const t = txt(texto).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return t.length > LIMITE_TEXTO ? { texto: t.slice(0, LIMITE_TEXTO), cortado: true } : { texto: t, cortado: false };
}

/** Partes escritas à mão ("Parte: pontos" por linha) -> [{ parte, pontos }]. */
export const partesDoTexto = (v) => String(v || '').split('\n').map((l) => { const m = /^\s*([^:]{2,120}):\s*(.*)$/.exec(l); return m ? { parte: txt(m[1]), pontos: txt(m[2]).slice(0, 400) } : null; }).filter(Boolean).slice(0, 8);
