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
