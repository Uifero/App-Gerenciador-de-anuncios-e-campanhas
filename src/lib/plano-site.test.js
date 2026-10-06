import { describe, it, expect } from 'vitest';
import {
  normalizarPlano, responderPergunta, diferencaPlanos, itensAceitos, aplicacaoDoPlano, checklistObrigatorio, tarefasDaLoja,
  conferirPorCodigo, ondeFunciona, itensFaltando, contagemConferencia, secaoDoModo,
} from './plano-site.js';
import { normalizarRecursos, sugeridoPara } from './recursos-loja.js';
import { aplicarReferencias, comUsos } from './fotos-site.js';
import PLANO_THERMORA from '../../tests/fixtures/ia/plano-thermora.json';

const foto = (n, extra = {}) => ({ id: `m${n}`, codigo: `F${n}`, url: `https://x/f${n}.jpg`, origem: 'foto', nomeOriginal: `f${n}.jpg`, ...extra });
const MATERIAIS = [15, 23, 25, 26, 29, 36, 40, 1, 2, 3].map((n) => foto(n));
const PRODUTOS = [{ id: 'p1', nome: 'Thermora Caps', preco: 189.9, descricao: 'x'.repeat(200), formula: 'Cafeína, chá verde', beneficios: 'Energia' }, { id: 'p2', nome: 'Thermora Gel', preco: 99, descricao: 'curta' }];
const ctxShopify = (tema = 'dawn') => ({ materiais: MATERIAIS, produtos: PRODUTOS, modo: 'pacote', plataforma: 'shopify', tema });

describe('normalizarPlano (texto real do operador, resposta gravada da IA)', () => {
  const plano = normalizarPlano(PLANO_THERMORA, ctxShopify());
  const porTipo = (t) => plano.itens.find((x) => x.tipo === t);

  it('lista cada pedido do texto com status e onde funciona', () => {
    for (const t of ['banner_fotos', 'frete_gratis', 'pagamentos', 'colunas_produtos', 'botao_grande', 'clientes_fotos', 'pagina_produto', 'secoes_produto', 'compre_junto']) expect(porTipo(t), t).toBeTruthy();
    expect(porTipo('banner_fotos').params.codigos).toEqual(['F36', 'F40', 'F15']);
    expect(porTipo('frete_gratis').params.valor).toBe(199);
    expect(porTipo('clientes_fotos').params.codigos).toEqual(['F23', 'F26', 'F25', 'F29']);
    expect(porTipo('compre_junto').params.onde).toBe('carrinho');
    expect(plano.itens.every((x) => ['pronto', 'pergunta', 'impossivel'].includes(x.status))).toBe(true);
  });

  it('"onde funciona" vem da tabela do app (Shopify Dawn), nunca da IA', () => {
    expect(porTipo('frete_gratis').onde.tipo).toBe('loja');
    expect(porTipo('frete_gratis').onde.caminho).toMatch(/Frete e entrega/);
    expect(porTipo('frete_gratis').onde.caminho).toMatch(/Barra de anúncios/);
    expect(porTipo('pagamentos').onde.caminho).toMatch(/Mostrar ícones de pagamento/);
    expect(porTipo('compre_junto').onde.caminho).toMatch(/confira no editor/);
    expect(porTipo('colunas_produtos').onde.caminho).toMatch(/Coleção em destaque/);
  });

  it('sugestões vêm desmarcadas e no máximo 5', () => {
    expect(plano.sugestoes.length).toBeLessThanOrEqual(5);
    expect(plano.sugestoes.every((x) => x.aceito === false && x.motivo)).toBe(true);
  });

  it('código de foto que não existe sai com aviso; se nenhum existe, "Não dá para fazer"', () => {
    const p = normalizarPlano({ itens: [
      { pedido: 'banner com F36 e F99', tipo: 'banner_fotos', params: { codigos: ['F36', 'F99'] }, status: 'pronto' },
      { pedido: 'galeria F98', tipo: 'clientes_fotos', params: { codigos: ['F98'] }, status: 'pronto' },
    ] }, ctxShopify());
    expect(p.itens[0].status).toBe('pronto');
    expect(p.itens[0].params.codigos).toEqual(['F36']);
    expect(p.itens[0].aviso).toMatch(/F99 não existe/);
    expect(p.itens[1].status).toBe('impossivel');
    expect(p.itens[1].aceito).toBe(false);
  });

  it('produto que não existe vira "Não dá para fazer" com motivo', () => {
    const p = normalizarPlano({ itens: [{ pedido: 'fotos do Thermora Max', tipo: 'produto_fotos', params: { produto: 'Thermora Max Ultra', codigos: ['F1'] } }] }, { ...ctxShopify(), produtos: [{ id: 'a', nome: 'Caps' }] });
    expect(p.itens[0].status).toBe('impossivel');
    expect(p.itens[0].motivo).toMatch(/não está cadastrado/);
  });

  it('pedido impossível guarda motivo e alternativa', () => {
    const p = normalizarPlano({ itens: [{ pedido: 'vídeo 3D girando no banner', tipo: 'outro', status: 'impossivel', motivo: 'O modelo não tem vídeo 3D.', alternativa: 'Carrossel com as fotos F36 e F40.' }] }, ctxShopify());
    expect(p.itens[0]).toMatchObject({ status: 'impossivel', motivo: 'O modelo não tem vídeo 3D.', alternativa: 'Carrossel com as fotos F36 e F40.', aceito: false });
    expect(p.itens[0].onde.caminho).toMatch(/confira no editor/); // tipo "outro" nunca leva caminho inventado
  });
});

describe('resposta REAL gravada da IA (plano_site, 06/10/2026, texto do operador)', () => {
  it('lista os 8 pedidos do texto, perguntas com opções e sugestões desmarcadas', async () => {
    const { extrairJSON } = await import('../core/ia.js');
    const gravado = (await import('../../tests/fixtures/ia/plano-thermora-real.json')).default;
    const p = normalizarPlano(extrairJSON(gravado.texto), ctxShopify());
    const tipos = p.itens.map((x) => x.tipo);
    for (const t of ['banner_fotos', 'frete_gratis', 'pagamentos', 'colunas_produtos', 'botao_grande', 'clientes_fotos', 'pagina_produto', 'compre_junto']) expect(tipos, t).toContain(t);
    expect(p.itens.find((x) => x.tipo === 'banner_fotos').params.codigos).toEqual(['F36', 'F40', 'F15']);
    expect(p.itens.find((x) => x.tipo === 'frete_gratis').params.valor).toBe(199);
    const perguntas = p.itens.filter((x) => x.status === 'pergunta');
    expect(perguntas.length).toBeGreaterThan(0);
    expect(perguntas.every((x) => x.pergunta.opcoes.length >= 2 && !x.aceito)).toBe(true);
    expect(p.sugestoes.length).toBeLessThanOrEqual(5);
    expect(p.sugestoes.every((x) => !x.aceito)).toBe(true);
  });
  it('conferência real (Haiku) no formato esperado', async () => {
    const { extrairJSON } = await import('../core/ia.js');
    const gravado = (await import('../../tests/fixtures/ia/conferencia-thermora-real.json')).default;
    const r = extrairJSON(gravado.texto).resultados;
    expect(r[0]).toMatchObject({ status: 'atendido' });
    expect(r[0].motivo.length).toBeGreaterThan(10);
  });
});

describe('pergunta com opções', () => {
  const base = normalizarPlano({ itens: [{ pedido: 'produtos grandes', tipo: 'colunas_produtos', params: { colunas: 3 }, status: 'pergunta', pergunta: { texto: 'Quantos por linha?', opcoes: [{ texto: '2 por linha', params: { colunas: 2 } }, { texto: '3 por linha', params: { colunas: 3 } }] } }] }, ctxShopify());
  it('fica desmarcado até responder; responder muda o item', () => {
    expect(base.itens[0].status).toBe('pergunta');
    expect(base.itens[0].aceito).toBe(false);
    const r = responderPergunta(base.itens[0], 0, ctxShopify());
    expect(r).toMatchObject({ status: 'pronto', aceito: true, resposta: '2 por linha' });
    expect(r.params.colunas).toBe(2);
    expect(r.onde.oque).toMatch(/2 produtos por linha/);
  });
  it('pergunta sem opções suficientes vira item pronto', () => {
    const p = normalizarPlano({ itens: [{ pedido: 'x', tipo: 'faq', status: 'pergunta', pergunta: { texto: '?', opcoes: ['só uma'] } }] }, ctxShopify());
    expect(p.itens[0].status).toBe('pronto');
  });
});

describe('diferença entre planos', () => {
  it('mostra novos, removidos e mudados', () => {
    const a = normalizarPlano({ itens: [{ pedido: 'frete grátis acima de 199', tipo: 'frete_gratis', params: { valor: 199 } }, { pedido: 'botão grande', tipo: 'botao_grande' }] }, ctxShopify());
    const b = normalizarPlano({ itens: [{ pedido: 'frete grátis acima de 249', tipo: 'frete_gratis', params: { valor: 249 } }, { pedido: 'faq', tipo: 'faq' }] }, ctxShopify());
    const d = diferencaPlanos(a, b);
    expect(d.novos.map((x) => x.tipo)).toEqual(['faq']);
    expect(d.removidos.map((x) => x.tipo)).toEqual(['botao_grande']);
    expect(d.mudados[0].item.tipo).toBe('frete_gratis');
    expect(diferencaPlanos(a, a).igual).toBe(true);
  });
});

describe('aplicar o plano: só o que foi aceito', () => {
  const plano = normalizarPlano(PLANO_THERMORA, ctxShopify());
  it('itens desmarcados não entram', () => {
    const itens = plano.itens.map((x) => ({ ...x, aceito: x.tipo !== 'frete_gratis' && x.aceito }));
    const a = aplicacaoDoPlano(itensAceitos({ ...plano, itens }), { modo: 'pacote', materiais: MATERIAIS, produtos: PRODUTOS });
    expect(a.recursos.freteGratis).toBeNull();
    expect(a.recursos.botaoGrande).toBe(true);
    expect(a.recursos.colunasProdutos).toBe(2);
  });
  it('sugestão só entra marcada', () => {
    const sem = aplicacaoDoPlano(itensAceitos(plano), { modo: 'pacote', materiais: MATERIAIS, produtos: PRODUTOS });
    const comSug = aplicacaoDoPlano(itensAceitos({ ...plano, sugestoes: plano.sugestoes.map((x) => ({ ...x, aceito: true })) }), { modo: 'pacote', materiais: MATERIAIS, produtos: PRODUTOS });
    expect(JSON.stringify(sem)).not.toBe(JSON.stringify(comSug));
  });
  it('fotos do banner e dos depoimentos na ordem do plano; escolha manual em "Usar em" vence', () => {
    const a = aplicacaoDoPlano(itensAceitos(plano), { modo: 'pacote', materiais: MATERIAIS, produtos: PRODUTOS });
    expect(a.refs.filter((r) => r.uso === 'banner').map((r) => r.codigo)).toEqual(['F36', 'F40', 'F15']);
    expect(a.refs.filter((r) => r.uso === 'clientes').map((r) => r.codigo)).toEqual(['F23', 'F26', 'F25', 'F29']);
    const mats = MATERIAIS.map((m) => (m.codigo === 'F1' ? { ...m, usos: { banner: 'manual' } } : m)); // banner escolhido à mão
    const r = aplicarReferencias(mats, a.refs, { produtos: PRODUTOS });
    const depois = comUsos(mats, r.patches);
    expect(depois.find((m) => m.codigo === 'F1').usos.banner).toBe('manual');
    expect(depois.find((m) => m.codigo === 'F36').usos?.banner).toBeFalsy();
    expect(r.conflitos.join(' ')).toMatch(/vale o seletor/);
  });
  it('no site personalizado: colunas viram variação dos blocos e pagamentos vão para a config', () => {
    const p = normalizarPlano(PLANO_THERMORA, { ...ctxShopify(), modo: 'custom', plataforma: 'custom' });
    const a = aplicacaoDoPlano(itensAceitos(p), { modo: 'custom', materiais: MATERIAIS, produtos: PRODUTOS });
    expect(a.ops).toContainEqual({ op: 'variacao', bloco: 'vendidos', opcao: 'colunas', valor: 2 });
    expect(a.pagamentosConfig).toEqual(['cartao', 'pix', 'boleto']);
  });
  it('lista obrigatória numerada para a geração', () => {
    const t = checklistObrigatorio(itensAceitos(plano));
    expect(t).toMatch(/PEDIDOS OBRIGATÓRIOS/);
    expect(t).toMatch(/\n1\. /);
    expect(checklistObrigatorio([])).toBe('');
  });
});

describe('passo 6: tarefas da loja com o caminho do tema', () => {
  it('Dawn e Horizon têm caminhos diferentes; Horizon manda conferir no editor', () => {
    const dawn = tarefasDaLoja(normalizarPlano(PLANO_THERMORA, ctxShopify('dawn')));
    const horizon = tarefasDaLoja(normalizarPlano(PLANO_THERMORA, ctxShopify('horizon')));
    expect(dawn.length).toBeGreaterThan(3);
    const freteD = dawn.find((t) => t.tipo === 'frete_gratis'), freteH = horizon.find((t) => t.tipo === 'frete_gratis');
    expect(freteD.caminho).toMatch(/Barra de anúncios/);
    expect(freteH.caminho).toMatch(/confira no editor/);
    expect(dawn.find((t) => t.tipo === 'secoes_produto').caminho).toMatch(/Linha recolhível/);
  });
  it('site personalizado: só frete e pagamento pedem configuração (no checkout)', () => {
    expect(ondeFunciona('botao_grande', {}, 'custom').tipo).toBe('ambos');
    expect(ondeFunciona('frete_gratis', { valor: 199 }, 'custom').tipo).toBe('loja');
  });
  it('sem plataforma: não chuta caminho', () => {
    expect(ondeFunciona('faq', {}, null).caminho).toMatch(/passo 3/);
  });
});

describe('conferência por código', () => {
  const plano = normalizarPlano(PLANO_THERMORA, ctxShopify());
  const itens = itensAceitos(plano);
  const comUso = (cods, uso) => MATERIAIS.map((m) => { const i = cods.indexOf(m.codigo); return i >= 0 ? { ...m, usos: { [uso]: 'texto', ordem: { [uso]: i + 1 } } } : m; });

  it('nada aplicado: frete, colunas e botão "Não atendido"', () => {
    const { resultados } = conferirPorCodigo(itens, { modo: 'pacote', site: { pacote: {} }, materiais: MATERIAIS, produtos: PRODUTOS });
    const de = (t) => resultados[itens.find((x) => x.tipo === t).id];
    expect(de('frete_gratis').status).toBe('nao');
    expect(de('botao_grande').status).toBe('nao');
    expect(de('banner_fotos').status).toBe('nao');
  });
  it('tudo aplicado: banner na ordem, frete certo, seções com dados; falta de fórmula = Parcial', () => {
    const mats = comUso(['F36', 'F40', 'F15'], 'banner').map((m) => (['F23', 'F26', 'F25', 'F29'].includes(m.codigo) ? { ...m, usos: { clientes: 'texto', ordem: { clientes: ['F23', 'F26', 'F25', 'F29'].indexOf(m.codigo) + 1 } } } : m));
    const a = aplicacaoDoPlano(itens, { modo: 'pacote', materiais: mats, produtos: PRODUTOS });
    const site = { pacote: { recursos: a.recursos, descricoesProdutos: PRODUTOS.map((p) => ({ produtoId: p.id, nome: p.nome, descricao: 'y'.repeat(200) })) } };
    const { resultados, paraIa } = conferirPorCodigo(itens, { modo: 'pacote', site, materiais: mats, produtos: PRODUTOS });
    const de = (t) => resultados[itens.find((x) => x.tipo === t).id];
    expect(de('banner_fotos')).toMatchObject({ status: 'atendido' });
    expect(de('clientes_fotos').status).toBe('atendido');
    expect(de('frete_gratis')).toMatchObject({ status: 'atendido', por: 'codigo' });
    expect(de('pagamentos').status).toBe('atendido');
    expect(de('colunas_produtos').status).toBe('atendido');
    expect(de('compre_junto').status).toBe('atendido');
    expect(de('secoes_produto').status).toBe('parcial'); // Thermora Gel sem fórmula
    expect(de('secoes_produto').motivo).toMatch(/Thermora Gel/);
    expect(paraIa.every((id) => ['texto', 'outro'].includes(itens.find((x) => x.id === id).tipo))).toBe(true);
    expect(itensFaltando(itens, resultados).map((x) => x.tipo)).toContain('secoes_produto');
    expect(contagemConferencia(resultados).total).toBe(Object.keys(resultados).length);
  });
  it('banner com as fotos em outra ordem = Parcial', () => {
    const mats = comUso(['F40', 'F36', 'F15'], 'banner');
    const { resultados } = conferirPorCodigo(itens.filter((x) => x.tipo === 'banner_fotos'), { modo: 'pacote', site: { pacote: {} }, materiais: mats, produtos: PRODUTOS });
    expect(Object.values(resultados)[0]).toMatchObject({ status: 'parcial' });
    expect(Object.values(resultados)[0].motivo).toMatch(/ordem/);
  });
});

describe('recursos de loja', () => {
  it('normaliza valor em reais e ignora lixo', () => {
    expect(normalizarRecursos({ freteGratis: { valor: 'R$ 199,00' } }).freteGratis).toEqual({ valor: 199 });
    expect(normalizarRecursos({ freteGratis: { valor: 'abc' }, pagamentos: ['pix', 'cripto'] })).toMatchObject({ freteGratis: null, pagamentos: ['pix'] });
  });
  it('"Compre junto": par escolhido ou o próximo produto', () => {
    expect(sugeridoPara('p1', PRODUTOS, {}).id).toBe('p2');
    expect(sugeridoPara('p2', PRODUTOS, {}).id).toBe('p1');
    expect(sugeridoPara('p1', [PRODUTOS[0]], {})).toBeNull();
  });
  it('seção da home: sinônimos por modo', () => {
    expect(secaoDoModo('banner', 'custom')).toBe('hero');
    expect(secaoDoModo('hero', 'pacote')).toBe('banner');
    expect(secaoDoModo('inexistente', 'pacote')).toBeNull();
  });
});
