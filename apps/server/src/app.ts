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
import { presence } from './lib/presence';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '30d', immutable: true }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, online: presence.count(), ai: config.ai.enabled, nim: !!config.nim.apiKey }));
  for (const r of [authRouter, usersRouter, postsRouter, arenaRouter, socialRouter, storeRouter]) app.use('/api', r);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
