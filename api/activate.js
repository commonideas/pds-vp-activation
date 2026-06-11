import { getConfig } from '../lib/config.js';
import { getToken, markTokenUsed, markTokenUnused } from '../lib/tokens.js';
import { ensureCustomerWithVpTag } from '../lib/shopify.js';
import { redirectToShop } from '../lib/http.js';
import { buildShopLoginUrl } from '../lib/shop-login.js';

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
      const reopenResult = await ensureCustomerWithVpTag(data.email);
      if (reopenResult.ok) {
        const { shopUrl, vpCollectionPath } = getConfig();
        const loginUrl = buildShopLoginUrl(shopUrl, vpCollectionPath, { vp_notice: 'already_active' });
        return res.redirect(302, loginUrl);
      }
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
    const notice = shopifyResult.alreadyHadTag ? 'already_active' : 'activated';
    const loginUrl = buildShopLoginUrl(shopUrl, vpCollectionPath, { vp_notice: notice });

    return res.redirect(302, loginUrl);
  } catch (err) {
    console.error(err);
    return redirectToShop(res, '/pages/vp?vp_error=activation_failed');
  }
}
