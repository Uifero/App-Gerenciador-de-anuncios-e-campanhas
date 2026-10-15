// Roteiro antigo do Thermora (Reels 9:16) como estava guardado no texto do criativo em produção. CENA 1 e CENA 3 são as
// linhas EXATAS do relato do operador (a CENA 3 é a direção que apareceu escrita no vídeo); as outras seguem o mesmo
// formato do roteiro. A foto da balança (63,60 kg -> 62,50 kg) e a do jeans são as que apareceram sem relação com a cena.
export const ROTEIRO_ANTIGO = [
  'CENA 1 (0-3s) — Bancada do banheiro com vários potes de suplemento espalhados, câmera no celular, luz natural. Texto na tela: "Quantos potes você tem aí?"',
  'CENA 2 (3-7s) — Close no pote do Thermora Metabolic Formula na mão, girando para mostrar o rótulo. Texto na tela: "Eu tinha 4. Agora tenho 1."',
  'CENA 3 (7-11s) — Mão derruba um dos potes sem querer, cena real, sem drama, só a situação do dia a dia corrido.',
  'CENA 4 (11-15s) — Xícara de café na mesa da cozinha ao lado do pote, de manhã. Voz: "Duas cápsulas com o café e pronto." Texto na tela: "2 cápsulas com o café"',
].join('\n');

export const criativoAntigo = {
  id: 'cTh', clienteId: 'thermora', nome: 'Quantos potes', hook: 'Quantos potes você tem aí?', copy: ROTEIRO_ANTIGO,
  cta: 'Conheça a fórmula', formato: 'video_curto', produtoId: 'pTM', status: 'rascunho', checklist: {}, versoes: [],
};

/** Materiais da sessão do Estúdio (como o Estúdio monta: rótulo = o que está guardado na foto). */
export const midiasThermora = [
  { nome: 'F31-thermora-metabolic-f31.jpg', rotulo: 'thermora-metabolic-f31.jpg · Pote do Thermora Metabolic Formula, rótulo de frente', tipo: 'imagem' },
  { nome: 'F12-balanca.jpg', rotulo: 'Foto da balança: 63,60 kg e depois 62,50 kg', tipo: 'imagem' },
  { nome: 'F40-jeans.jpg', rotulo: 'Cliente mostra o jeans que ficou largo', tipo: 'imagem' },
  { nome: 'F15-cafe.jpg', rotulo: 'Xícara de café na mesa da cozinha', tipo: 'imagem' },
];
