// Browser-side helper for the admin area.
const KEY = 'menu3d_admin_token';

export const token = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(KEY)),
  set: (t) => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
};

// 'owner' (restaurant) or 'super' (platform owner). Only used to choose which screen to show;
// the API enforces access from the signed token.
const ROLE_KEY = 'menu3d_admin_role';
export const role = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(ROLE_KEY)),
  set: (r) => localStorage.setItem(ROLE_KEY, r),
  clear: () => localStorage.removeItem(ROLE_KEY),
};

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const t = token.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  let payload;
  if (form) payload = form;
  else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') {
      token.clear();
      role.clear();
      window.location.href = '/admin/login';
    }
    throw new Error(json.error || 'Request failed');
  }
  return json;
}
