export function htmlEscape(s){
  return String(s).replace(/[&<>'"]/g,function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[c];
  });
}

export function fmtEuro(n){ const v=Number(n)||0; return v.toLocaleString('it-IT')+'€'; }
export function fmtInt(n){ const v=Number(n)||0; return String(Math.round(v)); }
export function domFromHTML(h){ const t=document.createElement('div'); t.innerHTML=h; return t.firstElementChild; }
