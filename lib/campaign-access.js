import { TOKEN_TTL_SECONDS } from './config.js';
import { getProfileById, profileExistsForEmail } from './klaviyo.js';
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

/**
 * Resolve VP browse access for Klaviyo campaign / newsletter links.
 * Accepts Klaviyo profile id (?hash_email=) and/or email fallback.
 *
 * Newsletter clicks with hash_email unlock anyone Klaviyo sent the email to,
 * even if they never completed VP signup (not in vp_tokens / no VP tag).
 */
export async function resolveCampaignAccess({
  profileIdInput,
  emailInput,
  fromCampaignContext = false,
} = {}) {
  const profileId = String(profileIdInput || '').trim();
  let email = normalizeEmail(emailInput);
  let fromVerifiedCampaignClick = false;

  if (!email && profileId) {
    if (!isValidProfileId(profileId)) {
      return { access: false, error: 'invalid_profile_id' };
    }

    const profile = await getProfileById(profileId);
    if (!profile?.email) {
      return { access: false, error: 'profile_not_found' };
    }

    email = normalizeEmail(profile.email);
    fromVerifiedCampaignClick = true;
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
