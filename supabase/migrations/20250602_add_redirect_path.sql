-- Run in Supabase SQL Editor if vp_tokens already exists without redirect_path

alter table public.vp_tokens
  add column if not exists redirect_path text;
