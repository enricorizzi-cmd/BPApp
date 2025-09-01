// telemetry.js — cattura errori JS e invia al server
(function(){
  function send(payload){
    try{
      fetch('/api/client_error', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ url: location.href, info: { ua:navigator.userAgent }, ...payload })
      });
    }catch(e){}
  }
  window.addEventListener('error', function(e){
    try{ send({ message: e.message, stack: (e.error && e.error.stack)||null }); }catch(_){}
  });
  window.addEventListener('unhandledrejection', function(e){
    try{ send({ message: 'unhandledrejection', stack: (e.reason && e.reason.stack)||String(e.reason) }); }catch(_){}
  });
})();