// Questionário único: texto para o cliente, leitura local por numeração, dado sensível, interpretação e revisão.
import { describe, it, expect } from 'vitest';
import { PERGUNTAS, TOTAL_PERGUNTAS, textoParaCliente, lerRespostaLocal, protegerSensivel, interpretar, perguntaPorId, planoDeRevisao, respondidas, produtosLocais, ABERTURA, FECHO, precoDigitado, tirarPergunta, limparRespostasIA } from './questionario.js';

const clienteVazio = { id: 'c1', nome: 'Loja da Ana', marca: {} };

describe('perguntas', () => {
  it('18 perguntas, números 1 a 18 e ids únicos e estáveis', () => {
    expect(TOTAL_PERGUNTAS).toBe(18);
    expect(PERGUNTAS.map((p) => p.n)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    // ids que já existiam no card antes desta fase continuam iguais
    for (const id of ['presenca', 'produtos', 'tom', 'usp', 'objecoes', 'provas', 'referencia', 'pixel', 'pagamento', 'formato']) expect(perguntaPorId(id)).toBeTruthy();
    expect(new Set(PERGUNTAS.map((p) => p.id)).size).toBe(18);
  });
  it('texto do cliente nunca pede senha/login/token (só avisa para não mandar)', () => {
    for (const p of PERGUNTAS) expect(p.cliente).not.toMatch(/mande (sua|a) senha|envie (sua|a) senha|token|código de acesso/i);
    expect(perguntaPorId('pixel').cliente).toContain('Nunca mande login nem senha');
    expect(perguntaPorId('pixel').cliente).toContain('(o Pixel é um código');
  });
});

describe('texto para o cliente', () => {
  it('todas: saudação com nome, abertura, blocos numerados e frase final', () => {
    const { texto, quantidade } = textoParaCliente({ cliente: clienteVazio, modo: 'todas' });
    expect(quantidade).toBe(18);
    expect(texto.startsWith('Olá, Loja da Ana! Tudo bem?')).toBe(true);
    expect(texto).toContain(ABERTURA);
    expect(texto).toContain('*SOBRE O NEGÓCIO*');
    expect(texto).toContain('\n7. Quais produtos você quer vender?');
    expect(texto.trim().endsWith(FECHO)).toBe(true);
  });
  it('só o que falta: pula o preenchido e mantém a numeração original', () => {
    const cliente = { ...clienteVazio, marca: { usp: 'não marca', tomDeVoz: 'leve' }, siteReferencia: 'https://x.com' };
    const { texto, quantidade } = textoParaCliente({ cliente, site: { modo: 'custom' }, produtos: [{ nome: 'L' }], modo: 'faltam' });
    expect(quantidade).toBe(18 - 5);
    expect(texto).not.toMatch(/^2\. /m); expect(texto).not.toMatch(/^7\. /m); expect(texto).not.toMatch(/^18\. /m);
    expect(texto).toMatch(/^1\. O que você vende/m); expect(texto).toMatch(/^16\. /m);
  });
});

describe('leitura local por numeração', () => {
  it('separa por número, tira a pergunta repetida e ignora "não sei"', () => {
    const resp = `Oi! Seguem:
1. O que você vende e para quem? (ex.: "roupas de academia para mulheres de 25 a 45 anos")
Roupa fitness pra mulheres 30+
2) Não fica transparente
3 - descontraída
4: não sei
7. Legging Power - cintura alta - R$ 129,90 - tamanhos P, M, G
Top Flex - R$ 79
16. 123456789012345
Responda mantendo os números das perguntas. O que não souber, pode deixar em branco.`;
    const r = lerRespostaLocal(resp);
    expect(r.numerada).toBe(true);
    expect(r.respostas.negocio).toBe('Roupa fitness pra mulheres 30+');
    expect(r.respostas.usp).toBe('Não fica transparente');
    expect(r.respostas.tom).toBe('descontraída');
    expect(r.respostas.objecoes).toBeUndefined();
    expect(r.respostas.produtos.split('\n')).toHaveLength(2);
    expect(r.respostas.pixel).toBe('123456789012345');
  });
  it('texto corrido não é tratado como numerado; número solto no meio não vira pergunta', () => {
    expect(lerRespostaLocal('vendo legging pra academia, meu diferencial é que não marca').numerada).toBe(false);
    const r = lerRespostaLocal('1. vendo leggings\n7. Legging - R$ 99\n3 unidades por pedido no máximo');
    expect(r.respostas.produtos).toContain('3 unidades'); // "3" depois do 7 não abre a pergunta 3
    expect(r.respostas.tom).toBeUndefined();
  });
  it('aceita "Pergunta 5:" e "5º"', () => {
    const r = lerRespostaLocal('Pergunta 5: "minha calça fica transparente"\n6º não prometer emagrecimento');
    expect(r.respostas).toEqual({ linguagemDor: '"minha calça fica transparente"', termosProibidos: 'não prometer emagrecimento' });
  });
});

describe('pergunta repetida pelo cliente (eco)', () => {
  const neg = perguntaPorId('negocio');
  it('tira a pergunta e o rótulo "Resposta:" e mantém só a resposta', () => {
    expect(tirarPergunta(neg, 'O que você vende e para quem?\n\nResposta:\nVendemos um produto encapsulado para emagrecimento.')).toBe('Vendemos um produto encapsulado para emagrecimento.');
    expect(tirarPergunta(neg, 'O que vc vende e para quem?\nR: cápsulas')).toBe('cápsulas');
    expect(tirarPergunta(neg, 'O que você vende e para quem? Resposta — cápsulas para mulheres')).toBe('cápsulas para mulheres');
  });
  it('sem eco, o texto continua igual', () => {
    expect(tirarPergunta(neg, 'Vendemos cápsulas para mulheres.\nAtenção: confirmar as alegações antes de anunciar.')).toBe('Vendemos cápsulas para mulheres.\nAtenção: confirmar as alegações antes de anunciar.');
  });
  it('IA que devolveu só a pergunta: recupera a resposta que vem depois, até a próxima pergunta', () => {
    const texto = 'O que você vende e para quem?\n\nResposta:\nVendemos cápsulas para emagrecimento, para mulheres de 30 a 50.\n\nO que faz o seu produto ou a sua loja ser diferente dos concorrentes?\nResposta: fórmula natural';
    const r = limparRespostasIA({ negocio: 'O que você vende e para quem?', usp: 'fórmula natural' }, texto);
    expect(r).toEqual({ negocio: 'Vendemos cápsulas para emagrecimento, para mulheres de 30 a 50.', usp: 'fórmula natural' });
  });
  it('trecho com a próxima pergunta no fim: corta a pergunta', () => {
    const r = limparRespostasIA({ negocio: 'Vendemos cápsulas.\n\nO que faz o seu produto ou a sua loja ser diferente dos concorrentes?' }, '');
    expect(r.negocio).toBe('Vendemos cápsulas.');
  });
});

describe('dado sensível', () => {
  it('mascara senha, token e cartão; mantém link e ID de Pixel', () => {
    const r = protegerSensivel(`senha do Instagram é Abc@1234
token: EAAGm0PX4ZCpsBAxyz1234567890
cartão 4111 1111 1111 1111 cvv 123
pixel 123456789012345
fotos: https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789`);
    expect(r.achados.sort()).toEqual(['cartão', 'senha', 'token']);
    expect(r.texto).not.toContain('Abc@1234'); expect(r.texto).not.toContain('EAAGm0PX4ZC'); expect(r.texto).not.toContain('4111 1111'); expect(r.texto).not.toMatch(/cvv:? 123/);
    expect(r.texto).toContain('pixel 123456789012345');
    expect(r.texto).toContain('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
  });
  it('frases comuns não disparam alarme falso', () => {
    for (const t of ['não vou mandar senha nenhuma', 'Nunca mande login nem senha.', 'a chave do sucesso é o atendimento', 'CNPJ 12.345.678/0001-90']) expect(protegerSensivel(t).achados).toEqual([]);
  });
  it('chave de API solta (sk-...) também', () => {
    expect(protegerSensivel('usa essa: sk-ant-api03-AbCdEf1234567890xyz').achados).toEqual(['token']);
  });
});

describe('interpretação local', () => {
  it('produtos: preço só quando escrito; variações', () => {
    const p = produtosLocais('Legging Power - cintura alta - R$ 129,90 - tamanhos P, M, G\nTop Flex - sem bojo\nShort 2 em 1 - 89 reais');
    expect(p[0]).toMatchObject({ nome: 'Legging Power', preco: 129.9, variacoes: [{ nome: 'Tamanho', valores: ['P', 'M', 'G'] }] });
    expect(p[1]).toMatchObject({ nome: 'Top Flex', preco: null });
    expect(p[2].preco).toBe(89);
  });
  it('anúncios, pixel, pagamento, formato, links', () => {
    expect(interpretar(perguntaPorId('anuncios'), 'Sim, uns R$ 50 por dia e cada venda sai uns 35 reais')).toEqual({ anuncia: true, orcamentoDiario: 50, cpaMedio: 35 });
    expect(interpretar(perguntaPorId('anuncios'), 'ainda não anuncio')).toMatchObject({ anuncia: false });
    expect(interpretar(perguntaPorId('pixel'), 'não tenho')).toEqual({ semPixel: true });
    expect(interpretar(perguntaPorId('pixel'), 'tenho sim, é o 12ab')).toEqual({ invalido: 'tenho sim, é o 12ab' });
    expect(interpretar(perguntaPorId('pagamento'), 'acho que mercado pago')).toBe('mercado_pago');
    expect(interpretar(perguntaPorId('formato'), 'quero a nuvemshop')).toBe('nuvemshop');
    expect(interpretar(perguntaPorId('presenca'), 'site www.lojadaana.com.br e insta @lojadaana')).toEqual({ site: 'www.lojadaana.com.br', instagram: '@lojadaana' });
  });
});

describe('preço digitado na revisão', () => {
  it('vírgula decimal, ponto de milhar e ponto decimal (o bug do 129.9 virar 1299)', () => {
    expect(precoDigitado('129,90')).toBe(129.9); expect(precoDigitado('1.299,90')).toBe(1299.9);
    expect(precoDigitado('129.9')).toBe(129.9); expect(precoDigitado('R$ 79')).toBe(79); expect(precoDigitado('')).toBeNull();
  });
});

describe('revisão', () => {
  it('vazio preenche, diferente vira conflito, pixel inválido não salva, sem resposta', () => {
    const cliente = { ...clienteVazio, marca: { usp: 'Tecido que não marca' }, rastreamento: {} };
    const linhas = planoDeRevisao({ cliente, site: {}, produtos: [{ nome: 'Top Flex' }] }, { negocio: 'fitness', usp: 'Entrega em 24h', pixel: '12ab', produtos: 'Top Flex - R$ 79\nLegging - R$ 99' });
    const por = Object.fromEntries(linhas.map((l) => [l.pergunta.id, l]));
    expect(por.negocio.estado).toBe('vazio');
    expect(por.usp).toMatchObject({ estado: 'conflito', atual: 'Tecido que não marca' });
    expect(por.pixel.estado).toBe('invalido');
    expect(por.produtos.estado).toBe('vazio');
    expect(por.produtos.motivo).toContain('1 produto(s) com o mesmo nome');
    expect(por.oferta.estado).toBe('sem_resposta');
  });
  it('contador de respondidas usa o dado real', () => {
    const r = respondidas({ marca: { negocio: 'x', jaAnuncia: 'nao' }, estagio: 'novo' }, { pagamentoPreferido: 'stripe' }, [], 2);
    expect(Object.values(r).filter(Boolean).length).toBe(4); // negocio, anuncios (não anuncia), materiais (2 materiais), pagamento
  });
});
