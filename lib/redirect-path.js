const VP_LOCALES = new Set(['en', 'de', 'es', 'it']);

/**
 * Normalize Weglot / form language code (fr = default storefront).
 */
export function normalizeLocale(value) {
  if (!value || typeof value !== 'string') return 'fr';
  const lang = value.trim().toLowerCase().split('-')[0];
  return VP_LOCALES.has(lang) ? lang : 'fr';
}

/**
 * Split `/en/collections/foo` → { locale: 'en', path: '/collections/foo' }.
 */
export function parseLocalizedPath(value) {
  if (!value || typeof value !== 'string') {
    return { locale: 'fr', path: null };
  }

  let path = value.trim();
  if (!path) return { locale: 'fr', path: null };

  if (path.includes('://')) {
    try {
      const url = new URL(path);
      path = url.pathname + url.search;
    } catch {
      return { locale: 'fr', path: null };
    }
  }

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  const qIndex = path.indexOf('?');
  const pathname = qIndex === -1 ? path : path.slice(0, qIndex);
  const search = qIndex === -1 ? '' : path.slice(qIndex);
  const parts = pathname.split('/').filter(Boolean);

  if (parts.length >= 2 && VP_LOCALES.has(parts[0].toLowerCase())) {
    const locale = parts[0].toLowerCase();
    const rest = `/${parts.slice(1).join('/')}${search}`;
    return { locale, path: rest };
  }

  return { locale: 'fr', path };
}

/**
 * Validate storefront paths for post-activation redirect (collections only).
 */
export function normalizeRedirectPath(value, fallback = null) {
  const { path } = parseLocalizedPath(value);
  if (!path) return fallback;

  let normalized = path.trim();
  if (!normalized) return fallback;

  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  if (normalized.includes('//') || /javascript:/i.test(normalized)) {
    return fallback;
  }

  const pathname = normalized.split('?')[0];
  if (!/^\/collections\/[a-z0-9][a-z0-9\-_]*$/i.test(pathname)) {
    return fallback;
  }

  return normalized;
}

/**
 * Prefix collection path with Weglot locale (/en, /de, …). FR keeps unprefixed path.
 */
export function applyLocaleToPath(path, locale) {
  const normalizedPath = normalizeRedirectPath(path, '/collections/ventes-privees');
  const lang = normalizeLocale(locale);

  if (lang === 'fr') {
    return normalizedPath;
  }

  const qIndex = normalizedPath.indexOf('?');
  const pathname = qIndex === -1 ? normalizedPath : normalizedPath.slice(0, qIndex);
  const search = qIndex === -1 ? '' : normalizedPath.slice(qIndex);
  const stripped = pathname.replace(/^\/(en|de|es|it)(?=\/)/i, '');

  return `/${lang}${stripped}${search}`;
}

export function resolveLocaleAndPath({ redirectPathInput, localeInput, defaultPath }) {
  const parsed = parseLocalizedPath(redirectPathInput);
  const locale = normalizeLocale(localeInput || parsed.locale);
  const redirectPath = normalizeRedirectPath(
    parsed.path || redirectPathInput,
    normalizeRedirectPath(defaultPath, null)
  );

  return { locale, redirectPath };
}

/**
 * Pick post-activation redirect (collections only).
 * Priority: email `to` query param → VP_COLLECTION_PATH (main hub).
 */
export function resolveActivationDestination(_tokenRedirectPath, defaultPath, queryOverride = null) {
  const fromQuery = normalizeRedirectPath(queryOverride, null);
  if (fromQuery) return fromQuery;

  return normalizeRedirectPath(defaultPath, '/collections/ventes-privees');
}

/** Read `to` (or legacy aliases) from activate query string. */
export function readActivationDestinationQuery(query = {}) {
  const raw = query.to ?? query.redirect ?? query.redirect_path;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
}
