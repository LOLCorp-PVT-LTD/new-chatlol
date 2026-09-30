import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new HttpError(400, first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input', 'validation');
  }
  return r.data;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err instanceof ZodError) return res.status(400).json({ error: err.message, code: 'validation' });
  console.error(err);
  res.status(500).json({ error: 'Something broke on our end. Try again in a sec.' });
}

/** Tiny in-memory token bucket, keyed per user/IP + action. */
const buckets = new Map<string, { tokens: number; at: number }>();
export function rateLimit(key: string, perMinute: number) {
  const t = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, at: t };
  b.tokens = Math.min(perMinute, b.tokens + ((t - b.at) / 60_000) * perMinute);
  b.at = t;
  if (b.tokens < 1) throw new HttpError(429, 'Whoa, slow down a little!', 'rate_limited');
  b.tokens -= 1;
  buckets.set(key, b);
}
