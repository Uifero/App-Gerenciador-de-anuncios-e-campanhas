// "Requisitos legais de loja no Brasil" (Frente 1): conferência do passo 6, sem IA. Lê os dados da loja que o OPERADOR
// preencheu (cliente.dadosLoja: nome empresarial, CNPJ ou CPF, endereço, e-mail, telefone), as políticas do site e os
// preços dos produtos, e diz o que falta. Nunca inventa CNPJ, endereço nem contato: só aponta o campo vazio.
// Resumo com palavras nossas do CDC (art. 49, arrependimento de 7 dias), do Decreto 7.962/2013 e da LGPD; não é parecer
// jurídico. O texto que a IA recebe está em server/referencias/requisitos-legais.js.

const txt = (v) => String(v ?? '').trim();
const so = (v) => txt(v).replace(/\D/g, '');

export const CAMPOS_DADOS_LOJA = [
  ['razaoSocial', 'Nome empresarial (ou nome de quem vende)', 'Ex.: Nome da Empresa Ltda'],
  ['cnpj', 'CNPJ (ou CPF de quem vende)', '00.000.000/0000-00'],
  ['endereco', 'Endereço (físico ou para devolução)', 'Rua, número, cidade/UF, CEP'],
  ['email', 'E-mail de atendimento', 'atendimento@loja.com.br'],
  ['telefone', 'Telefone ou WhatsApp', '(11) 99999-9999'],
];

/** CNPJ com os dígitos verificadores certos. */
export function cnpjValido(v) {
  const d = so(v); if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = pesos.reduce((a, p, i) => a + Number(d[i]) * p, 0) % 11; return s < 2 ? 0 : 11 - s; };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}
/** CPF com os dígitos verificadores certos. */
export function cpfValido(v) {
  const d = so(v); if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => { const s = [...d.slice(0, n)].reduce((a, x, i) => a + Number(x) * (n + 1 - i), 0) % 11; return s < 2 ? 0 : 11 - s; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
/** 'cnpj' | 'cpf' | null (vazio ou dígitos que não conferem). */
export const tipoDocumento = (v) => (cnpjValido(v) ? 'cnpj' : cpfValido(v) ? 'cpf' : null);
export const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(txt(v));

/** Trecho padrão do direito de arrependimento (lei, não dado inventado): o operador acrescenta com um clique. */
export const TRECHO_ARREPENDIMENTO = 'Direito de arrependimento: em compras pela internet, você pode desistir em até 7 dias corridos a partir do recebimento do pedido, sem precisar explicar o motivo. Devolvemos o valor pago, inclusive o frete. Para pedir, fale com o nosso atendimento.';
export const temArrependimento = (t) => /arrependimento|\b(7|sete)\s*dias\b/i.test(txt(t));
export const privacidadeCompleta = (t) => /dados/i.test(txt(t)) && txt(t).length >= 80;

/**
 * Itens legais do passo 6: [{ id, texto, ok, falta, acao }]. acao.tipo: 'dados' (campo de cliente.dadosLoja),
 * 'arrependimento' (acrescentar o trecho padrão), 'politica' (editar à mão, passo 4), 'produto'.
 */
export function checklistLegal({ cliente = {}, site = {}, produtos = [] } = {}) {
  const dl = cliente.dadosLoja || {}, pol = site?.conteudo?.politicas || {};
  const doc = tipoDocumento(dl.cnpj);
  const zap = so(site?.config?.whatsapp);
  const semPreco = produtos.filter((p) => !(Number(p.preco) > 0));
  const promoErrada = produtos.filter((p) => Number(p.precoPromocional) > 0 && !(Number(p.precoPromocional) < Number(p.preco)));
  return [
    { id: 'legal-identificacao', texto: 'Nome empresarial e CNPJ (ou CPF) no rodapé',
      ok: Boolean(txt(dl.razaoSocial) && doc),
      falta: !txt(dl.cnpj) ? 'Falta o CNPJ (ou CPF) de quem vende. O app não inventa: peça ao cliente.' : !doc ? 'O CNPJ/CPF digitado não confere (dígitos verificadores). Confira com o cliente.' : 'Falta o nome empresarial (ou o nome de quem vende).',
      acao: { tipo: 'dados', alvo: !txt(dl.cnpj) || !doc ? 'cnpj' : 'razaoSocial' } },
    { id: 'legal-contato', texto: 'Contato visível (e-mail ou telefone/WhatsApp)',
      ok: emailValido(dl.email) || so(dl.telefone).length >= 10 || zap.length >= 10,
      falta: 'Falta um contato de atendimento (e-mail ou telefone).', acao: { tipo: 'dados', alvo: 'email' } },
    { id: 'legal-endereco', texto: 'Endereço físico ou para devolução',
      ok: txt(dl.endereco).length >= 10, falta: 'Falta o endereço (físico ou para onde o cliente devolve). O app não inventa.', acao: { tipo: 'dados', alvo: 'endereco' } },
    { id: 'legal-arrependimento', texto: 'Direito de desistir em 7 dias na política de trocas',
      ok: temArrependimento(pol.trocas), falta: txt(pol.trocas) ? 'A política de trocas não fala do direito de arrependimento (7 dias da compra online).' : 'Sem política de trocas: escreva a do cliente (passo 4) ou acrescente o trecho do arrependimento.',
      acao: { tipo: 'arrependimento' } },
    { id: 'legal-trocas', texto: 'Política de trocas e devoluções', ok: txt(pol.trocas).length >= 40, falta: 'A política de trocas está vazia ou curta demais (prazo, como pedir, quem paga o frete).', acao: { tipo: 'politica', alvo: 'trocas' } },
    { id: 'legal-privacidade', texto: 'Política de privacidade (LGPD): que dados, para quê, com quem', ok: privacidadeCompleta(pol.privacidade), falta: 'A política de privacidade está vazia ou não diz quais dados a loja usa e para quê.', acao: { tipo: 'politica', alvo: 'privacidade' } },
    { id: 'legal-preco', texto: 'Preço claro em todos os produtos (preço riscado só se for real)',
      ok: produtos.length > 0 && !semPreco.length && !promoErrada.length,
      falta: semPreco.length ? `Sem preço: ${semPreco.map((p) => p.nome).join(', ')}.` : promoErrada.length ? `Preço promocional maior ou igual ao preço: ${promoErrada.map((p) => p.nome).join(', ')}.` : 'Nenhum produto cadastrado.',
      acao: { tipo: 'produto', alvo: (semPreco[0] || promoErrada[0])?.id || null } },
  ];
}

/** Dados da loja limpos para gravar (só texto curto; CNPJ/CPF com a máscara de volta). */
export function normalizarDadosLoja(v = {}) {
  const d = so(v.cnpj);
  const cnpj = d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : txt(v.cnpj);
  return Object.fromEntries(CAMPOS_DADOS_LOJA.map(([k]) => [k, (k === 'cnpj' ? cnpj : txt(v[k])).slice(0, 200)]));
}
