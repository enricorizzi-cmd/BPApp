let container;
let deferredPrompt = null;

function getContainer(){
  if(!container){
    container = document.getElementById('toast-container');
    if(!container){
      container = document.createElement('div');
      container.id = 'toast-container';
      container.setAttribute('role','status');
      container.setAttribute('aria-live','polite');
      document.body.appendChild(container);
    }
  }
  return container;
}

// Funzione per rilevare se è mobile
export function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || '';
  return /android|iphone|ipad|ipod|mobile/i.test(ua);
}

// Funzione per rilevare se è già installato come PWA
export function isPWAInstalled() {
  return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
}

// Funzione per verificare se il pulsante installazione dovrebbe essere mostrato
export function shouldShowInstallButton() {
  return isMobileDevice() && !isPWAInstalled() && deferredPrompt !== null;
}

// Funzione per installare l'app
export async function installPWA() {
  if (!deferredPrompt) {
    console.warn('[PWA] No install prompt available');
    return false;
  }

  try {
    // Mostra il prompt di installazione
    deferredPrompt.prompt();
    
    // Aspetta la risposta dell'utente
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log(`[PWA] Install prompt outcome: ${outcome}`);
    
    // Pulisci il prompt salvato
    deferredPrompt = null;
    
    return outcome === 'accepted';
  } catch (error) {
    console.error('[PWA] Error during installation:', error);
    return false;
  }
}

// Gestione dell'evento beforeinstallprompt
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('[PWA] beforeinstallprompt event fired');
  
  // Previeni il prompt automatico
  e.preventDefault();
  
  // Salva l'evento per usarlo più tardi
  deferredPrompt = e;
  
  // Aggiorna l'UI per mostrare il pulsante installazione
  updateInstallButtonVisibility();
});

// Funzione per aggiornare la visibilità del pulsante installazione
export function updateInstallButtonVisibility() {
  const shouldShow = shouldShowInstallButton();
  
  // Pulsante sidebar desktop
  const installButtonSidebar = document.getElementById('install-app-button');
  if (installButtonSidebar) {
    installButtonSidebar.style.display = shouldShow ? 'flex' : 'none';
  }
  
  // Pulsante drawer mobile
  const installButtonMobile = document.getElementById('install-app-button-mobile');
  if (installButtonMobile) {
    installButtonMobile.style.display = shouldShow ? 'block' : 'none';
  }
  
  // Pulsante topbar mobile
  const installButtonTopbar = document.getElementById('install-app-button-topbar');
  if (installButtonTopbar) {
    installButtonTopbar.style.display = shouldShow ? 'block' : 'none';
  }
}

export function showAddToHomePrompt(){
  if(sessionStorage.getItem('a2hs-dismissed') === '1') return;
  const ua = navigator.userAgent || navigator.vendor || '';
  const isMobile = /android|iphone|ipad|ipod|mobile/i.test(ua);
  const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  if(!isMobile || isStandalone) return;

  const c = getContainer();
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.display = 'flex';
  t.style.alignItems = 'center';
  t.style.gap = '8px';
  const msg = document.createElement('span');
  msg.textContent = 'Clicca installa app dal menu o aggiungi a schermata Home';
  const close = document.createElement('span');
  close.textContent = '\u00d7';
  close.setAttribute('role', 'button');
  close.setAttribute('aria-label', 'Chiudi');
  close.style.cursor = 'pointer';
  close.style.fontWeight = '700';
  close.addEventListener('click', () => {
    t.remove();
    if(!c.children.length){ c.remove(); container = null; }
    sessionStorage.setItem('a2hs-dismissed', '1');
  });
  t.appendChild(msg);
  t.appendChild(close);
  c.appendChild(t);
}
