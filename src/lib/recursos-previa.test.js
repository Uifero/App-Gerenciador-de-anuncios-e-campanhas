// Frente 2: a prévia (pacote) e o site personalizado mostram os pedidos comuns de loja quando o plano os liga.
import { describe, it, expect } from 'vitest';
import { dadosDoPacote, gerarPreviaLojaHTML } from './pacote-loja.js';
import { gerarSiteHTML } from './sitegen.js';

const RECURSOS = { freteGratis: { valor: 199 }, pagamentos: ['cartao', 'pix', 'boleto'], botaoGrande: true, colunasProdutos: 2, paginaProduto: true, secoesProduto: ['formula', 'beneficios'], compreJunto: { onde: 'carrinho', pares: [{ de: 'p1', sugerido: 'p2' }] } };
const PRODUTOS = [
  { id: 'p1', nome: 'Thermora Caps', preco: 189.9, descricao: 'Termogênico em cápsulas.', formula: 'Cafeína 200 mg, chá verde', beneficios: 'Mais disposição', fotos: [1, 2, 3, 4, 5, 6, 7].map((i) => ({ url: `https://x/c${i}.jpg` })) },
  { id: 'p2', nome: 'Thermora Gel', preco: 99, fotos: [{ url: 'https://x/g.jpg' }] },
];
const cliente = { id: 'c1', nome: 'Thermora', nicho: 'suplementos' };

describe('prévia do pacote', () => {
  const html = (rec) => gerarPreviaLojaHTML(dadosDoPacote({ cliente, site: { modo: 'pacote_plataforma', plataforma: 'shopify', plataformaConfirmada: true, pacote: { recursos: rec } }, produtos: PRODUTOS }));
  const com = html(RECURSOS), sem = html(undefined);
  it('barra e aviso de frete grátis com o valor', () => {
    expect(com).toContain('data-barra-frete');
    expect(com).toContain('Frete grátis acima de R$ 199,00');
    expect(sem).not.toContain('data-barra-frete');
  });
  it('ícones de pagamento, botão grande e 2 produtos por linha', () => {
    expect(com).toMatch(/data-pagamentos[^>]*>.*Cartão de crédito.*Pix.*Boleto/s);
    expect(com).toContain('class="comprar grande"');
    expect(com).toContain('.grade{grid-template-columns:repeat(2,1fr)}');
  });
  it('página do produto com TODAS as fotos, fórmula e benefícios (só com dado cadastrado)', () => {
    const pdp = com.split('id="produto-0"')[1].split('</section>')[0];
    for (let i = 2; i <= 7; i++) expect(pdp).toContain(`https://x/c${i}.jpg`);
    expect(sem.split('id="produto-0"')[1].split('</section>')[0]).not.toContain('https://x/c7.jpg'); // sem plano: as 5 primeiras
    expect(pdp).toContain('data-secao-produto="formula"');
    expect(pdp).toContain('Cafeína 200 mg');
    expect(com.split('id="produto-1"')[1].split('</section>')[0]).not.toContain('data-secao-produto="formula"'); // Gel sem fórmula: nada inventado
  });
  it('"Compre junto" com o outro produto', () => {
    const pdp = com.split('id="produto-0"')[1].split('</section>')[0];
    expect(pdp).toContain('data-compre-junto');
    expect(pdp).toContain('+ Thermora Gel');
    expect(pdp).toContain('na loja: sugestão no carrinho');
    expect(sem).not.toContain('data-compre-junto');
  });
  it('continua sem nenhum script', () => { expect(com).not.toMatch(/<script/i); });
});

describe('site personalizado', () => {
  const html = gerarSiteHTML({ cliente, produtos: PRODUTOS, conteudo: { heroTitulo: 'Oi', heroCta: 'Ver' }, config: { recursos: RECURSOS, pagamentos: ['cartao', 'pix', 'boleto'] } });
  it('barra de frete, página do produto e quanto falta para o frete no carrinho', () => {
    expect(html).toContain('class="barra-frete"');
    expect(html).toContain('id="p-p1" class="pdp-pagina"');
    expect(html).toContain('href="#p-p1"');
    expect(html).toContain('para o frete grátis');
    expect(html).toContain('Cafeína 200 mg');
  });
  it('"Compre junto" no carrinho sugere o par escolhido', () => {
    expect(html).toContain('"junto":"p2"');
    expect(html).toContain("getElementById('juntoCarrinho')");
  });
  it('sem recursos o site sai como antes', () => {
    const antes = gerarSiteHTML({ cliente, produtos: PRODUTOS, conteudo: { heroTitulo: 'Oi', heroCta: 'Ver' } });
    expect(antes).not.toContain('barra-frete"');
    expect(antes).not.toContain('pdp-pagina"');
    expect(antes).not.toContain('Ver detalhes');
  });
});
