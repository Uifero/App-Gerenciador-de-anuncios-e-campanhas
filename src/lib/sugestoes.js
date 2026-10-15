// Sugestões com "Fazer essa mudança" / "Ignorar" (plano, Conferência do pedido, Cara de IA). Cada sugestão tem uma CHAVE
// pelo conteúdo (fonte + seção + texto): ignorada uma vez, a mesma sugestão não volta na próxima conferência do mesmo
// conteúdo. A lista fica no site (site.sugestoesIgnoradas), entra no backup e sai junto quando o cliente é excluído.
const sem = (s) => String(s ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

export const FONTES_SUGESTAO = { analise: 'análise', conferencia: 'conferência', cara_de_ia: 'cara de IA', especialista: 'especialista' };
export const chaveSugestao = (fonte, secao, texto) => `${fonte}|${secao || ''}|${hash(sem(texto))}`;
export const ignoradas = (site) => new Set((site?.sugestoesIgnoradas || []).map((x) => x.chave));
export const estaIgnorada = (site, chave) => ignoradas(site).has(chave);
/** Lista nova com a sugestão ignorada (as 300 mais novas ficam). s: { chave, fonte, secao, oque }. */
export const comIgnorada = (site, s) => [...(site?.sugestoesIgnoradas || []).filter((x) => x.chave !== s.chave), { chave: s.chave, fonte: s.fonte, secao: s.secao || '', texto: String(s.oque || '').slice(0, 200), em: new Date().toISOString() }].slice(-300);
export const semIgnorada = (site, chave) => (site?.sugestoesIgnoradas || []).filter((x) => x.chave !== chave);

/** Chaves de cada fonte (o mesmo conteúdo = a mesma chave). */
export const chaveItemPlano = (x) => chaveSugestao('analise', x?.secao, `${x?.tipo}|${x?.pedido}|${x?.como}`);
// Conferência: pelo item e pelo RESULTADO (não feito / parcial); o motivo é texto da IA, que muda a cada conferência.
export const chaveConferencia = (x, status) => chaveSugestao('conferencia', x?.secao, `${x?.tipo}|${x?.pedido}|${status || ''}`);
export const chaveAchado = (a) => chaveSugestao('cara_de_ia', '', `${a?.id}|${a?.trecho || ''}`);
