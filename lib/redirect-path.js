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

export function resolveActivationDestination(tokenRedirectPath, defaultPath) {
  const fromToken = normalizeRedirectPath(tokenRedirectPath, null);
  if (fromToken) return fromToken;
  return normalizeRedirectPath(defaultPath, '/collections/vp-h7k3m9');
}
