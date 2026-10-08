// COL.analises guarda vários tipos de documento do mesmo cliente: 'recomendacao' ("Analisar e recomendar"), 'otimizacao'
// (plano WhatsApp x Site) e 'especialista' (consultas aos Especialistas). Cada histórico lê só o seu tipo, por aqui.

/** Análises de um tipo, da mais nova para a mais antiga. */
export const analisesDoTipo = (analises = [], tipo) => analises.filter((a) => a?.tipo === tipo).sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
