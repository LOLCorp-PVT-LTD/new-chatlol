import { rng } from './rng.js';

/**
 * Word Race for 2–8 players, everyone at once. Each of 5 rounds deals 9 letters; make the longest real word you
 * can from them (each letter once) within 45 seconds — you can improve your word until time runs out. Points =
 * word length, +3 for the longest word of the round. The server checks words against an English dictionary
 * (passed in as ctx.isWord).
 */
const ROUND_MS = 45_000;
const REVEAL_MS = 5_000;
export const WORD_ROUNDS = 5;
const VOWELS = 'AAEEEIIOOU';
const CONSONANTS = 'BBCCDDDFFGGHHJKLLLMMNNNNPPQRRRRSSSSTTTTVWWXYZ';

function letters(r) {
  const v = 3 + r.int(2);
  const out = [];
  for (let i = 0; i < 9; i++) out.push(i < v ? VOWELS[r.int(VOWELS.length)] : CONSONANTS[r.int(CONSONANTS.length)]);
  return out.sort(() => r.next() - 0.5);
}

export function initWordRace(n, seed, { now = Date.now() } = {}) {
  const r = rng(seed);
  return { n, rounds: Array.from({ length: WORD_ROUNDS }, () => letters(r)), round: 0, phase: 'play', endsAt: now + ROUND_MS, words: {}, scores: Array(n).fill(0), lastRound: null, result: null };
}

export function canMake(word, tiles) {
  const pool = [...tiles];
  for (const ch of word.toUpperCase()) {
    const i = pool.indexOf(ch);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

/** action: { type: 'word', word } — needs ctx.isWord(word). */
export function wordMove(s0, seat, a, ctx = {}) {
  if (s0.result) throw new Error('The game is over');
  if (s0.phase !== 'play') throw new Error('Wait for the next round');
  const w = String(a.word ?? '').trim().toUpperCase();
  if (w.length < 3) throw new Error('At least 3 letters');
  if (!canMake(w, s0.rounds[s0.round])) throw new Error('Use only the letters shown');
  if (!ctx.isWord?.(w.toLowerCase())) throw new Error(`“${w}” isn’t in the dictionary`);
  if ((s0.words[seat]?.length ?? 0) >= w.length) throw new Error('You already have a word that long');
  const s = structuredClone(s0);
  s.words[seat] = w;
  return s;
}

export function wordTimeout(s0, now = Date.now()) {
  const s = structuredClone(s0);
  if (s.phase === 'play') {
    const lens = Array.from({ length: s.n }, (_, i) => s.words[i]?.length ?? 0);
    const best = Math.max(...lens);
    const gained = lens.map((l) => l + (l && l === best ? 3 : 0));
    gained.forEach((g, i) => (s.scores[i] += g));
    s.lastRound = { words: { ...s.words }, gained };
    s.phase = 'reveal';
    s.endsAt = now + REVEAL_MS;
  } else if (s.round + 1 >= s.rounds.length) {
    const best = Math.max(...s.scores);
    s.result = { winners: s.scores.map((x, i) => i).filter((i) => s.scores[i] === best), scores: s.scores, reason: `${WORD_ROUNDS} rounds` };
  } else {
    s.round++;
    s.phase = 'play';
    s.words = {};
    s.endsAt = now + ROUND_MS;
  }
  return s;
}

/** Others' words stay hidden until the reveal. */
export function wordView(s, seat) {
  return {
    n: s.n,
    round: s.round,
    total: s.rounds.length,
    phase: s.phase,
    endsAt: s.endsAt,
    letters: s.rounds[s.round],
    myWord: s.words[seat] ?? null,
    submitted: Object.keys(s.words).map(Number),
    scores: s.scores,
    lastRound: s.phase === 'reveal' || s.result ? s.lastRound : null,
    result: s.result,
  };
}
