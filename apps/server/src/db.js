import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
import { config } from './config.js';
import { ensureIndexes } from './indexes.js';

/**
 * MongoDB data layer (official `mongodb` driver).
 *
 *  - `db.users`, `db.posts`, … are the app's collections. Every call made inside `db.tx()` automatically
 *    joins that transaction, so route code never has to thread a session through.
 *  - Transactions need a replica set (MongoDB Atlas, or `mongod --replSet`). On a standalone server
 *    `db.tx()` runs its body without one; the app's writes are written to stay correct either way
 *    (conditional updates like `{ sparks: { $gte: cost } }` and unique indexes do the real guarding).
 *  - With no MONGODB_URL in development, a local mongod on 27017 is used if one is running,
 *    otherwise an embedded MongoDB (mongodb-memory-server) that keeps its data in ./data/mongo.
 */

export const COLLECTIONS = [
  'users',
  'follows',
  'blocks',
  'posts',
  'battleVotes',
  'ratings',
  'reactions',
  'comments',
  'drops',
  'hotTakes',
  'stakes',
  'boards',
  'threads',
  'threadVotes',
  'replies',
  'lounges',
  'conversations',
  'messages',
  'notifications',
  'storeItems',
  'inventory',
  'streams',
  'streamGifts',
  'pushTokens',
  'reports',
  'dailyCounters',
  'emailTokens',
  'purchases',
  'locks',
  'shouts',
  'shoutReactions',
  'wallNotes',
  'modEvents',
  'modFlags',
  'profileRatings',
  'profileViews',
  'friendRequests',
  'friendships',
  'kv',
  'busEvents',
  'socketEvents',
  'settings',
  'contentReactions',
  'arenas',
  'arcadeRuns',
  'radioStations',
  'clans',
  'clanMembers',
  'clanRequests',
  'clanWars',
  'clanWeeks',
  'tournaments',
  'tournamentEntries',
];

const txStore = new AsyncLocalStorage();
let client = null;
let database = null;
let embedded = null;
let transactions = false;
let ready = null;

/** The session to pass along, but only while its transaction is still open (fire-and-forget work may outlive it). */
function sessionOpt() {
  const s = txStore.getStore();
  return s && !s.hasEnded && s.inTransaction() ? { session: s } : {};
}

// ——— ObjectIds ———
// Every document's _id, and every field that points at one (authorId, userId, members.userId, mentions…), is a
// real ObjectId in MongoDB. The app passes ids around as 24-character hex strings (that's also what the API and
// the apps see); the collection wrappers below convert on the way in and out, so route code never has to.
const HEX24 = /^[0-9a-f]{24}$/;
/** Field names that hold ids: _id, id (sub-documents), anything ending in Id / Ids, and mention lists. */
export const isIdField = (key) => {
  const last = String(key).split('.').filter((p) => !/^\d+$/.test(p) && !p.startsWith('$'))
    .pop();
  return last === '_id' || last === 'id' || last === 'mentions' || /[a-z]Ids?$/.test(last ?? '');
};
const isPlain = (v) => v !== null && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/** App → MongoDB: hex id strings in id fields (including inside $in, $ne, $set, pipelines…) become ObjectIds. */
export function toDb(v, idField = false) {
  if (typeof v === 'string') return idField && HEX24.test(v) ? new ObjectId(v) : v;
  if (Array.isArray(v)) return v.map((x) => toDb(x, idField));
  if (!isPlain(v)) return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = toDb(x, k.startsWith('$') ? idField : isIdField(k));
  return out;
}
/** MongoDB → app: every ObjectId becomes its hex string. */
export function fromDb(v) {
  if (v instanceof ObjectId) return v.toHexString();
  if (Array.isArray(v)) return v.map(fromDb);
  if (!isPlain(v)) return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = fromDb(x);
  return out;
}
/** Gives a new document a fresh id the app can see (the caller's object gets it too, like the driver does). */
function withId(doc) {
  if (doc && doc._id == null) doc._id = new ObjectId().toHexString();
  return toDb(doc);
}
/** A cursor whose documents come out with string ids; chaining (.sort().limit()…) keeps working. */
function wrapCursor(cur) {
  const proxy = new Proxy(cur, {
    get(t, k) {
      if (k === 'toArray') return async () => (await t.toArray()).map(fromDb);
      if (k === 'next' || k === 'tryNext') return async () => fromDb(await t[k]());
      if (k === Symbol.asyncIterator)
        return async function* () {
          for await (const d of t) yield fromDb(d);
        };
      const v = Reflect.get(t, k, t);
      if (typeof v !== 'function') return v;
      return (...args) => {
        const r = v.apply(t, args);
        return r === t ? proxy : r;
      };
    },
  });
  return proxy;
}
const updateIn = (u) => (Array.isArray(u) ? u.map((stage) => toDb(stage)) : toDb(u));

/** Wraps a collection so every call picks up the current transaction's session and stores real ObjectIds. */
function wrap(name) {
  const c = () => {
    if (!database) throw new Error('Database not initialised — await initDb() first');
    return database.collection(name);
  };
  const o = (opts) => ({ ...opts, ...sessionOpt() });
  return {
    /** The driver's collection, without id conversion (indexes, change streams, shared state). */
    get raw() {
      return c();
    },
    findOne: async (filter, opts) => fromDb(await c().findOne(toDb(filter ?? {}), o(opts))),
    find: (filter, opts) => wrapCursor(c().find(toDb(filter ?? {}), o(opts))),
    countDocuments: (filter, opts) => c().countDocuments(toDb(filter ?? {}), o(opts)),
    distinct: async (key, filter = {}, opts) => fromDb(await c().distinct(key, toDb(filter), o(opts))),
    aggregate: (pipeline, opts) => wrapCursor(c().aggregate(pipeline.map((stage) => toDb(stage)), o(opts))),
    insertOne: async (doc, opts) => {
      const r = await c().insertOne(withId(doc), o(opts));
      return { ...r, insertedId: fromDb(r.insertedId) };
    },
    insertMany: (docs, opts) => c().insertMany(docs.map(withId), o(opts)),
    updateOne: (filter, update, opts) => c().updateOne(toDb(filter), updateIn(update), o(toDb(opts))),
    updateMany: (filter, update, opts) => c().updateMany(toDb(filter), updateIn(update), o(toDb(opts))),
    replaceOne: (filter, doc, opts) => c().replaceOne(toDb(filter), toDb(doc), o(opts)),
    deleteOne: (filter, opts) => c().deleteOne(toDb(filter), o(opts)),
    deleteMany: (filter, opts) => c().deleteMany(toDb(filter), o(opts)),
    findOneAndUpdate: async (filter, update, opts) => fromDb(await c().findOneAndUpdate(toDb(filter), updateIn(update), o(toDb(opts)))),
    findOneAndDelete: async (filter, opts) => fromDb(await c().findOneAndDelete(toDb(filter), o(opts))),
    bulkWrite: (ops, opts) => c().bulkWrite(toDb(ops), o(opts)),
    /** Inserts unless a document matching `filter` exists. Returns true if it inserted. */
    async insertIfMissing(filter, doc) {
      try {
        const r = await c().updateOne(toDb(filter), { $setOnInsert: toDb(doc) }, o({ upsert: true }));
        return r.upsertedCount === 1;
      } catch (e) {
        if (isDuplicateKey(e)) return false; // two upserts raced; the other one won
        throw e;
      }
    },
  };
}

export const isDuplicateKey = (e) => e?.code === 11000;

async function connect(url) {
  const c = new MongoClient(url, { maxPoolSize: Number(process.env.MONGODB_POOL_MAX ?? 50), serverSelectionTimeoutMS: 10_000 });
  await c.connect();
  return c;
}

async function startEmbedded() {
  let mms;
  try {
    mms = await import('mongodb-memory-server-core');
  } catch {
    throw new Error(
      'No MongoDB found. Set MONGODB_URL (e.g. mongodb://127.0.0.1:27017/chatlol or a MongoDB Atlas URL), or run `npm install` to get the embedded dev database.',
    );
  }
  mkdirSync(config.mongo.embeddedPath, { recursive: true });
  console.log(`🍃 No MongoDB on localhost — starting an embedded one (data in ${config.mongo.embeddedPath})`);
  embedded = await mms.MongoMemoryServer.create({ instance: { dbPath: config.mongo.embeddedPath, storageEngine: 'wiredTiger' } });
  return embedded.getUri();
}

async function resolveUrl() {
  if (config.mongo.url) return config.mongo.url;
  if (config.isProd) throw new Error('MONGODB_URL must be set in production');
  // Dev: prefer a locally running mongod, else fall back to the embedded server.
  const local = 'mongodb://127.0.0.1:27017/chatlol';
  const probe = new MongoClient(local, { serverSelectionTimeoutMS: 1_500 });
  try {
    await probe.connect();
    await probe.db('admin').command({ ping: 1 });
    return local;
  } catch {
    return startEmbedded();
  } finally {
    await probe.close().catch(() => {});
  }
}

export function initDb() {
  ready ??= (async () => {
    client = await connect(await resolveUrl());
    database = client.db(config.mongo.dbName || undefined);
    if (database.databaseName === 'test' && !config.mongo.dbName) database = client.db('chatlol');
    const hello = await database.admin().command({ hello: 1 });
    transactions = !!hello.setName || hello.msg === 'isdbgrid';
    await ensureIndexes(db);
    return db;
  })();
  return ready;
}

export const db = {
  kind: 'mongodb',
  get name() {
    return database?.databaseName ?? '';
  },
  get transactions() {
    return transactions;
  },
  /** Runs fn atomically (when the deployment supports transactions). Nested calls join the outer one. */
  async tx(fn) {
    if (txStore.getStore() || !transactions) return fn();
    const session = client.startSession();
    try {
      let out;
      await session.withTransaction(async () => {
        out = await txStore.run(session, fn);
      });
      return out;
    } finally {
      await session.endSession();
    }
  },
  /**
   * Cluster-wide mutex (seeding on first boot when several replicas start at once).
   * A lock document with a unique _id; stale locks from crashed processes expire after `ttlMs`.
   */
  async exclusive(name, fn, ttlMs = 120_000) {
    const locks = database.collection('locks');
    for (;;) {
      const t = Date.now();
      try {
        await locks.insertOne({ _id: name, until: t + ttlMs });
        break;
      } catch (e) {
        if (!isDuplicateKey(e)) throw e;
        await locks.deleteOne({ _id: name, until: { $lt: t } });
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    try {
      return await fn();
    } finally {
      await locks.deleteOne({ _id: name }).catch(() => {});
    }
  },
  /** Wipes every collection (seed --reset, tests). Indexes are recreated unless `reindex` is false. */
  async dropDatabase({ reindex = true } = {}) {
    await database.dropDatabase();
    if (reindex) await ensureIndexes(db);
  },
  async close() {
    await client?.close();
    await embedded?.stop();
    client = database = embedded = null;
    ready = null;
  },
};
for (const name of COLLECTIONS) db[name] = wrap(name);

/** A new ObjectId, as the 24-character hex string the app uses (stored as a real ObjectId). */
export const newId = () => new ObjectId().toHexString();
export const isObjectIdHex = (s) => typeof s === 'string' && HEX24.test(s);
/**
 * A fixed ObjectId derived from a name — for records that must have the same id on every install and every
 * seed run (the AI personas, the demo account), so references to them stay stable.
 */
export const stableId = (name) => createHash('sha256').update(`chatlol:${name}`).digest('hex').slice(0, 24);

export const now = () => new Date().toISOString();
export const today = (d = new Date()) => d.toISOString().slice(0, 10);
/** Escapes user text for use inside a $regex. */
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
