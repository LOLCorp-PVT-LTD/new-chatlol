import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { CRATE_ODDS, gemPriceFor } from '@chatlol/shared';
import { db, now, today, json, type Row } from '../db';
import { optionalAuth, requireAuth, uid } from '../lib/auth';
import { HttpError, parse, rateLimit } from '../lib/http';
import { serializeStoreItem } from '../lib/serialize';
import { grant, emitWallet, ticker } from '../lib/rewards';
import { putImage } from '../lib/storage';
import { rollRarity } from '@chatlol/shared';

export const storeRouter = Router();

async function equippedSet(userId: string) {
  const c = json<Record<string, string | null>>((await db.one<Row>('SELECT cosmetics FROM users WHERE id = ?', userId))!.cosmetics, {});
  return new Set(Object.values(c).filter(Boolean) as string[]);
}

storeRouter.get('/store', optionalAuth, async (req, res) => {
  const owned = req.userId ? new Set((await db.all<Row>('SELECT item_id FROM inventory WHERE user_id = ? AND qty > 0', req.userId)).map((r) => r.item_id)) : new Set();
  const eq = req.userId ? await equippedSet(req.userId) : new Set<string>();
  const items = (await db.all<Row>('SELECT * FROM store_items ORDER BY position')).map((r) => serializeStoreItem(r, owned.has(r.id), eq.has(r.id)));
  const wallet = req.userId ? await db.one<Row>('SELECT sparks, gems FROM users WHERE id = ?', req.userId) : null;
  res.json({ items, sparks: wallet?.sparks ?? 0, gems: wallet?.gems ?? 0, crateOdds: CRATE_ODDS });
});

storeRouter.get('/store/inventory', requireAuth, async (req, res) => {
  const me = uid(req);
  const eq = await equippedSet(me);
  const rows = await db.all<Row>('SELECT s.* FROM inventory i JOIN store_items s ON s.id = i.item_id WHERE i.user_id = ? AND i.qty > 0 ORDER BY i.acquired_at DESC', me);
  res.json({ items: rows.map((r) => serializeStoreItem(r, true, eq.has(r.id))) });
});

const STACKABLE = new Set(['streak_freeze', 'boost', 'gift']);

storeRouter.post('/store/:id/buy', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`buy:${me}`, 20);
  const { currency } = parse(z.object({ currency: z.enum(['sparks', 'gems']).default('sparks') }), req.body ?? {});
  const item = await db.one<Row>('SELECT * FROM store_items WHERE id = ?', String(req.params.id));
  if (!item) throw new HttpError(404, 'Item not found');
  const gemPrice = gemPriceFor(item.kind, item.price);
  if (currency === 'gems' && gemPrice === null) throw new HttpError(400, 'This can only be unlocked with earned Sparks', 'sparks_only');
  const cost = currency === 'gems' ? gemPrice! : item.price;
  const col = currency === 'gems' ? 'gems' : 'sparks';

  const won = await db.tx(async () => {
    if (!STACKABLE.has(item.kind) && item.kind !== 'crate' && (await db.one('SELECT 1 AS x FROM inventory WHERE user_id = ? AND item_id = ?', me, item.id))) {
      throw new HttpError(409, 'Already in your locker');
    }
    const paid = await db.run(`UPDATE users SET ${col} = ${col} - ? WHERE id = ? AND ${col} >= ?`, cost, me, cost);
    if (!paid.changes) {
      const have = (await db.one<Row>(`SELECT ${col} AS n FROM users WHERE id = ?`, me))!.n;
      throw new HttpError(402, `You need ${cost - have} more ${currency === 'gems' ? 'Gems' : 'Sparks'}`, `insufficient_${currency}`);
    }
    if (item.kind === 'crate') {
      // Published odds (CRATE_ODDS). Duplicates convert to Sparks so a crate is never a dud.
      const pool = await db.all<Row>(`SELECT * FROM store_items WHERE rarity = ? AND kind IN ('frame', 'flair', 'theme', 'banner')`, rollRarity());
      const pick = pool[Math.floor(Math.random() * pool.length)] ?? null;
      if (pick) {
        const ins = await db.run('INSERT INTO inventory (user_id, item_id, qty, acquired_at) VALUES (?, ?, 1, ?) ON CONFLICT DO NOTHING', me, pick.id, now());
        if (!ins.changes) await db.run('UPDATE users SET sparks = sparks + ? WHERE id = ?', Math.round(pick.price * 0.4), me);
      }
      return pick;
    }
    await db.run(
      'INSERT INTO inventory (user_id, item_id, qty, acquired_at) VALUES (?, ?, 1, ?) ON CONFLICT (user_id, item_id) DO UPDATE SET qty = inventory.qty + 1',
      me, item.id, now());
    return null;
  });
  if (won && (won.rarity === 'legendary' || won.rarity === 'epic')) {
    const h = await db.one<Row>('SELECT handle FROM users WHERE id = ?', me);
    void ticker(`@${h?.handle} pulled a ${won.rarity.toUpperCase()} ${won.name} ${won.emoji}`, me);
  }
  const reward = await grant(me, 0, Math.round(item.price / 10), 'Vault purchase');
  const w = (await db.one<Row>('SELECT sparks, gems FROM users WHERE id = ?', me))!;
  res.json({ item: serializeStoreItem(item, true), sparks: w.sparks, gems: w.gems, won: won ? serializeStoreItem(won, true) : null, reward });
});

storeRouter.post('/store/daily', requireAuth, async (req, res) => {
  const me = uid(req);
  const nextAt = new Date(Date.parse(`${today()}T00:00:00Z`) + 86_400_000).toISOString();
  const claimed = await db.run('INSERT INTO daily_counters (user_id, day, key, n) VALUES (?, ?, ?, 1) ON CONFLICT DO NOTHING', me, today(), 'daily_chest');
  if (!claimed.changes) return res.json({ claimed: false, nextAt, reward: null });
  const amount = 25 + Math.floor(Math.random() * 51);
  const reward = await grant(me, amount, 20, `Daily Sunset Chest: +${amount} Sparks`);
  res.json({ claimed: true, nextAt, reward });
});

// ——— Uploads (local disk or S3/R2) ———
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });

storeRouter.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  await rateLimit(`upload:${uid(req)}`, 20);
  if (!req.file) throw new HttpError(400, 'Only images (jpg, png, webp, gif, heic) up to 12MB');
  res.status(201).json({ url: await putImage(req.file.buffer) });
});

export { emitWallet };
