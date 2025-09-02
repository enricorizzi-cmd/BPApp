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

export function toast(msg){
  const c = getContainer();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role','alert');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(function(){
    try{ t.remove(); if(!c.children.length){ c.remove(); container=null; } }
    catch{ /* ignore */ }
  }, 2200);
}

export function celebrate(){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('div');
  c.className = 'confetti';
  document.body.appendChild(c);
  for (let i=0;i<26;i++){
    const s = document.createElement('span');
    s.style.position='absolute';
    s.style.left = (2+i*4)+'%';
    s.style.top='0';
    s.style.width='6px';
    s.style.height='10px';
    s.style.background='hsl('+(i*14)+',90%,60%)';
    s.style.opacity='0.95';
    c.appendChild(s);
    (function(el,delay){
      setTimeout(function(){
        if(!el.animate) return;
        el.animate(
          [{transform:'translateY(-20px) rotate(0deg)'},
           {transform:'translateY(110vh) rotate(540deg)'}],
          {duration:1200+Math.random()*800, easing:'cubic-bezier(.2,.6,.2,1)'}
        );
      }, delay);
    })(s, i*35);
  }
  setTimeout(function(){ try{ c.remove(); }catch{ /* ignore */ } }, 2500);
}
