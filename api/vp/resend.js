import { applyShopCors } from '../../lib/cors.js';
import { resendActivationForEmail } from '../../lib/activation.js';
import { getEmailVpStatus } from '../../lib/email-status.js';
import { getLatestTokenForEmail } from '../../lib/tokens.js';
import { json, maskEmailForLog, normalizeEmail } from '../../lib/http.js';

const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

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
    const redirectPath = body.redirect_path || body.redirectPath || body.vp_redirect_path || null;

    if (!email) {
      return json(res, { error: 'email_required' }, 400);
    }

    const status = await getEmailVpStatus(email);

    if (status === 'activated') {
      return json(res, { error: 'already_activated', status }, 409);
    }

    if (status === 'unknown') {
      return json(res, { error: 'not_registered', status }, 404);
    }

    const latest = await getLatestTokenForEmail(email);
    if (latest?.created_at) {
      const ageMs = Date.now() - new Date(latest.created_at).getTime();
      if (ageMs < RESEND_COOLDOWN_MS) {
        return json(res, { error: 'rate_limited', retry_after_seconds: Math.ceil((RESEND_COOLDOWN_MS - ageMs) / 1000) }, 429);
      }
    }

    const result = await resendActivationForEmail(email, redirectPath, req);

    console.log('[vp/resend] success', {
      email: maskEmailForLog(email),
      klaviyo: result.klaviyoResult,
      event: result.eventResult,
    });

    return json(res, {
      ok: true,
      status: 'resent',
      klaviyo_profile_updated: result.klaviyoResult.ok,
      klaviyo_event_sent: result.eventResult.ok,
    });
  } catch (err) {
    console.error('[vp/resend] error', err);
    return json(res, { error: 'internal_error' }, 500);
  }
}
