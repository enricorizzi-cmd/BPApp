export function toast(msg){
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function(){ try{ t.remove(); }catch(e){} }, 2200);
}

export function celebrate(){
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
  setTimeout(function(){ try{ c.remove(); }catch(e){} }, 2500);
}

export function htmlEscape(s){
  return String(s).replace(/[&<>'"]/g,function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[c];
  });
}
export function fmtEuro(n){ const v=Number(n)||0; return v.toLocaleString('it-IT')+'€'; }
export function fmtInt(n){ const v=Number(n)||0; return String(Math.round(v)); }
export function domFromHTML(h){ const t=document.createElement('div'); t.innerHTML=h; return t.firstElementChild; }
