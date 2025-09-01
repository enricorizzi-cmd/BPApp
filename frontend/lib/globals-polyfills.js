// globals-polyfills.js — poly riutilizzabili a livello globale
(function(){
  if (typeof window.effectivePeriodType !== 'function'){
    window.effectivePeriodType = function(gran){
      if(!gran) return '';
      gran = String(gran).toLowerCase();
      return (gran === 'ytd' || gran === 'ltm') ? 'mensile' : gran;
    };
  }
  if (typeof window.isoWeekNum !== 'function'){
    window.isoWeekNum = function(d){
      var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      var dayNum = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - dayNum);
      var yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
      return Math.ceil((((date - yearStart) / 86400000) + 1)/7);
    };
  }
})();