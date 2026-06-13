import { createActivationForEmail } from '../../lib/activation.js';
import { getConfig } from '../../lib/config.js';
import { json, maskEmailForLog, normalizeEmail } from '../../lib/http.js';
import { normalizeRedirectPath } from '../../lib/redirect-path.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const { klaviyoWebhookSecret, vpCollectionPath } = getConfig();
    const secret = req.headers['x-klaviyo-secret'] || req.headers['x-webhook-secret'];

    if (!secret || secret !== klaviyoWebhookSecret) {
      console.warn('[vp/create] unauthorized');
      return res.status(401).end('Unauthorized');
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const email = normalizeEmail(body.email || body.Email || body.profile?.email);
    const redirectPath = normalizeRedirectPath(
      body.redirect_path ||
        body.redirectPath ||
        body.vp_redirect_path ||
        body.properties?.vp_redirect_path ||
        body.profile?.properties?.vp_redirect_path,
      normalizeRedirectPath(vpCollectionPath, null)
    );

    if (!email) {
      console.warn('[vp/create] email_required');
      return json(res, { error: 'email_required' }, 400);
    }

    const result = await createActivationForEmail(email, redirectPath, req);

    console.log('[vp/create] success', {
      email: maskEmailForLog(email),
      tokenSaved: true,
      klaviyo: result.klaviyoResult,
      redirectPath,
      expiresAt: new Date(result.expiresAt).toISOString(),
    });

    return json(res, {
      ok: true,
      activation_url: result.activationUrl,
      klaviyo_profile_updated: result.klaviyoResult.ok,
      klaviyo: result.klaviyoResult.ok
        ? { updated: true, method: result.klaviyoResult.method }
        : { updated: false, error: result.klaviyoResult.error, detail: result.klaviyoResult.detail },
    });
  } catch (err) {
    console.error('[vp/create] error', err);
    return json(res, { error: 'internal_error' }, 500);
  }
}
