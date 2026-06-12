import { getConfig } from '../lib/config.js';
import { getToken, markTokenUsed } from '../lib/tokens.js';
import { ensureCustomerWithVpTag } from '../lib/shopify.js';
import { redirectToShop } from '../lib/http.js';
import { resolveActivationDestination } from '../lib/redirect-path.js';

/** Magic links stay valid for 7 days; repeat clicks within that window reopen VP collection. */
function isTokenExpired(data) {
  return Date.now() > data.expiresAt;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const token = req.query.token;
    const { homePath, vpCollectionPath } = getConfig();

    if (!token) {
      return redirectToShop(res, homePath);
    }

    const data = await getToken(token);

    if (!data) {
      return redirectToShop(res, homePath);
    }

    if (isTokenExpired(data)) {
      return redirectToShop(res, homePath);
    }

    const shopifyResult = await ensureCustomerWithVpTag(data.email);

    if (!shopifyResult.ok) {
      return redirectToShop(res, homePath);
    }

    if (!data.used) {
      await markTokenUsed(token, data);
    }

    const destination = resolveActivationDestination(data.redirectPath, vpCollectionPath);
    return redirectToShop(res, destination);
  } catch (err) {
    console.error(err);
    return redirectToShop(res, getConfig().homePath);
  }
}
