// Leitura do JSON devolvido pela IA. Motivo (visto em produção): a busca de mercado traz texto de anúncios reais,
// com aspas e quebras de linha, e a resposta falhava com "A resposta da IA veio incompleta".
import { describe, it, expect } from 'vitest';
import { extrairJSON, repararJSON } from './ia.js';

describe('extrairJSON', () => {
  it('JSON válido com cercas e texto em volta', () => {
    expect(extrairJSON('Aqui está:\n```json\n[{"a":1}]\n```\nEspero ter ajudado [1].')).toEqual([{ a: 1 }]);
  });
  it('texto depois do JSON com colchetes/chaves não atrapalha', () => {
    expect(extrairJSON('{"x":"ok"} Fonte: {site} [ref]')).toEqual({ x: 'ok' });
  });
  it('aspas soltas dentro do texto do anúncio', () => {
    const r = extrairJSON('[{"titulo":"Anúncio","texto":"Compre "agora" e ganhe frete","diasNoAr":null}]');
    expect(r[0].texto).toBe('Compre "agora" e ganhe frete');
    expect(r[0].diasNoAr).toBeNull();
  });
  it('quebra de linha crua dentro do texto e vírgula sobrando', () => {
    const r = extrairJSON('[{"texto":"linha 1\nlinha 2",},]');
    expect(r).toEqual([{ texto: 'linha 1\nlinha 2' }]);
  });
  it('sem nada estruturado: mensagem clara', () => {
    expect(() => extrairJSON('não achei nada')).toThrow('não devolveu dados estruturados');
  });
});

describe('repararJSON', () => {
  it('não mexe em JSON que já é válido', () => {
    const ok = '{"a":"x \\"y\\"","b":[1,2],"c":{"d":"e"}}';
    expect(JSON.parse(repararJSON(ok))).toEqual(JSON.parse(ok));
  });
});
