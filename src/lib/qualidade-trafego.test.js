// Fase de qualidade, Frentes 2 e 3: "Parece anúncio?", avisos de política por nicho, regra de mínimo de dados
// ("Dados insuficientes para decidir") e o "Checklist para publicar". Tudo sem IA.
import { describe, it, expect } from 'vitest';
import { pareceAnuncio, instrucaoNatural, configNatural } from './parece-anuncio.js';
import { avisosPolitica } from './politicas-anuncio.js';
import { leituraDosDados, textoLeituraDados, alvoCustoVenda, TITULO_INSUFICIENTE } from './dados-minimos.js';
import { decisaoFinal } from './recomendacao.js';
import { checklistPublicar, nomeCampanha, nomeAnuncio, urlComUtms, UTM_DINAMICO, textoChecklistPublicar } from './checklist-publicar.js';

const cliente = { id: 'c1', nome: 'Thermora', nicho: 'suplemento', comoAnuncia: { destino: 'site', ticketMedio: '150', margem: '40' }, rastreamento: { metaPixelId: '123456789012345' } };

describe('"Parece anúncio?"', () => {
  it('anúncio de vitrine tira nota alta, com motivos e sugestões concretas', () => {
    const r = pareceAnuncio({ hook: 'THERMORA COM 30% DE DESCONTO SÓ HOJE NA PROMOÇÃO IMPERDÍVEL 🔥', copy: 'O melhor termogênico. Compre agora!!', cta: 'Garanta já', formato: 'video_curto' }, { cliente });
    expect(r.nota).toBeGreaterThanOrEqual(60);
    expect(r.faixa[1]).toBe('Parece anúncio');
    expect(r.motivos.map((m) => m.id)).toEqual(expect.arrayContaining(['venda', 'marca-cedo', 'terceira-pessoa', 'enfeite', 'caixa-alta']));
    expect(instrucaoNatural(r)).toMatch(/cara de post de pessoa real[\s\S]*não acrescente dado/);
  });
  it('post de pessoa real tira nota baixa', () => {
    const r = pareceAnuncio({ hook: 'Minha manhã antes do trabalho', copy: 'Eu tomo uma cápsula com o café e saio. Cabe na bolsa.', cta: 'me chama no WhatsApp', formato: 'video_curto' }, { cliente });
    expect(r.nota).toBeLessThan(30);
    expect(r.motivos).toEqual([]);
  });
  it('peça: painel de cor e logo desde o início contam; a versão natural troca o template e põe o logo no fim', () => {
    const peca = { tipo: 'video', config: { template: 'cartao', temLogo: true, logoNoFim: false, hook: 'Minha manhã' } };
    const r = pareceAnuncio({ copy: 'Eu uso todo dia.' }, { cliente, peca });
    expect(r.motivos.filter((m) => m.onde === 'peca').map((m) => m.id)).toEqual(['moldura', 'logo-cedo']);
    expect(configNatural(peca.config)).toMatchObject({ template: 'destaque', logoNoFim: true });
  });
});

describe('políticas por nicho (só aviso)', () => {
  it('atributo pessoal, preço riscado, sorteio e pedido à criança', () => {
    expect(avisosPolitica('Você está acima do peso?').map((a) => a.id)).toEqual(['atributo']);
    expect(avisosPolitica('De R$ 199 por R$ 99').map((a) => a.id)).toEqual(['preco-riscado']);
    expect(avisosPolitica('Sorteio: marque 3 amigos').map((a) => a.id)).toEqual(['sorteio']);
    expect(avisosPolitica('Pede pra sua mãe comprar').map((a) => a.id)).toEqual(['infantil']);
    expect(avisosPolitica('Eu uso de manhã com café')).toEqual([]);
  });
});

describe('mínimo de dados antes de decidir', () => {
  const r = (dia, extra) => ({ destino: 'site', periodoInicio: dia, periodoFim: dia, gasto: 50, ...extra });
  it('alvo = empate pelo ticket e margem', () => { expect(alvoCustoVenda(cliente)).toEqual({ valor: 60, fonte: 'ticket × margem (empate)' }); });
  it('sem resultados: insuficiente, com o que esperar', () => {
    const l = leituraDosDados({ resultados: [], cliente });
    expect(l).toMatchObject({ nivel: 'sem_dados', suficiente: false });
    expect(textoLeituraDados(l)).toContain(TITULO_INSUFICIENTE);
  });
  it('3 dias e 2 vendas: "Dados insuficientes para decidir", diz quantos dias e vendas faltam', () => {
    const l = leituraDosDados({ resultados: [r('2026-10-01', { compras: 1 }), r('2026-10-03', { compras: 1 })], cliente });
    expect(l.nivel).toBe('insuficiente');
    expect(l.faltam).toEqual(['4 dia(s) a mais (tem 3 de 7)', '8 venda(s) a mais (tem 2 de 10)']);
    const d = decisaoFinal(l, { suficiente: true, aguardar: '' });
    expect(d).toMatchObject({ suficiente: false, titulo: TITULO_INSUFICIENTE, iaDiscordou: true });
    expect(d.aguardar).toMatch(/Espere 4 dia/);
  });
  it('gastou 2x o alvo sem vender: já dá para tratar como perdedor', () => {
    const l = leituraDosDados({ resultados: [r('2026-10-01', { gasto: 130, compras: 0 })], cliente });
    expect(l.nivel).toBe('perdedor');
    expect(decisaoFinal(l).suficiente).toBe(true);
  });
  it('semana inteira e 10+ vendas: suficiente', () => {
    const rs = Array.from({ length: 7 }, (_, i) => r(`2026-10-0${i + 1}`, { compras: 2 }));
    const l = leituraDosDados({ resultados: rs, cliente });
    expect(l).toMatchObject({ nivel: 'suficiente', dias: 7, vendas: 14 });
    expect(textoLeituraDados(l)).toMatch(/Suficiente para decidir/);
  });
  it('WhatsApp sem venda registrada: insuficiente e pede o registro', () => {
    const l = leituraDosDados({ resultados: [{ destino: 'whatsapp', periodoInicio: '2026-10-01', periodoFim: '2026-10-08', gasto: 400, conversas: 40 }], cliente });
    expect(l.nivel).toBe('insuficiente');
    expect(l.aguardar).toMatch(/registre as vendas/);
  });
});

describe('"Checklist para publicar"', () => {
  const criativos = [{ id: 'k1', nome: 'Rotina da manhã', formato: 'video_curto', modeloGancho: 19, versoes: [{}, {}] }];
  const campanha = { nome: 'Teste outubro', objetivo: 'Vendas', orcamentoDiario: 100, urlDestino: 'https://thermora.com.br/produto', conjuntos: [{ nome: 'C1', publico: { nome: 'Mulheres 30-45 interesse fitness' }, orcamentoDiario: 60, criativos: [{ criativoId: 'k1' }] }, { nome: 'C2', publico: { nome: 'Amplo' }, orcamentoDiario: 50, criativos: [] }] };
  const s = checklistPublicar({ campanha, cliente, criativos, hoje: new Date('2026-10-14T12:00:00') });
  const sec = (id) => s.find((x) => x.id === id);
  it('nomes no padrão, com botão de copiar', () => {
    expect(nomeCampanha({ cliente, campanha, data: '2026-10-14' })).toBe('Thermora | Vendas | Site | Teste | 2026-10');
    expect(nomeAnuncio(criativos[0])).toBe('Rotina-da-manha | video-9x16 | G19 | v2');
    expect(sec('nomes').itens.filter((i) => i.copiar).length).toBe(4);
  });
  it('UTM por anúncio e o modelo dinâmico do Meta', () => {
    const u = sec('utm').itens[0].valor;
    expect(u).toMatch(/^https:\/\/thermora\.com\.br\/produto\?utm_source=facebook&utm_medium=paid_social&utm_campaign=thermora-vendas-site-teste-2026-10&utm_term=.+&utm_content=rotina-da-manha-video-9x16-g19-v2$/);
    expect(sec('utm').itens.at(-1).valor).toBe(UTM_DINAMICO);
    expect(urlComUtms('sem url', { campanha: 'a', conjunto: 'b', anuncio: 'c' })).toBeNull();
  });
  it('Pixel, exclusão de compradores, soma do orçamento, programação e o que não mexer', () => {
    expect(sec('pixel').itens[0].valor).toMatch(/Pixel 123456789012345/);
    expect(sec('exclusoes').itens[0].valor).toMatch(/Compradores dos últimos 180 dias/);
    expect(sec('orcamento').itens.at(-1).valor).toMatch(/somam R\$ 110,00\/dia/);
    expect(sec('programacao').itens[0].valor).toBe('15/10/2026 às 00:00');
    expect(sec('nao-mexer').itens.map((i) => i.valor).join(' ')).toMatch(/R\$ 120,00/);
    expect(textoChecklistPublicar(s, 'Teste outubro')).toMatch(/^CHECKLIST PARA PUBLICAR — Teste outubro/);
  });
  it('WhatsApp: sem UTM, com mensagem pré-preenchida por anúncio', () => {
    const w = checklistPublicar({ campanha, cliente: { ...cliente, comoAnuncia: { destino: 'whatsapp' } }, criativos });
    expect(w.find((x) => x.id === 'utm').itens[0].valor).toMatch(/mensagem pré-preenchida/);
  });
});
