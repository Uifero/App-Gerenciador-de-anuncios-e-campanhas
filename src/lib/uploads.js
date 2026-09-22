// Envio de arquivo ao Storage com uma mensagem clara quando falha, em vez de deixar o erro cru do SDK do Firebase
// aparecer sozinho. O motivo mais comum de TODO upload falhar neste app é o Firebase Storage do projeto ainda não
// ter sido ativado (exige o plano Blaze — ver a seção "Storage" do README). Não dá para distinguir com certeza
// esse motivo de outra falha de rede só pela mensagem do SDK, então o aviso cobre os dois casos e mantém o erro
// técnico original visível (útil para quem for depurar de verdade).
import { enviarArquivo } from '../core/storage.js';

export async function enviarArquivoOuAvisar(caminho, file) {
  try {
    return await enviarArquivo(caminho, file);
  } catch (e) {
    const original = e?.message || String(e || 'erro desconhecido');
    throw new Error(`Não consegui enviar "${file.name}". Se isso acontecer com QUALQUER arquivo, o motivo mais comum é o Firebase Storage deste projeto ainda não estar ativado (exige o plano Blaze — veja a seção "Storage" do README). Detalhe técnico: ${original}`);
  }
}
