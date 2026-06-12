/**
 * Validate storefront paths for post-activation redirect (collections only).
 */
export function normalizeRedirectPath(value, fallback = null) {
  if (!value || typeof value !== 'string') {
    return fallback;
  }

  let path = value.trim();
  if (!path) return fallback;

  if (path.includes('://')) {
    try {
      const url = new URL(path);
      path = url.pathname + url.search;
    } catch {
      return fallback;
    }
  }

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  if (path.includes('//') || /javascript:/i.test(path)) {
    return fallback;
  }

  const pathname = path.split('?')[0];
  if (!/^\/collections\/[a-z0-9][a-z0-9\-_]*$/i.test(pathname)) {
    return fallback;
  }

  return path;
}

/**
 * Pick post-activation redirect (collections only).
 * Priority: email `to` query param → VP_COLLECTION_PATH (main hub).
 *
 * Token redirect_path (from vp-sub signup) is stored in Supabase for reference but
 * not used here — email buttons control destination via `&to=`; plain
 * vp_activation_url always opens the main VP hub.
 */
export function resolveActivationDestination(_tokenRedirectPath, defaultPath, queryOverride = null) {
  const fromQuery = normalizeRedirectPath(queryOverride, null);
  if (fromQuery) return fromQuery;

  return normalizeRedirectPath(defaultPath, '/collections/vp-h7k3m9');
}

/** Read `to` (or legacy aliases) from activate query string. */
export function readActivationDestinationQuery(query = {}) {
  const raw = query.to ?? query.redirect ?? query.redirect_path;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
}
