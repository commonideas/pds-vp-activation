import { TOKEN_TTL_SECONDS } from './config.js';
import { getSupabase } from './supabase.js';

export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function rowToTokenData(row) {
  if (!row) return null;
  return {
    email: row.email,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    used: row.used,
    redirectPath: row.redirect_path || null,
  };
}

export async function revokePendingTokensForEmail(email) {
  const supabase = getSupabase();

  await supabase
    .from('vp_tokens')
    .update({ used: true, revoked: true })
    .eq('email', email)
    .eq('used', false);
}

export async function saveToken(token, data) {
  const supabase = getSupabase();

  const { error } = await supabase.from('vp_tokens').insert({
    token,
    email: data.email,
    created_at: new Date(data.createdAt).toISOString(),
    expires_at: new Date(data.expiresAt).toISOString(),
    used: false,
    revoked: false,
    redirect_path: data.redirectPath || null,
  });

  if (error) {
    console.error('saveToken error', error);
    throw error;
  }
}

export async function getToken(token) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('vp_tokens')
    .select('email, created_at, expires_at, used, redirect_path')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error('getToken error', error);
    return null;
  }

  return rowToTokenData(data);
}

export async function markTokenUsed(token, data) {
  const supabase = getSupabase();

  await supabase.from('vp_tokens').update({ used: true }).eq('token', token);
}

export async function markTokenUnused(token, data) {
  const supabase = getSupabase();

  await supabase.from('vp_tokens').update({ used: false }).eq('token', token);
}
