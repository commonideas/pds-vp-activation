import { TOKEN_TTL_SECONDS, getConfig, getActivationBaseUrl } from '../../lib/config.js';
import { generateToken, revokePendingTokensForEmail, saveToken } from '../../lib/tokens.js';
import { updateKlaviyoProfile } from '../../lib/klaviyo.js';
import { normalizeRedirectPath } from '../../lib/redirect-path.js';
import { json, maskEmailForLog, normalizeEmail } from '../../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const { klaviyoWebhookSecret } = getConfig();
    const secret = req.headers['x-klaviyo-secret'] || req.headers['x-webhook-secret'];

    if (!secret || secret !== klaviyoWebhookSecret) {
      console.warn('[vp/create] unauthorized');
      return res.status(401).end('Unauthorized');
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const email = normalizeEmail(body.email || body.Email || body.profile?.email);
    const { vpCollectionPath } = getConfig();
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

    await revokePendingTokensForEmail(email);

    const token = generateToken();
    const now = Date.now();
    const expiresAt = now + TOKEN_TTL_SECONDS * 1000;

    await saveToken(token, { email, createdAt: now, expiresAt, used: false, redirectPath });

    const baseUrl = getActivationBaseUrl(req);
    const activationUrl = `${baseUrl}/activate?token=${encodeURIComponent(token)}`;

    const klaviyoProfileUpdated = await updateKlaviyoProfile(email, activationUrl);

    console.log('[vp/create] success', {
      email: maskEmailForLog(email),
      tokenSaved: true,
      klaviyoProfileUpdated,
      redirectPath,
      expiresAt: new Date(expiresAt).toISOString(),
    });

    return json(res, { ok: true, activation_url: activationUrl });
  } catch (err) {
    console.error('[vp/create] error', err);
    return json(res, { error: 'internal_error' }, 500);
  }
}
