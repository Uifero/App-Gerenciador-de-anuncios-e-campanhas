// Auditoria de um banco restaurado: contagens por cliente e referências quebradas. Só números e ids técnicos —
// nunca nome, texto ou dado do cliente (o backup real de produção passa por aqui).
const ids = (lista) => new Set(lista.map((d) => d.id));
const porCliente = (lista, cid) => lista.filter((d) => d.clienteId === cid);
const usos = (m) => m?.usos || {};
const temUso = (u) => Object.entries(u).some(([k, v]) => (k === 'produtos' ? (v || []).length > 0 : Boolean(v)));

/** `banco` = { coleção: [docs com id] } (como db.listar devolve). */
export function auditar(banco, COL) {
  const L = (k) => banco[COL[k]] || [];
  const clientes = L('clientes');
  const idsClientes = ids(clientes);
  const problemas = [];
  const p = (cliente, tipo, detalhe) => problemas.push({ cliente, tipo, detalhe });
  const caminhos = new Set();
  let dataUrls = 0;

  const porClienteOut = clientes.map((c, i) => {
    const rot = `Cliente ${i + 1}`;
    const produtos = porCliente(L('produtos'), c.id), materiais = porCliente(L('materiais'), c.id), criativos = porCliente(L('criativos'), c.id);
    const resultados = porCliente(L('resultados'), c.id), campanhas = porCliente(L('campanhas'), c.id), sites = porCliente(L('sites'), c.id);
    const idsProd = ids(produtos), idsMat = ids(materiais), idsCr = ids(criativos);

    for (const m of materiais) {
      if (m.path) caminhos.add(m.path);
      if (m.borrada?.path) caminhos.add(m.borrada.path);
      if (String(m.url || '').startsWith('data:')) dataUrls++;
      if (m.origem !== 'prova_texto' && !m.url) p(rot, 'material sem link do arquivo', m.id);
      if (m.origem === 'prova_social' && m.borrada && !m.borrada.url) p(rot, 'print com cópia borrada sem link', m.id);
      for (const up of usos(m).produtos || []) if (!idsProd.has(up.id)) p(rot, '"Usar em" aponta para produto apagado', `${m.id} → ${up.id}`);
    }
    for (const pr of produtos) for (const f of pr.fotos || []) if (f?.path) caminhos.add(f.path);
    for (const cr of criativos) {
      for (const k of ['arquivoPath', 'previaPath']) if (cr[k]) caminhos.add(cr[k]);
      if (cr.produtoId && !idsProd.has(cr.produtoId)) p(rot, 'criativo ligado a produto apagado', cr.id);
      if (cr.status === 'pronto_aprovacao' && !cr.aprovacaoToken) p(rot, 'criativo "aguardando cliente" sem link (precisa reenviar)', cr.id);
    }
    for (const r of resultados) if (r.criativoId && !idsCr.has(r.criativoId)) p(rot, 'resultado de criativo excluído', r.id);
    for (const cp of campanhas) for (const x of cp.criativosIds || []) if (!idsCr.has(x)) p(rot, 'campanha com criativo excluído', `${cp.id} → ${x}`);
    for (const st of sites) {
      const refs = [...Object.values(st.layout?.imagens || {}).map((v) => v?.materialId), st.pacote?.visual?.banner?.materialId, ...(st.conteudo?.depoimentos || []).map((d) => d?.materialId)].filter(Boolean);
      for (const mid of refs) if (!idsMat.has(mid)) p(rot, 'site aponta para material apagado', `${st.id} → ${mid}`);
    }
    if (c.logoArquivo?.materialId && !idsMat.has(c.logoArquivo.materialId)) p(rot, 'logo aponta para material apagado', c.logoArquivo.materialId);
    for (const a of c.arquivosRetidos || []) if (a?.path) caminhos.add(a.path);

    const site = sites[0] || {};
    return {
      cliente: rot,
      produtos: produtos.length, produtosComPreco: produtos.filter((x) => Number(x.preco) > 0).length,
      materiais: materiais.length, comCodigo: materiais.filter((m) => m.codigo).length, comUsarEm: materiais.filter((m) => temUso(usos(m))).length,
      provasPrint: materiais.filter((m) => m.origem === 'prova_social').length, printsComBorrada: materiais.filter((m) => m.origem === 'prova_social' && m.borrada).length,
      provasTexto: materiais.filter((m) => m.origem === 'prova_texto' || (m.origem === 'prova_social' && m.texto)).length,
      logo: materiais.filter((m) => m.origem === 'logo').length,
      perfilMarcaCampos: Object.values(c.marca || {}).filter((v) => String(v ?? '').trim()).length, questionario: c.respostasCliente ? 1 : 0,
      criativos: criativos.length, arquivados: criativos.filter((x) => x.arquivado).length, resultados: resultados.length, campanhas: campanhas.length,
      linksAprovacao: porCliente(L('aprovacoes'), c.id).length, respostasAprovacao: porCliente(L('respostas'), c.id).length,
      sites: sites.length, sitePlataforma: site.plataforma || site.modo || '-', siteTema: site.tema ? 'sim' : '-', siteVersao: site.versaoManual ?? '-',
      diagnosticos: porCliente(L('diagnosticos'), c.id).length, imagensDiagnostico: porCliente(L('diagnosticoImagens'), c.id).length,
    };
  });

  // Documentos de cliente que não existe mais (órfãos).
  for (const [k, col] of Object.entries(COL)) {
    if (k === 'clientes' || k === 'config' || k === 'playbooks') continue;
    const orfaos = (banco[col] || []).filter((d) => d.clienteId && !idsClientes.has(d.clienteId)).length;
    if (orfaos) p('-', `${col}: documentos de cliente que não existe`, `${orfaos}`);
  }
  return { porCliente: porClienteOut, problemas, arquivosStorageReferenciados: caminhos.size, imagensDentroDoArquivo: dataUrls };
}
