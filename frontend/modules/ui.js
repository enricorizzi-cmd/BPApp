import { getUser } from '../src/auth.js';
import { injectLightBadgesCSS, injectMobileDrawerCSS, injectMobileLightModeCSS, injectSummaryClickableCSS } from '../src/mobileStyles.js';

export function topbarHTML(){
  const u = getUser();
  if(!u) return '';
  const isAdmin = (u.role==='admin');

  const drawer =
    '<div id="drawer" class="drawer" role="dialog" aria-modal="true" aria-label="Menu">'+
      '<div class="drawer-scroll-container">'+
        '<div class="drawer-menu">'+
          '<button class="ghost" onclick="viewHome();toggleDrawer(false)">Dashboard</button>'+
          '<button class="ghost" onclick="viewCalendar();toggleDrawer(false)">Calendario</button>'+
          '<button class="ghost" onclick="viewPeriods();toggleDrawer(false)">BP</button>'+
          '<button class="ghost" onclick="viewAppointments();toggleDrawer(false)">Appuntamenti</button>'+
          '<button class="ghost" onclick="viewOpenCycles();toggleDrawer(false)">Cicli Aperti</button>'+
          '<button class="ghost" onclick="viewLeaderboard();toggleDrawer(false)">Classifiche</button>'+
          '<button class="ghost" onclick="viewCommissions();toggleDrawer(false)">Provvigioni</button>'+
          '<button class="ghost" onclick="viewVenditeRiordini();toggleDrawer(false)">Vendite e Riordini</button>'+
          '<button class="ghost" onclick="viewCorsiInteraziendali();toggleDrawer(false)">Corsi Interaziendali</button>'+
          '<button class="ghost" onclick="viewGI();toggleDrawer(false)">GI &amp; Scadenzario</button>'+
          '<button class="ghost" onclick="viewReport();toggleDrawer(false)">Report</button>'+
          '<button class="ghost" onclick="viewClients();toggleDrawer(false)">Clienti</button>'+
          '<button class="ghost" onclick="viewTeam();toggleDrawer(false)">Squadra</button>'+
          (isAdmin? '<button class="ghost" onclick="viewUsers();toggleDrawer(false)">Utenti</button>' : '')+
          (isAdmin? '<button class="ghost" onclick="viewSettings();toggleDrawer(false)">Impostazioni</button>' : '')+
          '<button class="ghost" id="install-app-button-mobile" onclick="installApp();toggleDrawer(false)" style="display: none;">📱 Installa App</button>'+
          '<button onclick="logout()">Logout</button>'+
        '</div>'+
      '</div>'+
    '</div>';

  // Menu items con icone
  const menuItems = [
    { icon: '🏠', text: 'Dashboard', onclick: 'viewHome()' },
    { icon: '📅', text: 'Calendario', onclick: 'viewCalendar()' },
    { icon: '📊', text: 'BP', onclick: 'viewPeriods()' },
    { icon: '👥', text: 'Appuntamenti', onclick: 'viewAppointments()' },
    { icon: '🔄', text: 'Cicli Aperti', onclick: 'viewOpenCycles()' },
    { icon: '🏆', text: 'Classifiche', onclick: 'viewLeaderboard()' },
    { icon: '💰', text: 'Provvigioni', onclick: 'viewCommissions()' },
    { icon: '🛒', text: 'Vendite e Riordini', onclick: 'viewVenditeRiordini()' },
    { icon: '🎓', text: 'Corsi Interaziendali', onclick: 'viewCorsiInteraziendali()' },
    { icon: '📋', text: 'GI & Scadenzario', onclick: 'viewGI()' },
    { icon: '📈', text: 'Report', onclick: 'viewReport()' },
    { icon: '👤', text: 'Clienti', onclick: 'viewClients()' },
    { icon: '👥', text: 'Squadra', onclick: 'viewTeam()' }
  ];
  
  if (isAdmin) {
    menuItems.push({ icon: '⚙️', text: 'Utenti', onclick: 'viewUsers()' });
    menuItems.push({ icon: '🔧', text: 'Impostazioni', onclick: 'viewSettings()' });
  }

  // Sidebar per desktop
  const sidebar = `
    <div id="sidebar" class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">BATTLE PLAN</div>
        <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Comprimi/Espandi sidebar">
          <span class="sidebar-toggle-icon">◀</span>
        </button>
      </div>
      <div class="sidebar-logo-container">
        <img src="/logo-azienda.jpg" alt="Logo Azienda" class="company-logo">
      </div>
      <nav class="sidebar-nav">
        ${menuItems.map(item => `
          <button class="sidebar-item" onclick="${item.onclick}" title="${item.text}">
            <span class="sidebar-icon">${item.icon}</span>
            <span class="sidebar-text">${item.text}</span>
          </button>
        `).join('')}
        <button class="sidebar-item sidebar-install" id="install-app-button" onclick="installApp()" title="Installa App" style="display: none;">
          <span class="sidebar-icon">📱</span>
          <span class="sidebar-text">Installa App</span>
        </button>
        <button class="sidebar-item sidebar-logout" onclick="logout()" title="Logout">
          <span class="sidebar-icon">🚪</span>
          <span class="sidebar-text">Logout</span>
        </button>
      </nav>
    </div>
  `;

  // Topbar per mobile (mantenuta)
  const topbar = ''+
    '<div class="topbar">'+
      '<div class="brand">'+
        '<button class="hamb" id="hamb" aria-label="Apri menu" aria-controls="drawer" aria-expanded="false"><span></span><span></span><span></span></button>'+
        '<div class="logo">BATTLE PLAN</div>'+
      '</div>'+
      '<img src="/logo-azienda.jpg" alt="Logo Azienda" class="mobile-company-logo">'+
     '<div class="nav right">'+
  '<button class="ghost" onclick="viewHome()">Dashboard</button>'+
  '<button class="ghost" onclick="viewCalendar()">Calendario</button>'+
  '<button class="ghost" onclick="viewPeriods()">BP</button>'+
  '<button class="ghost" onclick="viewAppointments()">Appuntamenti</button>'+
  '<button class="ghost" onclick="viewLeaderboard()">Classifiche</button>'+
  '<button class="ghost" onclick="viewCommissions()">Provvigioni</button>'+
  '<button class="ghost" onclick="viewVenditeRiordini()">Vendite e Riordini</button>'+
  '<button class="ghost" onclick="viewCorsiInteraziendali()">Corsi Interaziendali</button>'+
  '<button class="ghost" onclick="viewGI()">GI &amp; Scadenzario</button>'+
  '<button class="ghost" onclick="viewReport()">Report</button>'+
  '<button class="ghost" onclick="viewClients()">Clienti</button>'+
  '<button class="ghost" onclick="viewTeam()">Squadra</button>'+
  (isAdmin? '<button class="ghost" onclick="viewUsers()">Utenti</button>':'' )+
  (isAdmin? '<button class="ghost" onclick="viewSettings()">Impostazioni</button>':'' )+
  '<button class="ghost" id="install-app-button-topbar" onclick="installApp()" style="display: none;">📱 Installa App</button>'+
  '<button onclick="logout()">Logout</button>'+
'</div>'+

    '</div>';

  return sidebar + topbar + drawer;
}

// Inietta CSS per il logo aziendale
function injectCompanyLogoCSS() {
  if (document.getElementById('company-logo-css')) return; // Già iniettato
  
  const css = `
    <style id="company-logo-css">
      /* Logo aziendale nella sidebar desktop */
      .sidebar-logo-container {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 15px 10px;
        margin-bottom: 10px;
      }
      
      .company-logo {
        width: 100%;
        max-width: 200px;
        max-height: 80px;
        height: auto;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      
      /* Logo aziendale nella topbar mobile */
      .mobile-company-logo {
        max-width: 40px;
        max-height: 30px;
        width: auto;
        height: auto;
        object-fit: contain;
        margin-left: auto;
        border-radius: 4px;
        display: none; /* Nascosto di default */
      }
      
      /* Responsive adjustments */
      @media (max-width: 768px) {
        .sidebar-logo-container {
          display: none; /* Nascondi nella sidebar mobile */
        }
        
        .mobile-company-logo {
          display: block !important;
        }
      }
      
      @media (min-width: 769px) {
        .mobile-company-logo {
          display: none; /* Nascondi nella topbar desktop */
        }
        
        .sidebar-logo-container {
          display: flex;
        }
      }
    </style>
  `;
  
  document.head.insertAdjacentHTML('beforeend', css);
}

function injectSidebarCSS(){
  if(!document.getElementById('bp_sidebar_css')){
    const css = `
      /* Sidebar per desktop */
      @media (min-width: 1024px) {
        .sidebar {
          position: fixed;
          left: 0;
          top: 0;
          height: 100vh;
          width: 280px;
          background: var(--card);
          border-right: 1px solid var(--hair2);
          z-index: 1000;
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
        }
        
        .sidebar.collapsed {
          width: 80px;
        }
        
        .sidebar-header {
          padding: 20px;
          border-bottom: 1px solid var(--hair2);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .sidebar-logo {
          font-size: 18px;
          font-weight: 800;
          color: var(--text);
          transition: opacity 0.3s ease;
        }
        
        .sidebar.collapsed .sidebar-logo {
          opacity: 0;
        }
        
        .sidebar-toggle {
          background: var(--card-soft);
          border: 1px solid var(--hair2);
          border-radius: 8px;
          padding: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--text);
        }
        
        .sidebar-toggle:hover {
          background: var(--accent);
          border-color: var(--accent);
          color: #fff;
        }
        
        .sidebar-toggle-icon {
          transition: transform 0.3s ease;
          font-size: 12px;
        }
        
        .sidebar.collapsed .sidebar-toggle-icon {
          transform: rotate(180deg);
        }
        
        .sidebar-xp {
          padding: 16px 20px;
          border-bottom: 1px solid var(--hair2);
          text-align: center;
          transition: opacity 0.3s ease;
        }
        
        .sidebar.collapsed .sidebar-xp {
          opacity: 0;
        }
        
        .sidebar-nav {
          flex: 1;
          padding: 16px 0;
          overflow-y: auto;
        }
        
        .sidebar-item {
          width: 100%;
          padding: 12px 20px;
          background: transparent;
          border: none;
          color: var(--text);
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 12px;
          text-align: left;
          font-size: 14px;
          border-radius: 0;
        }
        
        .sidebar-item:hover {
          background: var(--accent);
          color: #fff;
        }
        
        .sidebar-item.active {
          background: var(--accent);
          color: #fff;
          font-weight: 600;
        }
        
        .sidebar-icon {
          font-size: 18px;
          width: 24px;
          text-align: center;
          flex-shrink: 0;
        }
        
        .sidebar-text {
          transition: opacity 0.3s ease;
          white-space: nowrap;
        }
        
        .sidebar.collapsed .sidebar-text {
          opacity: 0;
        }
        
        .sidebar-logout {
          border-top: 1px solid var(--hair2);
          margin-top: auto;
          background: transparent;
        }
        
        .sidebar-install {
          border-top: 1px solid var(--hair2);
          background: transparent;
        }
        
        .sidebar-install:hover {
          background: var(--accent);
          color: #fff;
        }
        
        .sidebar-logout {
          border-top: 1px solid var(--hair2);
          margin-top: auto;
          background: transparent;
        }
        
        .sidebar-logout:hover {
          background: var(--danger);
          color: #fff;
        }
        
        /* Nascondi topbar su desktop */
        .topbar {
          display: none;
        }
        
        /* Aggiusta contenuto principale */
        body.sidebar-expanded {
          margin-left: 280px;
          transition: margin-left 0.3s ease;
        }
        
        body.sidebar-collapsed {
          margin-left: 80px;
          transition: margin-left 0.3s ease;
        }
      }
      
      /* Mobile: nascondi sidebar, mostra topbar */
      @media (max-width: 1023px) {
        .sidebar {
          display: none;
        }
        
        .topbar {
          display: flex;
        }
        
        body {
          margin-left: 0;
        }
      }
      
      /* Contrasto topbar mobile */
      @media (max-width: 1023px) {
        .topbar .nav .ghost{
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.18);
        }
        .topbar .nav .ghost:hover{
          background: rgba(255,255,255,.12);
        }
      }
    `;
    const st=document.createElement('style'); st.id='bp_sidebar_css'; st.textContent=css;
    document.head.appendChild(st);
  }

}

function injectUnifiedFiltersCSS(){
  if(!document.getElementById('bp-unified-filters-css')){
    const css = `
      /* Nested inputs align in two columns inside unified filters */
      .uf .row .row{ display:grid; grid-template-columns: 1fr 1fr; gap:8px; }

      @media (max-width: 980px){
        .uf input, .uf select{ min-width: 0; width: 100%; }
        .uf .row > div{ flex: 1 1 180px; min-width: 0; }

        /* Squadra admin bar: grid on small screens */
        #t_adminbar{ display:grid !important; grid-template-columns: 1fr 1fr; align-items:end; gap:10px; }
        #t_adminbar > div{ min-width: 0; }
        #t_adminbar .row{ display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
      }

      @media (max-width: 560px){
        #t_adminbar{ grid-template-columns: 1fr; }
      }
    `;
    const st=document.createElement('style'); st.id='bp-unified-filters-css'; st.textContent=css;
    document.head.appendChild(st);
  }
}

function setupEventListeners(){
  // Wiring interazioni
  const hamb = document.getElementById('hamb');
  if(hamb){
    hamb.onclick = function(){ toggleDrawer(); };
  }
  const drawer = document.getElementById('drawer');
  if(drawer){
    // Chiudi se clicchi sul background del drawer (non sui bottoni)
    drawer.addEventListener('click', function(e){
      if(e.target.id === 'drawer') toggleDrawer(false);
    });
  }

  // Toggle sidebar per desktop
  const sidebarToggle = document.getElementById('sidebar-toggle');
  if(sidebarToggle){
    sidebarToggle.onclick = function(){ toggleSidebar(); };
  }

  // Inizializza stato sidebar
  initSidebarState();

  // Listener per resize window
  window.addEventListener('resize', () => {
    if (window.innerWidth < 1024) {
      // Su mobile rimuovi classi sidebar
      document.body.classList.remove('sidebar-expanded', 'sidebar-collapsed');
    } else {
      // Su desktop ripristina stato sidebar
      const collapsed = localStorage.getItem('bp_sidebar_collapsed') === 'true';
      document.body.classList.remove('sidebar-expanded', 'sidebar-collapsed');
      document.body.classList.add(collapsed ? 'sidebar-collapsed' : 'sidebar-expanded');
    }
  });

  // Chiudi con ESC
  document.removeEventListener('keydown', onEscCloseDrawer, false);
  document.addEventListener('keydown', onEscCloseDrawer, false);
}

export function renderTopbar(){
  if(!getUser()) return;
  injectCompanyLogoCSS();
  injectSidebarCSS();
  injectUnifiedFiltersCSS();
  
  const appEl = document.getElementById('app');
  const tb = document.querySelector('.topbar');
  const html = topbarHTML();
  if(tb){ tb.outerHTML = html; } else if(appEl){ appEl.insertAdjacentHTML('afterbegin', html); }

  // Fix visivi mobile/light/badge (idempotenti)
  try{ injectMobileDrawerCSS(); }catch{ /* ignore */ }
  try{ injectMobileLightModeCSS(); }catch{ /* ignore */ }
  
  // Aggiorna la visibilità del pulsante installazione dopo il rendering
  try{ 
    import('./installPrompt.js').then(module => {
      module.updateInstallButtonVisibility();
    });
  }catch{ /* ignore */ }
  try{ injectLightBadgesCSS(); }catch{ /* ignore */ }
  try{ injectSummaryClickableCSS(); }catch{ /* ignore */ }
  
  setupEventListeners();
}

// NB: RINOMINATO (prima _onEscCloseDrawer) per evitare collisioni/duplicati
export function onEscCloseDrawer(e){
  if(e && e.key === 'Escape'){
    const d=document.getElementById('drawer');
    if(d && d.classList.contains('open')) toggleDrawer(false);
  }
}

export function toggleDrawer(force){
  const d=document.getElementById('drawer'); if(!d) return;
  const willOpen = (typeof force==='boolean') ? force : !d.classList.contains('open');
  d.classList.toggle('open', willOpen);

  // Aggiorna stato accessibilità e scroll background
  const hamb=document.getElementById('hamb');
  if(hamb){ hamb.setAttribute('aria-expanded', String(willOpen)); }
  
  // Previeni scroll del body quando drawer è aperto (mobile)
  if(window.innerWidth <= 980){
    document.body.classList.toggle('drawer-open', willOpen);
  }
}

let _tbTimer=null;
export function rerenderTopbarSoon(){ clearTimeout(_tbTimer); _tbTimer=setTimeout(renderTopbar,60); }

// Toggle sidebar per desktop
export function toggleSidebar(force){
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;
  
  const willCollapse = (typeof force==='boolean') ? force : !sidebar.classList.contains('collapsed');
  sidebar.classList.toggle('collapsed', willCollapse);
  
  // Aggiorna classi body per il margin
  if (window.innerWidth >= 1024) {
    document.body.classList.remove('sidebar-expanded', 'sidebar-collapsed');
    document.body.classList.add(willCollapse ? 'sidebar-collapsed' : 'sidebar-expanded');
  } else {
    // Su mobile rimuovi le classi
    document.body.classList.remove('sidebar-expanded', 'sidebar-collapsed');
  }
  
  // Salva stato in localStorage
  try {
    localStorage.setItem('bp_sidebar_collapsed', String(willCollapse));
  } catch {
    // Ignora errori localStorage
  }
}

// Inizializza stato sidebar da localStorage
export function initSidebarState(){
  try {
    const collapsed = localStorage.getItem('bp_sidebar_collapsed') === 'true';
    const sidebar = document.getElementById('sidebar');
    if(sidebar) {
      sidebar.classList.toggle('collapsed', collapsed);
      
      // Inizializza classi body
      if (window.innerWidth >= 1024) {
        document.body.classList.remove('sidebar-expanded', 'sidebar-collapsed');
        document.body.classList.add(collapsed ? 'sidebar-collapsed' : 'sidebar-expanded');
      } else {
        // Su mobile rimuovi le classi
        document.body.classList.remove('sidebar-expanded', 'sidebar-collapsed');
      }
    }
  } catch {
    // Ignora errori localStorage
  }
}

// Evidenzia voce attiva nella sidebar
export function setActiveSidebarItem(viewName){
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;
  
  // Rimuovi classe active da tutti gli item
  sidebar.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // Aggiungi classe active all'item corrente
  const activeItem = sidebar.querySelector(`[onclick*="${viewName}"]`);
  if(activeItem) {
    activeItem.classList.add('active');
  }
}
