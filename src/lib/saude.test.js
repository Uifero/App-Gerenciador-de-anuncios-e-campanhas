import { describe, it, expect } from 'vitest';
import { ehProdutoSaude, detectarProdutoSaude, achadosSaude, AVISO_META_SAUDE } from './saude.js';
import { linhaNarrativa, narrativaDevolvida } from './narrativas.js';

const emagrecimento = { nicho: 'suplementos', marca: { negocio: 'Cápsulas para emagrecimento', provasSociais: 'Cliente perdeu 3 kg em 2 meses' } };
const moda = { nicho: 'moda fitness', marca: { negocio: 'Leggings de cintura alta', provasSociais: 'Nota 4,9 no Google' } };

describe('produto de saúde/emagrecimento (política do Meta)', () => {
  it('detecta pelo cadastro e pelos produtos; a escolha do perfil manda', () => {
    expect(detectarProdutoSaude(emagrecimento)).toBe(true);
    expect(detectarProdutoSaude(moda)).toBe(false); // "cintura alta" de legging não é produto de emagrecimento
    expect(detectarProdutoSaude({ nicho: 'loja' }, [{ nome: 'Termogênico 60 cápsulas' }])).toBe(true);
    expect(ehProdutoSaude({ ...emagrecimento, marca: { ...emagrecimento.marca, produtoSaude: false } })).toBe(false);
    expect(ehProdutoSaude({ ...moda, marca: { ...moda.marca, produtoSaude: true } })).toBe(true);
  });

  it('com prova real de peso, "Antes e Depois" e "Resultado/Depoimento" ficam bloqueadas pelo Meta', () => {
    for (const id of ['antes_depois', 'resultado_depoimento']) {
      const r = linhaNarrativa(id, emagrecimento);
      expect(r).toMatchObject({ bloqueada: true, motivo: 'saude' });
      expect(r.linha).toContain(AVISO_META_SAUDE);
      expect(r.linha).toMatch(/Não use antes e depois, números de kg ou cm/);
      expect(r.linha).toMatch(/experiência de uso, rotina, como é usar, número de clientes/);
      expect(r.linha).toMatch(/porque/);
      expect(narrativaDevolvida(id, emagrecimento)).toBeNull(); // nem etiqueta de prova
    }
    expect(linhaNarrativa('dor_solucao', emagrecimento).bloqueada).toBe(false); // as outras seguem normais
  });

  it('cliente que NÃO é de saúde continua usando as narrativas de prova como antes', () => {
    expect(linhaNarrativa('antes_depois', moda)).toMatchObject({ bloqueada: false, motivo: '' });
    expect(narrativaDevolvida('resultado_depoimento', moda)).toBe('resultado_depoimento');
  });

  it('acha kg/cm de resultado e antes e depois no texto do criativo', () => {
    expect(achadosSaude('Perdi 3 kg e 5cm de cintura! Veja o antes e depois')).toEqual(['3 kg', '5cm', 'antes e depois']);
    expect(achadosSaude('Eliminei 2,5 quilos. Antes x depois')).toEqual(['2,5 quilos', 'antes x depois']);
    expect(achadosSaude('Rotina leve, mais de 500 clientes atendidos')).toEqual([]);
  });
});
