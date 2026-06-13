import { customerHasVpAccess } from './shopify.js';
import { getLatestTokenForEmail } from './tokens.js';
import { profileHasVpActivationUrl, profileExistsForEmail } from './klaviyo.js';

/**
 * @returns {Promise<'activated' | 'registered' | 'unknown'>}
 */
export async function getEmailVpStatus(email) {
  if (await customerHasVpAccess(email)) {
    return 'activated';
  }

  const tokenRow = await getLatestTokenForEmail(email);
  if (tokenRow) {
    return 'registered';
  }

  if (await profileHasVpActivationUrl(email)) {
    return 'registered';
  }

  if (await profileExistsForEmail(email)) {
    return 'registered';
  }

  return 'unknown';
}
