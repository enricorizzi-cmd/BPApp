let webPush = null;
try{ webPush = require('web-push'); }catch(e){ webPush = null; }

function configured(){
  return !!(webPush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function setup(){
  if(!configured()) return;
  try{
    webPush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
                            process.env.VAPID_PUBLIC_KEY,
                            process.env.VAPID_PRIVATE_KEY);
  }catch(e){ /* ignore */ }
}

async function sendPush(sub, payload){
  if(!configured()) return { ok:false, error:'not_configured' };
  try{
    const res = await webPush.sendNotification(sub, JSON.stringify(payload||{}));
    return { ok:true, res };
  }catch(e){
    return { ok:false, error:e && e.statusCode ? e.statusCode : (e && e.message) };
  }
}

module.exports = { setup, sendPush, configured };