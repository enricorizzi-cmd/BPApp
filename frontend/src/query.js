export function $1(sel){ return document.querySelector(sel); }
export function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

export function getQuery(){
  const out = {};
  const s = (location.search||'').replace(/^\?/, '');
  if(!s) return out;
  const parts = s.split('&');
  for(let i=0;i<parts.length;i++){
    const p = parts[i]; if(!p) continue;
    const idx = p.indexOf('=');
    if(idx===-1){ out[decodeURIComponent(p)]=''; continue; }
    const k = decodeURIComponent(p.slice(0,idx));
    const v = decodeURIComponent(p.slice(idx+1));
    if(out[k] != null){
      if(Array.isArray(out[k])) out[k].push(v);
      else out[k] = [out[k], v];
    } else {
      out[k] = v;
    }
  }
  return out;
}
