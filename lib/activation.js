import { TOKEN_TTL_SECONDS, getActivationBaseUrl, getConfig } from './config.js';
import { generateToken, revokePendingTokensForEmail, saveToken } from './tokens.js';
import { updateKlaviyoProfile, trackVpResendRequested } from './klaviyo.js';
import { resolveLocaleAndPath } from './redirect-path.js';

export async function createActivationForEmail(email, redirectPathInput, req, localeInput = null) {
  const { vpCollectionPath } = getConfig();
  const { locale, redirectPath } = resolveLocaleAndPath({
    redirectPathInput,
    localeInput,
    defaultPath: vpCollectionPath,
  });

  await revokePendingTokensForEmail(email);

  const token = generateToken();
  const now = Date.now();
  const expiresAt = now + TOKEN_TTL_SECONDS * 1000;

  await saveToken(token, { email, createdAt: now, expiresAt, used: false, redirectPath, locale });

  const baseUrl = getActivationBaseUrl(req);
  const activationUrl = `${baseUrl}/activate?token=${encodeURIComponent(token)}`;
  const klaviyoResult = await updateKlaviyoProfile(email, activationUrl, {
    vp_redirect_path: redirectPath,
    vp_language: locale,
  });

  return {
    activationUrl,
    klaviyoResult,
    expiresAt,
  };
}

export async function resendActivationForEmail(email, redirectPathInput, req, localeInput = null) {
  const result = await createActivationForEmail(email, redirectPathInput, req, localeInput);
  const eventResult = await trackVpResendRequested(email, result.activationUrl);
  return { ...result, eventResult };
}
