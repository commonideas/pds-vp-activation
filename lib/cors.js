import { getConfig } from './config.js';

function normalizeOrigin(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function allowedOrigins() {
  const { shopUrl } = getConfig();
  const origins = new Set();
  const base = normalizeOrigin(shopUrl);
  if (!base) return origins;

  origins.add(base);

  try {
    const url = new URL(base);
    if (url.hostname.startsWith('www.')) {
      origins.add(`${url.protocol}//${url.hostname.slice(4)}`);
    } else {
      origins.add(`${url.protocol}//www.${url.hostname}`);
    }
  } catch {
    /* ignore */
  }

  return origins;
}

export function applyShopCors(req, res) {
  const origin = normalizeOrigin(req.headers.origin);
  const allowed = allowedOrigins();

  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
