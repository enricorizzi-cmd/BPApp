// leaderboard-hooks.js — &type=... &mode=... + evita 400 senza indicator
(function(){
  if(!window.GET) return;
  const origGET = window.GET;
  window.GET = function(url){
    try{
      if (typeof url === 'string' && url.indexOf('/api/leaderboard') === 0){
        const overall = url.indexOf('/api/leaderboard_overall') === 0;

        // Se siamo su /api/leaderboard (per indicatore) ma NON c'è indicator, evita 400
        if (!overall && url.indexOf('indicator=') === -1){
          return Promise.resolve({ ranking: [] });
        }

        // Aggiunge sempre la granularità coerente con i filtri unificati
        if (window.readUnifiedRange){
          var r = window.readUnifiedRange('lb') || {};
          var t = (r.type==='ytd'||r.type==='ltm') ? 'mensile' : r.type;
          if (t){ url += (url.includes('?')?'&':'?') + 'type=' + encodeURIComponent(t); }
        }

        // Propaga la modalità previsionale/consuntivo
        var modeEl = document.getElementById('lb_mode');
        var mode = modeEl ? modeEl.value : 'consuntivo';
        url += (url.includes('?')?'&':'?') + 'mode=' + encodeURIComponent(mode);
      }
    }catch(e){}
    return origGET.apply(this, arguments);
  };
})();
