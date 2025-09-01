/* BPApp – Undo snackbar
   - Barra "Operazione riuscita — [Annulla]" che non rimpiazza i tuoi toast
   - Chiamata: BP.Undo.push({ label: "BP salvato", onUndo: ()=>{...}, timeoutMs: 5000 })
*/
(function(){
  const NS = (window.BP = window.BP || {});
  const UN = (NS.Undo = NS.Undo || {});

  const host = document.createElement("div");
  host.className = "bp-undo-host";
  document.body.appendChild(host);

  const css = `
  .bp-undo-host{
    position: fixed; left:50%; transform: translateX(-50%);
    bottom: 20px; z-index: 1201; display:flex; flex-direction:column; gap:8px;
  }
  .bp-undo{
    min-width: 280px; max-width: 540px;
    background: rgba(15,19,28,.95);
    border:1px solid rgba(255,255,255,.18);
    border-radius: 12px; padding: 10px 12px;
    box-shadow: 0 10px 24px rgba(0,0,0,.35);
    display:flex; align-items:center; gap:10px;
    animation: bpUndoPop .16s ease-out;
  }
  .bp-undo .lbl{ font-weight:700; }
  .bp-undo .spacer{ flex:1; }
  .bp-undo button{ white-space:nowrap; }
  @keyframes bpUndoPop{ from{ transform: translate(-50%, 4px); opacity:0 } to{ transform: translate(-50%, 0); opacity:1 } }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function push(opts){
    const el = document.createElement("div");
    el.className = "bp-undo";
    el.innerHTML = `
      <div class="lbl">${(opts && opts.label) || "Operazione eseguita"}</div>
      <div class="spacer"></div>
      <button type="button" class="ghost" data-undo>Annulla</button>
    `;
    host.appendChild(el);
    let done = false;
    const t = setTimeout(()=>{ if(!done){ done=true; el.remove(); }}, (opts && opts.timeoutMs) || 5000);
    el.querySelector("[data-undo]").addEventListener("click", ()=>{
      if(done) return;
      done = true;
      clearTimeout(t);
      try{ opts && opts.onUndo && opts.onUndo(); }catch(e){}
      el.remove();
    });
  }

  UN.push = push;
})();
