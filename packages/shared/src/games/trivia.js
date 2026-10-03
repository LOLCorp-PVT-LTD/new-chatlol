import { rng, shuffle } from './rng.js';
import { TRIVIA_BANK } from './triviaBank.js';

/**
 * Trivia race for 2–8 players, everyone at once. 10 questions, 15 seconds each: a right answer scores 100 plus
 * up to 50 for speed. A 4-second reveal shows the answer and who got it. The answer is hidden until the reveal.
 */
const Q_MS = 15_000;
const REVEAL_MS = 4_000;
export const TRIVIA_ROUNDS = 10;

export function initTrivia(n, seed, { now = Date.now() } = {}) {
  const r = rng(seed);
  const qs = shuffle(TRIVIA_BANK, r)
    .slice(0, TRIVIA_ROUNDS)
    .map(([cat, q, right, ...wrong]) => {
      const choices = shuffle([right, ...wrong], r);
      return { cat, q, choices, answer: choices.indexOf(right) };
    });
  return { n, qs, round: 0, phase: 'question', startedAt: now, endsAt: now + Q_MS, answers: {}, scores: Array(n).fill(0), lastRound: null, result: null };
}

function reveal(s, now) {
  const q = s.qs[s.round];
  const gained = Array(s.n).fill(0);
  for (const [seat, a] of Object.entries(s.answers))
    if (a.choice === q.answer) gained[seat] = 100 + Math.round(50 * Math.max(0, 1 - (a.at - s.startedAt) / Q_MS));
  gained.forEach((g, i) => (s.scores[i] += g));
  s.lastRound = { answer: q.answer, gained, picks: Object.fromEntries(Object.entries(s.answers).map(([k, v]) => [k, v.choice])) };
  s.phase = 'reveal';
  s.endsAt = now + REVEAL_MS;
}

/** action: { type: 'answer', choice, at } — `at` is set by the server. */
export function triviaMove(s0, seat, a) {
  if (s0.result) throw new Error('The game is over');
  if (s0.phase !== 'question') throw new Error('Wait for the next question');
  if (s0.answers[seat]) throw new Error('You already answered');
  const choice = Number(a.choice);
  if (!(choice >= 0 && choice < 4)) throw new Error('Pick an answer');
  const s = structuredClone(s0);
  s.answers[seat] = { choice, at: a.at ?? Date.now() };
  if (Object.keys(s.answers).length >= s.n) reveal(s, s.answers[seat].at);
  return s;
}

/** Time's up: reveal the answer, or move on to the next question / finish. */
export function triviaTimeout(s0, now = Date.now()) {
  const s = structuredClone(s0);
  if (s.phase === 'question') reveal(s, now);
  else if (s.round + 1 >= s.qs.length) {
    const best = Math.max(...s.scores);
    s.result = { winners: s.scores.map((x, i) => i).filter((i) => s.scores[i] === best), scores: s.scores, reason: `${TRIVIA_ROUNDS} questions` };
  } else {
    s.round++;
    s.phase = 'question';
    s.answers = {};
    s.startedAt = now;
    s.endsAt = now + Q_MS;
  }
  return s;
}

/** The current answer stays hidden until the reveal. */
export function triviaView(s, seat) {
  const q = s.qs[s.round];
  return {
    n: s.n,
    round: s.round,
    total: s.qs.length,
    phase: s.phase,
    endsAt: s.endsAt,
    question: { cat: q.cat, q: q.q, choices: q.choices },
    answered: Object.keys(s.answers).map(Number),
    myAnswer: s.answers[seat]?.choice ?? null,
    scores: s.scores,
    lastRound: s.phase === 'reveal' || s.result ? s.lastRound : null,
    result: s.result,
  };
}
