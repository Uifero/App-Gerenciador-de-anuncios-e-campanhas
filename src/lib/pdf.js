// Helper mínimo sobre o jsPDF para relatórios e manuais (texto com quebra de página automática).

// A fonte padrão do jsPDF cobre Latin-1 (acentos ok), mas não aspas/travessões tipográficos nem emoji.
const limpar = (t) => String(t ?? '')
  .replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[•●]/g, '-')
  .replace(/ /g, ' ').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}★☆✓✔]/gu, '').replace(/→/g, '->');

/** Async: o jsPDF é carregado sob demanda para não pesar o carregamento inicial. */
export async function criarPdf(titulo, subtitulo = '') {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48;
  let y = M;
  const largura = W - M * 2;
  const garantir = (h) => { if (y + h > H - M) { doc.addPage(); y = M; } };

  const api = {
    titulo(t, tam = 20) {
      garantir(tam + 12); doc.setFont('helvetica', 'bold').setFontSize(tam).setTextColor(30, 41, 59);
      doc.text(doc.splitTextToSize(limpar(t), largura), M, y + tam * 0.8); y += tam * 1.5;
      return api;
    },
    secao(t) {
      garantir(40); y += 8; doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(79, 70, 229);
      doc.text(limpar(t), M, y + 10); y += 14;
      doc.setDrawColor(226, 232, 240).line(M, y + 3, W - M, y + 3); y += 12; return api;
    },
    texto(t, { negrito = false, cor = [51, 65, 85], tam = 10.5 } = {}) {
      doc.setFont('helvetica', negrito ? 'bold' : 'normal').setFontSize(tam).setTextColor(...cor);
      for (const linha of doc.splitTextToSize(limpar(t), largura)) { garantir(tam * 1.5); doc.text(linha, M, y + tam); y += tam * 1.45; }
      y += 3; return api;
    },
    lista(itens, numerada = false) {
      itens.forEach((t, i) => {
        doc.setFont('helvetica', 'normal').setFontSize(10.5).setTextColor(51, 65, 85);
        const marca = numerada ? `${i + 1}.` : '-';
        const linhas = doc.splitTextToSize(limpar(t), largura - 18);
        linhas.forEach((l, k) => { garantir(16); if (k === 0) doc.text(marca, M, y + 10.5); doc.text(l, M + 18, y + 10.5); y += 15; });
        y += 2;
      });
      return api;
    },
    espaco(n = 8) { y += n; return api; },
    salvar(nome) { doc.save(nome); },
  };

  doc.setFillColor(79, 70, 229).rect(0, 0, W, 6, 'F');
  api.titulo(titulo, 22);
  if (subtitulo) api.texto(subtitulo, { cor: [100, 116, 139] });
  // Rodapé com paginação em todas as páginas ao salvar.
  const salvarOriginal = api.salvar;
  api.salvar = (nome) => {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFontSize(8).setTextColor(148, 163, 184).text(`Gerenciador de Criativos e Campanhas — página ${p}/${n}`, M, H - 24); }
    salvarOriginal(nome);
  };
  return api;
}
