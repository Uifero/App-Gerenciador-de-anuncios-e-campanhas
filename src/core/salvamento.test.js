// Ajustes de sensação de uso: lembrete de backup, atalho da busca e o "pode sair?" sem nada pendente.
import { describe, it, expect, vi } from 'vitest';
import { podeSair, horaCurta, MENSAGEM_SAIR } from './salvamento.js';

vi.mock('../core/storage.js', () => ({ db: {}, COL: {} }));
vi.mock('../modules/configuracoes.js', () => ({ registrarBackup: vi.fn() }));
const { lembreteBackup } = await import('../modules/backup.js');
const { ehAtalhoBusca } = await import('../modules/busca.js');

const DIA = 864e5, AGORA = Date.parse('2026-09-24T12:00:00Z');

describe('lembreteBackup', () => {
  it('nunca fez backup: avisa desde o início', () => {
    expect(lembreteBackup(null, 14, AGORA)).toEqual({ dias: null, atrasado: true, texto: 'Último backup: nunca. Exportar agora?' });
  });
  it('dentro do prazo: só mostra a data, sem aviso', () => {
    const r = lembreteBackup(new Date(AGORA - 3 * DIA).toISOString(), 14, AGORA);
    expect(r).toMatchObject({ dias: 3, atrasado: false, texto: 'Último backup completo: há 3 dias' });
    expect(lembreteBackup(new Date(AGORA - 2 * 3600e3).toISOString(), 14, AGORA).texto).toBe('Último backup completo: hoje');
  });
  it('passou do prazo (configurável): "há X dias. Exportar agora?"', () => {
    expect(lembreteBackup(new Date(AGORA - 15 * DIA).toISOString(), 14, AGORA)).toMatchObject({ atrasado: true, texto: 'Último backup: há 15 dias. Exportar agora?' });
    expect(lembreteBackup(new Date(AGORA - 15 * DIA).toISOString(), 30, AGORA).atrasado).toBe(false);
    expect(lembreteBackup(new Date(AGORA - 14 * DIA).toISOString(), 14, AGORA).atrasado).toBe(false); // "mais de 14 dias"
  });
});

describe('atalho da busca', () => {
  it('Ctrl+K e Cmd+K; não Ctrl+Shift+K nem K sozinho', () => {
    expect(ehAtalhoBusca({ ctrlKey: true, key: 'k' })).toBe(true);
    expect(ehAtalhoBusca({ metaKey: true, key: 'K' })).toBe(true);
    expect(ehAtalhoBusca({ ctrlKey: true, shiftKey: true, key: 'K' })).toBe(false);
    expect(ehAtalhoBusca({ key: 'k' })).toBe(false);
  });
});

describe('podeSair', () => {
  it('sem texto pendente não pergunta nada', () => {
    const confirmar = vi.fn();
    expect(podeSair(confirmar)).toBe(true);
    expect(confirmar).not.toHaveBeenCalled();
  });
  it('mensagem e hora do selo', () => {
    expect(MENSAGEM_SAIR).toBe('Você tem alterações não salvas. Sair mesmo assim?');
    expect(horaCurta(new Date(2026, 8, 24, 9, 5))).toBe('09:05');
  });
});
