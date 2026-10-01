import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from './config';
import { MIGRATIONS } from './migrations';

/**
 * Async database layer with two drivers:
 *  - Postgres (DATABASE_URL=postgres://…) for production and horizontal scaling
 *  - SQLite (node:sqlite, DATABASE_PATH) for local dev and tests
 * All SQL in the app is written in the portable subset both understand, with `?` placeholders.
 */
export type Row = Record<string, any>;
export type Param = string | number | bigint | null | Uint8Array;

interface Driver {
  kind: 'postgres' | 'sqlite';
  /** Cluster-wide mutex (Postgres advisory lock) so concurrent boots don't race migrations / seeding. */
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
  query(sql: string, params: Param[], tx: unknown): Promise<{ rows: Row[]; changes: number }>;
  tx<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const txStore = new AsyncLocalStorage<unknown>();

async function createPostgres(url: string): Promise<Driver> {
  const pg = await import('pg');
  pg.default.types.setTypeParser(20, (v) => Number(v)); // int8 (COUNT) → number
  pg.default.types.setTypeParser(1700, (v) => Number(v)); // numeric (SUM/AVG) → number
  const pool = new pg.default.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX ?? 20) });
  return pgDriver(pool, toPg);
}

/** Converts `?` placeholders to `$1…$n`, leaving `?` inside quoted string literals alone. */
export function toPg(sql: string) {
  let out = '';
  let n = 0;
  let quoted = false;
  for (const ch of sql) {
    if (ch === "'") quoted = !quoted;
    out += ch === '?' && !quoted ? `$${++n}` : ch;
  }
  return out;
}

function pgDriver(pool: import('pg').Pool, toPg: (s: string) => string): Driver {
  return {
    kind: 'postgres',
    async exclusive(fn) {
      const client = await pool.connect();
      try {
        await client.query('SELECT pg_advisory_lock(727272)');
        return await fn();
      } finally {
        await client.query('SELECT pg_advisory_unlock(727272)').catch(() => {});
        client.release();
      }
    },
    async query(sql, params, tx) {
      const client = (tx as import('pg').PoolClient | undefined) ?? pool;
      try {
        const r = await client.query(toPg(sql), params as unknown[]);
        return { rows: r.rows, changes: r.rowCount ?? 0 };
      } catch (e) {
        (e as Error).message += ` — in: ${sql.replace(/\s+/g, ' ').slice(0, 200)}`;
        throw e;
      }
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await txStore.run(client, fn);
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function createSqlite(path: string): Promise<Driver> {
  const { DatabaseSync } = await import('node:sqlite');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const d = new DatabaseSync(path);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  // SQLite has one connection, so transactions are serialised and other queries wait for them.
  let lock: Promise<void> = Promise.resolve();
  let locked = false;
  return {
    kind: 'sqlite',
    exclusive: (fn) => fn(),
    async query(sql, params, tx) {
      if (!tx) while (locked) await lock;
      const stmt = d.prepare(sql);
      if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { rows: stmt.all(...(params as never[])) as Row[], changes: 0 };
      const r = stmt.run(...(params as never[]));
      return { rows: [], changes: Number(r.changes) };
    },
    async tx(fn) {
      while (locked) await lock;
      let release!: () => void;
      lock = new Promise((r) => (release = r));
      locked = true;
      try {
        d.exec('BEGIN IMMEDIATE');
        const out = await txStore.run(true, fn);
        d.exec('COMMIT');
        return out;
      } catch (e) {
        try { d.exec('ROLLBACK'); } catch { /* already rolled back */ }
        throw e;
      } finally {
        locked = false;
        release();
      }
    },
    close: async () => d.close(),
  };
}

let driver: Driver | null = null;
let ready: Promise<Driver> | null = null;

export function initDb(): Promise<Driver> {
  ready ??= (async () => {
    driver = config.databaseUrl ? await createPostgres(config.databaseUrl) : await createSqlite(config.dbPath);
    const d = driver;
    await d.exclusive(() => migrate(d));
    return d;
  })();
  return ready;
}

async function migrate(d: Driver) {
  await d.query('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)', [], undefined);
  const done = new Set((await d.query('SELECT id FROM schema_migrations', [], undefined)).rows.map((r) => Number(r.id)));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await d.tx(async () => {
      const tx = txStore.getStore();
      for (const stmt of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await d.query(stmt, [], tx);
      await d.query('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)', [m.id, m.name, new Date().toISOString()], tx);
    });
  }
}

function drv() {
  if (!driver) throw new Error('Database not initialised — await initDb() first');
  return driver;
}

export const db = {
  get kind() { return drv().kind; },
  async one<T = Row>(sql: string, ...p: Param[]): Promise<T | undefined> {
    return (await drv().query(sql, p, txStore.getStore())).rows[0] as T | undefined;
  },
  async all<T = Row>(sql: string, ...p: Param[]): Promise<T[]> {
    return (await drv().query(sql, p, txStore.getStore())).rows as T[];
  },
  async run(sql: string, ...p: Param[]) {
    return { changes: (await drv().query(sql, p, txStore.getStore())).changes };
  },
  /** Runs fn in a transaction; nested calls join the outer transaction. */
  tx<T>(fn: () => Promise<T>): Promise<T> {
    return txStore.getStore() ? fn() : drv().tx(fn);
  },
  close: () => driver?.close(),
  exclusive: <T>(fn: () => Promise<T>) => drv().exclusive(fn),
};

const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyz';
export function newId(prefix = '') {
  const bytes = randomBytes(12);
  let s = '';
  for (const b of bytes) s += ALPHA[b % 36];
  return prefix ? `${prefix}_${s}` : s;
}

export const now = () => new Date().toISOString();
export const today = (d = new Date()) => d.toISOString().slice(0, 10);
export const json = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};
