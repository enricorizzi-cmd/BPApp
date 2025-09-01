// auth-fetch-shim.js — inietta automaticamente Authorization su ogni fetch /api/*

(function () {
  const _fetch = window.fetch.bind(window);

  function getJWT() {
    // 1) oggetto user
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      if (u && (u.token || u.jwt || u.accessToken)) return u.token || u.jwt || u.accessToken;
    } catch (_) {}

    // 2) chiavi comuni (sia raw JWT sia JSON stringificato con {token:...})
    const keys = ['token', 'authToken', 'jwt', 'bp_token', 'accessToken', 'id_token'];
    for (const k of keys) {
      let v = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (!v) continue;

      // JSON con { token/jwt/accessToken }
      try {
        const obj = JSON.parse(v);
        if (obj && (obj.token || obj.jwt || obj.accessToken)) return obj.token || obj.jwt || obj.accessToken;
      } catch (_) {}

      // raw JWT
      v = String(v).replace(/^"+|"+$/g, '');
      if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(v)) return v;
    }
    return null;
  }

  window.fetch = function (input, init) {
    // Applica solo alle chiamate /api/*
    const url = (typeof input === 'string') ? input : (input && input.url) || '';
    const isApi = typeof url === 'string' &&
      (url.startsWith('/api/') || url.startsWith(location.origin + '/api/'));

    if (!isApi) return _fetch(input, init);

    const t = getJWT();
    const opts = Object.assign({}, init);
    opts.headers = new Headers((opts && opts.headers) || {});
    if (t && !opts.headers.has('Authorization')) {
      opts.headers.set('Authorization', 'Bearer ' + t);
    }
    return _fetch(input, opts);
  };
})();
