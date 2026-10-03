import { Router } from 'express';
import { z } from 'zod';
import { AD_SLOTS } from '@chatlol/shared';
import { db, newId, now } from '../db.js';
import { optionalAuth, requireAuth, requirePerm, uid } from '../lib/auth.js';
import { parse } from '../lib/http.js';
import { isPremium } from '../lib/serialize.js';

/**
 * Ad slots. Staff set each slot's ad code (from an ad network) or a house ad (image + link) in the admin panel.
 * Codes run in a sandboxed iframe by default; 'direct' mode injects them into the page for networks that need it.
 * Premium members see no ads unless staff turn that off.
 */
export const adsRouter = Router();
const DEFAULTS = { enabled: false, premiumAdFree: true, slots: {} };
let cache = null;
let cachedAt = 0;
async function adConfig() {
  if (!cache || Date.now() - cachedAt > 30_000) {
    cache = { ...DEFAULTS, ...((await db.settings.findOne({ _id: 'ads' })) ?? {}) };
    cachedAt = Date.now();
  }
  return cache;
}

/** What the current viewer should see: only enabled slots, nothing for ad-free Premium members. */
adsRouter.get('/ads', optionalAuth, async (req, res) => {
  const cfg = await adConfig();
  const viewer = req.userId ? await db.users.findOne({ _id: req.userId }, { projection: { premium: 1 } }) : null;
  if (!cfg.enabled || (cfg.premiumAdFree && isPremium(viewer))) return res.json({ slots: {} });
  const slots = Object.fromEntries(
    Object.entries(cfg.slots)
      .filter(([k, s]) => s.enabled && AD_SLOTS.some((x) => x.key === k) && (s.code || s.imageUrl))
      .map(([k, s]) => [k, { mode: s.mode ?? 'sandboxed', code: s.code ?? '', imageUrl: s.imageUrl ?? null, linkUrl: s.linkUrl ?? null, height: s.height ?? null, every: s.every ?? null }]),
  );
  res.json({ slots });
});

adsRouter.get('/admin/ads', requireAuth, requirePerm('ads'), async (_req, res) => {
  res.json({ ...(await adConfig()), available: AD_SLOTS });
});

const slot = z.object({
  enabled: z.boolean(),
  mode: z.enum(['sandboxed', 'direct']).default('sandboxed'),
  code: z.string().max(20_000).default(''),
  imageUrl: z.string().url().max(600).nullable().default(null),
  linkUrl: z.string().url().max(600).nullable().default(null),
  height: z.number().int().min(50).max(800).nullable().default(null),
  every: z.number().int().min(2).max(50).nullable().default(null),
});
adsRouter.put('/admin/ads', requireAuth, requirePerm('ads'), async (req, res) => {
  const b = parse(z.object({ enabled: z.boolean(), premiumAdFree: z.boolean(), slots: z.record(z.string(), slot) }), req.body);
  const slots = Object.fromEntries(Object.entries(b.slots).filter(([k]) => AD_SLOTS.some((x) => x.key === k)));
  await db.settings.updateOne({ _id: 'ads' }, { $set: { enabled: b.enabled, premiumAdFree: b.premiumAdFree, slots, updatedAt: now(), updatedByUserId: uid(req) } }, { upsert: true });
  cache = null;
  const on = Object.entries(slots).filter(([, s]) => s.enabled).map(([k, s]) => `${k}${s.mode === 'direct' ? ' (direct)' : ''}`);
  await db.modEvents.insertOne({ _id: newId(), userId: uid(req), kind: 'settings', reason: `Ads ${b.enabled ? 'on' : 'off'}; slots: ${on.join(', ') || 'none'}`, byUserId: uid(req), createdAt: now() });
  res.json({ ...(await adConfig()), available: AD_SLOTS });
});
