import { Router } from 'express';
import { EXTRA_GAMES, gameFromSteam } from '@chatlol/shared';
import { requireAuth, uid } from '../lib/auth.js';
import { rateLimit } from '../lib/http.js';
import { shared } from '../lib/shared.js';

/** Game search for the profile "Games I play" section: built-in popular games + Steam's store search (no key needed). */
export const gamesCatalogRouter = Router();

async function steamSearch(q) {
  const key = `steamsearch:${q.toLowerCase()}`;
  const cached = await shared().get(key);
  if (cached) return JSON.parse(cached);
  let out = [];
  try {
    const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=GB`, { signal: AbortSignal.timeout(6000) });
    if (r.ok) out = ((await r.json()).items ?? []).filter((i) => i.type === 'app').slice(0, 12).map((i) => gameFromSteam(i.id, i.name));
  } catch {
    /* Steam unreachable: built-in games still work */
  }
  await shared().set(key, JSON.stringify(out), 86_400);
  return out;
}

gamesCatalogRouter.get('/games-catalog/search', requireAuth, async (req, res) => {
  await rateLimit(`gamesearch:${uid(req)}`, 40);
  const q = String(req.query.q ?? '').trim().slice(0, 60);
  if (!q) return res.json({ games: EXTRA_GAMES.slice(0, 12) });
  const ql = q.toLowerCase();
  const local = EXTRA_GAMES.filter((g) => g.name.toLowerCase().includes(ql));
  const steam = await steamSearch(q);
  res.json({ games: [...local, ...steam.filter((s) => !local.some((l) => l.name.toLowerCase() === s.name.toLowerCase()))].slice(0, 16) });
});
