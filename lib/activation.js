import { TOKEN_TTL_SECONDS, getActivationBaseUrl, getConfig } from './config.js';
import { generateToken, revokePendingTokensForEmail, saveToken } from './tokens.js';
import { updateKlaviyoProfile, trackVpResendRequested } from './klaviyo.js';
import { normalizeRedirectPath } from './redirect-path.js';

export async function createActivationForEmail(email, redirectPathInput, req) {
  const { vpCollectionPath } = getConfig();
  const redirectPath = normalizeRedirectPath(redirectPathInput, normalizeRedirectPath(vpCollectionPath, null));

  await revokePendingTokensForEmail(email);

  const token = generateToken();
  const now = Date.now();
  const expiresAt = now + TOKEN_TTL_SECONDS * 1000;

  await saveToken(token, { email, createdAt: now, expiresAt, used: false, redirectPath });

  const baseUrl = getActivationBaseUrl(req);
  const activationUrl = `${baseUrl}/activate?token=${encodeURIComponent(token)}`;
  const klaviyoResult = await updateKlaviyoProfile(email, activationUrl);

  return {
    activationUrl,
    klaviyoResult,
    expiresAt,
  };
}

export async function resendActivationForEmail(email, redirectPathInput, req) {
  const result = await createActivationForEmail(email, redirectPathInput, req);
  const eventResult = await trackVpResendRequested(email, result.activationUrl);
  return { ...result, eventResult };
}
