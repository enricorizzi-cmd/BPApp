/* BPApp – Coach (motivazionale)
   - Mostra frasi motivazionali in un canale grafico SEPARATO dai tuoi toast standard
   - Eventi tipici: bp_saved, appointment_created, appointment_updated, client_converted
   - Usa phrases.js (pool per intensità) e sostituisce {{name}}
*/
(function(){
  const NS = (window.BP = window.BP || {});
  const Coach = (NS.Coach = NS.Coach || {});

  // Container (top-right), non sovrascrive la tua .toast
  const host = document.createElement("div");
  host.className = "bp-coach-host";
  document.body.appendChild(host);

  const css = `
  .bp-coach-host{
    position: fixed; right: 16px; top: 70px; z-index: 1200;
    display:flex; flex-direction:column; gap:8px; align-items:flex-end;
  }
  .bp-coach{
    max-width: 360px;
    background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03));
    border:1px solid rgba(255,255,255,.18);
    border-radius: 14px;
    padding: 10px 12px;
    box-shadow: 0 10px 24px rgba(0,0,0,.35);
    animation: bpCoachPop .18s ease-out;
    font-weight: 700;
  }
  @keyframes bpCoachPop{ from{ transform: translateY(-6px); opacity:0 } to{ transform: translateY(0); opacity:1 } }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // Phrases per intensità (usa window.BP.Phrases se presente)
  function getPhrase(intensity, name){
    const PX = (window.BP && window.BP.Phrases) ? window.BP.Phrases : null;
    let pool = [];
    if(PX){
      if(intensity === "low") pool = PX.low || PX.standard || [];
      else if(intensity === "high") pool = PX.high || PX.standard || [];
      else pool = PX.medium || PX.standard || [];
    }else{
      // fallback minimale
      pool = [
        "Grande {{name}}!",
        "Che figata, {{name}}!",
        "Non ti ferma nessuno!",
        "Super, {{name}}!",
      ];
    }
    if(!pool.length) pool = ["Grande {{name}}!"];
    const txt = pool[Math.floor(Math.random()*pool.length)];
    return txt.replace(/{{\s*name\s*}}/gi, (name||""));
  }

  function show(text, ms){
    const el = document.createElement("div");
    el.className = "bp-coach";
    el.textContent = text;
    host.appendChild(el);
    setTimeout(()=> { el.style.opacity = "0"; el.style.transform = "translateY(-4px)"; }, (ms||2200));
    setTimeout(()=> { el.remove(); }, (ms||2200)+220);
  }

  // API principale
  // event: 'bp_saved' | 'appointment_created' | 'appointment_updated' | 'client_converted' | 'generic'
  // opts: { name, intensity: 'low'|'medium'|'high', durationMs }
  function say(event, opts){
    const name = (opts && opts.name) || "";
    let intensity = (opts && opts.intensity) || "medium";
    if(!opts || !opts.intensity){
      if(event === "bp_saved" || event === "client_converted") intensity = "high";
      else if(event === "appointment_created") intensity = "medium";
      else intensity = "low";
    }
    const txt = getPhrase(intensity, name);
    show(txt, (opts && opts.durationMs) || 2400);
  }

  Coach.say = say;
})();
