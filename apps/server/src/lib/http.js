import { shared } from './shared.js';
import { config } from '../config.js';

import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new HttpError(400, first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input', 'validation');
  }
  return r.data;
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err instanceof ZodError) return res.status(400).json({ error: err.message, code: 'validation' });
  console.error(err);
  res.status(500).json({ error: 'Something broke on our end. Try again in a sec.' });
}

/** Fixed-window rate limit shared across instances (Redis when configured). */
export async function rateLimit(key, perMinute) {
  const window = Math.floor(Date.now() / 60_000);
  const n = await shared().incr(`rl:${key}:${window}`, 70);
  if (n > perMinute * config.rateLimitScale) throw new HttpError(429, 'Whoa, slow down a little!', 'rate_limited');
}
