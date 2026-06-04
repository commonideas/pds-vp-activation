import { getConfig } from './config.js';
import { maskEmailForLog } from './http.js';

/** @returns {Promise<boolean>} true if vp_activation_url was set on the profile */
export async function updateKlaviyoProfile(email, activationUrl) {
  const { klaviyoPrivateApiKey } = getConfig();
  const masked = maskEmailForLog(email);

  if (!klaviyoPrivateApiKey) {
    console.warn('[vp/create] KLAVIYO_PRIVATE_API_KEY not set — skipping profile update', { email: masked });
    return false;
  }

  const res = await fetch('https://a.klaviyo.com/api/profile-import/', {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${klaviyoPrivateApiKey}`,
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
    console.error('[vp/create] Klaviyo profile-import failed', res.status, await res.text(), { email: masked });
    return false;
  }

  return true;
}
