import { getConfig } from './config.js';

export function json(res, obj, status = 200) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

export function redirectToShop(res, path, status = 302) {
  const { shopUrl } = getConfig();
  res.redirect(status, `${shopUrl}${path}`);
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
