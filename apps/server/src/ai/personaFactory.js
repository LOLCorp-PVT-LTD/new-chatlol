import { PROFILE_ACCENTS, PROFILE_BACKGROUNDS } from '@chatlol/shared';
import { db, newId, now, today } from '../db.js';
import { bus } from '../lib/events.js';
import { newUser, DEFAULT_SETTINGS, DEFAULT_PROFILE } from '../lib/serialize.js';
import { PERSONAS } from './personas.js';
import { nimChat, nimImage } from './nim.js';
import { photoAllowed } from './photos.js';
import { localCheck } from '../lib/moderation.js';

/**
 * New AI personas generated on demand (admin panel). The chat model invents them as JSON; we validate every field,
 * keep them adults, make handles unique, give them a generated profile picture with no face, and save the persona
 * on its user document (personaDef). The engine picks them up through the 'personas:changed' event.
 */
const LOUNGES = [...new Set(PERSONAS.flatMap((p) => p.preferredLounges ?? []))];
const BOARDS = [...new Set(PERSONAS.flatMap((p) => p.boards ?? []))];
const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const validTz = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20) || 'persona';

/** Cleans one model-made persona; null if it can't be used. `taken` = lower-case handles already in use. */
export function cleanPersona(raw, taken = new Set()) {
  if (!raw || typeof raw !== 'object') return null;
  const displayName = str(raw.displayName ?? raw.name, 40);
  let handle = str(raw.handle, 24)
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9._]/g, '')
    .slice(0, 24);
  const age = Math.round(Number(raw.age));
  const pronouns = ['she/her', 'he/him', 'they/them'].includes(raw.pronouns) ? raw.pronouns : null;
  const bio = str(raw.bio, 140);
  const voice = str(raw.voice, 220);
  const city = str(raw.city, 40);
  const interests = (Array.isArray(raw.interests) ? raw.interests : [])
    .map((i) => str(i, 24).toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .slice(0, 6);
  const photoIdeas = (Array.isArray(raw.photoIdeas) ? raw.photoIdeas : [])
    .map((i) => str(i, 140))
    .filter((i) => photoAllowed(i))
    .slice(0, 6);
  if (!displayName || !bio || !voice || !city || !pronouns || interests.length < 2 || photoIdeas.length < 2) return null;
  if (!(age >= 19 && age <= 55)) return null; // adults only
  if (![displayName, bio, voice, ...photoIdeas].every((t) => localCheck(t).ok)) return null;
  if (handle.length < 3) handle = slug(displayName).replace(/-/g, '_');
  let h = handle;
  for (let n = 2; taken.has(h.toLowerCase()); n++) h = `${handle.slice(0, 21)}${n}`;
  taken.add(h.toLowerCase());
  const avatarIdea = str(raw.avatarIdea, 140);
  return {
    id: `gen-${slug(h)}-${newId().slice(-6)}`,
    handle: h,
    displayName,
    age,
    pronouns,
    city,
    timezone: validTz(raw.timezone) ? raw.timezone : 'America/New_York',
    bio,
    interests,
    voice,
    photoIdeas,
    avatarIdea: photoAllowed(avatarIdea) ? avatarIdea : '',
    albums: (Array.isArray(raw.albums) ? raw.albums : [])
      .map((a) => str(a, 30))
      .filter(Boolean)
      .slice(0, 3),
    generosity: Math.round((3.2 + Math.random() * 1.4) * 10) / 10,
    preferredLounges: [...LOUNGES].sort(() => Math.random() - 0.5).slice(0, 2),
    boards: [...BOARDS].sort(() => Math.random() - 0.5).slice(0, 2),
  };
}

/** First JSON array (or object) in a model reply. */
export function extractJson(text) {
  const s = String(text ?? '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('[');
  const o = s.indexOf('{');
  const start = a >= 0 && (o < 0 || a < o) ? a : o;
  if (start < 0) return null;
  const end = s.lastIndexOf(s[start] === '[' ? ']' : '}');
  try {
    const v = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(v) ? v : [v];
  } catch {
    return null;
  }
}

const PROMPT = (count, hint, existing) => `Invent ${count} new, distinct, believable adult members (ages 19-55) for ChatLOL, a casual social app. They will be AI personas with an AI badge. Mix genders, countries, jobs, ages and personalities; avoid anything like these existing ones: ${existing}.${hint ? `\nAdmin's request: ${hint}` : ''}
Reply ONLY with a JSON array, no prose. Each item:
{"displayName":"First Last","handle":"lowercase_handle","age":27,"pronouns":"she/her|he/him|they/them","city":"City, Country or US state","timezone":"IANA timezone for that city","bio":"short profile bio in their own voice, max 120 chars, emoji ok","interests":["4 to 6 single lowercase words"],"voice":"how they text: tone, slang, emoji habits, quirks","photoIdeas":["4 concrete photo descriptions they would post (places, food, objects, hobbies; no people, no faces)"],"avatarIdea":"what their profile picture shows without their face (e.g. their guitar on a bed, a sunset from their balcony)","albums":["2 short gallery album names"]}
No celebrities or real people, nothing sexual, no minors.`;

let running = false;

/**
 * Generates `count` (1-5) personas and creates their accounts. Returns the created handles.
 * One run at a time per instance; the admin route also takes a cluster-wide lock.
 */
export async function generatePersonas({ count = 1, hint = '' } = {}) {
  if (running) throw new Error('Already generating personas');
  running = true;
  try {
    count = Math.max(1, Math.min(5, Math.round(count)));
    const existingUsers = await db.users.find({ isAi: true }, { projection: { displayName: 1, handle: 1, handleLower: 1 } }).toArray();
    const taken = new Set((await db.users.find({}, { projection: { handleLower: 1 } }).toArray()).map((u) => u.handleLower));
    const existing = existingUsers
      .map((u) => u.displayName)
      .slice(0, 40)
      .join(', ');
    const raw = await nimChat([{ role: 'user', content: PROMPT(count, str(hint, 300), existing) }], {
      maxTokens: 700 * count,
      temperature: 0.95,
      retries: 2,
    });
    const items = (extractJson(raw) ?? []).map((x) => cleanPersona(x, taken)).filter(Boolean).slice(0, count);
    if (!items.length) {
      console.warn('[personas] generation returned nothing usable:', String(raw ?? '').slice(0, 200));
      return [];
    }
    const t = now();
    const created = [];
    for (const [i, p] of items.entries()) {
      const avatar =
        (p.avatarIdea && (await nimImage(`${p.avatarIdea}, profile picture, square composition, no visible faces`))) ??
        (await nimImage(`${p.photoIdeas[0]}, profile picture, square composition, no visible faces`));
      const user = newUser({
        _id: newId(),
        handle: p.handle,
        displayName: p.displayName,
        avatarUrl: avatar ?? `https://i.pravatar.cc/300?img=${1 + Math.floor(Math.random() * 70)}`,
        bio: p.bio,
        pronouns: p.pronouns,
        city: p.city,
        birthdate: `${new Date().getFullYear() - p.age}-0${1 + (p.age % 9)}-1${p.age % 9}`,
        interests: p.interests,
        xp: Math.floor(500 + Math.random() * 8000),
        sparks: 800,
        streakDays: Math.floor(1 + Math.random() * 10),
        lastDropDay: today(new Date(Date.now() - 86_400_000)),
        badges: ['ai_persona'],
        gender: p.pronouns.startsWith('she') ? 'female' : p.pronouns.startsWith('he') ? 'male' : Math.random() < 0.5 ? 'female' : 'male',
        settings: { ...DEFAULT_SETTINGS, dmFrom: 'everyone' },
        profile: {
          ...DEFAULT_PROFILE,
          background: { kind: 'preset', value: PROFILE_BACKGROUNDS[(existingUsers.length + i) % PROFILE_BACKGROUNDS.length].key },
          accent: PROFILE_ACCENTS[(existingUsers.length + i) % PROFILE_ACCENTS.length],
          headline: p.bio.split(/[.!]/)[0].slice(0, 80),
        },
        isAi: true,
        personaId: p.id,
        personaDef: p,
        originalAvatarUrl: null,
        lastSeenAt: t,
        createdAt: t,
      });
      try {
        await db.users.insertOne(user);
        created.push(p.handle);
        console.log(`[personas] created ${p.displayName} (@${p.handle}), ${p.age}, ${p.city}`);
      } catch (e) {
        console.warn(`[personas] couldn't create @${p.handle}: ${e.message}`);
      }
    }
    if (created.length) bus.emitEvent('personas:changed', { created });
    return created;
  } finally {
    running = false;
  }
}
