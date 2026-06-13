import { applyShopCors } from '../../lib/cors.js';
import { getEmailVpStatus } from '../../lib/email-status.js';
import { json, maskEmailForLog, normalizeEmail } from '../../lib/http.js';

export default async function handler(req, res) {
  applyShopCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const email = normalizeEmail(body.email);

    if (!email) {
      return json(res, { error: 'email_required' }, 400);
    }

    const status = await getEmailVpStatus(email);

    console.log('[vp/check-email]', {
      email: maskEmailForLog(email),
      status,
    });

    return json(res, { status });
  } catch (err) {
    console.error('[vp/check-email] error', err);
    return json(res, { error: 'internal_error' }, 500);
  }
}
