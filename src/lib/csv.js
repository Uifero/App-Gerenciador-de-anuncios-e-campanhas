// Exportação do catálogo em CSV no formato de importação de Shopify e Nuvemshop (PapaParse).
import Papa from 'papaparse';

export const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Variações: [{nome, valores[]}] -> combinações [{Cor:'Preto', Tamanho:'P'}, ...] (máx. 3 opções). */
export function combinacoes(variacoes = []) {
  const vs = variacoes.filter((v) => v.nome && v.valores?.length).slice(0, 3);
  if (!vs.length) return [null];
  return vs.reduce((acc, v) => acc.flatMap((a) => v.valores.map((val) => [...a, [v.nome, val]])), [[]]).map((par) => par);
}

const htmlDesc = (p) => (p.descricao ? `<p>${String(p.descricao).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])).replace(/\n/g, '<br>')}</p>` : '');
const preco = (n) => (n == null || n === '' ? '' : Number(n).toFixed(2));

export function csvShopify(produtos, cliente) {
  const linhas = [];
  for (const p of produtos) {
    const handle = slug(p.nome);
    const combos = combinacoes(p.variacoes);
    const vs = (p.variacoes || []).filter((v) => v.nome && v.valores?.length).slice(0, 3);
    const imgs = p.fotos || [];
    const total = Math.max(combos.length, imgs.length, 1);
    for (let i = 0; i < total; i++) {
      const combo = combos[i]; const primeira = i === 0;
      const linha = { Handle: handle };
      if (primeira) Object.assign(linha, { Title: p.nome, 'Body (HTML)': htmlDesc(p), Vendor: cliente.nome, 'Product Category': '', Type: p.categoria || '', Tags: p.categoria || '', Published: 'TRUE' });
      const opcs = combo || [];
      for (let k = 0; k < 3; k++) {
        if (primeira && vs[k] && combo) linha[`Option${k + 1} Name`] = vs[k].nome;
        if (combo && opcs[k]) linha[`Option${k + 1} Value`] = opcs[k][1];
      }
      if (combo !== undefined) {
        Object.assign(linha, {
          'Variant SKU': `${handle}-${i + 1}`, 'Variant Inventory Tracker': '', 'Variant Inventory Qty': '', 'Variant Inventory Policy': 'deny',
          'Variant Fulfillment Service': 'manual', 'Variant Price': p.precoPromocional ? preco(p.precoPromocional) : preco(p.preco),
          'Variant Compare At Price': p.precoPromocional ? preco(p.preco) : '', 'Variant Requires Shipping': 'TRUE', 'Variant Taxable': 'TRUE',
        });
      }
      if (imgs[i]) Object.assign(linha, { 'Image Src': imgs[i].url, 'Image Position': i + 1, 'Image Alt Text': p.nome });
      if (primeira) Object.assign(linha, { Status: 'active' });
      linhas.push(linha);
    }
  }
  const campos = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price',
    'Variant Compare At Price', 'Variant Requires Shipping', 'Variant Taxable', 'Image Src', 'Image Position', 'Image Alt Text', 'Status'];
  return Papa.unparse({ fields: campos, data: linhas.map((l) => campos.map((c) => l[c] ?? '')) });
}

export function csvNuvemshop(produtos, cliente) {
  const campos = ['Identificador URL', 'Nome', 'Categorias', 'Nome da variação 1', 'Valor da variação 1', 'Nome da variação 2', 'Valor da variação 2', 'Nome da variação 3', 'Valor da variação 3',
    'Preço', 'Preço promocional', 'Peso (kg)', 'Altura (cm)', 'Largura (cm)', 'Comprimento (cm)', 'Estoque', 'SKU', 'Código de barras', 'Exibir na loja', 'Frete grátis', 'Descrição', 'Tags',
    'Título para SEO', 'Descrição para SEO', 'Marca', 'Produto Físico'];
  const linhas = [];
  for (const p of produtos) {
    const handle = slug(p.nome);
    combinacoes(p.variacoes).forEach((combo, i) => {
      const l = {
        'Identificador URL': handle, Nome: p.nome, Categorias: p.categoria || '', Preço: preco(p.preco), 'Preço promocional': preco(p.precoPromocional),
        Estoque: '', SKU: `${handle}-${i + 1}`, 'Exibir na loja': 'SIM', 'Frete grátis': 'NÃO', Descrição: htmlDesc(p), Tags: p.categoria || '',
        'Título para SEO': p.nome, 'Descrição para SEO': String(p.descricao || '').slice(0, 160), Marca: cliente.nome, 'Produto Físico': 'SIM',
      };
      (combo || []).forEach((par, k) => { l[`Nome da variação ${k + 1}`] = par[0]; l[`Valor da variação ${k + 1}`] = par[1]; });
      linhas.push(campos.map((c) => l[c] ?? ''));
    });
  }
  return Papa.unparse({ fields: campos, data: linhas });
}
