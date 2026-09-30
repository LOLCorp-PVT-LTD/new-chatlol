import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from './config';

const SCHEMA = /* sql */ `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  handle TEXT UNIQUE NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  pronouns TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  birthdate TEXT NOT NULL,
  interests TEXT NOT NULL DEFAULT '[]',
  xp INTEGER NOT NULL DEFAULT 0,
  sparks INTEGER NOT NULL DEFAULT 250,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_drop_day TEXT,
  last_daily_claim TEXT,
  combo_count INTEGER NOT NULL DEFAULT 0,
  badges TEXT NOT NULL DEFAULT '[]',
  cosmetics TEXT NOT NULL DEFAULT '{"frame":null,"flair":null,"theme":null,"banner":null}',
  settings TEXT NOT NULL DEFAULT '{}',
  is_ai INTEGER NOT NULL DEFAULT 0,
  persona_id TEXT,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  drop_id TEXT,
  soundtrack TEXT,
  r1 INTEGER NOT NULL DEFAULT 0, r2 INTEGER NOT NULL DEFAULT 0, r3 INTEGER NOT NULL DEFAULT 0,
  r4 INTEGER NOT NULL DEFAULT 0, r5 INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS posts_author ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_drop ON posts(drop_id);

CREATE TABLE IF NOT EXISTS battle_options (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  media_url TEXT,
  votes INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS battle_votes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS ratings (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS ratings_user ON ratings(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reactions (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS drops (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  emoji TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hot_takes (
  id TEXT PRIMARY KEY,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  statement TEXT NOT NULL,
  image_url TEXT,
  agree_pool INTEGER NOT NULL DEFAULT 0,
  disagree_pool INTEGER NOT NULL DEFAULT 0,
  agree_count INTEGER NOT NULL DEFAULT 0,
  disagree_count INTEGER NOT NULL DEFAULT 0,
  ends_at TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  outcome TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stakes (
  take_id TEXT NOT NULL REFERENCES hot_takes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (take_id, user_id)
);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id),
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  last_activity_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS thread_votes (
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  v INTEGER NOT NULL,
  PRIMARY KEY (thread_id, user_id)
);
CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lounges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  topic TEXT NOT NULL,
  now_playing TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  room_type TEXT NOT NULL, -- 'lounge' | 'dm' | 'stream'
  room_id TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  media_url TEXT,
  kind TEXT NOT NULL DEFAULT 'text',
  reply_to_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_room ON messages(room_type, room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  actor_id TEXT,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS store_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price INTEGER NOT NULL,
  rarity TEXT NOT NULL,
  emoji TEXT NOT NULL,
  preview TEXT NOT NULL,
  limited INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES store_items(id),
  qty INTEGER NOT NULL DEFAULT 1,
  acquired_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS streams (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  gifts_total INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE TABLE IF NOT EXISTS stream_gifts (
  stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_counters (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, key)
);
`;

let _db: DatabaseSync | null = null;

export function getDb() {
  if (_db) return _db;
  if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });
  _db = new DatabaseSync(config.dbPath);
  _db.exec(SCHEMA);
  return _db;
}

export type Row = Record<string, any>;
type Params = SQLInputValue[];

export const db = {
  one<T = Row>(sql: string, ...p: Params): T | undefined {
    return getDb().prepare(sql).get(...p) as T | undefined;
  },
  all<T = Row>(sql: string, ...p: Params): T[] {
    return getDb().prepare(sql).all(...p) as T[];
  },
  run(sql: string, ...p: Params) {
    return getDb().prepare(sql).run(...p);
  },
  exec(sql: string) {
    getDb().exec(sql);
  },
  tx<T>(fn: () => T): T {
    const d = getDb();
    d.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      d.exec('COMMIT');
      return r;
    } catch (e) {
      d.exec('ROLLBACK');
      throw e;
    }
  },
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
