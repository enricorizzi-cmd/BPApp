/* BPApp – ICS single appointment helper
   Genera e scarica un .ics per UNA singola card appuntamento (client-side).
   API:
     BP.ICS.makeIcsForAppointment(appt)
     BP.ICS.downloadIcsForAppointment(appt)
   appt atteso:
     { id, client, start, end, type, notes, vss, vsdPersonal }
     start/end: "YYYY-MM-DDTHH:MM" (locale)
*/
// logger is loaded globally via index.html

/* global logger */
(function () {
  const NS = (window.BP = window.BP || {});
  const ICS = (NS.ICS = NS.ICS || {});

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  // Stringa data -> "YYYYMMDDTHHMMSSZ" (UTC), robusta con ISO + timezone
  function toIcsUtc(str) {
    if (!str) return "";
    // Se contiene 'Z' o offset +HH:MM/-HH:MM, è già ISO con timezone
    if (/[Zz]|[+\-]\d{2}:\d{2}$/.test(String(str))) {
     return new Date(str).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z").slice(0,15)+"Z";
    }
   // Altrimenti: "YYYY-MM-DDTHH:MM" locale
    const [date, time="00:00"] = String(str).split("T");
    const [Y,M,D] = date.split("-").map(Number);
    const [h,m]   = time.split(":").map(Number);
    const d = new Date(Y, M-1, D, h, m, 0, 0);
    return d.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z").slice(0,15)+"Z";
  }

  function escapeText(s) {
    return (s || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }

  function foldLine(line) {
    // line folding (75 bytes consigliati); qui semplice spezzatura a 74 char
    const max = 74;
    if (line.length <= max) return [line];
    const parts = [];
    let i = 0;
    while (i < line.length) {
      const chunk = line.slice(i, i + max);
      parts.push(i === 0 ? chunk : " " + chunk);
      i += max;
    }
    return parts;
  }

  function buildIcs(appt) {
    const uid = ((appt && appt.id) || "bp-" + Date.now()) + "@bpapp";
    const title = appt && appt.client ? "Appuntamento · " + appt.client : "Appuntamento";
    const dtStart = toIcsUtc(appt && appt.start);
    const dtEnd = toIcsUtc(appt && appt.end);
    const dtStamp = toIcsUtc(new Date().toISOString().slice(0, 16));

    const descParts = [];
    if (appt && appt.type) descParts.push("Tipo: " + appt.type);
    if (appt && appt.vss) descParts.push("VSS: " + appt.vss);
    if (appt && appt.vsdPersonal) descParts.push("VSD Personale: " + appt.vsdPersonal);
    if (appt && appt.notes) descParts.push("Note: " + appt.notes);
    const description = escapeText(descParts.join("\n"));

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//BPApp//Calendario//IT",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + dtStamp,
      dtStart ? "DTSTART:" + dtStart : "",
      dtEnd ? "DTEND:" + dtEnd : "",
      "SUMMARY:" + escapeText(title),
      description ? "DESCRIPTION:" + description : "",
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean);

    // fold lines dove necessario
    const out = [];
    lines.forEach((ln) => out.push.apply(out, foldLine(ln)));
    return out.join("\r\n");
  }

  function isSafariLike(){
    try {
      const ua = navigator.userAgent || navigator.vendor || "";
      const isIOS = /iP(ad|hone|od)/.test(ua);
      const isSafari = /^((?!chrome|android|crios|fxios|edgi).)*safari/i.test(ua);
      return isIOS || isSafari;
    } catch(_) { return false; }
  }

  function downloadIcs(appt) {
    try {
      const ics = buildIcs(appt);
      const nDate = (appt && appt.start ? String(appt.start).split("T")[0] : "evento");
      const nameSafe = ((appt && appt.client) || "appuntamento").trim().replace(/[^\w\-]+/g, "_").slice(0, 40);
      const fname = `bp_${nameSafe}_${nDate}.ics`;

      // Safari/iOS: anchor download on Blob is unreliable. Use data: fallback/new tab.
      if (isSafariLike()) {
        try {
          const dataUrl = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
          const a = document.createElement("a");
          a.href = dataUrl;
          a.setAttribute("target", "_blank");
          // 'download' may be ignored by Safari, but harmless
          a.setAttribute("download", fname);
          document.body.appendChild(a);
          a.click();
          a.remove();
          return true;
        } catch (e1) {
          try {
            // Last resort: navigate current tab
            window.location.assign("data:text/calendar;charset=utf-8," + encodeURIComponent(ics));
            return true;
          } catch (e2) {
            try { logger.error(e2); } catch(_) {}
            return false;
          }
        }
      }

      // Default path: Blob + download works across modern browsers
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { URL.revokeObjectURL(a.href); } catch(_) {}
        a.remove();
      }, 50);
      return true;
    } catch (err) {
      try { logger.error(err); } catch(_) {}
      return false;
    }
  }

  ICS.makeIcsForAppointment = buildIcs;
  ICS.downloadIcsForAppointment = downloadIcs;

  // --- shim legacy (compatibilità con vecchie chiamate, in esecuzione transitoria) ---
  window.icsFromAppt = window.icsFromAppt || function(appt){ return buildIcs(appt); };
  window.downloadICS = window.downloadICS || function(filename, icsText){
    try{
      var name = (window.__icsSanitize ? __icsSanitize(filename) : (filename||'evento'));
      if (!/\.ics$/i.test(name)) name += '.ics';
      var blob = new Blob([icsText], { type:'text/calendar;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 50);
    }catch(e){ logger.error(e); }
  };
})();
