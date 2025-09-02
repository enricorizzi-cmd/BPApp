// globals-polyfills.js — poly riutilizzabili a livello globale

function effectivePeriodType(gran){
  if(!gran) return '';
  gran = String(gran).toLowerCase();
  return (gran === 'ytd' || gran === 'ltm') ? 'mensile' : gran;
}

function isoWeekNum(d){
  var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return Math.ceil((((date - yearStart) / 86400000) + 1)/7);
}

// Attach to window if not already defined (browser)
if (typeof window !== 'undefined'){
  if (typeof window.effectivePeriodType !== 'function'){
    window.effectivePeriodType = effectivePeriodType;
  }
  if (typeof window.isoWeekNum !== 'function'){
    window.isoWeekNum = isoWeekNum;
  }
}

// (No module exports when used in-browser via classic <script>)

