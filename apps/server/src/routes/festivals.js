import { Router } from 'express';
import { z } from 'zod';
import { FESTIVALS } from '@chatlol/shared';
import { db, today } from '../db.js';
import { optionalAuth, requireAuth, requirePerm, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { bumpCounter, grant } from '../lib/rewards.js';
import { track } from '../lib/activity.js';
import { currentFestival, ensureFestivalLounge, festivalCalendar, festivalQuiz, setFestivalDisabled } from '../lib/festivals.js';

/**
 * Festival seasons: what's on now (for the Home banner), the daily festival quiz, and the staff calendar.
 * Quiz: 5 questions a day, 15 Sparks per right answer and a 25 Spark bonus for a perfect round, once a day.
 */
export const festivalsRouter = Router();
const PER_RIGHT = 15;
const PERFECT_BONUS = 25;

festivalsRouter.get('/festival', optionalAuth, async (req, res) => {
  const f = await currentFestival();
  if (!f) return res.json({ festival: null });
  const lounge = await ensureFestivalLounge(f);
  const quiz = festivalQuiz(f.key, today());
  const done = req.userId ? await db.dailyCounters.findOne({ userId: req.userId, day: today(), key: `fquiz:${f.key}` }) : null;
  res.json({
    festival: f,
    loungeId: lounge?._id ?? null,
    quiz: { questions: quiz.map(({ q, choices }) => ({ q, choices })), done: !!done, score: done?.score ?? null, perRight: PER_RIGHT, perfectBonus: PERFECT_BONUS },
  });
});

festivalsRouter.post('/festival/quiz', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`fquiz:${me}`, 5);
  const f = await currentFestival();
  if (!f) throw new HttpError(404, 'No festival is on right now');
  const { answers } = parse(z.object({ answers: z.array(z.number().int().min(0).max(3)).max(5) }), req.body);
  const key = `fquiz:${f.key}`;
  // One go a day: the counter goes 0 → 1 atomically, so a double-tap can't pay twice.
  if ((await bumpCounter(me, key, 1)) > 1) throw new HttpError(409, 'You’ve done today’s quiz — come back tomorrow!', 'quiz_done');
  const quiz = festivalQuiz(f.key, today());
  const right = quiz.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
  await db.dailyCounters.updateOne({ userId: me, day: today(), key }, { $set: { score: right } });
  const sparks = right * PER_RIGHT + (right === quiz.length ? PERFECT_BONUS : 0);
  const reward = sparks ? await grant(me, sparks, right * 5, `${f.emoji} ${f.name} quiz: ${right}/${quiz.length}`) : null;
  track(me, 'festival_quiz');
  res.json({ right, total: quiz.length, answers: quiz.map((q) => q.answer), reward });
});

// ——— Staff: the calendar and switching festivals on or off ———
festivalsRouter.get('/admin/festivals', requireAuth, requirePerm('overview'), async (_req, res) => {
  res.json({ current: await currentFestival(), upcoming: await festivalCalendar(12), all: FESTIVALS.map((f) => ({ key: f.key, name: f.name, emoji: f.emoji })) });
});
festivalsRouter.put('/admin/festivals', requireAuth, requirePerm('staff'), async (req, res) => {
  const { disabled } = parse(z.object({ disabled: z.array(z.string().max(30)).max(50) }), req.body);
  await setFestivalDisabled(disabled.filter((k) => FESTIVALS.some((f) => f.key === k)));
  res.json({ current: await currentFestival(), upcoming: await festivalCalendar(12) });
});
