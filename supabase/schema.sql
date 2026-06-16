-- Run once in Supabase → SQL Editor (Panier des Sens VP activation)

create table if not exists public.vp_tokens (
  token text primary key,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used boolean not null default false,
  revoked boolean not null default false,
  redirect_path text,
  locale text
);

create index if not exists idx_vp_tokens_email on public.vp_tokens (email);
create index if not exists idx_vp_tokens_expires_at on public.vp_tokens (expires_at);

-- Optional: purge expired tokens (run via cron or manually)
-- delete from public.vp_tokens where expires_at < now() - interval '1 day';
