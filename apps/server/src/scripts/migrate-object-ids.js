/**
 * One-off migration: turns every string _id (u_k3j9…, p_8fh2…, ai_zara, u_demo, board/lounge/store slugs,
 * dates, composite keys…) into a real ObjectId, and rewrites every reference to it in every collection
 * (authorId, userId, members.userId, mentions, roomId, boardId, itemId, dropId, notification links, DM memory
 * notes…). Readable keys move to their own fields: boards/lounges → slug, store items → key, drops → day,
 * email tokens → tokenHash, push tokens → token, purchases → providerTxId, birthday posts → systemKey.
 *
 *   npm run db:migrate-ids -w apps/server -- --dry-run     # report what would change, write nothing
 *   npm run db:migrate-ids -w apps/server                  # migrate (stop the API servers first)
 *   npm run db:migrate-ids -w apps/server -- --drop-backups  # later, once you're happy: delete the backups
 *
 * Uses MONGODB_URL / MONGODB_DB from apps/server/.env, like the server. Nothing is deleted: each original
 * collection is renamed to <name>__backup_<timestamp> and the migrated copy takes its name. To roll back, stop
 * the servers and rename the backups back. Safe to re-run: an already-migrated database is left as it is.
 */
import { ObjectId } from 'mongodb';
import { COLLECTIONS, db, initDb, isIdField } from '../db.js';
import { ensureIndexes } from '../indexes.js';
import { DEMO_USER_ID, boardIdFor, itemIdFor, loungeIdFor, personaUserId } from '../lib/ids.js';

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const HEX24 = /^[0-9a-f]{24}$/;
/** Shared-state and event collections hold no records: they're cleared instead of migrated. */
const EPHEMERAL = ['kv', 'busEvents', 'socketEvents'];
const SKIP = new Set(['locks', ...EPHEMERAL]);
const ENTITIES = COLLECTIONS.filter((n) => !SKIP.has(n));
/** Collections whose old ids are slugs / natural keys: only fields that point at them are remapped with them. */
const KEYED = { boards: 'slug', lounges: 'slug', storeItems: 'key', drops: 'day', emailTokens: 'tokenHash', pushTokens: 'token', purchases: 'providerTxId' };
/** Fields that point at one of the keyed collections. */
const POINTS_AT = { boardId: 'boards', itemId: 'storeItems', dropId: 'drops', loungeId: 'lounges' };
const BATCH = 1000;

const raw = (name) => db[name].raw;
const log = (...a) => console.log(...a);

async function main() {
  await initDb();
  if (args.has('--drop-backups')) return dropBackups();
  log(`🍃 Database: ${db.name}${DRY ? '  (dry run — nothing will be written)' : ''}`);

  // ——— 1. Work out the new id of every record ———
  const maps = Object.fromEntries(ENTITIES.map((n) => [n, new Map()])); // per collection: old string id → new hex
  const global = new Map(); // generic (prefixed) old ids → new hex, for every reference field
  const counts = Object.fromEntries(ENTITIES.map((n) => [n, { docs: 0, ids: 0, refs: 0, dangling: 0 }]));
  let todo = 0;
  for (const name of ENTITIES) {
    const cur = raw(name).find({}, { projection: { _id: 1, isAi: 1, personaId: 1 } });
    for await (const d of cur) {
      counts[name].docs++;
      if (typeof d._id !== 'string') continue;
      counts[name].ids++;
      todo++;
      maps[name].set(d._id, newIdFor(name, d));
    }
    if (!KEYED[name]) for (const [o, n] of maps[name]) global.set(o, n);
  }
  // Battle options inside posts have their own ids (bo_…), referenced by battleVotes.optionId.
  for await (const p of raw('posts').find({ 'battle.id': { $type: 'string' } }, { projection: { battle: 1 } }))
    for (const o of p.battle ?? []) if (typeof o.id === 'string' && !HEX24.test(o.id) && !global.has(o.id)) global.set(o.id, new ObjectId().toHexString());

  // Reference fields that still hold strings mean the data needs rewriting even if every _id is already an ObjectId.
  const stringRefs = await countStringRefs();
  if (!todo && !stringRefs) {
    log('✅ Already migrated: every _id and reference is an ObjectId. Nothing to do.');
    return;
  }

  // ——— 2. Rewrite every document ———
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const swaps = [];
  for (const name of ENTITIES) {
    const c = counts[name];
    if (!c.docs) continue;
    const target = `${name}__migrating`;
    if (!DRY) await raw(name).db.collection(target).drop().catch(() => {});
    let batch = [];
    const flush = async () => {
      if (batch.length && !DRY) await raw(name).db.collection(target).insertMany(batch, { ordered: false });
      batch = [];
    };
    for await (const doc of raw(name).find({})) {
      batch.push(migrateDoc(name, doc, maps, global, c));
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    swaps.push(name);
  }

  // ——— 3. Report ———
  log('\n Collection            docs   new _ids   references   dangling refs');
  for (const name of ENTITIES) {
    const c = counts[name];
    if (!c.docs) continue;
    log(` ${name.padEnd(20)} ${String(c.docs).padStart(6)} ${String(c.ids).padStart(10)} ${String(c.refs).padStart(12)} ${String(c.dangling).padStart(15)}`);
  }
  log('\n "dangling" = references to records that no longer exist; they get a fresh ObjectId that points nowhere, same as before.');
  if (DRY) {
    log('\nDry run finished — run again without --dry-run to migrate (stop the API servers first).');
    return;
  }

  // ——— 4. Swap the migrated copies in, keeping the originals as backups ———
  for (const name of swaps) {
    const dbh = raw(name).db;
    await dbh.collection(name).rename(`${name}__backup_${stamp}`);
    await dbh.collection(`${name}__migrating`).rename(name);
  }
  for (const name of EPHEMERAL) await raw(name).deleteMany({}); // presence, rate limits, cooldowns: rebuilt on the fly
  await ensureIndexes(db);

  // ——— 5. Verify ———
  const left = [];
  for (const name of ENTITIES) {
    const n = await raw(name).countDocuments({ _id: { $type: 'string' } });
    if (n) left.push(`${name}: ${n}`);
  }
  const refsLeft = await countStringRefs();
  if (left.length || refsLeft) {
    log(`\n⚠️  Some string ids remain: ${left.join(', ') || ''} ${refsLeft ? `(${refsLeft} references)` : ''}`);
    process.exitCode = 1;
  } else log('\n✅ Done: every _id and reference is now an ObjectId.');
  log(`   Originals kept as *__backup_${stamp}. When you're happy, delete them with --drop-backups.`);
  log('   Existing sign-ins keep working: each user keeps their old id as legacyId for tokens issued before today.');
}

/** The new id for a record that has a string _id. */
function newIdFor(name, d) {
  const id = d._id;
  if (name === 'users') {
    if (d.isAi && d.personaId) return personaUserId(d.personaId);
    if (id === 'u_demo') return DEMO_USER_ID;
  }
  if (name === 'boards') return boardIdFor(id);
  if (name === 'lounges') return loungeIdFor(id);
  if (name === 'storeItems') return itemIdFor(id);
  if (HEX24.test(id)) return id; // already the right value, just stored as a string
  return new ObjectId().toHexString();
}

/** Resolves an old string reference to its new id (or leaves non-id values like 'ai' or slugs alone). */
function resolve(value, target, maps, global, c) {
  if (typeof value !== 'string') return value;
  if (target) {
    const hit = maps[target].get(value);
    if (hit) return new ObjectId(hit);
  }
  const hit = global.get(value);
  if (hit) return new ObjectId(hit);
  if (HEX24.test(value)) return new ObjectId(value);
  // An old-style generated id (prefix_ + 24 chars, ai_xxx) for a record that's gone: keep it consistent.
  if (/^[a-z]+_[a-z0-9]{24}$/.test(value) || /^ai_[a-z]+$/.test(value)) {
    c.dangling++;
    const n = new ObjectId().toHexString();
    global.set(value, n);
    return new ObjectId(n);
  }
  return value;
}

function migrateDoc(name, doc, maps, global, c) {
  const out = remap(doc, name, maps, global, c, '');
  const oldId = doc._id;
  if (typeof oldId === 'string') {
    out._id = new ObjectId(maps[name].get(oldId));
    if (KEYED[name] && out[KEYED[name]] == null) out[KEYED[name]] = oldId; // keep the readable key
    if (name === 'users' && !HEX24.test(oldId)) out.legacyId = oldId; // so sign-in tokens issued before the migration keep working
    if (name === 'posts' && oldId.startsWith('bday_')) {
      const year = oldId.slice(-4);
      out.systemKey = `birthday:${out.authorId instanceof ObjectId ? out.authorId.toHexString() : out.authorId}:${year}`;
    }
  }
  if (name === 'conversations') {
    // DM memory notes are keyed by persona user id; the pair key is built from the member ids.
    if (out.aiNotes) out.aiNotes = Object.fromEntries(Object.entries(out.aiNotes).map(([k, v]) => [resolve(k, 'users', maps, global, c)?.toString(), v]));
    if (out.pairKey && Array.isArray(out.members) && out.members.length === 2)
      out.pairKey = out.members.map((m) => String(m.userId)).sort().join('|');
  }
  if (name === 'modEvents' && 'by' in out) {
    out.byUserId = out.by === 'ai' ? 'ai' : resolve(out.by, 'users', maps, global, c);
    delete out.by;
  }
  if (name === 'messages' && typeof doc.roomId === 'string') {
    out.roomId = resolve(doc.roomId, doc.roomType === 'lounge' ? 'lounges' : doc.roomType === 'dm' ? 'conversations' : null, maps, global, c);
  }
  if (name === 'dailyCounters') {
    // Old ids were "<user>:<day>:<key>"; the fields carry the same information.
    if (typeof oldId === 'string' && (!out.day || !out.key)) {
      const [u, day, ...key] = oldId.split(':');
      out.userId ??= resolve(u, 'users', maps, global, c);
      out.day ??= day;
      out.key ??= key.join(':');
    }
  }
  if (typeof out.link === 'string') out.link = relink(out.link, maps, global);
  return out;
}

/** Walks a document, turning every reference field into an ObjectId. */
function remap(v, name, maps, global, c, key) {
  if (v instanceof ObjectId || v instanceof Date || v === null || typeof v !== 'object') {
    if (key && key !== '_id' && typeof v === 'string' && isIdField(key)) {
      const r = resolve(v, POINTS_AT[key] ?? null, maps, global, c);
      if (r !== v) c.refs++;
      return r;
    }
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => remap(x, name, maps, global, c, key));
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = k === '_id' && key === '' ? x : remap(x, name, maps, global, c, k === '_id' ? '_id' : k);
  return out;
}

/** Rewrites ids inside in-app links such as /p/<id>, /messages/<id>, /forums/<id>, /shouts?focus=<id>. */
function relink(link, maps, global) {
  return link.replace(/([/=])([A-Za-z0-9_-]{4,40})(?=$|[/?&#])/g, (m, sep, id) => {
    const n = global.get(id) ?? maps.lounges.get(id);
    return n ? `${sep}${n}` : m;
  });
}

/** How many reference fields still hold a string id (checks the common ones). */
async function countStringRefs() {
  const checks = [
    ['posts', 'authorId'],
    ['comments', 'authorId'],
    ['follows', 'followerId'],
    ['conversations', 'members.userId'],
    ['messages', 'authorId'],
    ['shouts', 'authorId'],
    ['notifications', 'userId'],
    ['ratings', 'userId'],
    ['threads', 'boardId'],
    ['inventory', 'itemId'],
  ];
  let n = 0;
  for (const [col, field] of checks) n += await raw(col).countDocuments({ [field]: { $type: 'string', $ne: 'ai' } });
  return n;
}

async function dropBackups() {
  const dbh = raw('users').db;
  const backups = (await dbh.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => /__backup_\d{8}T\d{6}$|__migrating$/.test(n));
  if (!backups.length) return log('No backups to delete.');
  for (const n of backups) {
    await dbh.collection(n).drop();
    log(`🗑️  dropped ${n}`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exitCode = 1;
  })
  .finally(() => db.close());
