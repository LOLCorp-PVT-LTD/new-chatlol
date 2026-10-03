import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { errorHandler } from './lib/http.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { postsRouter } from './routes/posts.js';
import { arenaRouter } from './routes/arena.js';
import { socialRouter } from './routes/social.js';
import { storeRouter } from './routes/store.js';
import { liveRouter } from './routes/live.js';
import { arenasRouter } from './routes/arenas.js';
import { arcadeRouter } from './routes/arcade.js';
import { paymentsRouter } from './routes/payments.js';
import { profileRouter } from './routes/profile.js';
import { shoutsRouter } from './routes/shouts.js';
import { homeRouter } from './routes/home.js';
import { adminRouter } from './routes/admin.js';
import { friendsRouter } from './routes/friends.js';
import { presence } from './lib/presence.js';
import { db } from './db.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  // Stripe signs the raw bytes, so its webhook must skip JSON parsing.
  app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(
    '/uploads',
    express.static(config.uploadDir, {
      maxAge: '30d',
      immutable: true,
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    }),
  );

  app.get('/api/health', async (_req, res) => {
    res.json({
      ok: true,
      db: db.kind,
      online: await presence.count(),
      ai: config.ai.enabled,
      nim: !!config.nim.apiKey,
      turn: config.rtc.turnUrls.length > 0,
    });
  });
  for (const r of [
    authRouter,
    usersRouter,
    profileRouter,
    shoutsRouter,
    homeRouter,
    adminRouter,
    postsRouter,
    arenaRouter,
    arenasRouter,
    arcadeRouter,
    socialRouter,
    storeRouter,
    liveRouter,
    paymentsRouter,
    friendsRouter,
  ])
    app.use('/api', r);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
