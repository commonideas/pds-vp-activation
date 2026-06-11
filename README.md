# VP Magic Link — Vercel deployment

One-click VP access after Klaviyo signup: **unique token**, **7-day TTL**, adds Shopify customer tag `VP`. Within 7 days (first or repeat click): redirect to VP collection. After 7 days (activated or not): redirect to homepage.

**Platform:** Vercel Serverless Functions + **Supabase Postgres** (token storage)

Setup: **[docs/vp/11-supabase-setup.md](../docs/vp/11-supabase-setup.md)** (Supabase)  
Alternative: Upstash Redis — see [09-vercel-setup.md](../docs/vp/09-vercel-setup.md)

Full setup guide: **[docs/vp/09-vercel-setup.md](../docs/vp/09-vercel-setup.md)**

---

## Quick deploy (Git → Vercel)

1. Push this repo to GitHub/GitLab.
2. Vercel → **New Project** → import repo.
3. **Root Directory:** `vp-activation`
4. Create **Supabase** project + run `supabase/schema.sql` (see [11-supabase-setup.md](../docs/vp/11-supabase-setup.md)).
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
- `SHOP_HOME_PATH` (default `/` — expired/invalid links)
- `VP_COLLECTION_PATH` — **live:** `/collections/vp-h7k3m9` (assign `collection.vp` on the collection in Shopify). **Draft preview only:** add `?view=vp` to the path in Vercel env.
- `KLAVIYO_WEBHOOK_SECRET`
- `KLAVIYO_PRIVATE_API_KEY`
- `ACTIVATION_BASE_URL`
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

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
