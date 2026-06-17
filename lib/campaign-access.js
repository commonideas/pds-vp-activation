import { TOKEN_TTL_SECONDS } from './config.js';
import { getProfileById, getProfileByExchangeId, profileExistsForEmail } from './klaviyo.js';
import { customerHasVpAccess } from './shopify.js';
import { getLatestTokenForEmail } from './tokens.js';
import { normalizeEmail } from './http.js';

function isValidProfileId(value) {
  return typeof value === 'string' && /^01[A-Z0-9]{20,}$/i.test(value.trim());
}

function normalizeExchangeId(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(String(value).trim());
  } catch {
    return String(value).trim();
  }
}

function isTokenRowValid(row) {
  if (!row || row.revoked) return false;
  const expiresAt = new Date(row.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function grantCampaignBrowseAccess(source = 'campaign_recipient') {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
  return {
    access: true,
    expires_at: expiresAt,
    source,
  };
}

async function resolveAccessForEmail(emailInput) {
  const email = normalizeEmail(emailInput);
  if (!email) {
    return { access: false, error: 'email_required' };
  }

  const tokenRow = await getLatestTokenForEmail(email);
  if (isTokenRowValid(tokenRow)) {
    return {
      access: true,
      token: tokenRow.token,
      expires_at: tokenRow.expires_at,
      source: 'token',
    };
  }

  if (await customerHasVpAccess(email)) {
    return grantCampaignBrowseAccess('activated');
  }

  return { access: false, error: 'not_registered' };
}

async function resolveEmailFromCampaignIdentifiers({ profileId, exchangeId }) {
  const normalizedExchangeId = normalizeExchangeId(exchangeId);
  if (normalizedExchangeId) {
    const profile = await getProfileByExchangeId(normalizedExchangeId);
    if (profile?.email) {
      return { email: normalizeEmail(profile.email), source: 'exchange_id' };
    }
  }

  const normalizedProfileId = String(profileId || '').trim();
  if (normalizedProfileId && isValidProfileId(normalizedProfileId)) {
    const profile = await getProfileById(normalizedProfileId);
    if (profile?.email) {
      return { email: normalizeEmail(profile.email), source: 'profile_id' };
    }
    return { error: 'profile_not_found' };
  }

  if (normalizedProfileId && !normalizedExchangeId) {
    return { error: 'invalid_profile_id' };
  }

  if (normalizedExchangeId) {
    return { error: 'profile_not_found' };
  }

  return null;
}

/**
 * Resolve VP browse access for Klaviyo campaign / newsletter links.
 * Accepts Klaviyo profile id (?hash_email=), exchange id (?_kx=), and/or email fallback.
 */
export async function resolveCampaignAccess({
  profileIdInput,
  exchangeIdInput,
  emailInput,
  fromCampaignContext = false,
} = {}) {
  let email = normalizeEmail(emailInput);
  let fromVerifiedCampaignClick = false;

  if (!email) {
    const resolved = await resolveEmailFromCampaignIdentifiers({
      profileId: profileIdInput,
      exchangeId: exchangeIdInput,
    });

    if (resolved?.error) {
      return { access: false, error: resolved.error };
    }

    if (resolved?.email) {
      email = resolved.email;
      fromVerifiedCampaignClick = true;
    }
  }

  if (!email) {
    return { access: false, error: 'identifier_required' };
  }

  const vpAccess = await resolveAccessForEmail(email);
  if (vpAccess.access) {
    return vpAccess;
  }

  if (fromVerifiedCampaignClick) {
    return grantCampaignBrowseAccess();
  }

  if (fromCampaignContext && (await profileExistsForEmail(email))) {
    return grantCampaignBrowseAccess();
  }

  return { access: false, error: 'not_registered' };
}
