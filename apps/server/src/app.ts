import express from 'express';
import cors from 'cors';
import { config } from './config';
import { errorHandler } from './lib/http';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { postsRouter } from './routes/posts';
import { arenaRouter } from './routes/arena';
import { socialRouter } from './routes/social';
import { storeRouter } from './routes/store';
import { liveRouter } from './routes/live';
import { paymentsRouter } from './routes/payments';
import { presence } from './lib/presence';
import { db } from './db';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  // Stripe signs the raw bytes, so its webhook must skip JSON parsing.
  app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '30d', immutable: true, setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));

  app.get('/api/health', async (_req, res) => {
    res.json({ ok: true, db: db.kind, online: await presence.count(), ai: config.ai.enabled, nim: !!config.nim.apiKey, turn: config.rtc.turnUrls.length > 0 });
  });
  for (const r of [authRouter, usersRouter, postsRouter, arenaRouter, socialRouter, storeRouter, liveRouter, paymentsRouter]) app.use('/api', r);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
