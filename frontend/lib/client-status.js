/* BPApp – Client Status helpers
   Banner "È diventato cliente?" (solo per appuntamenti NNCF = true).
   Mostra scelta Sì/No e aggiorna lo status del cliente.
   - Visualizzazione indipendente dai tuoi toast standard (non li sovrascrive)
   - Usa solo il database per tracciare le risposte ai banner
   API:
     BP.ClientStatus.renderBecameClientBanner({ appointment, clientName }, onChoice)
     BP.ClientStatus.setClientStatus({ clientId, status })
     BP.ClientStatus.setClientStatusByName({ clientName, status })
*/
(function () {
  const NS = (window.BP = window.BP || {});
  const CS = (NS.ClientStatus = NS.ClientStatus || {});

  // Funzioni rimosse: ora si usa solo il database per tracciare le risposte ai banner

  // REST helpers
  async function apiGET(url) {
    const token = (window.authToken || "");
    const r = await fetch(url, { headers: token ? { Authorization: "Bearer " + token } : {} });
    if (!r.ok) throw new Error("GET " + url + " failed");
    return r.json();
  }
  async function apiPOST(url, body) {
    const token = (window.authToken || "");
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error("POST " + url + " failed");
    return r.json();
  }

  // Aggiorna status cliente per ID
  async function setClientStatus({ clientId, status }) {
    if (!clientId) throw new Error("missing clientId");
    return apiPOST("/api/clients", { id: clientId, status: String(status || "") });
  }
// Update stato cercando il cliente per NOME (case-insensitive)
async function setClientStatusByName({ clientName, status }) {
  const token = (window.authToken || "");
  const list = await fetch("/api/clients", {
    method: "GET",
    headers: { "Authorization": "Bearer "+token }
  }).then(r=>r.json()).catch(()=>({clients:[]}));
  const key = String(clientName||"").trim().toLowerCase();
  const found = (list.clients||[]).find(c => String(c.name||"").trim().toLowerCase() === key);
  if (!found) throw new Error("client not found by name");
  return setClientStatus({ clientId: found.id, status });
}

CS.setClientStatusByName = setClientStatusByName;

  // Aggiorna status cliente cercando per NOME (case-insensitive).
  // Se non esiste, lo CREA con quel nome e poi aggiorna lo status.
  async function setClientStatusByName({ clientName, status }) {
    const name = String(clientName || "").trim();
    if (!name) throw new Error("missing clientName");
    const all = await apiGET("/api/clients");
    const found = (all.clients || []).find((c) => String(c.name || "").toLowerCase() === name.toLowerCase());
    if (found) return setClientStatus({ clientId: found.id, status });
    // crea e poi aggiorna
    await apiPOST("/api/clients", { name });
    const all2 = await apiGET("/api/clients");
    const f2 = (all2.clients || []).find((c) => String(c.name || "").toLowerCase() === name.toLowerCase());
    if (!f2) throw new Error("client creation failed");
    return setClientStatus({ clientId: f2.id, status });
  }

  // Banner UI (ritorna un nodo; chi lo chiama può appendere/remove)
  function renderBanner({ appointment, clientName }, onChoice) {
    const appt = appointment || {};
    const cname = clientName || appt.client || "Cliente";

    const el = document.createElement("div");
    el.className = "bp-banner-client";
    el.innerHTML = `
      <div class="bp-banner-inner">
        <div class="bp-banner-title">È diventato cliente?</div>
        <div class="bp-banner-sub">Appuntamento con <b>${escapeHtml(cname)}</b></div>
        <div class="bp-banner-actions">
          <button type="button" data-yes>Sì</button>
          <button type="button" class="ghost" data-no>No</button>
        </div>
      </div>
    `;
    el.querySelector("[data-yes]").addEventListener("click", () => onChoice && onChoice(true, appt));
    el.querySelector("[data-no]").addEventListener("click", () => onChoice && onChoice(false, appt));
    return el;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Stili minimi (una sola iniezione)
  (function injectCSSOnce() {
    if (document.getElementById("bp-clientstatus-css")) return;
    const css = `
.bp-banner-client{
  position: fixed; left:50%; transform:translateX(-50%);
  top: 70px; z-index: 1200;
  background: rgba(20,24,34,.95);
  color: #fff;
  border: 1px solid rgba(255,255,255,.18);
  box-shadow: 0 10px 24px rgba(0,0,0,.35);
  border-radius:14px; padding:10px; min-width:280px;
  animation: bpBannerPop .18s ease-out;
}
.bp-banner-inner{ display:flex; flex-direction:column; gap:6px; }
.bp-banner-title{ font-weight:800; }
.bp-banner-sub{ font-size:12px; opacity:.92; }
.bp-banner-actions{ display:flex; gap:8px; margin-top:6px; justify-content:flex-end; }
@keyframes bpBannerPop{ from{ transform:translate(-50%, -6px); opacity:0 } to{ transform:translate(-50%, 0); opacity:1 } }
`;

    const style = document.createElement("style");
    style.id = "bp-clientstatus-css";
    style.textContent = css;
    document.head.appendChild(style);
  })();

  // API
  CS.renderBecameClientBanner = renderBanner;
  CS.setClientStatus = setClientStatus;
  CS.setClientStatusByName = setClientStatusByName;
})();
