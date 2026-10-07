// IA simulada no navegador (app em modo demo com o Vite): no console, `await import('/tests/fixtures/ia/simulador-navegador.js')`.
// Responde POST /api/claude e GET /api/claude/trabalho/:id com o `texto` da fixture da tarefa (sem gastar a assinatura).
// window.__fx[tarefa] = texto troca a resposta de uma tarefa; window.__simulado lista as tarefas pedidas; window.__real = true
// deixa as chamadas irem para o servidor de verdade.
const FIXTURES = {
  extracao_anuncio: 'extracao-anuncio-real', palavras_nicho: 'palavras-nicho-real', pesquisa_nicho: 'pesquisa-nicho-real',
  resumo_documento: 'resumo-documento-real', recomendacao_anuncio: 'recomendacao-anuncio-real', leitura_resultados: 'leitura-prints-real',
  otimizacao_anuncio: 'otimizacao-anuncio-real',
};
window.__fx = window.__fx || {};
for (const [t, f] of Object.entries(FIXTURES)) {
  if (window.__fx[t]) continue;
  try { window.__fx[t] = (await (await fetch(`/tests/fixtures/ia/${f}.json`)).json()).texto; } catch { /* fixture ainda não gravada */ }
}
window.__simulado = [];
window.__pedidos = [];
const original = window.__fetchOrig || window.fetch;
window.__fetchOrig = original;
const fila = {};
let n = 0;
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
window.fetch = async (u, o) => {
  const s = String(u);
  if (!window.__real && s.endsWith('/api/claude') && o?.method === 'POST') {
    const b = JSON.parse(o.body); const id = `sim${++n}`;
    window.__simulado.push(b.tarefa); window.__pedidos.push(b);
    if (window.__fx[b.tarefa] == null) return json({ erro: `Sem fixture para a tarefa ${b.tarefa}.` }, 500);
    fila[id] = window.__fx[b.tarefa];
    return json({ trabalho: id }, 202);
  }
  if (!window.__real && s.includes('/api/claude/trabalho/')) {
    const id = s.split('/').pop();
    return json({ pronto: true, status: 200, corpo: { texto: fila[id], provedor: 'cli', uso: { entrada: 1, saida: 1, custoUsd: 0, modelo: 'simulado', provedor: 'cli' } } });
  }
  return original(u, o);
};
export default Object.keys(window.__fx);
