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
    if(!isMobile()) {
      console.log('[HAPTICS] Not mobile device, skipping vibration');
      return;
    }
    if(!("vibrate" in navigator)) {
      console.log('[HAPTICS] Vibration API not available');
      return;
    }
    try{
      switch(style){
        case "light": navigator.vibrate(12); break;
        case "heavy": navigator.vibrate([10, 30, 10]); break;
        case "success": navigator.vibrate([20, 50, 20]); break;
        default: navigator.vibrate(18); break; // medium
      }
      console.log('[HAPTICS] Vibration triggered:', style);
    }catch(e){
      console.warn('[HAPTICS] Vibration failed:', e);
    }
  }

  H.impact = impact;
})();
