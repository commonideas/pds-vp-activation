/**
 * Panier des Sens — VP magic-link activation
 *
 * POST /api/vp/create  — Klaviyo flow webhook (email → token → Klaviyo profile URL)
 * GET  /activate       — User clicks email link (token → tag VP → redirect login)
 * GET  /health         — Health check
 */

const TOKEN_TTL_SECONDS = 604800; // 7 days

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/health') {
        return json({ ok: true });
      }

      if (url.pathname === '/api/vp/create' && request.method === 'POST') {
        return await handleCreate(request, env);
      }

      if (url.pathname === '/activate' && request.method === 'GET') {
        return await handleActivate(request, env);
      }

      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error(err);
      return json({ error: 'internal_error' }, 500);
    }
  },
};

// ---------------------------------------------------------------------------
// POST /api/vp/create
// ---------------------------------------------------------------------------

async function handleCreate(request, env) {
  const secret = request.headers.get('x-klaviyo-secret') || request.headers.get('x-webhook-secret');
  if (!secret || secret !== env.KLAVIYO_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email || body.Email || body.profile?.email);
  const defaultCollection = env.VP_COLLECTION_PATH || '/collections/ventes-privees';
  const redirectPath = normalizeRedirectPath(
    body.redirect_path ||
      body.redirectPath ||
      body.vp_redirect_path ||
      body.properties?.vp_redirect_path ||
      body.profile?.properties?.vp_redirect_path,
    normalizeRedirectPath(defaultCollection, null)
  );

  if (!email) {
    return json({ error: 'email_required' }, 400);
  }

  // Optional: one active unused token per email — revoke previous pending tokens
  await revokePendingTokensForEmail(env, email);

  const token = generateToken();
  const now = Date.now();
  const expiresAt = now + TOKEN_TTL_SECONDS * 1000;

  await env.VP_TOKENS.put(
    token,
    JSON.stringify({ email, createdAt: now, expiresAt, used: false, redirectPath }),
    { expirationTtl: TOKEN_TTL_SECONDS }
  );

  await env.VP_TOKENS.put(`email:${email}`, token);

  const baseUrl = env.ACTIVATION_BASE_URL || new URL(request.url).origin;
  const activationUrl = `${baseUrl}/activate?token=${encodeURIComponent(token)}`;

  await updateKlaviyoProfile(env, email, activationUrl);

  return json({ ok: true, activation_url: activationUrl });
}

// ---------------------------------------------------------------------------
// GET /activate?token=...
// ---------------------------------------------------------------------------

async function handleActivate(request, env) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get('token');

  const homePath = env.SHOP_HOME_PATH || '/';
  const vpCollectionPath = env.VP_COLLECTION_PATH || '/collections/ventes-privees';

  if (!token) {
    return redirectToShop(env, homePath);
  }

  const raw = await env.VP_TOKENS.get(token);

  if (!raw) {
    return redirectToShop(env, homePath);
  }

  const data = JSON.parse(raw);

  if (Date.now() > data.expiresAt) {
    return redirectToShop(env, homePath);
  }

  const shopifyResult = await ensureCustomerWithVpTag(env, data.email);

  if (!shopifyResult.ok) {
    return redirectToShop(env, homePath);
  }

  if (!data.used) {
    await env.VP_TOKENS.put(token, JSON.stringify({ ...data, used: true }));
  }

  const destination = resolveActivationDestination(
    data.redirectPath,
    vpCollectionPath,
    readActivationDestinationQuery(Object.fromEntries(requestUrl.searchParams.entries()))
  );
  return redirectToShop(env, destination);
}

// ---------------------------------------------------------------------------
// Shopify Admin API
// ---------------------------------------------------------------------------

async function ensureCustomerWithVpTag(env, email) {
  let customer = await findCustomerByEmail(env, email);

  if (!customer) {
    customer = await createCustomer(env, email);
    if (!customer) return { ok: false };
  }

  const tags = customer.tags || [];
  const alreadyHadTag = tags.includes('VP');

  if (!alreadyHadTag) {
    const tagged = await tagsAdd(env, customer.id, ['VP']);
    if (!tagged) return { ok: false };
  }

  return { ok: true, alreadyHadTag };
}

async function shopifyGraphql(env, query, variables = {}) {
  const res = await fetch(`https://${env.SHOPIFY_STORE}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    console.error('Shopify HTTP error', res.status, await res.text());
    return null;
  }

  return res.json();
}

async function findCustomerByEmail(env, email) {
  const data = await shopifyGraphql(
    env,
    `query($q: String!) {
      customers(first: 1, query: $q) {
        nodes { id email tags }
      }
    }`,
    { q: `email:${email}` }
  );

  return data?.data?.customers?.nodes?.[0] || null;
}

async function createCustomer(env, email) {
  const data = await shopifyGraphql(
    env,
    `mutation($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id email tags }
        userErrors { field message }
      }
    }`,
    {
      input: {
        email,
        tags: ['VP'],
      },
    }
  );

  const errors = data?.data?.customerCreate?.userErrors;
  if (errors?.length) {
    console.error('customerCreate errors', errors);
    return null;
  }

  return data?.data?.customerCreate?.customer || null;
}

async function tagsAdd(env, customerGid, tags) {
  const data = await shopifyGraphql(
    env,
    `mutation($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }`,
    { id: customerGid, tags }
  );

  const errors = data?.data?.tagsAdd?.userErrors;
  if (errors?.length) {
    console.error('tagsAdd errors', errors);
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Klaviyo Profiles API (set vp_activation_url on profile)
// ---------------------------------------------------------------------------

async function updateKlaviyoProfile(env, email, activationUrl) {
  const apiKey =
    env.KLAVIYO_PRIVATE_API_KEY || env.KLAVIYO_API_KEY || env.KLAVIYO_PRIVATE_KEY;
  if (!apiKey) {
    console.warn('KLAVIYO_PRIVATE_API_KEY not set — skipping profile update');
    return { ok: false, error: 'KLAVIYO_PRIVATE_API_KEY not configured' };
  }

  const properties = { vp_activation_url: activationUrl };
  const headers = {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    revision: '2024-10-15',
  };

  const importRes = await fetch('https://a.klaviyo.com/api/profile-import/', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      data: { type: 'profile', attributes: { email, properties } },
    }),
  });

  let importBody = null;
  try {
    importBody = await importRes.json();
  } catch {
    importBody = null;
  }

  let profileId = importBody?.data?.id || null;
  if (!profileId) {
    const filter = encodeURIComponent(`equals(email,"${email.replace(/"/g, '\\"')}")`);
    const lookupRes = await fetch(`https://a.klaviyo.com/api/profiles?filter=${filter}`, {
      headers,
    });
    if (lookupRes.ok) {
      const lookupBody = await lookupRes.json();
      profileId = lookupBody?.data?.[0]?.id || null;
    }
  }

  if (profileId) {
    const patchRes = await fetch(`https://a.klaviyo.com/api/profiles/${profileId}/`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        data: { type: 'profile', id: profileId, attributes: { properties } },
      }),
    });
    if (patchRes.ok) return { ok: true, method: 'profile-patch' };
    console.error('Klaviyo profile PATCH failed', patchRes.status, await patchRes.text());
  }

  if (importRes.ok) return { ok: true, method: 'profile-import' };
  console.error('Klaviyo profile-import failed', importRes.status, JSON.stringify(importBody));
  return { ok: false, error: `profile-import failed (${importRes.status})` };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function normalizeEmail(value) {
  if (!value || typeof value !== 'string') return null;
  return value.trim().toLowerCase();
}

function normalizeRedirectPath(value, fallback = null) {
  if (!value || typeof value !== 'string') return fallback;
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
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.includes('//') || /javascript:/i.test(path)) return fallback;
  const pathname = path.split('?')[0];
  if (!/^\/collections\/[a-z0-9][a-z0-9\-_]*$/i.test(pathname)) return fallback;
  return path;
}

function readActivationDestinationQuery(query = {}) {
  const raw = query.to ?? query.redirect ?? query.redirect_path;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
}

function resolveActivationDestination(_tokenRedirectPath, defaultPath, queryOverride = null) {
  const fromQuery = normalizeRedirectPath(queryOverride, null);
  if (fromQuery) return fromQuery;

  return normalizeRedirectPath(defaultPath, '/collections/ventes-privees');
}

async function revokePendingTokensForEmail(env, email) {
  const indexKey = `email:${email}`;
  const previousToken = await env.VP_TOKENS.get(indexKey);
  if (!previousToken) return;

  const prev = await env.VP_TOKENS.get(previousToken);
  if (!prev) return;

  const parsed = JSON.parse(prev);
  if (!parsed.used) {
    await env.VP_TOKENS.put(previousToken, JSON.stringify({ ...parsed, used: true, revoked: true }));
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function redirectToShop(env, path) {
  return Response.redirect(`${env.SHOP_URL}${path}`, 302);
}

