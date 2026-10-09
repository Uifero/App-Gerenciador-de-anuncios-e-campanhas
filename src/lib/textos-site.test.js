import { describe, it, expect } from 'vitest';
import {
  contadorTexto, exigirTamanho, LIMITE_TEXTO_SITE, normalizarParte, pendenciasParte, escolherVersao, definirFonte, confirmarAlegacao,
  receberTextoCompleto, mesclarSugestoes, textosParaAplicar, aplicarTextosNoEstado, conferirTextoItem, alegacoesMantidas,
  alegacoesParaCliente, numerosDe, comDestaques, AVISO_SITE_SAUDE,
} from './textos-site.js';
import { normalizarPlano, itensAceitos, checklistObrigatorio, conferirPorCodigo } from './plano-site.js';
import { motivoSaude, trocarPelaSegura, MOTIVO_ANUNCIO_SITE } from './saude.js';
import { gerarSiteHTML } from './sitegen.js';
import { gerarPreviaLojaHTML, dadosDoPacote, gruposPlataforma } from './pacote-loja.js';
import REAL from '../../tests/fixtures/ia/plano-thermora-motivos-real.json';
import MAO from '../../tests/fixtures/ia/plano-thermora-motivos.json';
import SUGERIR from '../../tests/fixtures/ia/sugerir-textos-thermora.json';

const foto = (n) => ({ id: `m${n}`, codigo: `F${n}`, url: `https://x/f${n}.jpg`, origem: 'foto', nomeOriginal: `f${n}.jpg` });
const CTX = { materiais: [1, 2, 3].map(foto), produtos: [{ id: 'p1', nome: 'Thermora Caps', preco: 189.9 }, { id: 'p2', nome: 'Thermora Gel', preco: 99 }], modo: 'pacote', plataforma: 'nuvemshop', tema: '', saude: true };
const SAUDE = { saude: true };
const THERMORA = { nome: 'Thermora', nicho: 'suplemento termogênico', marca: { produtoSaude: true } };
const planoDe = (fx, ctx = CTX) => normalizarPlano(JSON.parse(fx.texto), ctx);
const itemTexto = (plano) => plano.itens.find((x) => x.tipo === 'texto');
/** Resolve as pendências de um item: fonte do número e "Entendi" nas alegações. */
function resolver(item, { fonte = { tipo: 'vendas_cliente' } } = {}) {
  let x = item;
  for (const p of x.partes) {
    if (pendenciasParte(p, SAUDE).includes('fonte')) x = definirFonte(x, p.id, fonte, SAUDE);
    const q = x.partes.find((y) => y.id === p.id);
    if (pendenciasParte(q, SAUDE).includes('confirmar')) x = confirmarAlegacao(x, p.id, { por: 'gestor@x', em: '2026-10-09T12:00:00Z' }, SAUDE);
  }
  return x;
}

describe('limite do texto "Como eu quero o site"', () => {
  it('conta, avisa a partir de 90% e nunca corta calado', () => {
    expect(LIMITE_TEXTO_SITE).toBeGreaterThanOrEqual(8000);
    expect(contadorTexto('abc').rotulo).toBe('3 de 8.000 caracteres');
    expect(contadorTexto('x'.repeat(7199)).perto).toBe(false);
    expect(contadorTexto('x'.repeat(7200)).perto).toBe(true);
    const longo = 'y'.repeat(8000);
    expect(exigirTamanho(longo)).toBe(longo); // 8.000 inteiros, sem corte
    expect(() => exigirTamanho('z'.repeat(8001))).toThrow(/8\.001 caracteres.*Encurte/);
  });
});

describe('plano com os 5 motivos (resposta REAL gravada)', () => {
  it('vira um item de texto com 5 partes, pendente (alegação sem "Entendi" e número sem fonte), nunca "Não dá para fazer"', () => {
    const it5 = itemTexto(planoDe(REAL));
    expect(it5.partes).toHaveLength(5);
    expect(it5.status).toBe('pergunta');
    expect(it5.aceito).toBe(false);
    expect(it5.params).toMatchObject({ destino: 'secao', titulo: '5 motivos para escolher Thermora' });
    expect(it5.partes.every((p) => p.escolha === 'original')).toBe(true);
    // A IA devolveu a "melhorada" igual ao original: não conta como outra versão.
    expect(it5.partes[0].melhorada).toBe('');
    expect(it5.partes[2].segura).toBe('Fórmula sem estimulante forte');
    expect(pendenciasParte(it5.partes[0], SAUDE)).toEqual(['confirmar']);
    expect(pendenciasParte(it5.partes[3], SAUDE)).toEqual(['fonte']);
  });
});

describe('três versões por texto', () => {
  it('b) escolher "Seu texto" e confirmar o aviso deixa pronto e aplica o original', () => {
    const it5 = resolver(itemTexto(planoDe(MAO)));
    expect(it5.status).toBe('pronto');
    expect(it5.aceito).toBe(true);
    const [g] = textosParaAplicar([it5], SAUDE);
    expect(g.linhas.map((l) => l.texto)).toEqual(['Energia e disposição para o dia todo', 'Auxílio ao metabolismo', 'Fórmula sem estimulante forte, sem taquicardia', 'Mais de 5000 pessoas já usam Thermora', 'Só 2 cápsulas por dia, fácil de levar na bolsa']);
    expect(g.linhas[0].confirmado).toMatchObject({ por: 'gestor@x' });
    expect(g.linhas[3].fonte).toEqual({ tipo: 'vendas_cliente', outro: '' });
  });

  it('c) "Versão melhorada" num e "Versão segura" noutro: só as escolhidas entram', () => {
    let it5 = itemTexto(planoDe(MAO));
    const [p1, p2] = it5.partes;
    it5 = escolherVersao(it5, p1.id, 'melhorada', SAUDE);
    it5 = escolherVersao(it5, p2.id, 'segura', SAUDE);
    it5 = resolver(it5);
    const linhas = textosParaAplicar([it5], SAUDE)[0].linhas;
    expect(linhas[0]).toMatchObject({ texto: 'Mais energia e disposição do café da manhã ao fim do dia', versao: 'melhorada' });
    expect(linhas[1]).toMatchObject({ texto: 'Com extrato de chá verde, gengibre e pimenta', versao: 'segura', alegacao: [] });
    expect(linhas.map((l) => l.texto)).not.toContain('Auxílio ao metabolismo');
    // A melhorada mantém a alegação do original: o aviso continua valendo (e o "Entendi" é dela).
    expect(linhas[0].alegacao.length).toBeGreaterThan(0);
    expect(linhas[0].confirmado.texto).toBe(linhas[0].texto);
  });

  it('trocar de versão depois do "Entendi" pede a confirmação de novo', () => {
    let it5 = resolver(itemTexto(planoDe(MAO)));
    const p = it5.partes[0];
    it5 = escolherVersao(it5, p.id, 'melhorada', SAUDE);
    expect(pendenciasParte(it5.partes[0], SAUDE)).toEqual(['confirmar']);
    expect(it5.status).toBe('pergunta');
  });

  it('"Editar à mão" guarda o texto do operador', () => {
    let it5 = itemTexto(planoDe(MAO));
    it5 = escolherVersao(it5, it5.partes[4].id, 'manual', { ...SAUDE, manual: '  Duas cápsulas e pronto  ' });
    expect(it5.partes[4]).toMatchObject({ escolha: 'manual', manual: 'Duas cápsulas e pronto' });
  });

  it('a IA nunca acrescenta alegação nem número: versão que traz algo novo é descartada', () => {
    const p = normalizarParte({ original: 'Só 2 cápsulas por dia', melhorada: 'Só 2 cápsulas por dia e mais energia', segura: 'Mais de 3000 clientes' }, 'x1');
    expect(p.melhorada).toBe('');
    expect(p.segura).toBe('');
    expect(p.descartes).toHaveLength(2);
    expect(normalizarParte({ original: 'Rotina simples', melhorada: 'Já são 9000 clientes' }, 'x2').melhorada).toBe('');
  });

  it('cliente que não é de saúde: alegação não pede confirmação; número continua pedindo fonte', () => {
    const it5 = itemTexto(planoDe(MAO, { ...CTX, saude: false }));
    expect(pendenciasParte(it5.partes[0], { saude: false })).toEqual([]);
    expect(pendenciasParte(it5.partes[3], { saude: false })).toEqual(['fonte']);
  });
});

describe('d) número do operador pede a fonte', () => {
  it('"mais de 5000 pessoas": sem fonte fica pendente; com fonte fica pronto e a fonte vai junto', () => {
    expect(numerosDe('Mais de 5000 pessoas já usam Thermora')).toEqual(['mais de 5000 pessoas']);
    expect(numerosDe('5 motivos e 60 cápsulas por R$ 189')).toEqual([]);
    let it5 = itemTexto(planoDe(MAO));
    const n = it5.partes[3];
    // Só a fonte "outro" sem dizer qual não resolve.
    it5 = definirFonte(it5, n.id, { tipo: 'outro', outro: '' }, SAUDE);
    expect(pendenciasParte(it5.partes[3], SAUDE)).toEqual(['fonte']);
    it5 = definirFonte(it5, n.id, { tipo: 'relatorio' }, SAUDE);
    expect(pendenciasParte(it5.partes[3], SAUDE)).toEqual([]);
    // Escolher a versão segura (sem número) também resolve, sem fonte.
    let outro = itemTexto(planoDe(MAO));
    outro = escolherVersao(outro, outro.partes[3].id, 'segura', SAUDE);
    expect(pendenciasParte(outro.partes[3], SAUDE)).toEqual([]);
  });
});

describe('texto completo e "Sugerir de novo"', () => {
  it('pergunta "Você me manda o texto completo?" vira campo próprio; o texto colado vira as partes', () => {
    const plano = normalizarPlano({ itens: [{ pedido: '5 motivos (texto cortado)', tipo: 'texto', params: { destino: 'secao', titulo: '5 motivos' }, status: 'pergunta', pergunta: { texto: 'Você me manda o texto completo?', opcoes: [{ texto: 'Mando o texto completo' }] } }] }, CTX);
    let x = plano.itens[0];
    expect(x).toMatchObject({ pedeTexto: true, status: 'pergunta', partes: [] });
    x = receberTextoCompleto(x, '1. Energia e disposição\n2) Fórmula sem estimulante forte\n\n- Só 2 cápsulas por dia', SAUDE);
    expect(x.partes.map((p) => p.original)).toEqual(['Energia e disposição', 'Fórmula sem estimulante forte', 'Só 2 cápsulas por dia']);
    expect(x.status).toBe('pergunta'); // "Energia e disposição" pede o "Entendi"
  });

  it('"Sugerir de novo" troca só a melhorada e a segura; a escolha, a fonte e o original ficam', () => {
    let it5 = resolver(itemTexto(planoDe(MAO)));
    const antes = it5.partes.map((p) => [p.original, p.escolha, p.fonte]);
    it5 = mesclarSugestoes(it5, JSON.parse(SUGERIR.texto).textos, SAUDE);
    expect(it5.partes.map((p) => [p.original, p.escolha, p.fonte])).toEqual(antes);
    expect(it5.partes[0].melhorada).toBe('Energia e disposição que acompanham o seu dia');
    expect(it5.partes[3].melhorada).toBe(''); // igual ao original
    expect(it5.status).toBe('pronto');
  });
});

describe('aplicar no site e conferir', () => {
  const pronto = () => { let x = itemTexto(planoDe(MAO)); x = escolherVersao(x, x.partes[1].id, 'segura', SAUDE); return resolver(x); };

  it('pacote e site personalizado ganham a seção de destaques; a conferência compara com a versão escolhida', () => {
    const x = pronto();
    const pac = aplicarTextosNoEstado({ pacote: { banners: [{ titulo: 'Da IA' }] } }, [x], 'pacote', SAUDE);
    expect(pac.pacote.destaques[0].titulo).toBe('5 motivos para escolher Thermora');
    expect(pac.pacote.banners[0].titulo).toBe('Da IA');
    expect(conferirTextoItem(x, pac, 'pacote').status).toBe('atendido');
    const cus = aplicarTextosNoEstado({ conteudo: { heroTitulo: 'Oi' } }, [x], 'custom', SAUDE);
    expect(conferirPorCodigo([x], { modo: 'custom', site: cus }).resultados[x.id].status).toBe('atendido');
    // Alguém mudou um texto no site: a conferência aponta a diferença.
    const mexido = JSON.parse(JSON.stringify(pac)); mexido.pacote.destaques[0].linhas[1].texto = 'Acelera o metabolismo';
    const r = conferirTextoItem(x, mexido, 'pacote');
    expect(r.status).toBe('parcial');
    expect(r.motivo).toContain('Com extrato de chá verde');
  });

  it('título do banner escolhido no plano vai para o banner', () => {
    const x = resolver({ ...normalizarPlano({ itens: [{ pedido: 'título do banner', tipo: 'texto', params: { destino: 'banner_titulo' }, status: 'pronto', textos: [{ original: 'Sua rotina com Thermora', melhorada: 'Thermora na sua rotina' }] }] }, CTX).itens[0] });
    const e = aplicarTextosNoEstado({ pacote: {} }, [x], 'pacote', SAUDE);
    expect(e.pacote.banners[0].titulo).toBe('Sua rotina com Thermora');
    expect(conferirTextoItem(x, e, 'pacote').status).toBe('atendido');
  });

  it('a geração recebe os textos escolhidos como fixos (não reescreve)', () => {
    const lista = checklistObrigatorio(itensAceitos({ itens: [pronto()], sugestoes: [] }));
    expect(lista).toContain('TEXTOS JÁ ESCOLHIDOS PELO OPERADOR');
    expect(lista).toContain('"Com extrato de chá verde, gengibre e pimenta"');
    expect(lista).not.toContain('"Auxílio ao metabolismo"');
  });

  it('a prévia da loja e o site mostram os destaques logo depois do banner; o passo 6 tem o texto para copiar', () => {
    const x = pronto();
    const site = { modo: 'pacote', plataforma: 'nuvemshop', plataformaConfirmada: true, pacote: aplicarTextosNoEstado({ pacote: { banners: [{ titulo: 'Thermora' }] } }, [x], 'pacote', SAUDE).pacote };
    const d = dadosDoPacote({ cliente: { nome: 'Thermora' }, site, produtos: CTX.produtos });
    const html = gerarPreviaLojaHTML(d);
    expect(html).toContain('data-destaques');
    expect(html.indexOf('data-destaques')).toBeLessThan(html.indexOf('id="produtos"'));
    expect(gruposPlataforma(d).find((g) => g.id === 'destaques').itens[1].valor).toContain('Com extrato de chá verde');
    const custom = gerarSiteHTML({ cliente: { id: 'c', nome: 'Thermora' }, produtos: CTX.produtos, conteudo: aplicarTextosNoEstado({ conteudo: { heroTitulo: 'Oi' } }, [x], 'custom', SAUDE).conteudo });
    expect(custom.indexOf('id="topo"')).toBeLessThan(custom.indexOf('id="destaques"'));
    expect(custom).toContain('<li>Energia e disposição para o dia todo</li>');
    expect(comDestaques(['provas', 'faq'], 'hero')).toEqual(['destaques', 'provas', 'faq']);
  });

  it('passo 6 e criativos: lista o que o operador manteve (alegação e número com fonte)', () => {
    const site = { pacote: aplicarTextosNoEstado({ pacote: {} }, [pronto()], 'pacote', SAUDE).pacote };
    const lista = alegacoesMantidas(site, 'pacote');
    expect(lista.map((l) => l.texto)).toEqual(['Energia e disposição para o dia todo', 'Mais de 5000 pessoas já usam Thermora']);
    expect(lista[1].fonte.tipo).toBe('vendas_cliente');
    expect(AVISO_SITE_SAUDE).toMatch(/^No site é permitido, mas atenção: a Anvisa/);
  });
});

describe('e) texto do site reaproveitado em criativo', () => {
  const site = { pacote: aplicarTextosNoEstado({ pacote: {} }, [resolver(itemTexto(planoDe(MAO)))], 'pacote', SAUDE).pacote };
  const cliente = { ...THERMORA, alegacoesSite: alegacoesParaCliente(alegacoesMantidas(site, 'pacote')) };

  it('o bloqueio de sempre vale, com o motivo do site e a versão segura oferecida', () => {
    const texto = 'Thermora: energia e disposição para o dia todo. Peça já.';
    const m = motivoSaude(texto, cliente);
    expect(m.startsWith(MOTIVO_ANUNCIO_SITE)).toBe(true);
    expect(m).toContain('o Meta proíbe');
    expect(m).toContain('"Cafeína anidra 150 mg e chá verde em cada dose"');
    expect(trocarPelaSegura(texto, cliente)).toBe('Thermora: Cafeína anidra 150 mg e chá verde em cada dose. Peça já.');
    expect(motivoSaude(trocarPelaSegura(texto, cliente), cliente)).toBe('');
  });

  it('criativo que não usa texto do site continua com o motivo de antes', () => {
    const m = motivoSaude('Acelera o metabolismo', cliente);
    expect(m.startsWith('produto de saúde: o Meta proíbe')).toBe(true);
  });
});

describe('prompts do site', async () => {
  const { contextoPreferencias, regraSite } = await import('../core/ia.js');
  it('o texto inteiro vai para a IA (8.000 caracteres, sem corte); acima do limite pede para encurtar', () => {
    const texto = `${'a'.repeat(7987)} FIM-DO-TEXTO`; // 8.000 exatos
    expect(contextoPreferencias({ preferenciasSite: { texto } })).toContain('FIM-DO-TEXTO');
    expect(() => contextoPreferencias({ preferenciasSite: { texto: 'b'.repeat(8001) } })).toThrow(/Encurte/);
  });
  it('site não é anúncio: no cliente de saúde a IA não recusa alegação do operador e nunca acrescenta', () => {
    expect(regraSite(THERMORA)).toMatch(/SITE NÃO É ANÚNCIO/);
    expect(regraSite(THERMORA)).toMatch(/NUNCA acrescenta alegação de efeito nem número/);
    expect(regraSite({ nome: 'Loja de roupa', nicho: 'moda' })).not.toMatch(/alegação/);
  });
});
