// ZIP mínimo (sem compressão, método "stored"), suficiente para entregar o site personalizado como uma PASTA pronta
// para arrastar numa hospedagem (ex.: Netlify Drop pede uma pasta com o index.html dentro). Sem dependência nova:
// o Windows, o macOS e as hospedagens abrem esse formato normalmente.

let TABELA = null;
function crc32(bytes) {
  if (!TABELA) {
    TABELA = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABELA[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** arquivos: [{ nome: 'pasta/index.html', conteudo: string | Uint8Array }] -> Uint8Array do .zip. */
export function criarZip(arquivos) {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let offset = 0;
  const agora = new Date();
  const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | Math.floor(agora.getSeconds() / 2);
  const data = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const dados = typeof a.conteudo === 'string' ? enc.encode(a.conteudo) : a.conteudo;
    const crc = crc32(dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // bit 11: nomes em UTF-8
    local.setUint16(8, 0, true); local.setUint16(10, hora, true); local.setUint16(12, data, true);
    local.setUint32(14, crc, true); local.setUint32(18, dados.length, true); local.setUint32(22, dados.length, true);
    local.setUint16(26, nome.length, true); local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nome, dados);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true); cd.setUint16(12, hora, true); cd.setUint16(14, data, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, dados.length, true); cd.setUint32(24, dados.length, true);
    cd.setUint16(28, nome.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nome);
    offset += 30 + nome.length + dados.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true); fim.setUint32(16, offset, true);
  const tudo = [...partes, ...central, new Uint8Array(fim.buffer)];
  const out = new Uint8Array(tudo.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of tudo) { out.set(p, pos); pos += p.length; }
  return out;
}
