import { applyShopCors } from '../../lib/cors.js';
import { resolveCampaignAccess } from '../../lib/campaign-access.js';
import { json } from '../../lib/http.js';

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
    const result = await resolveCampaignAccess(profileId);

    if (!result.access) {
      return json(res, result, result.error === 'invalid_profile_id' ? 400 : 403);
    }

    return json(res, result);
  } catch (err) {
    console.error('[vp/campaign-access] error', err);
    return json(res, { access: false, error: 'internal_error' }, 500);
  }
}
