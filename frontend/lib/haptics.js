/* BPApp – Haptics (solo mobile)
   - Usa navigator.vibrate dove disponibile
   - No-op su desktop
*/
(function(){
  const NS = (window.BP = window.BP || {});
  const H = (NS.Haptics = NS.Haptics || {});

  function isMobile(){
    const ua = navigator.userAgent || navigator.vendor || "";
    // Rilevamento mobile più permissivo
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet|fennec|maemo|symbian|j2me|midp|wap|phone/i;
    const isMobileUA = mobileRegex.test(ua);
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 1024; // Più permissivo
    const hasMobileFeatures = 'orientation' in window || 'deviceMotionEvent' in window;
    
    console.log('[HAPTICS] Device detection:', {
      ua: ua.substring(0, 100) + '...',
      isMobileUA,
      isTouchDevice,
      isSmallScreen,
      hasMobileFeatures,
      maxTouchPoints: navigator.maxTouchPoints,
      screenWidth: window.innerWidth,
      orientation: 'orientation' in window,
      deviceMotion: 'deviceMotionEvent' in window
    });
    
    // Più permissivo: se ha touch O è mobile UA O ha features mobile
    return isMobileUA || isTouchDevice || hasMobileFeatures || isSmallScreen;
  }

  function impact(style){
    const isMobileDevice = isMobile();
    const hasVibrate = "vibrate" in navigator;
    
    console.log('[HAPTICS] Impact check:', {
      isMobileDevice,
      hasVibrate,
      style
    });
    
    // Se non ha vibrate, non può funzionare
    if(!hasVibrate) {
      console.log('[HAPTICS] Vibration API not available');
      return;
    }
    
    // Se è rilevato come mobile, prova sempre
    if(!isMobileDevice) {
      console.log('[HAPTICS] Not detected as mobile device, skipping vibration');
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
  
  // Funzione per forzare haptics (bypassa rilevamento mobile)
  H.force = function(style) {
    console.log('[HAPTICS] Force vibration:', style);
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
      console.log('[HAPTICS] Force vibration triggered:', style);
    }catch(e){
      console.warn('[HAPTICS] Force vibration failed:', e);
    }
  };
  
  // Esponi anche globalmente per test
  window.testHaptics = H.test;
  window.forceHaptics = H.force;
})();
