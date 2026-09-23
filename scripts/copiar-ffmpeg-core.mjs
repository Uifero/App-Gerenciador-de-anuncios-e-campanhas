// Copia o núcleo do ffmpeg.wasm (pacote @ffmpeg/core, ~32 MB) para public/ffmpeg — de lá o Estúdio carrega sob
// demanda, no navegador, só quando o usuário abre a edição de vídeo (nunca no carregamento inicial do app, e
// nunca passa pelo servidor). Roda sozinho depois de "npm install" (script "postinstall" do package.json).
// Os arquivos copiados NÃO entram no Git (são grandes e já vêm do pacote baixado pelo npm) — "npm install" de
// novo os recria se faltarem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// A variante ESM (não a UMD) é a que funciona: o worker do @ffmpeg/ffmpeg é carregado como módulo ES pelo Vite
// (new Worker(url, {type:'module'})) e faz "import()" do núcleo — só o build ESM do @ffmpeg/core exporta certo
// nesse caminho (a UMD falha com "failed to import ffmpeg-core.js").
const origem = path.join(raiz, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
const destino = path.join(raiz, 'public', 'ffmpeg');

if (!fs.existsSync(origem)) {
  console.warn('[ffmpeg] @ffmpeg/core não encontrado em node_modules — pulei a cópia. A edição de vídeo do Estúdio não vai funcionar até rodar "npm install" com a dependência presente.');
  process.exit(0);
}
fs.mkdirSync(destino, { recursive: true });
for (const nome of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  fs.copyFileSync(path.join(origem, nome), path.join(destino, nome));
}
console.log('[ffmpeg] núcleo do ffmpeg.wasm copiado para public/ffmpeg/.');
