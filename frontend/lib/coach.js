/* BPApp – Coach (motivazionale)
   - Mostra frasi motivazionali in un canale grafico SEPARATO dai tuoi toast standard
   - Eventi tipici: bp_saved, appointment_created, appointment_updated, client_converted
   - Usa phrases.js (pool per intensità) e sostituisce {{name}}
*/
(function(){
  const NS = (window.BP = window.BP || {});
  const Coach = (NS.Coach = NS.Coach || {});

  // Container (top-right), non sovrascrive la tua .toast
  console.log('[COACH] Initializing coach system...');
  const host = document.createElement("div");
  host.className = "bp-coach-host";
  
  console.log('[COACH] Created host element:', host, 'with class:', host.className);
  console.log('[COACH] Document body:', document.body, 'exists:', !!document.body);
  
  try {
    document.body.appendChild(host);
    console.log('[COACH] Host appended to body successfully');
  } catch (error) {
    console.error('[COACH] Error appending host to body:', error);
  }

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
  
  console.log('[COACH] Created style element:', style);
  console.log('[COACH] Document head:', document.head, 'exists:', !!document.head);
  
  try {
    document.head.appendChild(style);
    console.log('[COACH] Style appended to head successfully');
  } catch (error) {
    console.error('[COACH] Error appending style to head:', error);
  }

  // Phrases per intensità (usa window.BP.Phrases se presente)
  function getPhrase(intensity, name){
    console.log('[COACH] getPhrase() called with:', { intensity, name });
    
    const PX = (window.BP && window.BP.Phrases) ? window.BP.Phrases : null;
    console.log('[COACH] Phrases object available:', !!PX, PX ? Object.keys(PX) : 'none');
    
    let pool = [];
    if(PX){
      if(intensity === "low") pool = PX.lite || PX.standard || [];
      else if(intensity === "high") pool = PX.mega || PX.grande || [];
      else pool = PX.mid || PX.rilevante || [];
      console.log('[COACH] Using phrases pool for', intensity, ':', pool.length, 'phrases');
    }else{
      // fallback minimale
      pool = [
        "Grande {{name}}!",
        "Che figata, {{name}}!",
        "Non ti ferma nessuno!",
        "Super, {{name}}!",
      ];
      console.log('[COACH] Using fallback phrases:', pool.length, 'phrases');
    }
    if(!pool.length) pool = ["Grande {{name}}!"];
    const txt = pool[Math.floor(Math.random()*pool.length)];
    const finalTxt = txt.replace(/{{\s*name\s*}}/gi, (name||""));
    console.log('[COACH] Selected phrase:', txt, '-> Final:', finalTxt);
    return finalTxt;
  }

  function show(text, ms){
    console.log('[COACH] show() called with:', { text, ms });
    console.log('[COACH] Host element:', host, 'exists:', !!host);
    console.log('[COACH] Host parent:', host.parentNode, 'in DOM:', document.contains(host));
    
    const el = document.createElement("div");
    el.className = "bp-coach";
    el.textContent = text;
    
    console.log('[COACH] Created element:', el, 'with class:', el.className);
    
    try {
      host.appendChild(el);
      console.log('[COACH] Element appended to host successfully');
      
      const fadeOutMs = ms || 3000;
      const removeMs = fadeOutMs + 220;
      
      setTimeout(()=> { 
        console.log('[COACH] Starting fade out');
        el.style.opacity = "0"; 
        el.style.transform = "translateY(-4px)"; 
      }, fadeOutMs);
      
      setTimeout(()=> { 
        console.log('[COACH] Removing element');
        el.remove(); 
      }, removeMs);
      
    } catch (error) {
      console.error('[COACH] Error showing coach:', error);
    }
  }

  // API principale
  // event: 'bp_saved' | 'appointment_created' | 'appointment_updated' | 'client_converted' | 'generic'
  // opts: { name, intensity: 'low'|'medium'|'high', durationMs }
  function say(event, opts){
    console.log('[COACH] say() called with:', { event, opts });
    
    const name = (opts && opts.name) || "";
    let intensity = (opts && opts.intensity) || "medium";
    if(!opts || !opts.intensity){
      if(event === "bp_saved" || event === "client_converted") intensity = "high";
      else if(event === "appointment_created") intensity = "medium";
      else intensity = "low";
    }
    
    console.log('[COACH] Resolved parameters:', { name, intensity, event });
    
    const txt = getPhrase(intensity, name);
    console.log('[COACH] Generated phrase:', txt);
    
    const duration = (opts && opts.durationMs) || 3000;
    console.log('[COACH] Showing coach with duration:', duration);
    
    show(txt, duration);
  }

  Coach.say = say;
  
  // Funzione di test per verificare il coach
  Coach.test = function() {
    console.log('[COACH] Testing coach system...');
    say('appointment_created', { intensity: 'medium' });
    setTimeout(() => say('client_converted', { intensity: 'high' }), 1000);
    setTimeout(() => say('bp_saved', { intensity: 'low' }), 2000);
  };
  
  // Esponi anche globalmente per test
  window.testCoach = Coach.test;
  
  console.log('[COACH] Coach system initialized successfully');
})();
