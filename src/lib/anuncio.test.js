// "Sobre como esse cliente anuncia": campos estruturados (só preenche o vazio), tabela do Meta, CTA, avisos e a
// Biblioteca de Anúncios do nicho.
import { describe, it, expect } from 'vitest';
import {
  numeroBR, normalizarCamposAnuncio, preencherVazios, textoComoAnuncia, limitesDoCliente, validarObjetivo, ctaParaDestino, avisosDestino,
  urlBibliotecaAnuncios, palavrasPadrao, limparPalavras, sugerirNicho, CONFIRA, isoDoCliente,
} from './anuncio.js';

describe('numeroBR', () => {
  it('lê valores em reais e porcentagem no formato brasileiro', () => {
    expect(numeroBR('R$ 1.234,56')).toBe(1234.56);
    expect(numeroBR('1.500')).toBe(1500);
    expect(numeroBR('40%')).toBe(40);
    expect(numeroBR(12.5)).toBe(12.5);
    expect(numeroBR('')).toBeNull();
    expect(numeroBR('abc')).toBeNull();
  });
});

describe('extração dos campos estruturados', () => {
  it('normaliza o que a IA devolve (destino, números, atendimento)', () => {
    const c = normalizarCamposAnuncio({ destino: 'pelos dois, whatsapp e site', ticketMedio: 'R$ 189,90', margem: '35%', verbaMensal: '3.000', atendimento: 'a Ana responde em até 10 minutos', quemAtende: 'Ana' });
    expect(c).toEqual({ destino: 'ambos', ticketMedio: 189.9, margem: 35, verbaMensal: 3000, atendimento: 'rapido', quemAtende: 'Ana' });
    expect(normalizarCamposAnuncio({ destino: 'só no zap' }).destino).toBe('whatsapp');
    expect(normalizarCamposAnuncio({ destino: 'loja online' }).destino).toBe('site');
    expect(normalizarCamposAnuncio({ margem: 140 }).margem).toBeNull(); // margem fora de 0-100 não vale
    expect(normalizarCamposAnuncio({ atendimento: 'ninguém atende direito' }).atendimento).toBe('ninguem');
  });

  it('só preenche campo vazio e marca o que foi preenchido para confirmar', () => {
    const atual = { texto: 'vendo no whats', destino: 'whatsapp', ticketMedio: 150 };
    const { patch, preenchidos } = preencherVazios(atual, { destino: 'site', ticketMedio: 999, verbaMensal: 2000, margem: 30 });
    expect(preenchidos.sort()).toEqual(['margem', 'verbaMensal']);
    expect(patch.destino).toBeUndefined(); // o operador já tinha escolhido: nunca muda
    expect(patch.ticketMedio).toBeUndefined();
    expect(patch).toMatchObject({ verbaMensal: 2000, margem: 30, auto: { verbaMensal: true, margem: true } });
  });

  it('nada para preencher = patch vazio', () => {
    expect(preencherVazios({ destino: 'site' }, {}).preenchidos).toEqual([]);
  });

  it('o texto do cliente vai para a IA com os campos e a marca de "não confirmado"', () => {
    const t = textoComoAnuncia({ subnicho: 'plus size', comoAnuncia: { texto: 'Vende no WhatsApp', destino: 'whatsapp', ticketMedio: 120, auto: { ticketMedio: true } } });
    expect(t).toContain('Vende no WhatsApp');
    expect(t).toContain('Destino de venda: WhatsApp');
    expect(t).toMatch(/Ticket médio \(sugerido pela IA.*R\$ 120/);
    expect(t).toContain('Subnicho: plus size');
  });
});

describe('limitesDoCliente (conta com ticket e margem, sem benchmark)', () => {
  it('calcula empate e ponto de escalar', () => {
    expect(limitesDoCliente({ ticketMedio: 200, margem: 40 })).toEqual({ ok: true, custoVendaEmpate: 80, custoVendaEscalar: 56, roasEmpate: 2.5, roasEscalar: 3.57 });
  });
  it('sem margem diz o que falta', () => {
    expect(limitesDoCliente({ ticketMedio: 200 })).toEqual({ ok: false, falta: ['margem'] });
  });
});

describe('tabela do Meta (nomes nunca inventados)', () => {
  it('aceita chave ou nome da tabela', () => {
    const v = validarObjetivo('vendas', 'Apps de mensagem (WhatsApp)');
    expect(v.objetivo.nome).toBe('Vendas');
    expect(v.local.chave).toBe('apps_mensagem');
    expect(v.avisos).toEqual([]);
  });
  it('fora da tabela vira "confira no Gerenciador de Anúncios"', () => {
    const v = validarObjetivo('Conversões avançadas', 'Loja do Instagram');
    expect(v.objetivo.nome).toBe(CONFIRA);
    expect(v.local.nome).toBe(CONFIRA);
    expect(v.avisos.length).toBe(2);
  });
  it('combinação que não existe ganha aviso', () => {
    expect(validarObjetivo('reconhecimento', 'site').avisos[0]).toContain(CONFIRA);
  });
});

describe('CTA por destino', () => {
  it('WhatsApp usa CTA de conversa; troca CTA de compra', () => {
    expect(ctaParaDestino('Enviar mensagem', 'whatsapp')).toEqual({ cta: 'Enviar mensagem', ajustado: false });
    const r = ctaParaDestino('Comprar agora', 'whatsapp');
    expect(r.cta).toBe('Enviar mensagem pelo WhatsApp');
    expect(r.ajustado).toBe(true);
    expect(r.aviso).toContain('compra no site');
  });
  it('site usa CTA de compra; troca CTA de conversa', () => {
    expect(ctaParaDestino('Chamar no WhatsApp', 'site').cta).toBe('Comprar agora');
    expect(ctaParaDestino('', 'site')).toMatchObject({ cta: 'Comprar agora', ajustado: false });
  });
});

describe('avisos do destino', () => {
  it('WhatsApp sem alguém para responder rápido', () => {
    expect(avisosDestino({ cliente: { comoAnuncia: { destino: 'whatsapp' } } }).map((a) => a.id)).toEqual(['whatsapp_atendimento']);
    expect(avisosDestino({ cliente: { comoAnuncia: { destino: 'whatsapp', atendimento: 'lento' } } })[0].texto).toContain('leva horas');
    expect(avisosDestino({ cliente: { comoAnuncia: { destino: 'whatsapp', atendimento: 'imediato' } } })).toEqual([]);
  });
  it('site sem Pixel e loja não publicada (mesmos avisos da montagem de campanha)', () => {
    const ids = avisosDestino({ cliente: { comoAnuncia: { destino: 'site' } }, site: null }).map((a) => a.id);
    expect(ids).toEqual(['pixel', 'loja']);
    const ok = avisosDestino({ cliente: { comoAnuncia: { destino: 'site' }, rastreamento: { metaPixelId: '123456789012345' } }, site: { linkPublicado: 'https://loja.com', modo: 'custom' }, etiquetaAprov: { tipo: 'aprovado', texto: 'Aprovado v1' } });
    expect(ok).toEqual([]);
  });
});

describe('Biblioteca de Anúncios do nicho', () => {
  it('monta o endereço com país BR, só ativos e as palavras do nicho', () => {
    const u = new URL(urlBibliotecaAnuncios({ palavras: ['moda plus size', 'vestido plus size'], pais: 'BR' }));
    expect(u.origin + u.pathname).toBe('https://www.facebook.com/ads/library/');
    expect(u.searchParams.get('country')).toBe('BR');
    expect(u.searchParams.get('active_status')).toBe('active');
    expect(u.searchParams.get('ad_type')).toBe('all');
    expect(u.searchParams.get('q')).toBe('moda plus size vestido plus size');
  });
  it('palavras padrão vêm do subnicho e do nicho; a lista é limpa', () => {
    expect(palavrasPadrao({ nicho: 'Moda feminina', subnicho: 'plus size' })).toEqual(['plus size', 'Moda feminina']);
    expect(limparPalavras('a, b, a, , c')).toEqual(['a', 'b', 'c']);
    expect(isoDoCliente({ pais: 'Portugal' })).toBe('PT');
    expect(isoDoCliente({})).toBe('BR');
  });
  it('sugere o nicho pela categoria mais comum dos produtos', () => {
    expect(sugerirNicho({}, [{ categoria: 'Moda feminina' }, { categoria: 'moda feminina' }, { categoria: 'Acessórios' }])).toBe('Moda feminina');
    expect(sugerirNicho({ marca: { negocio: 'Suplemento emagrecedor para mulheres' } }, [])).toBe('Suplemento emagrecedor');
  });
});
