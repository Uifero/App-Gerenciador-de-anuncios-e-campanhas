// CLI falsa do Claude que RESPONDE (assinatura funcionando), para testar o roteamento sem gastar nada.
// Com imagem o servidor usa entrada stream-json: a resposta conta os blocos de imagem recebidos ("imagens=N").
const args = process.argv.slice(2);
const stream = args.includes('stream-json');
let entrada = '';
process.stdin.on('data', (d) => (entrada += d));
process.stdin.on('end', () => {
  let imagens = 0;
  if (stream) { try { imagens = JSON.parse(entrada.split('\n')[0]).message.content.filter((b) => b.type === 'image').length; } catch { imagens = -1; } }
  const r = { type: 'result', is_error: false, result: `{"ok":true,"imagens":${imagens}}`, usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
  if (stream) process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init' }) + '\n' + JSON.stringify(r) + '\n');
  else process.stdout.write(JSON.stringify(r));
});
