import { applyShopCors } from '../../lib/cors.js';
import { resolveCampaignAccess } from '../../lib/campaign-access.js';
import { json, normalizeEmail } from '../../lib/http.js';

function readQueryParam(req, name) {
  const fromQuery = req.query?.[name];
  if (typeof fromQuery === 'string' && fromQuery.trim()) {
    return fromQuery.trim();
  }

  try {
    const rawUrl = req.url || '';
    const url = new URL(rawUrl, 'https://localhost');
    const value = url.searchParams.get(name);
    return value ? value.trim() : '';
  } catch {
    return '';
  }
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
    const profileId = readQueryParam(req, 'hash_email') || readQueryParam(req, 'profile_id');
    const email = normalizeEmail(readQueryParam(req, 'email'));
    const exchangeId = readQueryParam(req, 'exchange_id') || readQueryParam(req, '_kx');
    const fromCampaignContext =
      readQueryParam(req, 'campaign') === '1' || readQueryParam(req, 'referrer') === 'campaign';

    if (!profileId && !email && !exchangeId) {
      return json(res, { access: false, error: 'identifier_required' }, 400);
    }

    const result = await resolveCampaignAccess({
      profileIdInput: profileId,
      exchangeIdInput: exchangeId,
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
