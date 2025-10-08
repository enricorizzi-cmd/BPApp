export function injectMobileDrawerCSS(){
  if (document.getElementById('bp-mobile-drawer-fix')) return;
  const css = `
  @media (max-width:980px){
    .topbar{
      background: rgba(20,24,34,.90) !important;
      border-bottom: 1px solid rgba(255,255,255,.08) !important;
      z-index: 70 !important; /* Assicura che la topbar sia sopra il drawer */
    }
    .drawer{
      background: rgba(20,24,34,.96) !important;
      box-shadow: 14px 0 28px rgba(0,0,0,.45) !important;
      width: 86vw !important;
      height: 100vh !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      z-index: 60 !important;
      overflow: hidden !important; /* Container fisso, no scroll */
    }
    .drawer-scroll-container{
      height: 100% !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      -webkit-overflow-scrolling: touch !important;
      scroll-behavior: smooth !important;
      /* Performance ottimizzazioni */
      will-change: scroll-position !important;
      transform: translateZ(0) !important; /* Hardware acceleration */
      /* Scrollbar visibile */
      scrollbar-width: thin !important;
      scrollbar-color: rgba(255,255,255,0.3) transparent !important;
    }
    /* Webkit scrollbar styling */
    .drawer-scroll-container::-webkit-scrollbar {
      width: 6px !important;
    }
    .drawer-scroll-container::-webkit-scrollbar-track {
      background: transparent !important;
    }
    .drawer-scroll-container::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.3) !important;
      border-radius: 3px !important;
    }
    .drawer-scroll-container::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.5) !important;
    }
    
    /* Tabelle GI & Scadenzario - Scroll orizzontale mobile */
    .gi-card .table {
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
      scrollbar-width: thin !important;
      scrollbar-color: rgba(255,255,255,0.3) transparent !important;
    }
    .gi-card .table::-webkit-scrollbar {
      height: 6px !important;
    }
    .gi-card .table::-webkit-scrollbar-track {
      background: transparent !important;
    }
    .gi-card .table::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.3) !important;
      border-radius: 3px !important;
    }
    .gi-card .table::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.5) !important;
    }
    .gi-card .table table {
      min-width: 800px !important; /* Forza larghezza minima per scroll */
    }
    
    /* Tabella Forecast incassi - autosize colonne (Dark mode) */
    .gi-card .table table thead th:first-child {
      width: auto !important;
      min-width: 120px !important;
      max-width: 200px !important;
    }
    .gi-card .table table thead th:nth-child(2) {
      width: auto !important;
      min-width: 100px !important;
      max-width: 150px !important;
    }
    .gi-card .table table thead th:nth-child(3),
    .gi-card .table table thead th:nth-child(4) {
      width: auto !important;
      min-width: 80px !important;
      max-width: 120px !important;
    }
    
    /* Form GI mobile - posizionamento e autosize (Dark mode) */
    .gi-modal {
      top: 60px !important; /* Sotto l'intestazione */
      left: 0 !important;
      right: 0 !important;
      width: 100vw !important;
      max-width: 100vw !important;
      min-width: 100vw !important;
      height: calc(100vh - 60px) !important;
      max-height: calc(100vh - 60px) !important;
      margin: 0 !important;
      border-radius: 0 !important;
      position: fixed !important;
      z-index: 9999 !important;
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch !important;
    }
    .drawer-menu{ 
      display: flex !important;
      flex-direction: column !important;
      gap: 10px !important; 
      padding: 100px 16px 40px 16px !important; /* Top padding per compensare topbar + PWA */
      min-height: calc(100vh - 40px) !important; /* Assicura scroll se necessario */
    }
    .drawer button{
      background: rgba(255,255,255,.10) !important;
      border: 1px solid rgba(255,255,255,.22) !important;
      color: #fff !important;
      padding: 12px 14px !important;
      font-weight: 700 !important;
      border-radius: 12px !important;
      -webkit-tap-highlight-color: transparent;
    }
    .drawer button:hover{
      background: rgba(255,255,255,.14) !important;
      border-color: rgba(255,255,255,.30) !important;
    }
    .drawer button.ghost{
      background: rgba(255,255,255,.10) !important;
      box-shadow: none !important;
    }
    .hamb{
      z-index: 80 !important; /* Assicura che l'hamburger sia sempre cliccabile */
      position: relative !important;
    }
    /* Previeni scroll del body quando drawer è aperto */
    body.drawer-open{
      overflow: hidden !important;
      position: fixed !important;
      width: 100% !important;
    }
  }`;
  const s = document.createElement('style');
  s.id = 'bp-mobile-drawer-fix';
  s.textContent = css;
  document.head.appendChild(s);
}

export function injectMobileLightModeCSS(){
  if (document.getElementById('bp-mobile-light-fix')) return;
  const css = `
    @media (max-width:980px) and (prefers-color-scheme: light){
      .topbar{
        background:#fff !important;
        border-bottom:1px solid rgba(0,0,0,.08) !important;
        box-shadow:none !important;
      }
      .topbar .brand .logo{
        color:#0f172a !important;
        font-weight:900 !important;
        letter-spacing:.4px;
        text-shadow:none !important;
        opacity:1 !important;
      }
      .topbar .hamb span{ background:#0f172a !important; }
      .card{
        background:#fff !important;
        background-image:none !important;
        box-shadow:none !important;
      }
      .drawer{
        background:#fff !important;
        box-shadow:14px 0 28px rgba(0,0,0,.10) !important;
        height: 100vh !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        z-index: 60 !important;
        overflow: hidden !important;
      }
      .drawer-scroll-container{
        height: 100% !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        -webkit-overflow-scrolling: touch !important;
        scroll-behavior: smooth !important;
        will-change: scroll-position !important;
        transform: translateZ(0) !important;
        scrollbar-width: thin !important;
        scrollbar-color: rgba(0,0,0,0.3) transparent !important;
      }
      .drawer-scroll-container::-webkit-scrollbar {
        width: 6px !important;
      }
      .drawer-scroll-container::-webkit-scrollbar-track {
        background: transparent !important;
      }
      .drawer-scroll-container::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,0.3) !important;
        border-radius: 3px !important;
      }
      .drawer-scroll-container::-webkit-scrollbar-thumb:hover {
        background: rgba(0,0,0,0.5) !important;
      }
      
      /* Tabelle GI & Scadenzario - Scroll orizzontale mobile (Light mode) */
      .gi-card .table {
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
        scrollbar-width: thin !important;
        scrollbar-color: rgba(0,0,0,0.3) transparent !important;
      }
      .gi-card .table::-webkit-scrollbar {
        height: 6px !important;
      }
      .gi-card .table::-webkit-scrollbar-track {
        background: transparent !important;
      }
      .gi-card .table::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,0.3) !important;
        border-radius: 3px !important;
      }
      .gi-card .table::-webkit-scrollbar-thumb:hover {
        background: rgba(0,0,0,0.5) !important;
      }
      .gi-card .table table {
        min-width: 800px !important; /* Forza larghezza minima per scroll */
      }
      
      /* Tabella Forecast incassi - autosize colonne */
      .gi-card .table table thead th:first-child {
        width: auto !important;
        min-width: 120px !important;
        max-width: 200px !important;
      }
      .gi-card .table table thead th:nth-child(2) {
        width: auto !important;
        min-width: 100px !important;
        max-width: 150px !important;
      }
      .gi-card .table table thead th:nth-child(3),
      .gi-card .table table thead th:nth-child(4) {
        width: auto !important;
        min-width: 80px !important;
        max-width: 120px !important;
      }
      
      /* Form GI mobile - posizionamento e autosize */
      .gi-modal {
        top: 60px !important; /* Sotto l'intestazione */
        left: 0 !important;
        right: 0 !important;
        width: 100vw !important;
        max-width: 100vw !important;
        min-width: 100vw !important;
        height: calc(100vh - 60px) !important;
        max-height: calc(100vh - 60px) !important;
        margin: 0 !important;
        border-radius: 0 !important;
        position: fixed !important;
        z-index: 9999 !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch !important;
      }
      .drawer-menu{
        display: flex !important;
        flex-direction: column !important;
        gap: 10px !important;
        padding: 100px 16px 40px 16px !important; /* Top padding per compensare topbar + PWA */
        min-height: calc(100vh - 40px) !important;
      }
      .drawer button{
        color:#0f172a !important;
        background:rgba(0,0,0,.04) !important;
        border:1px solid rgba(0,0,0,.12) !important;
      }
      .drawer button:hover{
        background:rgba(0,0,0,.08) !important;
      }
    }
  `;
  const s=document.createElement('style');
  s.id='bp-mobile-light-fix';
  s.textContent=css;
  document.head.appendChild(s);
}

export function injectLightBadgesCSS(){
  if (document.getElementById('bp-badge-light-css')) return;
  const css = `
    @media (prefers-color-scheme: light){
      .badge{
        background: linear-gradient(180deg, #eef2ff, #f8fafc) !important;
        border: 1px solid #c7d2fe !important;
        color: #0f172a !important;
        font-weight: 700 !important;
        padding: 6px 10px !important;
        border-radius: 9999px !important;
        letter-spacing: .2px !important;
        box-shadow: 0 1px 0 rgba(15,23,42,.05) inset !important;
      }
      .chip, .tag{
        background: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
        color: #0f172a !important;
        font-weight: 600 !important;
        border-radius: 9999px !important;
      }
      .card .badge{
        background: #fff !important;
      }
    }
  `;
  const s = document.createElement('style');
  s.id = 'bp-badge-light-css';
  s.textContent = css;
  document.head.appendChild(s);
}

export function injectSummaryClickableCSS(){
  if (document.getElementById('bp-summary-css')) return;
  const css = `
    summary{ cursor:pointer; padding:4px 0; }
  `;
  const s = document.createElement('style');
  s.id = 'bp-summary-css';
  s.textContent = css;
  document.head.appendChild(s);
}
