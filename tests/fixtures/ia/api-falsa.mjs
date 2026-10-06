// API da Anthropic falsa (só POST /v1/messages com stream SSE), para testar a reserva sem gastar nada.
// modo 'ok' responde `texto`; modo 'erro' devolve 500. Nunca lê nem mostra a chave recebida.
import http from 'node:http';

export function apiFalsa({ modo = 'ok', texto = '{"ok":true}' } = {}) {
  const pedidos = [];
  const srv = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (d) => (corpo += d));
    req.on('end', () => {
      pedidos.push({ url: req.url, corpo: JSON.parse(corpo || '{}') });
      if (modo === 'erro') { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'falha simulada' } })); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const ev = (tipo, dados) => res.write(`event: ${tipo}\ndata: ${JSON.stringify({ type: tipo, ...dados })}\n\n`);
      ev('message_start', { message: { id: 'msg_teste', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 120, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: texto } });
      ev('content_block_stop', { index: 0 });
      ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 30 } });
      ev('message_stop', {});
      res.end();
    });
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${srv.address().port}`, pedidos, fechar: () => new Promise((f) => srv.close(f)) })));
}
