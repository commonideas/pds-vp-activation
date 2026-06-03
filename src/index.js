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
    JSON.stringify({ email, createdAt: now, expiresAt, used: false }),
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
  const token = new URL(request.url).searchParams.get('token');

  if (!token) {
    return redirectToShop(env, '/pages/vp?vp_error=missing_token');
  }

  const raw = await env.VP_TOKENS.get(token);

  if (!raw) {
    return redirectToShop(env, '/pages/vp?vp_error=invalid_token');
  }

  const data = JSON.parse(raw);

  if (data.used) {
    return redirectToShop(env, '/pages/vp?vp_error=already_used');
  }

  if (Date.now() > data.expiresAt) {
    return redirectToShop(env, '/pages/vp?vp_error=expired');
  }

  // Mark used before Shopify call to reduce double-redemption race
  await env.VP_TOKENS.put(token, JSON.stringify({ ...data, used: true }));

  const shopifyResult = await ensureCustomerWithVpTag(env, data.email);

  if (!shopifyResult.ok) {
    // Allow retry if Shopify failed
    await env.VP_TOKENS.put(token, JSON.stringify({ ...data, used: false }));
    return redirectToShop(env, '/pages/vp?vp_error=activation_failed');
  }

  const returnPath = env.VP_COLLECTION_PATH || '/collections/vp-h7k3m9';
  const loginUrl = `${env.SHOP_URL}/account/login?return_url=${encodeURIComponent(returnPath)}`;

  if (shopifyResult.alreadyHadTag) {
    return Response.redirect(`${loginUrl}&vp_notice=already_active`, 302);
  }

  return Response.redirect(`${loginUrl}&vp_notice=activated`, 302);
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
  if (!env.KLAVIYO_PRIVATE_API_KEY) {
    console.warn('KLAVIYO_PRIVATE_API_KEY not set — skipping profile update');
    return;
  }

  const res = await fetch('https://a.klaviyo.com/api/profile-import/', {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${env.KLAVIYO_PRIVATE_API_KEY}`,
      'Content-Type': 'application/json',
      revision: '2024-10-15',
    },
    body: JSON.stringify({
      data: {
        type: 'profile',
        attributes: {
          email,
          properties: {
            vp_activation_url: activationUrl,
          },
        },
      },
    }),
  });

  if (!res.ok) {
    console.error('Klaviyo profile-import failed', res.status, await res.text());
  }
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
