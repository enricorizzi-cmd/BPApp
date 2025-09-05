let container;
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
  msg.textContent = 'Aggiungi questa pagina alla schermata Home per avere la tua app';
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
