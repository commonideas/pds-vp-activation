import { TOKEN_TTL_SECONDS } from './config.js';
import { getProfileById } from './klaviyo.js';
import { customerHasVpAccess } from './shopify.js';
import { getLatestTokenForEmail } from './tokens.js';
import { normalizeEmail } from './http.js';

function isValidProfileId(value) {
  return typeof value === 'string' && /^01[A-Z0-9]{20,}$/i.test(value.trim());
}

function isTokenRowValid(row) {
  if (!row || row.revoked) return false;
  const expiresAt = new Date(row.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

/**
 * Resolve VP browse access for Klaviyo campaign links (?hash_email=profileId).
 * @returns {Promise<{access: boolean, token?: string, expires_at?: string, source?: string, error?: string}>}
 */
export async function resolveCampaignAccess(profileIdInput) {
  const profileId = String(profileIdInput || '').trim();
  if (!isValidProfileId(profileId)) {
    return { access: false, error: 'invalid_profile_id' };
  }

  const profile = await getProfileById(profileId);
  if (!profile?.email) {
    return { access: false, error: 'profile_not_found' };
  }

  const email = normalizeEmail(profile.email);
  if (!email) {
    return { access: false, error: 'profile_email_missing' };
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
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
    return {
      access: true,
      expires_at: expiresAt,
      source: 'activated',
    };
  }

  return { access: false, error: 'not_registered' };
}
