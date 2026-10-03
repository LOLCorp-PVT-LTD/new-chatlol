import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';
import { config, loadedEnvFiles } from './config.js';
import { songSearchStatus } from './routes/profile.js';
import { initDb, db } from './db.js';
import { backfillFriendships } from './lib/friends.js';
import { initShared, shared, sharedBackend } from './lib/shared.js';
import { seedIfEmpty } from './seed.js';
import { runInactivity } from './lib/progression.js';
import { resolveArenaTimeouts } from './lib/arenas.js';
import { finishDueTournaments } from './lib/tournaments.js';
import { startPersonaEngine } from './ai/engine.js';
import { refreshModels, setModelStore } from './ai/nim.js';
import { resolveExpiredTakes } from './routes/arena.js';
import { runBirthdays } from './lib/birthdays.js';

const INSTANCE = `${hostname()}:${process.pid}`;

/**
 * Background work (AI personas, Hot Take resolution) must run on exactly one instance.
 * A lease in the shared state (MongoDB or Redis; renewed every 20s, expires after 60s) elects the worker.
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
  await initDb();
  await initShared();
  await seedIfEmpty();
  // Friends used to mean "follow each other": turn those pairs into friendships once.
  const converted = await backfillFriendships();
  if (converted) console.log(`🤝 ${converted} mutual follows became friendships`);

  const server = createServer(createApp());
  await attachRealtime(server);
  server.listen(config.port, config.host, () => {
    console.log(`🌅 ChatLOL API on http://localhost:${config.port} (db: ${db.kind}, shared state: ${sharedBackend()})`);
    console.log(`   Settings from: ${loadedEnvFiles.length ? loadedEnvFiles.join(', ') : 'environment only (no settings file found)'}`);
    void songSearchStatus().then((s) => console.log(`   Song search: ${s}`));
    console.log(
      `   AI personas: ${config.ai.enabled ? (config.nim.apiKey ? `on (NVIDIA NIM: ${config.nim.apiKeys.length} key${config.nim.apiKeys.length === 1 ? '' : 's'} × ${config.nim.rpm} requests/min)` : '⚠️  NO NVIDIA_API_KEY — personas will not reply to DMs and only post canned filler. Get a free key at https://build.nvidia.com and put it in apps/server/.env') : 'off'}`,
    );
    if (config.nim.apiKey) {
      const report = (r) =>
        r
          ? console.log(
              `   NIM models: ${r.pool.join(', ')} · using first: ${r.current ?? '—'} · replies to people: ${r.chatModel}${r.removed.length ? ` · retired by NVIDIA, dropped: ${r.removed.join(', ')}` : ''}${r.added?.length ? ` · new: ${r.added.join(', ')}` : ''}`,
            )
          : console.log(
              `   NIM models: ${config.nim.models.join(', ')} (couldn't read NVIDIA's catalogue; retired models drop out on first use)`,
            );
      // Working models are saved in MongoDB (kv: nim:models), so restarts start from known-good ones and new releases / retirements are tracked.
      const kv = db.kv.raw;
      const modelStore = {
        load: async () => JSON.parse((await kv.findOne({ _id: 'nim:models' }))?.v ?? '{}'),
        save: (reg) => kv.updateOne({ _id: 'nim:models' }, { $set: { v: JSON.stringify(reg), exp: null } }, { upsert: true }),
      };
      void setModelStore(modelStore)
        .then((r) => r && r.usable && console.log(`   NIM models restored from MongoDB: ${r.usable} working (${r.saved} tracked)`))
        .then(() => refreshModels())
        .then(report);
      setInterval(() => void refreshModels(), 6 * 3_600_000).unref();
    }
    console.log(
      `   Links in emails: ${config.appUrl}${/localhost|127\.0\.0\.1/.test(config.appUrl) && process.env.NODE_ENV === 'production' ? '  ⚠️  APP_URL isn’t set — verification and password-reset emails will point to localhost. Set APP_URL=https://your-domain' : ''}`,
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
    await runBirthdays();
    await runInactivity();
    await resolveArenaTimeouts();
    await finishDueTournaments();
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
