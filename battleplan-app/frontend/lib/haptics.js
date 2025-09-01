/* BPApp – Haptics (solo mobile)
   - Usa navigator.vibrate dove disponibile
   - No-op su desktop
*/
(function(){
  const NS = (window.BP = window.BP || {});
  const H = (NS.Haptics = NS.Haptics || {});

  function isMobile(){
    const ua = navigator.userAgent || navigator.vendor || "";
    return /android|iphone|ipad|ipod|mobile/i.test(ua);
  }

  function impact(style){
    if(!isMobile()) return;
    if(!("vibrate" in navigator)) return;
    try{
      switch(style){
        case "light": navigator.vibrate(12); break;
        case "heavy": navigator.vibrate([10, 30, 10]); break;
        default: navigator.vibrate(18); break; // medium
      }
    }catch(_){}
  }

  H.impact = impact;
})();
