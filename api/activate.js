import { getConfig } from '../lib/config.js';
import { getToken, markTokenUsed, markTokenUnused } from '../lib/tokens.js';
import { ensureCustomerWithVpTag } from '../lib/shopify.js';
import { redirectToShop } from '../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const token = req.query.token;

    if (!token) {
      return redirectToShop(res, '/pages/vp?vp_error=missing_token');
    }

    const data = await getToken(token);

    if (!data) {
      return redirectToShop(res, '/pages/vp?vp_error=invalid_token');
    }

    if (data.used) {
      return redirectToShop(res, '/pages/vp?vp_error=already_used');
    }

    if (Date.now() > data.expiresAt) {
      return redirectToShop(res, '/pages/vp?vp_error=expired');
    }

    await markTokenUsed(token, data);

    const shopifyResult = await ensureCustomerWithVpTag(data.email);

    if (!shopifyResult.ok) {
      await markTokenUnused(token, data);
      return redirectToShop(res, '/pages/vp?vp_error=activation_failed');
    }

    const { shopUrl, vpCollectionPath } = getConfig();
    const loginUrl = `${shopUrl}/account/login?return_url=${encodeURIComponent(vpCollectionPath)}`;
    const notice = shopifyResult.alreadyHadTag ? 'already_active' : 'activated';

    return res.redirect(302, `${loginUrl}&vp_notice=${notice}`);
  } catch (err) {
    console.error(err);
    return redirectToShop(res, '/pages/vp?vp_error=activation_failed');
  }
}
