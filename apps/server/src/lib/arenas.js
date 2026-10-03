import { randomBytes, randomInt } from 'node:crypto';
import { ARENA_RAKE_PCT, GAMES } from '@chatlol/shared';
import { currentFestival } from './festivals.js';
import { db, newId, now } from '../db.js';
import { HttpError } from './http.js';
import { io, room } from './io.js';
import { emitWallet, notify } from './rewards.js';
import { isWord } from './words.js';
import { recordTournamentResult } from './tournaments.js';

/**
 * Game arenas: rooms where 2–6 members play one of the GAMES, optionally for a stake. The host creates it (public or
 * private), invites friends or shares the code, and starts when enough people have joined. Stakes are taken into
 * escrow at the start and paid out (minus the house rake) when the game ends; a draw refunds everyone.
 * The server runs every rule; clients only send actions. Each update bumps `version` (optimistic concurrency).
 */
const LABEL = { sparks: 'Sparks', gems: 'Gems', gold: 'Gold' };
export const STAKE_LIMITS = { sparks: 100_000, gems: 10_000, gold: 1_000 };

let wagerCache = null;
let wagerAt = 0;
/** Admin switch: may arenas be staked in Gems and Gold? On unless an admin turned it off. */
export async function gemGoldWagers() {
  if (wagerCache === null || Date.now() - wagerAt > 30_000) {
    wagerCache = (await db.settings.findOne({ _id: 'wagers' }))?.gemsGold ?? true;
    wagerAt = Date.now();
  }
  return wagerCache;
}
export async function setGemGoldWagers(on) {
  await db.settings.updateOne({ _id: 'wagers' }, { $set: { gemsGold: !!on } }, { upsert: true });
  wagerCache = null;
}

const code = () => randomBytes(4).toString('base64url').replace(/[-_]/g, 'x').slice(0, 6).toUpperCase();

export async function createArena(hostId, { name, game, visibility, stake }) {
  const g = GAMES[game];
  if (!g) throw new HttpError(400, 'Unknown game');
  if (stake.currency !== 'none') {
    if (stake.currency !== 'sparks' && !(await gemGoldWagers())) throw new HttpError(403, 'Gem and Gold stakes are switched off right now', 'wagers_off');
    if (stake.amount < 1 || stake.amount > STAKE_LIMITS[stake.currency]) throw new HttpError(400, `Stake must be 1–${STAKE_LIMITS[stake.currency].toLocaleString()} ${LABEL[stake.currency]}`);
  }
  const doc = {
    _id: newId(),
    name,
    game,
    hostId,
    visibility,
    code: code(),
    playerIds: [hostId],
    invitedIds: [],
    forfeitIds: [],
    stake: stake.currency === 'none' ? { currency: 'none', amount: 0 } : stake,
    status: 'lobby',
    state: null,
    version: 0,
    turnDeadline: null,
    outcome: null,
    payouts: [],
    escrowIds: [],
    createdAt: now(),
    startedAt: null,
    endedAt: null,
  };
  await db.arenas.insertOne(doc);
  return doc;
}

export const canSee = (a, userId, codeTry) =>
  a.visibility === 'public' || a.playerIds.includes(userId) || a.invitedIds.includes(userId) || (codeTry && codeTry.toUpperCase() === a.code);

function broadcast(a) {
  io()?.to(room.arena(a._id)).emit('arena:update', { id: a._id, version: a.version, status: a.status });
}

/** Saves `next` only if nobody changed the arena since `prev` was read. */
async function save(prev, set) {
  const r = await db.arenas.findOneAndUpdate({ _id: prev._id, version: prev.version }, { $set: { ...set, version: prev.version + 1 } }, { returnDocument: 'after' });
  if (!r) throw new HttpError(409, 'Someone else just moved — try again', 'arena_busy');
  broadcast(r);
  return r;
}

export async function joinArena(a, userId, codeTry) {
  if (a.status !== 'lobby') throw new HttpError(409, 'This game already started');
  if (!canSee(a, userId, codeTry)) throw new HttpError(403, 'This arena is invite-only', 'arena_private');
  if (a.playerIds.includes(userId)) return a;
  if (a.playerIds.length >= GAMES[a.game].max) throw new HttpError(409, 'This arena is full');
  await assertCanAfford(userId, a.stake);
  return save(a, { playerIds: [...a.playerIds, userId] });
}

export async function leaveArena(a, userId) {
  if (!a.playerIds.includes(userId)) return a;
  if (a.status === 'lobby') {
    if (a.hostId === userId) return save(a, { status: 'closed', endedAt: now() });
    return save(a, { playerIds: a.playerIds.filter((p) => p !== userId) });
  }
  if (a.status === 'playing') return resign(a, userId);
  return a;
}

export async function inviteToArena(a, byId, userIds) {
  if (!a.playerIds.includes(byId)) throw new HttpError(403, 'Join the arena to invite people');
  if (a.status !== 'lobby') throw new HttpError(409, 'The game already started');
  const fresh = userIds.filter((u) => u !== byId && !a.invitedIds.includes(u)).slice(0, 20);
  const by = await db.users.findOne({ _id: byId }, { projection: { displayName: 1 } });
  const next = await save(a, { invitedIds: [...a.invitedIds, ...fresh] });
  for (const u of fresh)
    await notify(u, {
      kind: 'invite',
      actorId: byId,
      title: `🎮 ${by.displayName} invited you to ${GAMES[a.game].name}`,
      body: `${a.name}${a.stake.amount ? ` · stake ${a.stake.amount.toLocaleString()} ${LABEL[a.stake.currency]}` : ''}`,
      link: `/arenas/${a._id}`,
      action: { type: 'arena_invite', id: a._id },
    });
  return next;
}

async function assertCanAfford(userId, stake) {
  if (!stake.amount) return;
  const u = await db.users.findOne({ _id: userId }, { projection: { [stake.currency]: 1 } });
  if ((u?.[stake.currency] ?? 0) < stake.amount)
    throw new HttpError(402, `You need ${stake.amount.toLocaleString()} ${LABEL[stake.currency]} to play here`, `insufficient_${stake.currency}`);
}

/** Host starts the game: everyone's stake goes into escrow (all or nobody), then the board is dealt. */
export async function startArena(a, userId) {
  const g = GAMES[a.game];
  if (a.hostId !== userId) throw new HttpError(403, 'Only the host can start');
  if (a.status !== 'lobby') throw new HttpError(409, 'Already started');
  if (a.playerIds.length < g.min) throw new HttpError(400, `${g.name} needs at least ${g.min} players`);
  const escrowIds = [];
  if (a.stake.amount) {
    const { currency, amount } = a.stake;
    for (const p of a.playerIds) {
      const r = await db.users.updateOne({ _id: p, [currency]: { $gte: amount } }, { $inc: { [currency]: -amount } });
      if (!r.modifiedCount) {
        for (const q of escrowIds) await db.users.updateOne({ _id: q }, { $inc: { [currency]: amount } });
        const who = await db.users.findOne({ _id: p }, { projection: { handle: 1 } });
        throw new HttpError(402, `@${who?.handle} can’t cover the ${amount.toLocaleString()} ${LABEL[currency]} stake`, 'stake_short');
      }
      escrowIds.push(p);
    }
    for (const p of escrowIds) void emitWallet(p);
  }
  // Seats in random order (white / first to act isn't always the host).
  const seats = [...a.playerIds].sort(() => randomInt(3) - 1);
  // Trivia during a festival mixes in themed questions.
  const festival = (await currentFestival())?.key ?? null;
  const state = g.init(seats.length, randomInt(2 ** 31), { now: Date.now(), festival });
  const next = await save(a, {
    status: 'playing',
    playerIds: seats,
    escrowIds,
    state,
    startedAt: now(),
    turnDeadline: deadlineFor(g, state),
  });
  return settleIfOver(next);
}

/** When the current turn / round times out: the game's own clock if it has one, else turnSeconds from now. */
const deadlineFor = (g, state) => new Date(g.deadline ? g.deadline(state) : Date.now() + g.turnSeconds * 1000).toISOString();

/** A player's action. `{ type: 'resign' }` forfeits. */
export async function playMove(a, userId, action) {
  if (a.status !== 'playing') throw new HttpError(409, 'The game isn’t running');
  const seat = a.playerIds.indexOf(userId);
  if (seat < 0) throw new HttpError(403, 'You’re not playing in this arena');
  if (action?.type === 'resign') return resign(a, userId);
  const g = GAMES[a.game];
  let state;
  try {
    // The server's clock, never the client's: timed games (tower, trivia speed) use it.
    state = g.move(a.state, seat, { ...action, at: Date.now() }, { isWord });
  } catch (e) {
    throw new HttpError(400, e.message, 'illegal_move');
  }
  state = await autoplayForfeits(a, state);
  // Simultaneous games keep their round clock (deadline()); turn-based games restart the turn timer.
  const next = await save(a, { state, turnDeadline: deadlineFor(g, state) });
  return settleIfOver(next);
}

/** Seats that resigned never act again: their turns are skipped with the game's timeout rule. */
async function autoplayForfeits(a, state, forfeits = a.forfeitIds) {
  const g = GAMES[a.game];
  for (let guard = 0; guard < 200 && !g.outcome(state); guard++) {
    const t = g.turn(state);
    if (t == null || !forfeits.includes(a.playerIds[t])) break;
    state = g.timeout(state, Date.now());
  }
  return state;
}

async function resign(a, userId) {
  const g = GAMES[a.game];
  const seat = a.playerIds.indexOf(userId);
  const forfeitIds = [...new Set([...a.forfeitIds, userId])];
  const remaining = a.playerIds.filter((p) => !forfeitIds.includes(p));
  let state = a.state;
  let forced = null;
  // Down to one player: they win outright.
  if (remaining.length <= 1) forced = { winners: remaining.map((p) => a.playerIds.indexOf(p)), reason: `${seat >= 0 ? 'opponent' : 'player'} resigned` };
  else state = await autoplayForfeits(a, state, forfeitIds);
  const next = await save(a, { forfeitIds, state, forcedOutcome: forced });
  return settleIfOver(next);
}

/** Pays out when the game has ended. Forfeited players never win anything. */
async function settleIfOver(a) {
  const g = GAMES[a.game];
  const out = a.forcedOutcome ?? g.outcome(a.state);
  if (!out || a.status !== 'playing') return a;
  const claimed = await db.arenas.findOneAndUpdate(
    { _id: a._id, status: 'playing' },
    { $set: { status: 'finished', outcome: out, endedAt: now(), turnDeadline: null, version: a.version + 1 } },
    { returnDocument: 'after' },
  );
  if (!claimed) return db.arenas.findOne({ _id: a._id });
  const { currency, amount } = a.stake;
  const pot = amount * a.escrowIds.length;
  const payouts = [];
  const eligible = (seat) => !a.forfeitIds.includes(a.playerIds[seat]);
  if (pot) {
    let weights = a.playerIds.map(() => 0);
    if (out.shares) weights = out.shares.map((w, i) => (eligible(i) ? w : 0));
    else for (const w of out.winners ?? []) if (eligible(w)) weights[w] = 1;
    const total = weights.reduce((x, y) => x + y, 0);
    if (!total) {
      // Draw: everyone gets their stake back.
      for (const p of a.escrowIds) payouts.push({ userId: p, amount });
    } else {
      const prize = Math.floor((pot * (100 - ARENA_RAKE_PCT)) / 100);
      weights.forEach((w, i) => w && payouts.push({ userId: a.playerIds[i], amount: Math.floor((prize * w) / total) }));
    }
    for (const p of payouts) if (p.amount) await db.users.updateOne({ _id: p.userId }, { $inc: { [currency]: p.amount } });
  }
  const winners = (out.winners ?? []).filter(eligible).map((i) => a.playerIds[i]);
  await db.users.updateMany({ _id: { $in: a.playerIds } }, { $inc: { 'gameStats.played': 1, [`gameStats.byGame.${a.game}.played`]: 1 } });
  if (winners.length) await db.users.updateMany({ _id: { $in: winners } }, { $inc: { 'gameStats.wins': 1, [`gameStats.byGame.${a.game}.wins`]: 1 } });
  if (winners.length) await recordTournamentResult('arena', a.game, winners, 1);
  const done = await db.arenas.findOneAndUpdate({ _id: a._id }, { $set: { payouts } }, { returnDocument: 'after' });
  for (const p of a.playerIds) {
    void emitWallet(p);
    const mine = payouts.find((x) => x.userId === p)?.amount ?? 0;
    await notify(p, {
      kind: 'arena',
      title: mine > amount ? `🏆 You won ${mine.toLocaleString()} ${LABEL[currency]}!` : mine ? `🤝 ${g.name} ended — ${mine.toLocaleString()} ${LABEL[currency]} back` : `🎮 ${g.name} is over`,
      body: `${a.name} · ${out.reason ?? ''}`.trim(),
      link: `/arenas/${a._id}`,
    });
  }
  broadcast(done);
  return done;
}

/** Worker: turns that ran out of time are played by the game's timeout rule. */
export async function resolveArenaTimeouts() {
  const due = await db.arenas.find({ status: 'playing', turnDeadline: { $lte: now() } }).limit(100).toArray();
  for (const a of due) {
    try {
      const g = GAMES[a.game];
      const state = await autoplayForfeits(a, g.timeout(a.state, Date.now()));
      const next = await save(a, { state, turnDeadline: deadlineFor(g, state) });
      await settleIfOver(next);
    } catch (e) {
      if (e.status !== 409) console.warn('[arena timeout]', a._id, e.message);
    }
  }
}

/** What one person sees: the arena plus the game state with secrets hidden for their seat. */
export function arenaView(a, viewerId) {
  const g = GAMES[a.game];
  const seat = a.playerIds.indexOf(viewerId);
  return {
    id: a._id,
    name: a.name,
    game: a.game,
    hostId: a.hostId,
    visibility: a.visibility,
    code: seat >= 0 || a.hostId === viewerId ? a.code : null,
    playerIds: a.playerIds,
    invitedIds: a.invitedIds,
    forfeitIds: a.forfeitIds,
    stake: a.stake,
    status: a.status,
    version: a.version,
    turnDeadline: a.turnDeadline,
    turnSeat: a.status === 'playing' && a.state ? g.turn(a.state) : null,
    mySeat: seat >= 0 ? seat : null,
    state: a.state ? g.view(a.state, seat) : null,
    outcome: a.outcome,
    payouts: a.payouts,
    createdAt: a.createdAt,
  };
}
