# VP Magic Link — Vercel deployment

One-click VP access after Klaviyo signup: **unique token**, **7-day TTL**, **single-use**, adds Shopify customer tag `VP`.

**Platform:** Vercel Serverless Functions + **Upstash Redis** (Vercel Marketplace)

Full setup guide: **[docs/vp/09-vercel-setup.md](../docs/vp/09-vercel-setup.md)**

---

## Quick deploy (Git → Vercel)

1. Push this repo to GitHub/GitLab.
2. Vercel → **New Project** → import repo.
3. **Root Directory:** `vp-activation`
4. **Storage** → Marketplace → **Upstash** → create Redis → connect to project (there is no standalone “KV” option anymore).
5. Add environment variables (see `.env.example`).
6. Deploy → set `ACTIVATION_BASE_URL` to your Vercel URL → redeploy.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/vp/create` | Klaviyo webhook (secured) |
| GET | `/activate?token=...` | Activate VP access |

---

## Environment variables

Copy from `.env.example`. Required:

- `SHOPIFY_STORE`
- `SHOPIFY_ADMIN_TOKEN`
- `SHOP_URL`
- `VP_COLLECTION_PATH`
- `KLAVIYO_WEBHOOK_SECRET`
- `KLAVIYO_PRIVATE_API_KEY`
- `ACTIVATION_BASE_URL`
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (auto when Upstash is linked)

---

## Klaviyo webhook

- **URL:** `https://YOUR_DOMAIN/api/vp/create`
- **Header:** `x-klaviyo-secret: <KLAVIYO_WEBHOOK_SECRET>`
- **Body:** `{"email": "{{ person.email }}"}`
- **Email link:** `{{ person.vp_activation_url }}`

---

## Local dev

```bash
npm install
vercel link
vercel env pull .env.local
npm run dev
```

---

## Legacy Cloudflare Worker

Files `src/index.js` and `wrangler.toml` are kept for reference only.  
Use **Vercel** for new deployments.

Cloudflare guide (optional): [docs/vp/07-cloudflare-wrangler-setup.md](../docs/vp/07-cloudflare-wrangler-setup.md)

---

## Related

- [Customer testing guide](../docs/vp/08-customer-testing-guide.md)
- [Automatic discounts](../docs/vp/05-automatic-discounts.md)
