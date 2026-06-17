import { getConfig } from './config.js';
import { maskEmailForLog } from './http.js';

const KLAVIYO_REVISION = '2024-10-15';
const KLAVIYO_BASE = 'https://a.klaviyo.com/api';

function getKlaviyoApiKey() {
  return (
    process.env.KLAVIYO_PRIVATE_API_KEY ||
    process.env.KLAVIYO_API_KEY ||
    process.env.KLAVIYO_PRIVATE_KEY ||
    ''
  );
}

function klaviyoHeaders(apiKey) {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    revision: KLAVIYO_REVISION,
  };
}

function escapeKlaviyoFilterValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function readKlaviyoBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function profileHasVpActivationUrl(email) {
  const apiKey = getKlaviyoApiKey();
  if (!apiKey) return false;

  const lookup = await findProfileIdByEmail(apiKey, email);
  if (!lookup.id) return false;

  const res = await fetch(`${KLAVIYO_BASE}/profiles/${lookup.id}/`, {
    method: 'GET',
    headers: klaviyoHeaders(apiKey),
  });

  const body = await readKlaviyoBody(res);
  if (!res.ok) return false;

  const properties = body?.data?.attributes?.properties || {};
  return Boolean(properties.vp_activation_url);
}

export async function profileExistsForEmail(email) {
  const apiKey = getKlaviyoApiKey();
  if (!apiKey) return false;

  const lookup = await findProfileIdByEmail(apiKey, email);
  return Boolean(lookup.id);
}

export async function getProfileById(profileId) {
  const apiKey = getKlaviyoApiKey();
  if (!apiKey || !profileId) return null;

  const res = await fetch(`${KLAVIYO_BASE}/profiles/${encodeURIComponent(profileId)}/`, {
    method: 'GET',
    headers: klaviyoHeaders(apiKey),
  });

  const body = await readKlaviyoBody(res);
  if (!res.ok) return null;

  const attrs = body?.data?.attributes || {};
  return {
    id: body?.data?.id || profileId,
    email: attrs.email || null,
    properties: attrs.properties || {},
  };
}

function normalizeExchangeId(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(String(value).trim());
  } catch {
    return String(value).trim();
  }
}

export async function getProfileByExchangeId(exchangeIdInput) {
  const apiKey = getKlaviyoApiKey();
  const exchangeId = normalizeExchangeId(exchangeIdInput);
  if (!apiKey || !exchangeId) return null;

  const filter = encodeURIComponent(`equals(_kx,"${escapeKlaviyoFilterValue(exchangeId)}")`);
  const res = await fetch(`${KLAVIYO_BASE}/profiles?filter=${filter}`, {
    method: 'GET',
    headers: klaviyoHeaders(apiKey),
  });

  const body = await readKlaviyoBody(res);
  if (!res.ok) return null;

  const row = body?.data?.[0];
  if (!row) return null;

  const attrs = row.attributes || {};
  return {
    id: row.id || null,
    email: attrs.email || null,
    properties: attrs.properties || {},
  };
}

export async function trackVpResendRequested(email, activationUrl) {
  const apiKey = getKlaviyoApiKey();
  if (!apiKey) {
    return { ok: false, error: 'KLAVIYO_PRIVATE_API_KEY not configured on server' };
  }

  const res = await fetch(`${KLAVIYO_BASE}/events/`, {
    method: 'POST',
    headers: klaviyoHeaders(apiKey),
    body: JSON.stringify({
      data: {
        type: 'event',
        attributes: {
          profile: { data: { type: 'profile', attributes: { email } } },
          metric: { data: { type: 'metric', attributes: { name: 'VP Activation Resend Requested' } } },
          properties: {
            vp_activation_url: activationUrl,
          },
        },
      },
    }),
  });

  const body = await readKlaviyoBody(res);
  if (!res.ok) {
    return { ok: false, error: 'klaviyo_event_failed', detail: body };
  }

  return { ok: true };
}

async function findProfileIdByEmail(apiKey, email) {
  const filter = encodeURIComponent(`equals(email,"${escapeKlaviyoFilterValue(email)}")`);
  const res = await fetch(`${KLAVIYO_BASE}/profiles?filter=${filter}`, {
    method: 'GET',
    headers: klaviyoHeaders(apiKey),
  });

  const body = await readKlaviyoBody(res);
  if (!res.ok) {
    return { id: null, error: body };
  }

  return { id: body?.data?.[0]?.id || null, error: null };
}

async function patchProfileProperties(apiKey, profileId, properties) {
  const res = await fetch(`${KLAVIYO_BASE}/profiles/${profileId}/`, {
    method: 'PATCH',
    headers: klaviyoHeaders(apiKey),
    body: JSON.stringify({
      data: {
        type: 'profile',
        id: profileId,
        attributes: { properties },
      },
    }),
  });

  const body = await readKlaviyoBody(res);
  return { ok: res.ok, status: res.status, body };
}

async function importProfile(apiKey, email, properties) {
  const res = await fetch(`${KLAVIYO_BASE}/profile-import/`, {
    method: 'POST',
    headers: klaviyoHeaders(apiKey),
    body: JSON.stringify({
      data: {
        type: 'profile',
        attributes: {
          email,
          properties,
        },
      },
    }),
  });

  const body = await readKlaviyoBody(res);
  return { ok: res.ok, status: res.status, body };
}

/**
 * Set vp_activation_url on Klaviyo profile (import + PATCH fallback).
 * @returns {Promise<{ok: boolean, method?: string, error?: string, detail?: unknown}>}
 */
export async function updateKlaviyoProfile(email, activationUrl, extraProperties = {}) {
  const apiKey = getKlaviyoApiKey();
  const masked = maskEmailForLog(email);
  const properties = { vp_activation_url: activationUrl, ...extraProperties };

  if (!apiKey) {
    console.warn('[vp/create] KLAVIYO_PRIVATE_API_KEY not set — skipping profile update', {
      email: masked,
    });
    return {
      ok: false,
      error: 'KLAVIYO_PRIVATE_API_KEY not configured on server',
    };
  }

  const imported = await importProfile(apiKey, email, properties);
  let profileId = imported.body?.data?.id || null;

  if (!imported.ok) {
    console.warn('[vp/create] Klaviyo profile-import failed', {
      email: masked,
      status: imported.status,
      body: imported.body,
    });
  }

  if (!profileId) {
    const lookup = await findProfileIdByEmail(apiKey, email);
    profileId = lookup.id;
    if (!profileId && lookup.error) {
      console.warn('[vp/create] Klaviyo profile lookup failed', {
        email: masked,
        body: lookup.error,
      });
    }
  }

  if (profileId) {
    const patched = await patchProfileProperties(apiKey, profileId, properties);
    if (patched.ok) {
      return { ok: true, method: imported.ok ? 'profile-import+patch' : 'profile-patch' };
    }

    console.error('[vp/create] Klaviyo profile PATCH failed', {
      email: masked,
      status: patched.status,
      body: patched.body,
    });

    if (imported.ok) {
      return {
        ok: true,
        method: 'profile-import',
        detail: 'import succeeded; patch verification unavailable',
      };
    }

    return {
      ok: false,
      error: `Klaviyo profile update failed (import ${imported.status}, patch ${patched.status})`,
      detail: { import: imported.body, patch: patched.body },
    };
  }

  if (imported.ok) {
    return { ok: true, method: 'profile-import' };
  }

  return {
    ok: false,
    error: `Klaviyo profile-import failed (${imported.status})`,
    detail: imported.body,
  };
}
