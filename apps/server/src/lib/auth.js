import { createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { config } from '../config.js';
import { db, now } from '../db.js';
import { HttpError } from './http.js';

const scrypt = promisify(_scrypt);

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw, stored) {
  if (!stored) return false;
  const [algo, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const key = Buffer.from(keyB64, 'base64');
  const test = await scrypt(pw, Buffer.from(saltB64, 'base64'), key.length);
  return timingSafeEqual(key, test);
}

const b64u = (b) => Buffer.from(b).toString('base64url');
const TOKEN_TTL_S = 60 * 60 * 24 * 60; // 60 days, mobile-friendly

/** `pv` (password version) lets a password reset invalidate every existing session. */
export function signToken(userId, pv = '') {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const iat = Math.floor(Date.now() / 1000);
  const payload = b64u(JSON.stringify({ sub: userId, pv, iat, exp: iat + TOKEN_TTL_S }));
  const sig = createHmac('sha256', config.jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const expected = createHmac('sha256', config.jwtSecret).update(`${h}.${p}`).digest();
  const given = Buffer.from(s, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return typeof payload.sub === 'string' ? { sub: payload.sub, pv: payload.pv ?? '' } : null;
  } catch {
    return null;
  }
}

/** Short fingerprint of the password hash; changes whenever the password changes. */
export const passwordVersion = (hash) => (hash ? createHmac('sha256', config.jwtSecret).update(hash).digest('base64url').slice(0, 10) : '');

/** Resolves a bearer token to an active user id (checks deletion + password version). */
export async function authenticate(token) {
  const t = verifyToken(token);
  if (!t) return null;
  const u = await db.users.findOne({ _id: t.sub, deletedAt: null }, { projection: { passwordHash: 1, isAi: 1 } });
  if (!u || u.isAi) return null;
  if (t.pv && t.pv !== passwordVersion(u.passwordHash)) return null;
  return t.sub;
}

function bearer(req) {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

export async function optionalAuth(req, _res, next) {
  try {
    const uid = await authenticate(bearer(req));
    if (uid) req.userId = uid;
    next();
  } catch (e) {
    next(e);
  }
}

export async function requireAuth(req, _res, next) {
  try {
    const uid = await authenticate(bearer(req));
    if (!uid) return next(new HttpError(401, 'Sign in to keep the vibe going'));
    req.userId = uid;
    void db.users.updateOne({ _id: uid }, { $set: { lastSeenAt: now() } }).catch(() => {});
    next();
  } catch (e) {
    next(e);
  }
}

export const uid = (req) => {
  if (!req.userId) throw new HttpError(401, 'Not signed in');
  return req.userId;
};
