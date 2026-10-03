import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { CRATE_ODDS, activePowers, gemPriceFor } from '@chatlol/shared';
import { usePower } from '../lib/progression.js';
import { db, now, today } from '../db.js';
import { optionalAuth, requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { serializeStoreItem } from '../lib/serialize.js';
import { grant, emitWallet, ticker } from '../lib/rewards.js';
import { putImage } from '../lib/storage.js';
import { rollRarity, EMOJI_PACKS, GIPHY_UNLOCK, STICKER_PACKS } from '@chatlol/shared';
import { config } from '../config.js';
import { giphySearch, ownedPackKeys } from '../lib/stickers.js';

export const storeRouter = Router();

async function equippedSet(userId) {
  const u = await db.users.findOne({ _id: userId }, { projection: { cosmetics: 1 } });
  return new Set(Object.values(u?.cosmetics ?? {}).filter(Boolean));
}

storeRouter.get('/store', optionalAuth, async (req, res) => {
  const held = new Map(
    req.userId ? (await db.inventory.find({ userId: req.userId, qty: { $gt: 0 } }).toArray()).map((i) => [String(i.itemId), i.qty]) : [],
  );
  const eq = req.userId ? await equippedSet(req.userId) : new Set();
  const items = (await db.storeItems.find({}).sort({ position: 1 }).toArray()).map((r) =>
    serializeStoreItem(r, held.has(String(r._id)), eq.has(r.key), held.get(String(r._id)) ?? 0),
  );
  const wallet = req.userId ? await db.users.findOne({ _id: req.userId }, { projection: { sparks: 1, gems: 1 } }) : null;
  res.json({ items, sparks: wallet?.sparks ?? 0, gems: wallet?.gems ?? 0, crateOdds: CRATE_ODDS });
});

storeRouter.get('/store/inventory', requireAuth, async (req, res) => {
  const me = uid(req);
  const eq = await equippedSet(me);
  const inv = await db.inventory
    .find({ userId: me, qty: { $gt: 0 } })
    .sort({ acquiredAt: -1 })
    .toArray();
  const byId = new Map((await db.storeItems.find({ _id: { $in: inv.map((i) => i.itemId) } }).toArray()).map((s) => [s._id, s]));
  const rows = inv.map((i) => byId.get(i.itemId)).filter(Boolean);
  res.json({ items: rows.map((r) => serializeStoreItem(r, true, eq.has(r.key))) });
});

const STACKABLE = new Set(['streak_freeze', 'boost', 'gift', 'power']);

storeRouter.post('/store/:id/buy', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`buy:${me}`, 20);
  const { currency } = parse(z.object({ currency: z.enum(['sparks', 'gems']).default('sparks') }), req.body ?? {});
  const item = await db.storeItems.findOne({ key: String(req.params.id) });
  if (!item) throw new HttpError(404, 'Item not found');
  const gemPrice = gemPriceFor(item.kind, item.price);
  if (currency === 'gems' && gemPrice === null) throw new HttpError(400, 'This can only be unlocked with earned Sparks', 'sparks_only');
  const cost = currency === 'gems' ? gemPrice : item.price;
  const col = currency === 'gems' ? 'gems' : 'sparks';

  const won = await db.tx(async () => {
    const stackable = STACKABLE.has(item.kind) || item.kind === 'crate';
    if (!stackable && (await db.inventory.findOne({ userId: me, itemId: item._id }))) throw new HttpError(409, 'Already in your locker');
    const paid = await db.users.updateOne({ _id: me, [col]: { $gte: cost } }, { $inc: { [col]: -cost } });
    if (!paid.modifiedCount) {
      const have = (await db.users.findOne({ _id: me }, { projection: { [col]: 1 } }))?.[col] ?? 0;
      throw new HttpError(402, `You need ${cost - have} more ${currency === 'gems' ? 'Gems' : 'Sparks'}`, `insufficient_${currency}`);
    }
    if (item.kind === 'crate') {
      // Published odds (CRATE_ODDS). Duplicates convert to Sparks so a crate is never a dud.
      const [pick] = await db.storeItems
        .aggregate([{ $match: { rarity: rollRarity(), kind: { $in: ['frame', 'flair', 'theme', 'banner'] } } }, { $sample: { size: 1 } }])
        .toArray();
      if (pick) {
        const fresh = await db.inventory.insertIfMissing({ userId: me, itemId: pick._id }, { qty: 1, acquiredAt: now() });
        if (fresh) await db.inventory.updateOne({ userId: me, itemId: pick._id }, { $set: { via: 'crate' } });
        else await db.users.updateOne({ _id: me }, { $inc: { sparks: Math.round(pick.price * 0.4) } });
      }
      return pick ?? null;
    }
    await db.inventory.updateOne(
      { userId: me, itemId: item._id },
      // `via` decides what an inactivity reset takes back: only things bought with earned Sparks.
      { $inc: { qty: 1 }, $set: { via: col }, $setOnInsert: { acquiredAt: now() } },
      { upsert: true },
    );
    return null;
  });
  if (won && (won.rarity === 'legendary' || won.rarity === 'epic')) {
    const h = await db.users.findOne({ _id: me }, { projection: { handle: 1 } });
    void ticker(`@${h?.handle} pulled a ${won.rarity.toUpperCase()} ${won.name} ${won.emoji}`, me);
  }
  const reward = await grant(me, 0, Math.round(item.price / 10), 'Vault purchase');
  const w = await db.users.findOne({ _id: me }, { projection: { sparks: 1, gems: 1 } });
  res.json({
    item: serializeStoreItem(item, true),
    sparks: w.sparks,
    gems: w.gems ?? 0,
    won: won ? serializeStoreItem(won, true) : null,
    reward,
  });
});

/** Activates a power-up from the locker (XP Surge, Spark Surge, Spotlight, All-Access Pass, Ghost Mode). */
storeRouter.post('/store/:id/use', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`use:${me}`, 20);
  const used = await usePower(me, String(req.params.id));
  const u = await db.users.findOne({ _id: me }, { projection: { powers: 1 } });
  res.json({ used, powers: activePowers(u) });
});

storeRouter.post('/store/daily', requireAuth, async (req, res) => {
  const me = uid(req);
  const nextAt = new Date(Date.parse(`${today()}T00:00:00Z`) + 86_400_000).toISOString();
  const day = today();
  const claimed = await db.dailyCounters.insertIfMissing(
    { userId: me, day, key: 'daily_chest' },
    { n: 1, at: new Date() },
  );
  if (!claimed) return res.json({ claimed: false, nextAt, reward: null });
  const amount = 25 + Math.floor(Math.random() * 51);
  const reward = await grant(me, amount, 20, `Daily Sunset Chest: +${amount} Sparks`);
  res.json({ claimed: true, nextAt, reward });
});

// ——— Stickers & custom emoji ———
storeRouter.get('/stickers', optionalAuth, async (req, res) => {
  const owned = await ownedPackKeys(req.userId);
  res.json({
    owned: [...owned],
    emojiPacks: EMOJI_PACKS,
    stickerPacks: STICKER_PACKS,
    giphy: { available: !!config.giphyApiKey, owned: owned.has(GIPHY_UNLOCK.key), key: GIPHY_UNLOCK.key, price: GIPHY_UNLOCK.price },
  });
});
storeRouter.get('/stickers/giphy', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`giphy:${me}`, 60);
  if (!(await ownedPackKeys(me)).has(GIPHY_UNLOCK.key)) throw new HttpError(402, 'Unlock GIPHY Sticker Search in the Sparks Vault', 'giphy_locked');
  const q = String(req.query.q ?? '').trim().slice(0, 50);
  res.json(await giphySearch(q, Math.max(0, Math.min(4999, Number(req.query.offset) || 0))));
});

// ——— Uploads (local disk or S3/R2) ———
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });

storeRouter.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  await rateLimit(`upload:${uid(req)}`, 20);
  if (!req.file) throw new HttpError(400, 'Only images (jpg, png, webp, gif, heic) up to 12MB');
  res.status(201).json({ url: await putImage(req.file.buffer) });
});

export { emitWallet };
