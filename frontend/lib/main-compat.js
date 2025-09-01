(function(){
  'use strict';
  // Non tocca la UI. Non chiama viewLogin. Non re-innesca render().
  // Si limita a: (1) bloccare GET prima del login; (2) prevenire doppia init().

  var GET = (typeof window.GET === 'function') ? window.GET : null;
  if (GET) {
    var GET_ORIG = GET;
    window.GET = function(url){
      try{
        var tok = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
        if(!tok && !/^\/?api\/health/.test(String(url))) {
          // Evita chiamate premature (niente UI)
          return Promise.reject({ error:'no_token' });
        }
      }catch(e){}
      return GET_ORIG.apply(this, arguments);
    };
  }

  // Evita doppia init: se il main la richiama, esci subito.
  if (typeof window.init === 'function') {
    var initOrig = window.init;
    var __initOnce = false;
    window.init = function(){
      if (__initOnce) return;
      __initOnce = true;
      return initOrig.apply(this, arguments);
    };
  }
})();
