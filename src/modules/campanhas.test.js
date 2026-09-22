// Testes da conexão campanha <-> site: sugestão automática do link publicado como destino, com UTM no checklist.
import { describe, it, expect } from 'vitest';
import { checklistPadrao, siteDestino } from './campanhas.js';

const cliente = { estagio: 'novo' };

describe('siteDestino', () => {
  it('devolve o primeiro site com link publicado (custom ou pacote)', () => {
    const sites = [{ modo: 'pacote_plataforma', linkPublicado: 'https://loja.exemplo.com' }];
    expect(siteDestino(sites)).toEqual({ url: 'https://loja.exemplo.com', modo: 'pacote_plataforma' });
  });

  it('devolve null quando nenhum site tem link publicado', () => {
    expect(siteDestino([{ modo: 'custom', linkPublicado: '' }])).toBeNull();
    expect(siteDestino([])).toBeNull();
  });
});

describe('checklistPadrao — URL de destino', () => {
  it('inclui a URL com parâmetros UTM quando a campanha tem urlDestino', () => {
    const c = { nome: 'Campanha X', urlDestino: 'https://loja.exemplo.com/produto' };
    const linhas = checklistPadrao(c, cliente);
    const linha = linhas.find((l) => l.includes('URL de destino'));
    expect(linha).toContain('utm_source=meta');
    expect(linha).toContain('utm_campaign=Campanha+X');
  });

  it('avisa claramente quando não há site publicado (sem urlDestino)', () => {
    const linhas = checklistPadrao({ nome: 'Campanha X' }, cliente);
    const linha = linhas.find((l) => l.toLowerCase().includes('url de destino'));
    expect(linha).toContain('nenhum site publicado');
  });
});
