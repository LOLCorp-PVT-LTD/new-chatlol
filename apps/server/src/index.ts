import { createServer } from 'node:http';
import { createApp } from './app';
import { attachRealtime } from './realtime';
import { config } from './config';
import { getDb } from './db';
import { seedIfEmpty } from './seed';
import { startPersonaEngine } from './ai/engine';
import { resolveExpiredTakes } from './routes/arena';

getDb();
seedIfEmpty();

const app = createApp();
const server = createServer(app);
attachRealtime(server);

server.listen(config.port, () => {
  console.log(`🌅 ChatLOL API on http://localhost:${config.port}`);
  console.log(`   AI personas: ${config.ai.enabled ? (config.nim.apiKey ? `on (NVIDIA NIM: ${config.nim.models.length} models)` : 'on (offline fallback — set NVIDIA_API_KEY for NIM)') : 'off'}`);
});

setInterval(() => resolveExpiredTakes(), 60_000);
if (config.ai.enabled) startPersonaEngine();
