// ics-sanitize.js — normalizza i nomi file .ics
(function(){
  function sanitize(name){
    return String(name||'event')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9._-]+/g,'_')
      .replace(/^_+|_+$/g,'')
      .slice(0,80) || 'event';
  }
  if (window.saveICS && !window.__icsSanitized){
    const orig = window.saveICS;
    window.saveICS = function(filename, data){
      try{ filename = sanitize(filename); }catch(e){}
      return orig(filename, data);
    };
    window.__icsSanitized = true;
  }
  window.__icsSanitize = sanitize;
})();