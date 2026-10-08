import { describe, it, expect } from 'vitest';
import { ehProdutoSaude, detectarProdutoSaude, achadosSaude, motivoSaude, AVISO_META_SAUDE, REGRA_SAUDE } from './saude.js';
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

  it('regra para a IA: nada de autoimagem negativa, mesmo com a dor nas palavras do público (teste real Thermora, 07/10/2026)', () => {
    expect(REGRA_SAUDE).toMatch(/NUNCA use texto que provoque autoimagem negativa/);
    expect(REGRA_SAUDE).toMatch(/mesmo sendo as palavras reais do público/);
  });

  it('regra para a IA: sem promessa de efeito no corpo nem condição de quem assiste (produção Thermora, 08/10/2026)', () => {
    expect(REGRA_SAUDE).toMatch(/NUNCA diga nem insinue efeito no metabolismo, energia, disposição, queima de gordura, apetite/);
    expect(REGRA_SAUDE).toMatch(/NUNCA fale da condição de saúde de quem assiste \("você está cansado", "sem energia", "seu corpo pede", "seu metabolismo"\)/);
    expect(REGRA_SAUDE).toMatch(/Permitido: a composição real \(nome dos ativos, número de cápsulas, preço, oferta ativa\)/);
    expect(REGRA_SAUDE).not.toMatch(/dores permitidas/); // cansaço e falta de disposição deixaram de ser dor permitida
  });

  it('bloqueia as 4 frases de produção e explica o porquê', () => {
    const casos = [
      ['Você sabia que guaraná e cafeína juntos têm esse efeito no metabolismo?', ['efeito', 'metabolismo'], /promessa de efeito no organismo/],
      ['Tomar só cafeína pra ter energia? Você está fazendo isso errado', ['energia'], /promessa de efeito no organismo/],
      ['Seu corpo pede mais que isso', ['seu corpo'], /condição de quem assiste/],
      ['Se você termina o dia sem energia, presta atenção nisso', ['sem energia'], /condição de quem assiste/],
    ];
    for (const [frase, achados, porque] of casos) {
      expect(achadosSaude(frase)).toEqual(achados);
      const m = motivoSaude(frase, { marca: { produtoSaude: true } });
      expect(m).toMatch(/^produto de saúde: o Meta proíbe /);
      expect(m).toMatch(porque);
      expect(m).toMatch(/Remova isso e use a composição real/);
    }
  });

  it('libera composição real, rotina e experiência sem efeito', () => {
    for (const frase of ['5 ativos em 60 cápsulas', 'laranja moro, cafeína e guaraná na mesma fórmula', 'Uma cápsula de manhã, junto com o café. Conto como foi a rotina', 'R$ 189,90 com frete grátis']) {
      expect(achadosSaude(frase)).toEqual([]);
      expect(motivoSaude(frase, { marca: { produtoSaude: true } })).toBe('');
    }
  });

  it('pega variações (sem acento, maiúsculas, outras funções do corpo) e devolve o trecho como escrito', () => {
    expect(achadosSaude('ACELERA O METABOLISMO e tira a fome')).toEqual(['metabolismo', 'fome']);
    expect(achadosSaude('Mais disposicao, queima de gordura e menos inchaço')).toEqual(['disposicao', 'queima de gordura', 'inchaço']);
    expect(achadosSaude('Cansada? Sua energia vai voltar')).toEqual(['cansada', 'sua energia']);
  });

  it('só vale para cliente de saúde; o motivo cita só a categoria encontrada', () => {
    expect(motivoSaude('Seu corpo pede mais que isso', { marca: { produtoSaude: false } })).toBe('');
    const m = motivoSaude('Perdi 3 kg', { marca: { produtoSaude: true } });
    expect(m).toMatch(/resultado no corpo/);
    expect(m).not.toMatch(/condição de quem assiste|promessa de efeito/);
  });

  it('o verificador local NÃO bloqueia "barriga" solta (só "sua barriga"): evita falso positivo como gel para a barriga', () => {
    expect(achadosSaude('Gel de massagem para a barriga, uso após o banho')).toEqual([]);
  });

  it('acha kg/cm de resultado e antes e depois no texto do criativo', () => {
    expect(achadosSaude('Perdi 3 kg e 5cm de cintura! Veja o antes e depois')).toEqual(['3 kg', '5cm', 'antes e depois']);
    expect(achadosSaude('Eliminei 2,5 quilos. Antes x depois')).toEqual(['2,5 quilos', 'antes x depois']);
    expect(achadosSaude('Rotina leve, mais de 500 clientes atendidos')).toEqual([]);
  });
});

describe('resposta real gravada (Thermora, 08/10/2026)', () => {
  it('3 variações sem efeito no corpo nem condição de quem assiste, mesmo com "mais energia e metabolismo acelerado" no perfil', async () => {
    const { readFileSync } = await import('node:fs');
    const lista = JSON.parse(JSON.parse(readFileSync('tests/fixtures/ia/criativos-thermora-sem-efeito-real.json', 'utf8')).texto);
    expect(lista).toHaveLength(3);
    for (const v of lista) expect(achadosSaude(`${v.hook} ${v.copy} ${v.cta}`)).toEqual([]);
    expect(lista.some((v) => /laranja moro/i.test(v.copy))).toBe(true); // composição real continua permitida
  });
});
