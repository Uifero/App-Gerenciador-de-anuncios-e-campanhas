// Ferramentas externas GRATUITAS de imagem e vídeo por IA: lista de referência fixa (sem chamada de API, sem custo).
// Aparece no Estúdio (logo abaixo dos prompts sugeridos, para saber onde colá-los) e em Configurações.
// Os limites gratuitos mudam com frequência: por isso o aviso fixo junto da lista.
import { esc } from '../core/ui.js';

export const FERRAMENTAS_IA = {
  imagem: [
    { nome: 'Google Gemini', url: 'https://gemini.google.com', pontoForte: 'Fotorrealista, texto correto dentro da imagem, edição por conversa.', gratis: 'Geração diária generosa, sem cartão.' },
    { nome: 'ChatGPT', url: 'https://chatgpt.com', pontoForte: 'Realista, fácil de editar pedindo o ajuste em texto.', gratis: 'Algumas gerações grátis por dia.' },
    { nome: 'Ideogram', url: 'https://ideogram.ai', pontoForte: 'O melhor para texto legível dentro da imagem (logo, banner com escrita).', gratis: '10 prompts/dia (40 imagens).' },
    { nome: 'Microsoft Designer / Bing Image Creator', url: 'https://designer.microsoft.com', pontoForte: 'Acesso grátis ao DALL-E 3, bom para uso geral.', gratis: 'Sem cartão, limite diário generoso.' },
  ],
  video: [
    { nome: 'Luma Dream Machine', url: 'https://lumalabs.ai/dream-machine', pontoForte: 'Vídeo a partir de foto, o mais generoso no grátis; ótimo para B-roll atmosférico.', gratis: 'Geração mensal grátis, com marca d\'água.' },
    { nome: 'Kling AI', url: 'https://klingai.com', pontoForte: 'Movimento mais realista, consistência de rosto/produto entre cortes.', gratis: '~66 créditos renovados a cada 24h.' },
    { nome: 'Pika', url: 'https://pika.art', pontoForte: 'Mais fácil para quem nunca escreveu prompt de movimento; bom para clipe social rápido.', gratis: 'Créditos diários renovados.' },
  ],
};

export const AVISO_LIMITES = 'Limites gratuitos mudam com frequência, confira o valor atual na própria ferramenta antes de usar.';

const ROTULO = { imagem: 'Imagem', video: 'Vídeo' };

/** HTML da lista. `grupos` escolhe quais tipos mostrar (e a ordem); `titulo` vai antes da lista. */
export function htmlFerramentas({ grupos = ['imagem', 'video'], titulo = '' } = {}) {
  return `<div class="rounded-lg border border-slate-200 p-2 text-sm" data-ferramentas-ia>
    ${titulo ? `<p class="mb-1 font-medium">${esc(titulo)}</p>` : ''}
    ${grupos.map((g) => `<p class="mt-1 text-xs font-semibold uppercase text-slate-500"><i class="fa-solid fa-${g === 'video' ? 'film' : 'image'} mr-1"></i>${ROTULO[g]}</p>
      <ul class="space-y-1">${FERRAMENTAS_IA[g].map((f) => `<li><a class="font-medium text-indigo-600 underline" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.nome)}</a>
        <span class="text-slate-500">(${esc(f.url.replace(/^https:\/\//, ''))})</span> — ${esc(f.pontoForte)} <span class="tag">${esc(f.gratis)}</span></li>`).join('')}</ul>`).join('')}
    <p class="hint mt-2"><i class="fa-solid fa-triangle-exclamation text-amber-600"></i> ${esc(AVISO_LIMITES)}</p></div>`;
}
