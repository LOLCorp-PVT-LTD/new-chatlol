/**
 * Ordered schema migrations, written in SQL that both Postgres and SQLite accept.
 * Never edit a shipped migration — add a new one.
 */
export const MIGRATIONS = [
  {
    id: 1,
    name: 'initial schema',
    sql: /* sql */ `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  handle TEXT NOT NULL,
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
CREATE UNIQUE INDEX users_handle_lc ON users (LOWER(handle));
CREATE TABLE follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX follows_followee ON follows (followee_id);
CREATE TABLE blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE TABLE posts (
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
CREATE INDEX posts_created ON posts (created_at);
CREATE INDEX posts_author ON posts (author_id, created_at);
CREATE INDEX posts_drop ON posts (drop_id);
CREATE TABLE battle_options (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  media_url TEXT,
  votes INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL
);
CREATE INDEX battle_options_post ON battle_options (post_id);
CREATE TABLE battle_votes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE ratings (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX ratings_user ON ratings (user_id, created_at);
CREATE TABLE reactions (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX comments_post ON comments (post_id, created_at);
CREATE TABLE drops (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  emoji TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL
);
CREATE TABLE hot_takes (
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
CREATE TABLE stakes (
  take_id TEXT NOT NULL REFERENCES hot_takes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (take_id, user_id)
);
CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE threads (
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
CREATE INDEX threads_activity ON threads (last_activity_at);
CREATE TABLE thread_votes (
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  v INTEGER NOT NULL,
  PRIMARY KEY (thread_id, user_id)
);
CREATE TABLE replies (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX replies_thread ON replies (thread_id, created_at);
CREATE TABLE lounges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  topic TEXT NOT NULL,
  now_playing TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL
);
CREATE TABLE conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user ON conversation_members (user_id);
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  room_type TEXT NOT NULL,
  room_id TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  media_url TEXT,
  kind TEXT NOT NULL DEFAULT 'text',
  reply_to_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX messages_room ON messages (room_type, room_id, created_at);
CREATE TABLE notifications (
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
CREATE INDEX notifications_user ON notifications (user_id, created_at);
CREATE TABLE store_items (
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
CREATE TABLE inventory (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES store_items(id),
  qty INTEGER NOT NULL DEFAULT 1,
  acquired_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE streams (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  gifts_total INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE TABLE stream_gifts (
  stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX stream_gifts_stream ON stream_gifts (stream_id);
CREATE TABLE push_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE daily_counters (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, key)
)`,
  },
  {
    id: 2,
    name: 'email verification, gems, purchases, live video',
    sql: /* sql */ `
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN gems INTEGER NOT NULL DEFAULT 0;
CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX email_tokens_user ON email_tokens (user_id, kind);
CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  product_id TEXT NOT NULL,
  gems INTEGER NOT NULL,
  amount_cents INTEGER,
  currency TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX purchases_user ON purchases (user_id, created_at);
ALTER TABLE streams ADD COLUMN video INTEGER NOT NULL DEFAULT 0`,
  },
];
