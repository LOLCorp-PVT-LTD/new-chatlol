import { db, newId, now } from '../db.js';
import { io } from './io.js';
import { HttpError } from './http.js';
import { resolveTrack } from './youtubeApi.js';

/**
 * Live radio for lounges (when their owner switches it on) and the shoutbox. One song plays for everyone at the
 * same moment: the server keeps { track, startedAt } and every listener seeks to "now − startedAt". Listeners
 * suggest songs (YouTube) and vote for what plays next; the most-voted suggestion plays next (ties are a coin
 * toss). With nothing suggested, the system picks a random song the station has played before.
 *
 * Station ids: 'shouts' or 'lounge:<id>'. Socket room: `radio:<station>`.
 */
export const MAX_QUEUE = 30;
export const MAX_PER_USER = 2;
const HISTORY = 60;
/** Songs with an unknown length (no YouTube API key) end when a listener's player reports the end, or after 8 min. */
const UNKNOWN_LENGTH_SEC = 8 * 60;

export const radioRoom = (station) => `radio:${station}`;
export const validStation = (s) => s === 'shouts' || /^lounge:[A-Za-z0-9_-]{6,40}$/.test(s);

async function load(station) {
  return (await db.radioStations.findOne({ _id: station })) ?? { _id: station, now: null, queue: [], history: [], version: 0 };
}

/** Public view of a station (votes as counts; whether the viewer voted / suggested). */
export function view(st, viewerId = null) {
  return {
    station: st._id,
    now: st.now ? { ...st.now, serverTime: now() } : null,
    queue: [...(st.queue ?? [])]
      .sort((a, b) => b.votes.length - a.votes.length || a.at.localeCompare(b.at))
      .map((q) => ({ id: q.id, track: q.track, by: q.by, votes: q.votes.length, mine: q.by === viewerId, voted: !!viewerId && q.votes.includes(viewerId) })),
    serverTime: now(),
  };
}

function broadcast(st) {
  io()?.to(radioRoom(st._id)).emit('radio:state', view(st));
}

/** Saves a change only if nobody else changed the station meanwhile (several servers may run). */
async function save(st, prevVersion) {
  const doc = { ...st, version: prevVersion + 1 };
  if (prevVersion === 0 && !(await db.radioStations.findOne({ _id: st._id }))) {
    try {
      await db.radioStations.insertOne(doc);
      return doc;
    } catch {
      return null;
    }
  }
  const r = await db.radioStations.updateOne({ _id: st._id, version: prevVersion }, { $set: { now: doc.now, queue: doc.queue, history: doc.history, version: doc.version } });
  return r.modifiedCount ? doc : null;
}

function start(st, track, by) {
  const len = track.duration || UNKNOWN_LENGTH_SEC;
  const t = Date.now();
  st.now = { track, by, startedAt: new Date(t).toISOString(), endsAt: new Date(t + len * 1000 + 1500).toISOString() };
  st.history = [track, ...(st.history ?? []).filter((h) => h.id !== track.id)].slice(0, HISTORY);
  schedule(st);
}

/** Moves to the next song: most votes from the queue, else a random earlier song, else silence. */
function pickNext(st) {
  const q = st.queue ?? [];
  if (q.length) {
    const top = Math.max(...q.map((x) => x.votes.length));
    const best = q.filter((x) => x.votes.length === top);
    const pick = best[Math.floor(Math.random() * best.length)];
    st.queue = q.filter((x) => x.id !== pick.id);
    return start(st, pick.track, pick.by);
  }
  const recent = new Set((st.history ?? []).slice(0, 5).map((h) => h.id));
  const pool = (st.history ?? []).filter((h) => !recent.has(h.id));
  const from = pool.length ? pool : st.history ?? [];
  if (!from.length) return void (st.now = null);
  start(st, from[Math.floor(Math.random() * from.length)], null);
}

export async function advance(station, { ifTrackId = null, force = false } = {}) {
  for (let i = 0; i < 3; i++) {
    const st = await load(station);
    if (ifTrackId && st.now?.track.id !== ifTrackId) return st; // someone already moved on
    if (!force && st.now && Date.parse(st.now.endsAt) > Date.now()) return st;
    const v = st.version ?? 0;
    pickNext(st);
    const saved = await save(st, v);
    if (saved) return broadcast(saved), saved;
  }
  return load(station);
}

const timers = new Map();
function schedule(st) {
  clearTimeout(timers.get(st._id));
  if (!st.now) return;
  const ms = Math.max(500, Date.parse(st.now.endsAt) - Date.now());
  timers.set(st._id, setTimeout(() => void advance(st._id, { ifTrackId: st.now.track.id }).catch(() => {}), ms).unref?.() ?? undefined);
}

/** Safety net for restarts and other servers: every few seconds, move on any station whose song has ended. */
export function startRadioLoop() {
  setInterval(() => {
    void (async () => {
      const due = await db.radioStations.find({ 'now.endsAt': { $lte: now() } }, { projection: { _id: 1 } }).toArray();
      for (const s of due) await advance(s._id);
    })().catch((e) => console.warn('[radio]', e.message));
  }, 4000).unref();
}

export async function getStation(station, viewerId) {
  return view(await load(station), viewerId);
}

export async function suggest(station, userId, youtubeId) {
  const track = await resolveTrack(youtubeId);
  if (!track) throw new HttpError(400, 'That song can’t be played on the radio');
  if (track.duration && track.duration > 15 * 60) throw new HttpError(400, 'Songs on the radio can be up to 15 minutes');
  for (let i = 0; i < 3; i++) {
    const st = await load(station);
    const v = st.version ?? 0;
    st.queue = st.queue ?? [];
    if (st.now?.track.id === track.id || st.queue.some((q) => q.track.id === track.id)) throw new HttpError(409, 'That song is already playing or queued');
    if (st.queue.filter((q) => q.by === userId).length >= MAX_PER_USER) throw new HttpError(429, `You can have ${MAX_PER_USER} songs waiting at a time`);
    if (st.queue.length >= MAX_QUEUE) throw new HttpError(429, 'The queue is full — vote for a song instead');
    if (!st.now) start(st, track, userId); // nothing on: play it right away
    else st.queue.push({ id: newId(), track, by: userId, votes: [userId], at: now() });
    const saved = await save(st, v);
    if (saved) return broadcast(saved), view(saved, userId);
  }
  throw new HttpError(409, 'The radio is busy — try again');
}

export async function vote(station, userId, itemId) {
  for (let i = 0; i < 3; i++) {
    const st = await load(station);
    const v = st.version ?? 0;
    const item = (st.queue ?? []).find((q) => q.id === itemId);
    if (!item) throw new HttpError(404, 'That song already played or was removed');
    item.votes = item.votes.includes(userId) ? item.votes.filter((x) => x !== userId) : [...item.votes, userId];
    const saved = await save(st, v);
    if (saved) return broadcast(saved), view(saved, userId);
  }
  throw new HttpError(409, 'The radio is busy — try again');
}

export async function removeFromQueue(station, userId, itemId, staff) {
  for (let i = 0; i < 3; i++) {
    const st = await load(station);
    const v = st.version ?? 0;
    const item = (st.queue ?? []).find((q) => q.id === itemId);
    if (!item) return view(st, userId);
    if (item.by !== userId && !staff) throw new HttpError(403, 'Only the person who added it (or a host) can remove it');
    st.queue = st.queue.filter((q) => q.id !== itemId);
    const saved = await save(st, v);
    if (saved) return broadcast(saved), view(saved, userId);
  }
  throw new HttpError(409, 'The radio is busy — try again');
}

/** On boot: re-arm timers for songs that are playing. */
export async function resumeRadio() {
  for (const st of await db.radioStations.find({ now: { $ne: null } }).toArray()) schedule(st);
}
