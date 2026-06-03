import { createClient } from '@supabase/supabase-js';

let client = null;

/**
 * Supports manual env vars and Vercel Supabase integration (2024+ naming).
 * URL: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 * Key: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY (server / service role)
 */
function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  return { url, key };
}

export function getSupabase() {
  if (client) return client;

  const { url, key } = getSupabaseConfig();

  if (!url || !key) {
    throw new Error(
      'Missing Supabase config. Need URL (SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL) and secret key (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY)'
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}
