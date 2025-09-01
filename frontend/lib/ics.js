/* BPApp – ICS bulk (stub di compatibilità)
   NOTA: abbiamo deciso di usare solo l'export del singolo appuntamento.
   Questo file evita errori se il codice storico chiama funzioni "bulk".
   Non genera nulla; logga un warning.
   In futuro, si può eventualmente delegare a BP.ICS.downloadIcsForAppointment.
*/
(function () {
  const NS = (window.BP = window.BP || {});
  const ICS = (NS.ICS = NS.ICS || {});

  function warn(name) {
    try {
      console.warn("[BP ICS bulk disabled] chiamata a:", name);
    } catch (_) {}
  }

  // API storiche (stub)
  ICS.createCalendarForRange = function /* (fromDate, toDate, appointments) */ () {
    warn("createCalendarForRange()");
    return null;
  };

  ICS.downloadForRange = function /* (fromDate, toDate, appointments) */ () {
    warn("downloadForRange()");
    return false;
  };

  // Facile estensione futura:
  // se mai servisse creare più VEVENT, si può importare BP.ICS.makeIcsForAppointment
  // e concatenare più VEVENT in un'unica VCALENDAR qui.
})();
