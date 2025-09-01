/* BPApp – Clients helpers
   - Calcolo "ultimo appuntamento" per cliente
   - Filtri per stato e consulente (id o nome)
   Nota: match cliente per "nome" (case-insensitive)
*/
(function () {
  const NS = (window.BP = window.BP || {});
  const CH = (NS.ClientsHelpers = NS.ClientsHelpers || {});

  function norm(s){ return String(s||"").trim().toLowerCase(); }

  // { clientNameLower: ISODateMax }
  function mapLastAppointments(appointments) {
    const out = {};
    (appointments||[]).forEach(a=>{
      const key = norm(a.client);
      if(!key) return;
      const d = a.start || a.end;
      if(!d) return;
      const cur = out[key];
      if(!cur || new Date(d) > new Date(cur)) out[key] = d;
    });
    return out;
  }

  // restituisce clienti con "lastAppointment"
  function withLastAppointment(clients, appointments) {
    const map = mapLastAppointments(appointments);
    return (clients||[]).map(c=>{
      const last = map[norm(c.name)] || null;
      return { ...c, lastAppointment: last };
    });
  }

  // filtro per stato + consulente (id o nome)
function filterClients(clients, { status, consultantId, consultantName }) {
  const norm = s => String(s||"").trim().toLowerCase();
  const canon = s => {
    const x = norm(s).replace(/\s+/g, "_").replace(/-/g, "_");
    if (x === "lead_non_chiuso") return "lead_non_chiuso";
    if (x === "lead_non-chiuso") return "lead_non_chiuso";
    return x;
  };

  let rows = clients || [];
  if (status && status !== "tutti") {
    rows = rows.filter(c => canon(c.status) === canon(status));
  }
  if (consultantId) {
    rows = rows.filter(c => (c.consultantId || "") === String(consultantId));
  } else if (consultantName) {
    const k = norm(consultantName);
    rows = rows.filter(c => norm(c.consultantName) === k);
  }
  return rows;
}


  CH.withLastAppointment = withLastAppointment;
  CH.filter = filterClients;
})();
