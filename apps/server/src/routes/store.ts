import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import { CRATE_ODDS, GIFTS, rollRarity } from '@chatlol/shared';
import { db, newId, now, today, type Row } from '../db';
import { optionalAuth, requireAuth, uid } from '../lib/auth';
import { HttpError, parse, rateLimit } from '../lib/http';
import { serializeStoreItem, serializeMessage, authorCache, userPublic } from '../lib/serialize';
import { grant, emitWallet, notify, ticker } from '../lib/rewards';
import { assertClean } from '../lib/moderation';
import { io, room } from '../lib/io';
import { bus } from '../lib/events';
import { config } from '../config';

export const storeRouter = Router();

function equippedSet(userId: string) {
  const c = JSON.parse(db.one<Row>('SELECT cosmetics FROM users WHERE id = ?', userId)!.cosmetics);
  return new Set(Object.values(c).filter(Boolean) as string[]);
}

storeRouter.get('/store', optionalAuth, (req, res) => {
  const owned = req.userId ? new Set(db.all<Row>('SELECT item_id FROM inventory WHERE user_id = ? AND qty > 0', req.userId).map((r) => r.item_id)) : new Set();
  const eq = req.userId ? equippedSet(req.userId) : new Set<string>();
  const items = db.all<Row>('SELECT * FROM store_items ORDER BY position').map((r) => serializeStoreItem(r, owned.has(r.id), eq.has(r.id)));
  const sparks = req.userId ? db.one<Row>('SELECT sparks FROM users WHERE id = ?', req.userId)!.sparks : 0;
  res.json({ items, sparks, crateOdds: CRATE_ODDS });
});

storeRouter.get('/store/inventory', requireAuth, (req, res) => {
  const me = uid(req);
  const eq = equippedSet(me);
  const items = db.all<Row>('SELECT s.* FROM inventory i JOIN store_items s ON s.id = i.item_id WHERE i.user_id = ? AND i.qty > 0 ORDER BY i.acquired_at DESC', me)
    .map((r) => serializeStoreItem(r, true, eq.has(r.id)));
  res.json({ items });
});

const STACKABLE = new Set(['streak_freeze', 'boost', 'gift']);

storeRouter.post('/store/:id/buy', requireAuth, (req, res) => {
  const me = uid(req);
  rateLimit(`buy:${me}`, 20);
  const item = db.one<Row>('SELECT * FROM store_items WHERE id = ?', String(req.params.id));
  if (!item) throw new HttpError(404, 'Item not found');
  let won: Row | null = null;
  db.tx(() => {
    const u = db.one<Row>('SELECT sparks FROM users WHERE id = ?', me)!;
    if (u.sparks < item.price) throw new HttpError(402, `You need ${item.price - u.sparks} more Sparks`, 'insufficient_sparks');
    if (!STACKABLE.has(item.kind) && item.kind !== 'crate' && db.one('SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?', me, item.id)) {
      throw new HttpError(409, 'Already in your locker');
    }
    db.run('UPDATE users SET sparks = sparks - ? WHERE id = ?', item.price, me);
    if (item.kind === 'crate') {
      // Published odds (CRATE_ODDS). Duplicates convert to Sparks so a crate is never a dud.
      const rarity = rollRarity();
      const pool = db.all<Row>(`SELECT * FROM store_items WHERE rarity = ? AND kind IN ('frame', 'flair', 'theme', 'banner')`, rarity);
      won = pool[Math.floor(Math.random() * pool.length)] ?? null;
      if (won) {
        if (db.one('SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?', me, won.id)) {
          db.run('UPDATE users SET sparks = sparks + ? WHERE id = ?', Math.round(won.price * 0.4), me);
        } else {
          db.run('INSERT INTO inventory VALUES (?, ?, 1, ?)', me, won.id, now());
        }
      }
    } else {
      db.run('INSERT INTO inventory VALUES (?, ?, 1, ?) ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + 1', me, item.id, now());
    }
  });
  const w = won as Row | null;
  if (w && (w.rarity === 'legendary' || w.rarity === 'epic')) {
    ticker(`@${db.one<Row>('SELECT handle FROM users WHERE id = ?', me)!.handle} pulled a ${w.rarity.toUpperCase()} ${w.name} ${w.emoji}`, me);
  }
  const reward = grant(me, 0, Math.round(item.price / 10), 'Vault purchase');
  res.json({ item: serializeStoreItem(item, true), sparks: db.one<Row>('SELECT sparks FROM users WHERE id = ?', me)!.sparks, won: w ? serializeStoreItem(w, true) : null, reward });
});

storeRouter.post('/store/daily', requireAuth, (req, res) => {
  const me = uid(req);
  const key = `daily_chest_${today()}`;
  const had = db.one('SELECT 1 FROM daily_counters WHERE user_id = ? AND day = ? AND key = ?', me, today(), key);
  const nextAt = new Date(Date.parse(`${today()}T00:00:00Z`) + 86_400_000).toISOString();
  if (had) return res.json({ claimed: false, nextAt, reward: null });
  db.run('INSERT INTO daily_counters VALUES (?, ?, ?, 1)', me, today(), key);
  const amount = 25 + Math.floor(Math.random() * 51);
  const reward = grant(me, amount, 20, `Daily Sunset Chest: +${amount} Sparks`);
  res.json({ claimed: true, nextAt, reward });
});

// ——— Live streams ———
export const streamViewers = new Map<string, Set<string>>();

export function serializeStream(s: Row, viewerId?: string | null) {
  const author = authorCache(viewerId);
  const top = db.all<Row>('SELECT user_id, SUM(amount) amount FROM stream_gifts WHERE stream_id = ? GROUP BY user_id ORDER BY amount DESC LIMIT 3', s.id);
  const real = streamViewers.get(s.id)?.size ?? 0;
  // AI-hosted streams keep a small ambient audience of AI personas; counts reflect actual connected sockets + those personas.
  const ambient = db.one<Row>(`SELECT COUNT(DISTINCT author_id) n FROM messages WHERE room_type = 'stream' AND room_id = ? AND created_at > ?`, s.id, new Date(Date.now() - 10 * 60_000).toISOString())!.n;
  return {
    id: s.id, host: author(s.host_id), title: s.title, category: s.category, coverUrl: s.cover_url,
    viewers: Math.max(real, ambient), giftsTotal: s.gifts_total, startedAt: s.started_at,
    topGifters: top.map((t) => ({ user: author(t.user_id), amount: t.amount })),
  };
}

storeRouter.get('/live', optionalAuth, (req, res) => {
  const streams = db.all<Row>('SELECT * FROM streams WHERE ended_at IS NULL ORDER BY gifts_total DESC, started_at DESC LIMIT 30').map((s) => serializeStream(s, req.userId));
  res.json({ streams: streams.sort((a, b) => b.viewers - a.viewers) });
});

storeRouter.get('/live/:id', optionalAuth, (req, res) => {
  const s = db.one<Row>('SELECT * FROM streams WHERE id = ?', String(req.params.id));
  if (!s) throw new HttpError(404, 'Stream ended');
  const author = authorCache(req.userId);
  const chat = db.all<Row>(`SELECT * FROM messages WHERE room_type = 'stream' AND room_id = ? ORDER BY created_at DESC LIMIT 50`, s.id).reverse().map((m) => serializeMessage(m, author));
  res.json({ stream: serializeStream(s, req.userId), chat });
});

export function startStream(hostId: string, title: string, category: string, coverUrl?: string) {
  db.run('UPDATE streams SET ended_at = ? WHERE host_id = ? AND ended_at IS NULL', now(), hostId);
  const id = newId('live');
  const host = db.one<Row>('SELECT * FROM users WHERE id = ?', hostId)!;
  db.run('INSERT INTO streams (id, host_id, title, category, cover_url, started_at) VALUES (?, ?, ?, ?, ?, ?)', id, hostId, title, category, coverUrl ?? host.avatar_url, now());
  bus.emitEvent('stream:started', { streamId: id, hostId });
  for (const f of db.all<Row>('SELECT follower_id FROM follows WHERE followee_id = ? LIMIT 500', hostId)) {
    notify(f.follower_id, { kind: 'invite', actorId: hostId, link: `/live/${id}`, title: `${host.display_name} is LIVE 🔴`, body: title });
  }
  return db.one<Row>('SELECT * FROM streams WHERE id = ?', id)!;
}

storeRouter.post('/live', requireAuth, (req, res) => {
  const me = uid(req);
  rateLimit(`golive:${me}`, 3);
  const b = parse(z.object({ title: z.string().trim().min(3).max(80), category: z.string().min(2).max(24) }), req.body);
  assertClean(b.title);
  res.status(201).json({ stream: serializeStream(startStream(me, b.title, b.category), me) });
});

storeRouter.delete('/live/:id', requireAuth, (req, res) => {
  db.run('UPDATE streams SET ended_at = ? WHERE id = ? AND host_id = ?', now(), String(req.params.id), uid(req));
  res.json({ ok: true });
});

export function sendGift(streamId: string, fromId: string, giftId: string) {
  const gift = GIFTS.find((g) => g.id === giftId);
  if (!gift) throw new HttpError(404, 'Gift not found');
  const s = db.one<Row>('SELECT * FROM streams WHERE id = ? AND ended_at IS NULL', streamId);
  if (!s) throw new HttpError(404, 'Stream ended');
  if (s.host_id === fromId) throw new HttpError(400, "You can't gift yourself");
  db.tx(() => {
    const u = db.one<Row>('SELECT sparks FROM users WHERE id = ?', fromId)!;
    if (u.sparks < gift.price) throw new HttpError(402, 'Not enough Sparks', 'insufficient_sparks');
    db.run('UPDATE users SET sparks = sparks - ? WHERE id = ?', gift.price, fromId);
    // Creators keep 70% of gifted Sparks.
    db.run('UPDATE users SET sparks = sparks + ? WHERE id = ?', Math.floor(gift.price * 0.7), s.host_id);
    db.run('UPDATE streams SET gifts_total = gifts_total + ? WHERE id = ?', gift.price, streamId);
    db.run('INSERT INTO stream_gifts VALUES (?, ?, ?, ?)', streamId, fromId, gift.price, now());
  });
  const from = userPublic(db.one<Row>('SELECT * FROM users WHERE id = ?', fromId)!);
  io()?.to(room.stream(streamId)).emit('stream:gift', { streamId, from, giftId, emoji: gift.emoji, amount: gift.price });
  const mid = newId('m');
  db.run(`INSERT INTO messages (id, room_type, room_id, author_id, body, kind, created_at) VALUES (?, 'stream', ?, ?, ?, 'gift', ?)`, mid, streamId, fromId, `sent ${gift.name} ${gift.emoji}`, now());
  io()?.to(room.stream(streamId)).emit('stream:chat', serializeMessage(db.one<Row>('SELECT * FROM messages WHERE id = ?', mid)!));
  notify(s.host_id, { kind: 'gift', actorId: fromId, link: `/live/${streamId}`, title: `${from.displayName} sent you ${gift.name} ${gift.emoji}`, body: `+${Math.floor(gift.price * 0.7)} Sparks` });
  emitWallet(fromId);
  emitWallet(s.host_id);
}

storeRouter.post('/live/:id/gift', requireAuth, (req, res) => {
  const me = uid(req);
  rateLimit(`gift:${me}`, 60);
  const { giftId } = parse(z.object({ giftId: z.string() }), req.body);
  sendGift(String(req.params.id), me, giftId);
  grant(me, 0, 5, 'Sent a gift');
  res.json({ sparks: db.one<Row>('SELECT sparks FROM users WHERE id = ?', me)!.sparks });
});

// ——— Uploads ———
mkdirSync(config.uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) => cb(null, `${newId()}${extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg'}`),
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.mimetype) || /^audio\//.test(file.mimetype)),
});

storeRouter.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  rateLimit(`upload:${uid(req)}`, 20);
  if (!req.file) throw new HttpError(400, 'Only images (jpg, png, webp, gif, heic) up to 12MB');
  res.status(201).json({ url: `${config.publicUrl}/uploads/${req.file.filename}` });
});
