// Configurações globais (coleção gcc_configuracoes, documento único "global").
import { db, COL } from '../core/storage.js';
import { CONFIG_PADRAO } from '../lib/constantes.js';
import { cabecalho, lerForm, num, toast, on, ocupado } from '../core/ui.js';

const ID = 'global';
let cache = null;

export async function obterConfig() {
  if (cache) return cache;
  const d = await db.obter(COL.config, ID);
  cache = { ...CONFIG_PADRAO, ...(d || {}), cortes: { ...CONFIG_PADRAO.cortes, ...(d?.cortes || {}) } };
  return cache;
}

/** Classifica o sinal de uma referência pelos dias no ar: 'forte' | 'moderado' | 'fraco' | null (sem dado). */
export function classificarSinal(dias, cfg) {
  if (dias == null || isNaN(dias)) return null;
  if (dias >= cfg.cortes.forte) return 'forte';
  if (dias >= cfg.cortes.moderado) return 'moderado';
  return 'fraco';
}

export async function view(el) {
  const c = await obterConfig();
  el.innerHTML = `${cabecalho('Configurações', 'Ajustes que valem para todos os clientes.')}
  <form class="card max-w-xl space-y-4" id="f">
    <div><label class="label">Dias mínimos no ar para considerar uma referência de mercado</label>
      <input class="input" type="number" min="1" name="dias" value="${c.diasMinimosReferencia}">
      <p class="hint">Anúncio que fica muito tempo ativo costuma estar dando resultado. Padrão: 15.</p></div>
    <div class="grid grid-cols-2 gap-3">
      <div><label class="label">Sinal "moderado" a partir de (dias)</label><input class="input" type="number" min="1" name="moderado" value="${c.cortes.moderado}"></div>
      <div><label class="label">Sinal "forte" a partir de (dias)</label><input class="input" type="number" min="1" name="forte" value="${c.cortes.forte}"></div>
    </div>
    <div><label class="label">Alerta de fadiga de criativo após (dias em uso)</label>
      <input class="input" type="number" min="1" name="fadiga" value="${c.diasFadiga}">
      <p class="hint">Avisa nas campanhas quando um criativo está no ar há mais tempo que isso. Padrão: 14.</p></div>
    <button class="btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar configurações</button>
  </form>`;
  on(el, 'submit', '#f', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f);
    const dados = {
      diasMinimosReferencia: num(v.dias) || 15,
      cortes: { moderado: num(v.moderado) || 15, forte: num(v.forte) || 30 },
      diasFadiga: num(v.fadiga) || 14,
    };
    if (dados.cortes.forte < dados.cortes.moderado) return toast('O corte "forte" deve ser maior ou igual ao "moderado".', 'erro');
    await ocupado(f.querySelector('button'), async () => {
      if (await db.obter(COL.config, ID)) await db.atualizar(COL.config, ID, dados);
      else await db.criar(COL.config, dados, ID);
      cache = null;
      toast('Configurações salvas.');
    });
  });
}
