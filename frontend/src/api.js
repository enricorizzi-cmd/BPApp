import { getToken } from './auth.js';

export function api(path, opts = {}) {
  opts.method = opts.method || 'GET';

  // headers + bearer
  const headers = { ...(opts.headers || {}) };
  const tok = getToken();
  if (tok) headers.Authorization = 'Bearer ' + tok;

  // set Content-Type only if body is non-string
  if (opts.body != null && typeof opts.body !== 'string') {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    opts.body = JSON.stringify(opts.body);
  }
  opts.headers = headers;

  return fetch(path, opts).then(handleResponse);
}

async function handleResponse(r) {
  const text = await r.text();
  if (!r.ok) throw buildError(text, r);
  return parseBody(text, r);
}

function buildError(text, r) {
  try {
    const msg = (JSON.parse(text).error) || '';
    return new Error(msg || r.statusText || ('HTTP ' + r.status));
  } catch {
    return new Error(r.statusText || ('HTTP ' + r.status));
  }
}

function parseBody(text, r) {
  try {
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.indexOf('application/json') !== -1) {
      return text ? JSON.parse(text) : {};
    }
  } catch { /* risposta vuota o non json */ }
  return text; // qualsiasi altra cosa
}

export function GET(path, extra) {
  return api(path, Object.assign({ method: 'GET' }, extra || {}));
}

export function POST(path, body) {
  return api(path, { method: 'POST', body: body || {} });
}

export function DEL(path) {
  return api(path, { method: 'DELETE' });
}

export function PUT(path, body) {
  return api(path, { method: 'PUT', body: body || {} });
}

export function DELETE(path) {
  return api(path, { method: 'DELETE' });
}