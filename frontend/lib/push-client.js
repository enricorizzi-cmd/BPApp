/* BPApp – push-client.js
   Gestisce la sottoscrizione Web Push e l'invio al backend */
import './logger.js';

/* global logger */
(function(){
  'use strict';
  if(!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  function getAuthToken(){
    try{
      const u = JSON.parse(localStorage.getItem('bp_user')||'null') || {};
      if(u.token) return u.token;
    }catch(_){ }
    return localStorage.getItem('bp_token') || localStorage.getItem('authToken') || localStorage.getItem('token') || '';
  }

  function urlBase64ToUint8Array(base64String){
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  async function sendSubscription(sub){
    const token = getAuthToken();
    if(!token) return; // user not logged in
    try{
      await fetch('/api/push/subscribe', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':'Bearer '+token
        },
        body: JSON.stringify(sub)
      });
    }catch(e){ logger.warn('[BP] push subscribe error', e); }
  }

  async function subscribe(){
    try{
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if(!sub){
        const r = await fetch('/api/push/publicKey');
        const j = await r.json();
        const key = j.publicKey || j.key || '';
        if(!key) return;
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key)
        });
      }
      await sendSubscription(sub.toJSON());
    }catch(e){ logger.warn('[BP] push subscribe fail', e); }
  }

  async function init(){
    if(Notification.permission === 'granted') return subscribe();
    if(Notification.permission === 'default'){
      try{
        const p = await Notification.requestPermission();
        if(p === 'granted') return subscribe();
      }catch(_){ }
    }
  }

  window.BPPush = { init, subscribe };
  window.addEventListener('load', init);
})();
