import { getConfig } from './config.js';

export function json(res, obj, status = 200) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

export function redirectToShop(res, path, status = 302) {
  const { shopUrl } = getConfig();
  res.redirect(status, `${shopUrl}${path}`);
}

/** Append or merge query params on a storefront path (e.g. /collections/vp?view=vp). */
export function withQueryParams(path, params = {}) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const qIndex = normalized.indexOf('?');
  const pathname = qIndex === -1 ? normalized : normalized.slice(0, qIndex);
  const search = new URLSearchParams(qIndex === -1 ? '' : normalized.slice(qIndex + 1));

  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') {
      search.set(key, String(value));
    }
  }

  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function normalizeEmail(value) {
  if (!value || typeof value !== 'string') return null;
  return value.trim().toLowerCase();
}

/** Redacted email for Vercel logs (never log activation tokens or full addresses). */
export function maskEmailForLog(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '(invalid)';
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length <= 1) return `*@${domain}`;
  if (local.length === 2) return `${local[0]}*@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
