import { createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { db, now } from '../db';
import { HttpError } from './http';

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string | null) {
  if (!stored) return false;
  const [algo, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const key = Buffer.from(keyB64, 'base64');
  const test = await scrypt(pw, Buffer.from(saltB64, 'base64'), key.length);
  return timingSafeEqual(key, test);
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const TOKEN_TTL_S = 60 * 60 * 24 * 60; // 60 days, mobile-friendly

export function signToken(userId: string) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const iat = Math.floor(Date.now() / 1000);
  const payload = b64u(JSON.stringify({ sub: userId, iat, exp: iat + TOKEN_TTL_S }));
  const sig = createHmac('sha256', config.jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifyToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const expected = createHmac('sha256', config.jwtSecret).update(`${h}.${p}`).digest();
  const given = Buffer.from(s, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { userId?: string }
  }
}

function bearer(req: Request) {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const uid = verifyToken(bearer(req));
  if (uid && db.one('SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL', uid)) req.userId = uid;
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const uid = verifyToken(bearer(req));
  if (!uid || !db.one('SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL', uid)) {
    return next(new HttpError(401, 'Sign in to keep the vibe going'));
  }
  req.userId = uid;
  db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', now(), uid);
  next();
}

export const uid = (req: Request) => {
  if (!req.userId) throw new HttpError(401, 'Not signed in');
  return req.userId;
};
