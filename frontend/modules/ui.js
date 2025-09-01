import { getUser } from '../src/auth.js';
import { injectMobileDrawerCSS, injectMobileLightModeCSS, injectLightBadgesCSS } from '../src/mobileStyles.js';

export function topbarHTML(){
  const u = getUser();
  if(!u) return '';
  const isAdmin = (u.role==='admin');
  const xpBadge = '<span class="badge">Lvl '+(window.level?window.level():'' )+' · XP '+(window.getXP?window.getXP():'' )+'</span>';

  const drawer =
    '<div id="drawer" class="drawer" role="dialog" aria-modal="true" aria-label="Menu">'+
      '<div class="row">'+
        '<button class="ghost" onclick="viewHome();toggleDrawer(false)">Dashboard</button>'+
        '<button class="ghost" onclick="viewCalendar();toggleDrawer(false)">Calendario</button>'+
        '<button class="ghost" onclick="viewPeriods();toggleDrawer(false)">BP</button>'+
        '<button class="ghost" onclick="viewAppointments();toggleDrawer(false)">Appuntamenti</button>'+
        '<button class="ghost" onclick="viewLeaderboard();toggleDrawer(false)">Classifiche</button>'+
        '<button class="ghost" onclick="viewCommissions();toggleDrawer(false)">Provvigioni</button>'+
        '<button class="ghost" onclick="viewGI();toggleDrawer(false)">GI &amp; Scadenzario</button>'+
        '<button class="ghost" onclick="viewReport();toggleDrawer(false)">Report</button>'+
        '<button class="ghost" onclick="viewClients();toggleDrawer(false)">Clienti</button>'+
        '<button class="ghost" onclick="viewTeam();toggleDrawer(false)">Squadra</button>'+
        (isAdmin? '<button class="ghost" onclick="viewUsers();toggleDrawer(false)">Utenti</button>' : '')+
        '<button onclick="logout()">Logout</button>'+
      '</div>'+
    '</div>';

  return ''+
    '<div class="topbar">'+
      '<div class="brand">'+
        '<button class="hamb" id="hamb" aria-label="Apri menu" aria-controls="drawer" aria-expanded="false"><span></span><span></span><span></span></button>'+
        '<div class="logo">BATTLE PLAN</div>'+
      '</div>'+
     '<div class="nav right">'+ xpBadge +
  '<button class="ghost" onclick="viewHome()">Dashboard</button>'+
  '<button class="ghost" onclick="viewCalendar()">Calendario</button>'+
  '<button class="ghost" onclick="viewPeriods()">BP</button>'+
  '<button class="ghost" onclick="viewAppointments()">Appuntamenti</button>'+
  '<button class="ghost" onclick="viewLeaderboard()">Classifiche</button>'+
  '<button class="ghost" onclick="viewCommissions()">Provvigioni</button>'+
  '<button class="ghost" onclick="viewGI()">GI &amp; Scadenzario</button>'+  // <-- aggiunto
  '<button class="ghost" onclick="viewReport()">Report</button>'+
  '<button class="ghost" onclick="viewClients()">Clienti</button>'+
  '<button class="ghost" onclick="viewTeam()">Squadra</button>'+
  (isAdmin? '<button class="ghost" onclick="viewUsers()">Utenti</button>':'' )+
  '<button onclick="logout()">Logout</button>'+
'</div>'+

    '</div>'+drawer;
}

export function renderTopbar(){
  if(!getUser()) return;

  // CSS: più contrasto ai bottoni topbar SOLO su desktop; mobile lasciato com'è
  if(!document.getElementById('bp_nav_contrast_css')){
    const css = `
      @media (min-width: 1024px){
        .topbar .nav .ghost{
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.18);
        }
        .topbar .nav .ghost:hover{
          background: rgba(255,255,255,.12);
        }
      }
    `;
    const st=document.createElement('style'); st.id='bp_nav_contrast_css'; st.textContent=css;
    document.head.appendChild(st);
  }

  const appEl = document.getElementById('app');
  const tb = document.querySelector('.topbar');
  const html = topbarHTML();
  if(tb){ tb.outerHTML = html; } else if(appEl){ appEl.insertAdjacentHTML('afterbegin', html); }

  // Fix visivi mobile/light/badge (idempotenti)
  try{ injectMobileDrawerCSS(); }catch{ /* ignore */ }
  try{ injectMobileLightModeCSS(); }catch{ /* ignore */ }
  try{ injectLightBadgesCSS(); }catch{ /* ignore */ }

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

  // Chiudi con ESC
  document.removeEventListener('keydown', onEscCloseDrawer, false);
  document.addEventListener('keydown', onEscCloseDrawer, false);
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
  document.body.classList.toggle('no-scroll', willOpen);
}

let _tbTimer=null;
export function rerenderTopbarSoon(){ clearTimeout(_tbTimer); _tbTimer=setTimeout(renderTopbar,60); }
