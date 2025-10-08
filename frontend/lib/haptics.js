/* BPApp – Haptics (solo mobile)
   - Usa navigator.vibrate dove disponibile
   - No-op su desktop
*/
(function(){
  const NS = (window.BP = window.BP || {});
  const H = (NS.Haptics = NS.Haptics || {});

  function isMobile(){
    const ua = navigator.userAgent || navigator.vendor || "";
    // Rilevamento mobile più accurato
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;
    const isMobileUA = mobileRegex.test(ua);
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    
    console.log('[HAPTICS] Device detection:', {
      ua: ua.substring(0, 100) + '...',
      isMobileUA,
      isTouchDevice,
      isSmallScreen,
      maxTouchPoints: navigator.maxTouchPoints
    });
    
    return isMobileUA || (isTouchDevice && isSmallScreen);
  }

  function impact(style){
    const isMobileDevice = isMobile();
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const hasVibrate = "vibrate" in navigator;
    
    console.log('[HAPTICS] Impact check:', {
      isMobileDevice,
      hasTouch,
      hasVibrate,
      style
    });
    
    // Prova sempre se ha touch e vibrate, anche se non rilevato come mobile
    if(!isMobileDevice && !hasTouch) {
      console.log('[HAPTICS] Not mobile device and no touch, skipping vibration');
      return;
    }
    
    if(!hasVibrate) {
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
  
  // Funzione di test per verificare haptics
  H.test = function() {
    console.log('[HAPTICS] Testing all vibration patterns...');
    impact('light');
    setTimeout(() => impact('medium'), 500);
    setTimeout(() => impact('heavy'), 1000);
    setTimeout(() => impact('success'), 1500);
  };
  
  // Esponi anche globalmente per test
  window.testHaptics = H.test;
})();
