import { Redis } from '@upstash/redis';
import { TOKEN_TTL_SECONDS } from './config.js';

const tokenKey = (token) => `vp:token:${token}`;
const emailIndexKey = (email) => `vp:email:${email}`;

function getRedis() {
  return Redis.fromEnv();
}

export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function revokePendingTokensForEmail(email) {
  const redis = getRedis();
  const previousToken = await redis.get(emailIndexKey(email));
  if (!previousToken) return;

  const prev = await redis.get(tokenKey(previousToken));
  if (!prev) return;

  const parsed = typeof prev === 'string' ? JSON.parse(prev) : prev;
  if (!parsed.used) {
    await redis.set(tokenKey(previousToken), { ...parsed, used: true, revoked: true }, {
      ex: TOKEN_TTL_SECONDS,
    });
  }
}

export async function saveToken(token, data) {
  const redis = getRedis();
  await redis.set(tokenKey(token), data, { ex: TOKEN_TTL_SECONDS });
  await redis.set(emailIndexKey(data.email), token, { ex: TOKEN_TTL_SECONDS });
}

export async function getToken(token) {
  const redis = getRedis();
  const raw = await redis.get(tokenKey(token));
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

export async function markTokenUsed(token, data) {
  const redis = getRedis();
  await redis.set(tokenKey(token), { ...data, used: true }, { ex: TOKEN_TTL_SECONDS });
}

export async function markTokenUnused(token, data) {
  const redis = getRedis();
  await redis.set(tokenKey(token), { ...data, used: false }, { ex: TOKEN_TTL_SECONDS });
}
