import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';
import { config } from './config.js';
import { initDb, db } from './db.js';
import { initShared, shared } from './lib/shared.js';
import { seedIfEmpty } from './seed.js';
import { startPersonaEngine } from './ai/engine.js';
import { resolveExpiredTakes } from './routes/arena.js';

const INSTANCE = `${hostname()}:${process.pid}`;

/**
 * Background work (AI personas, Hot Take resolution) must run on exactly one instance.
 * A Redis lease (renewed every 20s, expires after 60s) elects the worker; without Redis this instance is it.
 */
async function acquireWorkerLease() {
  const key = 'lease:workers';
  if (await shared().setNx(key, INSTANCE, 60_000)) return true;
  if ((await shared().get(key)) === INSTANCE) {
    await shared().set(key, INSTANCE, 60);
    return true;
  }
  return false;
}

async function main() {
  await initShared();
  await initDb();
  await seedIfEmpty();

  const server = createServer(createApp());
  await attachRealtime(server);
  server.listen(config.port, () => {
    console.log(`🌅 ChatLOL API on http://localhost:${config.port} (db: ${db.kind}, redis: ${config.redisUrl ? 'on' : 'off'})`);
    console.log(
      `   AI personas: ${config.ai.enabled ? (config.nim.apiKey ? `on (NVIDIA NIM: ${config.nim.models.length} models)` : '⚠️  NO NVIDIA_API_KEY — personas will not reply to DMs and only post canned filler. Get a free key at https://build.nvidia.com and put it in apps/server/.env') : 'off'}`,
    );
    console.log(
      `   Live video: ${config.rtc.turnUrls.length ? `TURN ${config.rtc.turnUrls.join(', ')}` : 'STUN only (set TURN_URLS + TURN_SECRET for your TURN server)'} • mesh cap ${config.rtc.maxViewers} viewers`,
    );
  });

  if (!config.runWorkers) return;
  if (!config.ai.enabled) await shared().del('presence:ai');
  let engineStarted = false;
  const tick = async () => {
    if (!(await acquireWorkerLease())) return;
    await resolveExpiredTakes();
    if (config.ai.enabled && !engineStarted) {
      engineStarted = true;
      await startPersonaEngine(() => acquireWorkerLease());
    }
  };
  void tick().catch((e) => console.error('[worker]', e));
  setInterval(() => void tick().catch((e) => console.error('[worker]', e)), 20_000);

  const shutdown = () => {
    server.close();
    void db.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
