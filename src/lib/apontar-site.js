// "Apontar no site": script que roda DENTRO da prévia (iframe sandbox sem allow-same-origin: não enxerga o painel).
// Com o modo ligado, o toque/clique não navega: destaca o elemento mais próximo com data-el (contorno + rótulo com a
// seção e o elemento) e avisa o painel por postMessage. Toque fora de um elemento cancela. O painel também pede para
// destacar um elemento (o "Entendi assim" do print). Só entra na prévia do passo 4: nunca no site baixado nem no link
// de aprovação.

const CSS = `.gcc-apontando [data-el]{cursor:pointer}.gcc-apontando [data-el]:hover{outline:1px dashed #6366f1;outline-offset:2px}
.gcc-sel{outline:3px solid #e11d48!important;outline-offset:2px!important}
#gcc-rot{position:absolute;z-index:2147483647;background:#e11d48;color:#fff;font:600 13px/1.3 system-ui,sans-serif;padding:4px 8px;border-radius:6px;max-width:calc(100vw - 16px);pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.25)}
.gcc-apontando #cookies{display:none!important}`;

const JS = `(function(){var ativo=false,sel=null;
function limpar(){if(sel)sel.classList.remove('gcc-sel');var r=document.getElementById('gcc-rot');if(r)r.remove();sel=null;}
function marcar(el){limpar();sel=el;el.classList.add('gcc-sel');var r=document.createElement('div');r.id='gcc-rot';r.textContent=el.getAttribute('data-el-nome')||el.getAttribute('data-el');document.body.appendChild(r);var b=el.getBoundingClientRect(),t=window.scrollY+b.top-r.offsetHeight-6;r.style.top=(t<window.scrollY?window.scrollY+b.bottom+6:t)+'px';r.style.left=Math.max(8,Math.min(b.left,window.innerWidth-r.offsetWidth-8))+'px';}
function avisar(el){var p=el.closest('[data-produto]'),irm=[];if(el.parentElement)Array.prototype.forEach.call(el.parentElement.children,function(c){var i=c.getAttribute('data-el');if(i&&c.offsetParent!==null)irm.push(i);});parent.postMessage({tipo:'gcc-apontado',id:el.getAttribute('data-el'),nome:el.getAttribute('data-el-nome')||'',texto:(el.innerText||'').slice(0,600),produto:p?p.getAttribute('data-produto'):'',irmaos:irm},'*');}
addEventListener('message',function(e){var d=e.data||{};
 if(d.tipo==='gcc-modo'){ativo=!!d.ativo;document.documentElement.classList.toggle('gcc-apontando',ativo);if(!ativo)limpar();}
 if(d.tipo==='gcc-destacar'){var achar=function(){var v=null;document.querySelectorAll('[data-el]').forEach(function(x){if(!v&&x.getAttribute('data-el')===d.id&&x.offsetParent!==null)v=x;});return v;};var el=achar();if(!el){var o=null;document.querySelectorAll('[data-el]').forEach(function(x){if(!o&&x.getAttribute('data-el')===d.id)o=x;});var pg=o&&o.closest('.pdp-pagina,.pagina');if(pg&&pg.id)location.hash=pg.id;}setTimeout(function(){var e2=el||achar();if(e2){e2.scrollIntoView({block:'center'});setTimeout(function(){marcar(e2);},60);}},el?0:150);}
 if(d.tipo==='gcc-ir'&&d.hash){location.hash=d.hash;}
 if(d.tipo==='gcc-limpar')limpar();});
function tocar(ev){if(!ativo)return;ev.preventDefault();ev.stopPropagation();var el=ev.target.closest('[data-el]');if(!el){limpar();parent.postMessage({tipo:'gcc-cancelar'},'*');return;}marcar(el);avisar(el);}
document.addEventListener('click',tocar,true);
document.addEventListener('submit',function(ev){if(ativo){ev.preventDefault();ev.stopPropagation();}},true);
parent.postMessage({tipo:'gcc-pronto'},'*');})();`;

/** HTML da prévia com o "Apontar no site" (o modo começa desligado; o painel liga por mensagem). */
export function comApontar(html, { ativo = false } = {}) {
  const extra = `<style>${CSS}</style><script>${JS}${ativo ? "document.documentElement.classList.add('gcc-apontando');" : ''}</script>`;
  return /<\/body>/i.test(html) ? String(html).replace(/<\/body>(?![\s\S]*<\/body>)/i, `${extra}</body>`) : `${html}${extra}`;
}
