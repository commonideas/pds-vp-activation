import { getConfig } from './config.js';

export async function updateKlaviyoProfile(email, activationUrl) {
  const { klaviyoPrivateApiKey } = getConfig();

  if (!klaviyoPrivateApiKey) {
    console.warn('KLAVIYO_PRIVATE_API_KEY not set — skipping profile update');
    return;
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
    console.error('Klaviyo profile-import failed', res.status, await res.text());
  }
}
