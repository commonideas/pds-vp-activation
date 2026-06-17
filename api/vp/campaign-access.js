import { applyShopCors } from '../../lib/cors.js';
import { resolveCampaignAccess } from '../../lib/campaign-access.js';
import { json, normalizeEmail } from '../../lib/http.js';

export default async function handler(req, res) {
  applyShopCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const profileId = req.query.hash_email || req.query.profile_id;
    const email = normalizeEmail(req.query.email);
    const fromCampaignContext =
      req.query.campaign === '1' || req.query.referrer === 'campaign';

    if (!profileId && !email) {
      return json(res, { access: false, error: 'identifier_required' }, 400);
    }

    const result = await resolveCampaignAccess({
      profileIdInput: profileId,
      emailInput: email,
      fromCampaignContext,
    });

    if (!result.access) {
      const status =
        result.error === 'invalid_profile_id' || result.error === 'identifier_required' ? 400 : 403;
      return json(res, result, status);
    }

    return json(res, result);
  } catch (err) {
    console.error('[vp/campaign-access] error', err);
    return json(res, { access: false, error: 'internal_error' }, 500);
  }
}
