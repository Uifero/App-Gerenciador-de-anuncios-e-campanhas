// IA simulada no navegador (app em modo demo com o Vite): no console, `await import('/tests/fixtures/ia/simulador-navegador.js')`.
// Responde POST /api/claude e GET /api/claude/trabalho/:id com o `texto` da fixture da tarefa (sem gastar a assinatura).
// window.__fx[tarefa] = texto troca a resposta de uma tarefa; window.__simulado lista as tarefas pedidas; window.__real = true
// deixa as chamadas irem para o servidor de verdade. window.__limite = true simula a assinatura no limite: o servidor pede
// permissão (409 precisaPermissao) e só o reenvio com permitirApi responde, pago pela API.
const FIXTURES = {
  extracao_anuncio: 'extracao-anuncio-real', palavras_nicho: 'palavras-nicho-real', pesquisa_nicho: 'pesquisa-nicho-real',
  resumo_documento: 'resumo-documento-real', recomendacao_anuncio: 'recomendacao-anuncio-real', leitura_resultados: 'leitura-prints-real',
  otimizacao_anuncio: 'otimizacao-anuncio-real', plano_site: 'plano-thermora-secoes', plano_secao: 'plano-secao-thermora',
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
    const usarApi = b.permitirApi || (window.__limite && b.usarApi === 'sempre');
    fila[id] = window.__limite && !usarApi ? (b.usarApi === 'nunca' ? { nunca: true } : { pedir: true }) : { texto: window.__fx[b.tarefa], api: Boolean(usarApi) };
    return json({ trabalho: id }, 202);
  }
  if (!window.__real && s.includes('/api/claude/trabalho/')) {
    const id = s.split('/').pop();
    const f = fila[id];
    if (f.nunca) return json({ pronto: true, status: 503, corpo: { erro: 'O limite da assinatura do Claude acabou. Volta às 21:30 (horário de Brasília). A chave de API não foi usada.', limite: true, provedor: 'cli' } });
    if (f.pedir) return json({ pronto: true, status: 409, corpo: { erro: 'A assinatura chegou ao limite.', motivo: 'O limite da assinatura do Claude acabou. Volta às 21:30 (horário de Brasília).', precisaPermissao: true, limite: true, custoEstimadoUsd: 0.0421, provedor: 'cli' } });
    const prov = f.api ? 'api' : 'cli';
    return json({ pronto: true, status: 200, corpo: { texto: f.texto, provedor: prov, uso: { entrada: 1000, saida: 500, custoUsd: f.api ? 0.0123 : 0, modelo: 'claude-haiku-4-5', provedor: prov } } });
  }
  return original(u, o);
};
export default Object.keys(window.__fx);
