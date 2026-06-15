import { applyShopCors } from '../../lib/cors.js';
import { getToken } from '../../lib/tokens.js';
import { json } from '../../lib/http.js';

function isTokenExpired(data) {
  return Date.now() > data.expiresAt;
}

export default async function handler(req, res) {
  applyShopCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const token = req.query.token;
    if (!token) {
      return json(res, { access: false, error: 'token_required' }, 400);
    }

    const data = await getToken(token);
    if (!data || isTokenExpired(data)) {
      return json(res, { access: false, error: 'invalid_or_expired' }, 403);
    }

    return json(res, { access: true, expires_at: new Date(data.expiresAt).toISOString() });
  } catch (err) {
    console.error('[vp/verify-access] error', err);
    return json(res, { access: false, error: 'internal_error' }, 500);
  }
}
