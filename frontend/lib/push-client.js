/* BPApp – push-client.js
   Gestisce la sottoscrizione Web Push e l'invio al backend */
// logger is loaded globally via index.html

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
      logger.info('[BP] Starting subscription process...');
      const reg = await navigator.serviceWorker.ready;
      logger.info('[BP] Service Worker ready');
      
      let sub = await reg.pushManager.getSubscription();
      logger.info('[BP] Existing subscription:', !!sub);
      
      if(!sub){
        logger.info('[BP] No existing subscription, creating new one...');
        const r = await fetch('/api/push/publicKey');
        const j = await r.json();
        const key = j.publicKey || j.key || '';
        logger.info('[BP] Public key received:', !!key);
        
        if(!key) {
          logger.error('[BP] No public key received from server');
          return;
        }
        
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key)
        });
        console.log('[BP] New subscription created');
      }
      
      console.log('[BP] Sending subscription to server...');
      await sendSubscription(sub.toJSON());
      console.log('[BP] Subscription sent successfully');
    }catch(e){ 
      console.error('[BP] Push subscribe failed:', e);
      logger.warn('[BP] push subscribe fail', e); 
    }
  }

  async function init(){
    console.log('[BP] Push client initializing...');
    console.log('[BP] Notification permission:', Notification.permission);
    
    if(Notification.permission === 'granted') {
      console.log('[BP] Permission already granted, subscribing...');
      return subscribe();
    }
    
    if(Notification.permission === 'default'){
      console.log('[BP] Requesting notification permission...');
      try{
        const p = await Notification.requestPermission();
        console.log('[BP] Permission result:', p);
        if(p === 'granted') {
          console.log('[BP] Permission granted, subscribing...');
          return subscribe();
        } else {
          console.warn('[BP] Notification permission denied');
        }
      }catch(e){ 
        console.error('[BP] Error requesting permission:', e);
      }
    } else {
      console.warn('[BP] Notification permission denied by user');
    }
  }

  window.BPPush = { init, subscribe };
  window.addEventListener('load', init);
})();
