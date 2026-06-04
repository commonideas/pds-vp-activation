/**
 * Build storefront login URL with post-login redirect.
 * Panier des Sens uses Shopify Customer Accounts (/customer_authentication/login + return_to).
 * Legacy stores use /account/login + return_url.
 */
export function buildShopLoginUrl(shopUrl, returnPath, extraParams = {}) {
  const path = returnPath.startsWith('/') ? returnPath : `/${returnPath}`;
  const useLegacy = process.env.SHOPIFY_LOGIN_STYLE === 'legacy';
  const base = shopUrl.replace(/\/$/, '');
  const url = new URL(useLegacy ? `${base}/account/login` : `${base}/customer_authentication/login`);

  if (useLegacy) {
    url.searchParams.set('return_url', path);
  } else {
    url.searchParams.set('return_to', path);
  }

  for (const [key, value] of Object.entries(extraParams)) {
    if (value != null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}
