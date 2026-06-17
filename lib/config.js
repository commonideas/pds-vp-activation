export const TOKEN_TTL_SECONDS = 604800; // 7 days

const SUPPORTED_LOCALES = new Set(['en', 'de', 'es', 'it', 'fr']);

/**
 * Default storefront language per host (unprefixed Weglot URLs).
 * Each Vercel deployment sets SHOP_URL to one of these; override with DEFAULT_STORE_LOCALE if needed.
 */
const HOST_DEFAULT_LOCALE = {
  // Panier des Sens — FR default
  'panierdessens.com': 'fr',
  'www.panierdessens.com': 'fr',
  // Panier des Sens — EN default (Canada / USA)
  'ca.panierdessens.com': 'en',
  'www.ca.panierdessens.com': 'en',
  'us.panierdessens.com': 'en',
  'www.us.panierdessens.com': 'en',
  // La Maison du Savon de Marseille
  'maison-du-savon-de-marseille.fr': 'fr',
  'www.maison-du-savon-de-marseille.fr': 'fr',
  'maison-du-savon-de-marseille.com': 'en',
  'www.maison-du-savon-de-marseille.com': 'en',
  // La Crique — FR default
  'lacriquebeauty.com': 'fr',
  'www.lacriquebeauty.com': 'fr',
};

/**
 * Infer default locale from a storefront hostname.
 * Returns null when the host is not recognized (caller uses fallback).
 */
export function inferDefaultLocaleFromHost(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '');
  if (!host) return null;

  if (HOST_DEFAULT_LOCALE[host]) return HOST_DEFAULT_LOCALE[host];

  // Regional subdomains (ca.*, us.*) → English default
  if (/^(www\.)?(ca|us)\./.test(host)) return 'en';

  // French ccTLD storefronts
  if (host.endsWith('.fr')) return 'fr';

  return null;
}

/**
 * Default storefront locale (no /en/ or /fr/ URL prefix on magic-link redirect).
 * Priority: DEFAULT_STORE_LOCALE env → SHOP_URL host map → fr fallback.
 */
export function getDefaultStoreLocale() {
  const explicit = process.env.DEFAULT_STORE_LOCALE;
  if (explicit && typeof explicit === 'string') {
    const lang = explicit.trim().toLowerCase().split('-')[0];
    if (SUPPORTED_LOCALES.has(lang)) return lang;
  }

  try {
    const host = new URL(getConfig().shopUrl).hostname;
    const inferred = inferDefaultLocaleFromHost(host);
    if (inferred) return inferred;
  } catch {
    /* ignore */
  }

  return 'fr';
}

export function getConfig() {
  return {
    shopifyStore: process.env.SHOPIFY_STORE || 'panierdessens.myshopify.com',
    shopifyAdminToken: process.env.SHOPIFY_ADMIN_TOKEN,
    shopUrl: (process.env.SHOP_URL || 'https://panierdessens.com').replace(/\/$/, ''),
    homePath: process.env.SHOP_HOME_PATH || '/',
    vpCollectionPath: process.env.VP_COLLECTION_PATH || '/collections/ventes-privees',
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
