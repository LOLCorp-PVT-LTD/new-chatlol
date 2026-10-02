import { z } from 'zod';
import { EMOJI_PACKS, GIPHY_UNLOCK, STICKER_PACKS, customEmoji, customEmojiCodes, isGiphyMediaUrl, notoSticker } from '@chatlol/shared';
import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError } from './http.js';
import { itemIdFor } from './ids.js';

/**
 * Custom emoji, sticker packs and the GIPHY unlock are Vault items bought with Sparks; free packs come with every
 * account. Everything people post is checked here, so a client can't use what it doesn't own.
 */
const PAID_KEYS = [...EMOJI_PACKS, ...STICKER_PACKS].filter((p) => p.price > 0).map((p) => p.key).concat(GIPHY_UNLOCK.key);
const KEY_BY_ITEM = new Map(PAID_KEYS.map((k) => [itemIdFor(k), k]));
const FREE = new Set([...EMOJI_PACKS, ...STICKER_PACKS].filter((p) => p.price === 0).map((p) => p.key));

/** Every pack / unlock key this user can use. */
export async function ownedPackKeys(userId) {
  const owned = new Set(FREE);
  if (!userId) return owned;
  const rows = await db.inventory.find({ userId, itemId: { $in: [...KEY_BY_ITEM.keys()] }, qty: { $gt: 0 } }, { projection: { itemId: 1 } }).toArray();
  for (const r of rows) owned.add(KEY_BY_ITEM.get(r.itemId));
  return owned;
}

const packName = (key) => [...EMOJI_PACKS, ...STICKER_PACKS].find((p) => p.key === key)?.name ?? key;

/** Rejects text that uses custom emoji from a pack the author hasn't unlocked. */
export async function assertEmojiOwned(userId, ...texts) {
  const codes = texts.flatMap((t) => customEmojiCodes(t ?? ''));
  if (!codes.length) return;
  const owned = await ownedPackKeys(userId);
  const locked = codes.map(customEmoji).find((e) => e && !owned.has(e.pack));
  if (locked) throw new HttpError(402, `:${locked.code}: is in the ${packName(locked.pack)} pack — unlock it in the Sparks Vault`, 'emoji_locked');
}

/** What clients send for a sticker. */
export const stickerInput = z
  .union([
    z.object({ kind: z.literal('noto'), id: z.string().max(60) }),
    z.object({
      kind: z.literal('giphy'),
      id: z.string().regex(/^[A-Za-z0-9]{1,40}$/),
      url: z.string().max(600),
      w: z.number().int().positive().max(2000).nullable().optional(),
      h: z.number().int().positive().max(2000).nullable().optional(),
    }),
  ])
  .nullable()
  .optional();

/** Validates a sticker against what the user owns and returns what gets stored. */
export async function resolveSticker(userId, input) {
  if (!input) return null;
  const owned = await ownedPackKeys(userId);
  if (input.kind === 'noto') {
    const s = notoSticker(input.id);
    if (!s) throw new HttpError(400, 'Unknown sticker');
    if (!owned.has(s.pack.key)) throw new HttpError(402, `That sticker is in the ${s.pack.name} pack — unlock it in the Sparks Vault`, 'sticker_locked');
    return { kind: 'noto', id: input.id, url: s.url, still: s.still, w: 512, h: 512, label: s.sticker.label };
  }
  if (!owned.has(GIPHY_UNLOCK.key)) throw new HttpError(402, 'Unlock GIPHY Sticker Search in the Sparks Vault', 'giphy_locked');
  if (!isGiphyMediaUrl(input.url)) throw new HttpError(400, 'That sticker isn’t from GIPHY');
  return { kind: 'giphy', id: input.id, url: input.url, still: null, w: input.w ?? null, h: input.h ?? null, label: 'GIPHY sticker' };
}

/** Text shown in notifications and previews for a sticker-only message. */
export const stickerPreview = (sticker) => (sticker ? `🏷️ Sticker${sticker.label ? `: ${sticker.label}` : ''}` : '');

/** GIPHY sticker search (or trending when there's no query), through our server so the API key stays private. */
export async function giphySearch(q, offset = 0) {
  if (!config.giphyApiKey) return { enabled: false, results: [] };
  const params = new URLSearchParams({ api_key: config.giphyApiKey, limit: '24', offset: String(offset), rating: 'pg-13', bundle: 'messaging_non_clips' });
  if (q) params.set('q', q);
  const r = await fetch(`https://api.giphy.com/v1/stickers/${q ? 'search' : 'trending'}?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new HttpError(502, 'GIPHY is unavailable right now');
  const j = await r.json();
  return {
    enabled: true,
    results: (j.data ?? [])
      .map((g) => {
        const full = g.images?.fixed_height ?? g.images?.original;
        const small = g.images?.fixed_height_small ?? full;
        const clean = (u) => String(u ?? '').split('?')[0];
        return { id: g.id, url: clean(full?.webp || full?.url), preview: clean(small?.webp || small?.url), w: Number(full?.width) || null, h: Number(full?.height) || null, title: g.title ?? '' };
      })
      .filter((g) => isGiphyMediaUrl(g.url)),
    next: j.pagination && j.pagination.offset + j.pagination.count < j.pagination.total_count ? j.pagination.offset + j.pagination.count : null,
  };
}
