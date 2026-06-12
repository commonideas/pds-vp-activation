export const TOKEN_TTL_SECONDS = 604800; // 7 days

export function getConfig() {
  return {
    shopifyStore: process.env.SHOPIFY_STORE || 'panierdessens.myshopify.com',
    shopifyAdminToken: process.env.SHOPIFY_ADMIN_TOKEN,
    shopUrl: (process.env.SHOP_URL || 'https://panierdessens.com').replace(/\/$/, ''),
    homePath: process.env.SHOP_HOME_PATH || '/',
    vpCollectionPath: process.env.VP_COLLECTION_PATH || '/collections/vp-h7k3m9',
    klaviyoWebhookSecret: process.env.KLAVIYO_WEBHOOK_SECRET,
    klaviyoPrivateApiKey:
      process.env.KLAVIYO_PRIVATE_API_KEY ||
      process.env.KLAVIYO_API_KEY ||
      process.env.KLAVIYO_PRIVATE_KEY ||
      '',
    activationBaseUrl: process.env.ACTIVATION_BASE_URL
      ? process.env.ACTIVATION_BASE_URL.replace(/\/$/, '')
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : '',
  };
}

export function getActivationBaseUrl(req) {
  const cfg = getConfig();
  if (cfg.activationBaseUrl) return cfg.activationBaseUrl;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}
