export function save(k, v) {
  localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
}

export function load(k, def) {
  const s = localStorage.getItem(k);
  if (s == null) return def;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export function del(k) {
  localStorage.removeItem(k);
}

export function setToken(t, remember) {
  // Salva sempre nel localStorage per persistenza massima
  // Il parametro 'remember' ora è sempre true per default
  save('bp_token', t);
}

export function getToken() {
  return localStorage.getItem('bp_token') || sessionStorage.getItem('bp_token') || '';
}

export function setUser(u) {
  save('bp_user', u);
}

export function getUser() {
  const u = load('bp_user', null);
  return u || null;
}

export function logout() {
  del('bp_token');
  sessionStorage.removeItem('bp_token');
  del('bp_user');
  location.href = '/?v=13';
}
