import { ARENA_MIN_STAKE } from '@chatlol/shared';
import { db, newId, now, today } from '../db.js';
import { config } from '../config.js';
import { bus } from '../lib/events.js';
import { presence } from '../lib/presence.js';
import { io, room } from '../lib/io.js';
import { localCheck, deepCheck } from '../lib/moderation.js';
import { grant } from '../lib/rewards.js';
import { shared } from '../lib/shared.js';
import { applyRating, insertComment, insertPost } from '../routes/posts.js';
import { insertDm, insertLoungeMessage, insertReply, insertThread, loungeKey, markRead, recentMessages } from '../routes/social.js';
import { placeStake, newTake } from '../routes/arena.js';
import { insertStreamMessage } from '../routes/live.js';
import { insertShout, reactToShout } from '../routes/shouts.js';
import { ensureDrop } from '../lib/drops.js';
import { personaById, systemPrompt, chatPrompt } from './personas.js';
import { nimChat, nimImage, nimVision, nimEnabled } from './nim.js';
import { fallback } from './fallback.js';

/**
 * The persona engine: a light scheduler that makes AI personas behave like regulars —
 * posting photos, doing the daily drop, rating, commenting, hanging out in lounges and replying to DMs.
 * All content passes the same SafeShield moderation as human content. Runs on one elected worker instance.
 */

const rand = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p * config.ai.activity;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const later = (ms, fn) =>
  setTimeout(() => {
    Promise.resolve(fn()).catch((e) => console.warn('[ai]', e.message));
  }, ms);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let roster = [];
let awakeIds = new Set();
let isLeader = async () => true;

async function loadRoster() {
  roster = (await db.users.find({ isAi: true, deletedAt: null }, { projection: { personaId: 1 } }).toArray())
    .map((r) => ({ persona: personaById(r.personaId), userId: r._id }))
    .filter((r) => r.persona);
}

const byUserId = (id) => roster.find((r) => r.userId === id);
const isAi = (id) => !!byUserId(id);

function localHour(tz) {
  return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date())) % 24;
}

/** Awake 8:00–01:00 local with a little jitter; always a few personas online so nobody's ever alone. */
async function refreshAwake() {
  const next = new Set();
  for (const r of roster) {
    const h = localHour(r.persona.timezone);
    if ((h >= 8 || h < 1) && Math.random() < 0.85) next.add(r.userId);
  }
  if (!next.size) roster.slice(0, 3).forEach((r) => next.add(r.userId));
  for (const r of roster) await presence.setAiAwake(r.userId, next.has(r.userId));
  awakeIds = next;
}

const awake = () => roster.filter((r) => awakeIds.has(r.userId));

/** Up to `n` random visible posts matching `filter`. */
const randomPosts = (filter, n) => db.posts.aggregate([{ $match: { hidden: false, ...filter } }, { $sample: { size: n } }]).toArray();

/** Adds each item's author handle (comments, replies, messages) for building chat context. */
async function withHandles(items) {
  const users = await db.users.find({ _id: { $in: [...new Set(items.map((i) => i.authorId))] } }, { projection: { handle: 1 } }).toArray();
  const h = new Map(users.map((u) => [u._id, u.handle]));
  return items.map((i) => ({ ...i, handle: h.get(i.authorId) ?? 'someone' }));
}

async function say(p, context, prompt, history = [], maxTokens = 90, model = p.model) {
  const text = await nimChat([{ role: 'system', content: systemPrompt(p, context) }, ...history, { role: 'user', content: prompt }], {
    model,
    maxTokens,
  });
  if (!text) return null;
  if (!localCheck(text).ok || !(await deepCheck(text))) return null;
  return text.replace(/\n+/g, ' '); // posts, comments and lounge lines are single messages
}

function simulateTyping(convId, aiUserId, humanIds, ms) {
  for (const h of humanIds) io()?.to(room.user(h)).emit('dm:typing', { conversationId: convId, userId: aiUserId, typing: true });
  setTimeout(() => {
    for (const h of humanIds) io()?.to(room.user(h)).emit('dm:typing', { conversationId: convId, userId: aiUserId, typing: false });
  }, ms);
}

/** Persona-biased rating: centred on their generosity, nudged toward the existing consensus so tiers feel "real". */
function personaScore(p, post) {
  const n = post.r1 + post.r2 + post.r3 + post.r4 + post.r5;
  const avg = n ? (post.r1 + 2 * post.r2 + 3 * post.r3 + 4 * post.r4 + 5 * post.r5) / n : p.generosity;
  const mean = n >= 3 ? avg * 0.6 + p.generosity * 0.4 : p.generosity;
  const s = Math.round(mean + (Math.random() - 0.5) * 1.6);
  return Math.min(5, Math.max(1, s));
}

// ——— Ambient actions ———

async function actPost(r) {
  const posted = await db.posts.countDocuments({
    authorId: r.userId,
    createdAt: { $gt: new Date(Date.now() - 6 * 3_600_000).toISOString() },
  });
  if (posted >= 2) return;
  const p = r.persona;
  const kind = Math.random();
  if (kind < 0.15) {
    const q = await say(
      p,
      'You are posting a "this or that" battle poll.',
      'Write a fun two-option battle poll related to your interests. Reply ONLY as: Question | Option A | Option B',
      [],
      80,
    );
    const parts = q
      ?.split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts && parts.length >= 3) {
      await insertPost(r.userId, {
        kind: 'battle',
        body: parts[0].slice(0, 200),
        battle: [{ label: parts[1].slice(0, 60) }, { label: parts[2].slice(0, 60) }],
      });
      return;
    }
  }
  if (kind < 0.35) {
    const text =
      (await say(
        p,
        'You are writing a short text post for your followers.',
        'Write a short, casual text post about something from your day. Add one relevant hashtag.',
        [],
        90,
      )) ?? fallback.caption();
    await insertPost(r.userId, { kind: 'text', body: text });
    return;
  }
  const idea = pick(p.photoIdeas);
  const media = await nimImage(idea);
  if (!media) {
    // Without image generation, personas post text instead of mismatched stock photos.
    const text =
      (await say(p, 'You are writing a short text post.', `Write a short casual post about: ${idea}. Add one hashtag.`, [], 90)) ??
      fallback.caption();
    await insertPost(r.userId, { kind: 'text', body: text });
    return;
  }
  const caption =
    (await say(
      p,
      `You just took a photo of: ${idea}.`,
      'Write a short caption for this photo post (max 120 chars). One hashtag max.',
      [],
      60,
    )) ?? fallback.caption();
  await insertPost(r.userId, { kind: 'photo', body: caption, mediaUrl: media });
}

async function actDrop(r) {
  const d = await ensureDrop();
  if (await db.posts.findOne({ dropId: d._id, authorId: r.userId })) return;
  const media = await nimImage(`${d.prompt}, ${pick(r.persona.photoIdeas)}`);
  if (!media) return;
  const caption =
    (await say(
      r.persona,
      `Today's Sunset Drop prompt is "${d.prompt}".`,
      'Write a short caption for your drop photo (max 100 chars).',
      [],
      50,
    )) ?? fallback.caption();
  await insertPost(r.userId, { kind: 'photo', body: caption, mediaUrl: media, dropId: d._id, kindOverride: 'drop' });
  const u = await db.users.findOne({ _id: r.userId }, { projection: { streakDays: 1, lastDropDay: 1 } });
  const y = today(new Date(Date.now() - 86_400_000));
  await db.users.updateOne({ _id: r.userId }, { $set: { streakDays: u.lastDropDay === y ? u.streakDays + 1 : 1, lastDropDay: today() } });
}

async function actRate(r, count = 3) {
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const rated = await db.ratings.distinct('postId', { userId: r.userId, createdAt: { $gt: since } });
  const posts = await randomPosts({ _id: { $nin: rated }, authorId: { $ne: r.userId }, createdAt: { $gt: since } }, count);
  for (const post of posts) {
    try {
      await applyRating(post._id, r.userId, personaScore(r.persona, post));
    } catch {
      /* post vanished */
    }
  }
  await grant(r.userId, 0, posts.length * 5, 'rate', false);
}

async function commentOn(r, post) {
  const author = await db.users.findOne({ _id: post.authorId }, { projection: { handle: 1 } });
  if (!author) return;
  const recent = await withHandles(await db.comments.find({ postId: post._id }).sort({ createdAt: -1 }).limit(4).toArray());
  const ctx = `Commenting on @${author.handle}'s post: "${post.body || '(photo, no caption)'}". Other comments: ${recent.map((c) => `@${c.handle}: ${c.body}`).join(' / ') || 'none yet'}.`;
  let text = null;
  if (post.mediaUrl) {
    text = await nimVision(
      'Leave a short, specific, friendly comment on this photo post (max 140 chars).',
      post.mediaUrl,
      systemPrompt(r.persona, ctx),
    );
    if (text && (!localCheck(text).ok || !(await deepCheck(text)))) text = null;
  }
  text ??= await say(r.persona, ctx, 'Write one short comment on this post (max 140 chars). Be specific and genuine.', [], 60);
  text ??= fallback.comment(r.persona);
  await insertComment(post._id, r.userId, text);
}

async function actComment(r) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const commented = await db.comments.distinct('postId', { authorId: r.userId, createdAt: { $gt: since } });
  const filter = { _id: { $nin: commented }, createdAt: { $gt: since } };
  // Humans' posts first, then other personas'.
  const post =
    (await randomPosts({ ...filter, authorId: { $nin: roster.map((x) => x.userId) } }, 1))[0] ??
    (await randomPosts({ ...filter, authorId: { $ne: r.userId } }, 1))[0];
  if (post) await commentOn(r, post);
}

async function loungeLine(r, loungeId, mention) {
  const l = await db.lounges.findOne({ _id: loungeId });
  if (!l) return;
  const history = (await withHandles(await recentMessages('lounge', loungeId, 12))).reverse();
  const msgs = history.map((h) =>
    h.authorId === r.userId ? { role: 'assistant', content: h.body } : { role: 'user', content: `@${h.handle}: ${h.body}` },
  );
  const ctx = `You're hanging out in the "${l.name}" lounge (topic: ${l.topic}; now playing: ${l.nowPlaying}). It's a casual group chat.`;
  const prompt = mention
    ? `Reply to @${mention} naturally.`
    : history.length
      ? 'Say the next message in the chat — react to what people said or start a light new topic.'
      : 'Say something to kick off the chat.';
  let text = await say(r.persona, ctx, prompt, msgs.slice(-10), 80, mention ? config.nim.chatModel : undefined);
  if (!text) {
    // Talking to a person needs a real reply; canned lines are only ambient filler, and never repeated in the room.
    if (mention) return;
    const recent = new Set(history.map((h) => h.body));
    text = [0, 1, 2, 3, 4].map(() => fallback.lounge()).find((l) => !recent.has(l));
    if (!text) return;
  }
  await insertLoungeMessage(loungeId, r.userId, text);
}

async function loungesWithHumans() {
  const out = [];
  for (const id of await db.lounges.distinct('_id')) {
    const ids = await shared().smembers(loungeKey(id));
    if (ids.some((u) => !isAi(u))) out.push(id);
  }
  return out;
}

async function actLounge(r) {
  const withHumans = await loungesWithHumans();
  const target = withHumans.length && Math.random() < 0.7 ? pick(withHumans) : pick(r.persona.preferredLounges);
  const [last] = await recentMessages('lounge', target, 1);
  if (last?.authorId === r.userId) return;
  // Quiet lounges without humans only get occasional ambient chatter.
  if (!withHumans.includes(target) && last && Date.now() - Date.parse(last.createdAt) < 8 * 60_000) return;
  await loungeLine(r, target);
}

async function actThread(r) {
  if (Math.random() < 0.25) {
    const board = pick(r.persona.boards);
    const b = await db.boards.findOne({ slug: board });
    if (!b) return;
    const out = await say(
      r.persona,
      `Starting a discussion thread in the ${board} board.`,
      'Write a discussion thread. Reply ONLY as: Title | Body (body max 200 chars)',
      [],
      110,
    );
    const [title, body] = out?.split('|').map((s) => s.trim()) ?? fallback.thread();
    if (title && body && title.length >= 4) await insertThread(r.userId, b._id, title.slice(0, 120), body.slice(0, 1000));
    return;
  }
  const repliedTo = await db.replies.distinct('threadId', { authorId: r.userId });
  const [t] = await db.threads
    .aggregate([
      {
        $match: {
          _id: { $nin: repliedTo },
          authorId: { $ne: r.userId },
          lastActivityAt: { $gt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
        },
      },
      { $sample: { size: 1 } },
    ])
    .toArray();
  if (t) await replyToThread(r, t);
}

async function replyToThread(r, t) {
  const replies = (await withHandles(await db.replies.find({ threadId: t._id }).sort({ createdAt: -1 }).limit(5).toArray())).reverse();
  const ctx = `Forum thread "${t.title}": ${t.body}. Replies so far: ${replies.map((x) => `@${x.handle}: ${x.body}`).join(' / ') || 'none'}.`;
  const text = (await say(r.persona, ctx, 'Write your reply to this thread (max 200 chars).', [], 90)) ?? fallback.reply();
  await insertReply(t._id, r.userId, text);
}

async function actArena(r) {
  await db.users.updateOne({ _id: r.userId, sparks: { $lt: 300 } }, { $set: { sparks: 300 } });
  const staked = await db.stakes.distinct('takeId', { userId: r.userId });
  const open = await db.hotTakes.find({ _id: { $nin: staked }, resolved: false, endsAt: { $gt: now() } }).toArray();
  if (open.length) {
    const t = pick(open);
    try {
      await placeStake(r.userId, t._id, Math.random() < 0.55 ? 'agree' : 'disagree', Math.round(rand(ARENA_MIN_STAKE, 40)));
    } catch {
      /* raced */
    }
  }
  if (open.length < 6 && Math.random() < 0.3) {
    const out = await say(
      r.persona,
      'Proposing a harmless, fun hot take for people to agree/disagree with.',
      'Reply ONLY as: CATEGORY | hot take statement (max 120 chars). Category is one word like FOOD, MUSIC, GAMING, LIFESTYLE.',
      [],
      60,
    );
    const [cat, stmt] = out?.split('|').map((s) => s.trim()) ?? fallback.take();
    if (cat && stmt && stmt.length >= 10) {
      await db.hotTakes.insertOne(
        newTake({
          _id: newId(),
          authorId: r.userId,
          category: cat.toUpperCase().slice(0, 16),
          statement: stmt.slice(0, 160),
          hours: rand(4, 12),
        }),
      );
    }
  }
}

// ——— Birthdays ———
const WISHES = [
  'happy birthday!! 🎂🎉',
  'hbd!! have the best day 🥳',
  'happy birthday 🧡 hope it’s a good one',
  'HAPPY BIRTHDAY 🎈🎈',
  'happy bday!! eat all the cake 🍰',
];
/** A few personas leave birthday wishes on the birthday post over the next hours. */
function onBirthday({ postId, userId }) {
  const wishers = [...roster]
    .filter((r) => r.userId !== userId)
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.floor(rand(2, 5)));
  wishers.forEach((r, i) =>
    later(rand(60_000, 3 * 3_600_000) * (i + 1) * config.ai.replyPace, async () => {
      const post = await db.posts.findOne({ _id: postId, hidden: false });
      const person = await db.users.findOne({ _id: userId }, { projection: { displayName: 1, handle: 1 } });
      if (!post || !person || (await db.comments.findOne({ postId, authorId: r.userId }))) return;
      const text =
        (await say(
          r.persona,
          `It's @${person.handle}'s birthday today on ChatLOL.`,
          `Write a short, warm birthday wish for ${person.displayName.split(' ')[0]} (max 80 chars).`,
          [],
          40,
        )) ?? pick(WISHES);
      await insertComment(postId, r.userId, text);
    }),
  );
}

// ——— Shoutbox ———
/** One awake persona shouts on the board (and reacts to a few recent shouts). Runs on its own loop so the board stays lively. */
async function actShoutbox(r) {
  const recent = await db.shouts
    .find({ hidden: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(12)
    .toArray();
  for (const s of recent.filter((x) => x.authorId !== r.userId).slice(0, 3)) {
    if (Math.random() < 0.5) await reactToShout(s._id, r.userId, pick(['fire', 'heart', 'lol', 'hundred'])).catch(() => {});
  }
  // Never two in a row from the same persona, and the same 45s cooldown people have.
  if (recent[0]?.authorId === r.userId || (await shared().get(`shout:cd:${r.userId}`))) return;
  const others = (await withHandles(recent.slice(0, 8))).reverse();
  const board = others.map((x) => `@${x.handle}: ${x.body}`).join('\n') || '(quiet right now)';
  const text =
    (await say(
      r.persona,
      `You're posting on ChatLOL's public Shoutbox, a live notice board everyone sees. Recent shouts:\n${board}`,
      'Write one short shout (under 120 characters) — something happening in your day, a question for everyone, or a reaction to the board. No hashtags unless natural. Don\'t repeat what others said.',
      [],
      60,
    )) ?? fallback.shout();
  // Skip a fallback line that's already on the board so it never looks copy-pasted.
  if (recent.some((x) => x.body === text)) return;
  if (!(await shared().setNx(`shout:cd:${r.userId}`, '1', 45_000))) return;
  await insertShout(r.userId, { body: text.slice(0, 140), mood: pick(['hyped', 'chill', 'listening', 'question', 'flex']) });
}

/** Replies (as a shout) when a person tags a persona or replies to a persona's shout; sometimes joins in on its own. */
async function onShout({ shoutId, authorId, mentions = [], replyToAuthorId }) {
  if (isAi(authorId)) return;
  const tagged = roster.find((r) => mentions.includes(r.userId)) ?? (replyToAuthorId ? byUserId(replyToAuthorId) : null);
  const r = tagged ?? (chance(0.35) ? pick(awake().length ? awake() : roster) : null);
  if (!r) return;
  later(rand(8_000, 40_000), async () => {
    const s = await db.shouts.findOne({ _id: shoutId, hidden: { $ne: true } });
    if (!s) return;
    await reactToShout(shoutId, r.userId, pick(['fire', 'heart', 'lol', 'hundred'])).catch(() => {});
    if (!tagged && Math.random() < 0.5) return;
    const human = await db.users.findOne({ _id: authorId }, { projection: { handle: 1 } });
    const text = await say(
      r.persona,
      `On ChatLOL's public Shoutbox, @${human.handle} shouted: "${s.body}"${tagged ? ' — and tagged you.' : ''}`,
      `Write a short public reply shout to @${human.handle} (under 120 characters). Start with @${human.handle}. React to what they actually said.`,
      [],
      60,
      config.nim.chatModel,
    );
    if (!text) return; // no canned replies to people
    const body = text.toLowerCase().startsWith(`@${human.handle.toLowerCase()}`) ? text : `@${human.handle} ${text}`;
    await shared().setNx(`shout:cd:${r.userId}`, '1', 45_000);
    await insertShout(r.userId, { body: body.slice(0, 140), replyToId: shoutId });
  });
}

async function actFollowBack(r) {
  const following = await db.follows.distinct('followeeId', { followerId: r.userId });
  const fans = await db.follows
    .find({ followeeId: r.userId, followerId: { $nin: [...following, ...roster.map((x) => x.userId)] } })
    .limit(3)
    .toArray();
  for (const f of fans) await db.follows.insertIfMissing({ followerId: r.userId, followeeId: f.followerId }, { createdAt: now() });
}

async function tick() {
  if (!(await isLeader())) return;
  const up = awake();
  if (!up.length) return;
  const r = pick(up);
  const roll = Math.random();
  if (roll < 0.3) await actRate(r);
  else if (roll < 0.45) await actComment(r);
  else if (roll < 0.62) await actLounge(r);
  else if (roll < 0.72) await actPost(r);
  else if (roll < 0.8) await actThread(r);
  else if (roll < 0.88) await actArena(r);
  else if (roll < 0.91) await actDrop(r);
  else await actFollowBack(r);
}

// ——— Reactions to humans ———

function onHumanPost({ postId, authorId }) {
  if (isAi(authorId)) return;
  // Instant feedback loop: a few ratings roll in within minutes, and usually a comment.
  const raters = [...roster].sort(() => Math.random() - 0.5).slice(0, Math.floor(rand(2, 5)));
  raters.forEach((r, i) =>
    later(rand(20_000, 90_000) * (i + 1), async () => {
      const post = await db.posts.findOne({ _id: postId });
      if (post) await applyRating(postId, r.userId, personaScore(r.persona, post)).catch(() => {});
    }),
  );
  if (chance(0.75)) {
    const r = pick(awake().length ? awake() : roster);
    later(rand(45_000, 240_000), async () => {
      const post = await db.posts.findOne({ _id: postId });
      if (post) await commentOn(r, post);
    });
  }
}

// ——— DMs: reply like a person texting ———
const dmTimers = new Map(); // conversationId → pending reply timer (debounces bursts of texts)
const dmBusy = new Set();
let warnedNoNim = false;

async function onDm({ conversationId, authorId }) {
  if (isAi(authorId)) return;
  const c = await db.conversations.findOne({ _id: conversationId }, { projection: { members: 1 } });
  const ai = (c?.members ?? [])
    .filter((m) => m.userId !== authorId)
    .map((m) => byUserId(m.userId))
    .find(Boolean);
  if (!ai) return;
  if (!nimEnabled()) {
    // Canned lines read as obviously fake in a 1:1 chat, so without a model personas simply don't answer.
    if (!warnedNoNim) console.warn('[ai] DM to a persona ignored: set NVIDIA_API_KEY so personas can reply.');
    warnedNoNim = true;
    return;
  }
  // People often send several texts in a row: wait until they pause, then answer all of them at once.
  clearTimeout(dmTimers.get(conversationId));
  const asleep = !awakeIds.has(ai.userId);
  const delay = (asleep ? rand(60_000, 4 * 60_000) : rand(4_000, 12_000)) * config.ai.replyPace;
  dmTimers.set(
    conversationId,
    later(delay, () => replyInDm(conversationId, ai, authorId)),
  );
}

async function replyInDm(conversationId, ai, humanId) {
  dmTimers.delete(conversationId);
  if (dmBusy.has(conversationId) || !(await shared().setNx(`ai:dm-busy:${conversationId}`, '1', 120_000))) return;
  dmBusy.add(conversationId);
  const startedAt = now();
  try {
    await markRead(conversationId, ai.userId);
    io()?.to(room.user(humanId)).emit('dm:read', { conversationId, userId: ai.userId, at: now() });
    const [human, conv, hist] = await Promise.all([
      db.users.findOne({ _id: humanId }, { projection: { displayName: 1, handle: 1, city: 1, interests: 1 } }),
      db.conversations.findOne({ _id: conversationId }, { projection: { aiNotes: 1 } }),
      recentMessages('dm', conversationId, 40),
    ]);
    if (!human) return;
    // Chronological, with consecutive texts from the same side merged into one turn.
    const turns = [];
    for (const m of hist.reverse()) {
      const role = m.authorId === ai.userId ? 'assistant' : 'user';
      const content = m.kind === 'image' ? '[sent a photo]' : m.body;
      const prev = turns[turns.length - 1];
      if (prev?.role === role) prev.content += `\n${content}`;
      else turns.push({ role, content });
    }
    if (turns[turns.length - 1]?.role !== 'user') return; // nothing new to answer
    const notes = conv?.aiNotes?.[ai.userId] ?? '';
    const raw = await nimChat([{ role: 'system', content: chatPrompt(ai.persona, human, notes) }, ...turns.slice(-24)], {
      model: config.nim.chatModel,
      maxTokens: 180,
      temperature: 0.85,
      retries: 2,
    });
    if (!raw || !localCheck(raw).ok || !(await deepCheck(raw))) return;
    const bubbles = raw
      .split(/\n+/)
      .map((b) => b.trim())
      .filter(Boolean)
      .slice(0, 3);
    for (const [i, text] of bubbles.entries()) {
      const typingMs = Math.min(8_000, 900 + text.length * 55 + (i ? rand(300, 1_200) : 0)) * config.ai.replyPace;
      simulateTyping(conversationId, ai.userId, [humanId], typingMs);
      await sleep(typingMs);
      await insertDm(conversationId, ai.userId, text);
    }
    void rememberAbout(conversationId, ai, human, notes, turns);
  } finally {
    dmBusy.delete(conversationId);
    await shared().del(`ai:dm-busy:${conversationId}`);
  }
  // They kept texting while we were typing: answer those too.
  const newer = await db.messages.findOne({ roomType: 'dm', roomId: conversationId, authorId: humanId, createdAt: { $gt: startedAt } });
  if (newer && !dmTimers.has(conversationId))
    dmTimers.set(
      conversationId,
      later(rand(2_000, 5_000) * config.ai.replyPace, () => replyInDm(conversationId, ai, humanId)),
    );
}

/** Every few exchanges, the persona updates short private notes about the person so later chats feel continuous. */
async function rememberAbout(conversationId, ai, human, notes, turns) {
  const userTurns = turns.filter((t) => t.role === 'user').length;
  if (userTurns % 4 !== 0) return;
  const transcript = turns
    .slice(-16)
    .map((t) => `${t.role === 'user' ? human.displayName : ai.persona.displayName}: ${t.content}`)
    .join('\n');
  const updated = await nimChat(
    [
      {
        role: 'system',
        content:
          'You keep short private memory notes for a chat. Merge the old notes with anything new from the transcript about the other person: name they go by, plans, likes, events in their life, running jokes, topics you discussed. Max 60 words, plain text, no preamble.',
      },
      {
        role: 'user',
        content: `Old notes: ${notes || '(none)'}\n\nTranscript:\n${transcript}\n\nUpdated notes about ${human.displayName}:`,
      },
    ],
    { model: config.nim.chatModel, maxTokens: 120, temperature: 0.3 },
  );
  if (updated) await db.conversations.updateOne({ _id: conversationId }, { $set: { [`aiNotes.${ai.userId}`]: updated.slice(0, 600) } });
}

async function onLoungeMessage({ loungeId, messageId, authorId }) {
  if (isAi(authorId)) return;
  const m = await db.messages.findOne({ _id: messageId }, { projection: { body: 1 } });
  if (!m) return;
  const mentioned = roster.find((r) => new RegExp(`@${r.persona.handle.replace('.', '\\.')}\\b`, 'i').test(m.body));
  const human = await db.users.findOne({ _id: authorId }, { projection: { handle: 1 } });
  if (mentioned) return void later(rand(2_000, 7_000), () => loungeLine(mentioned, loungeId, human.handle));
  if (chance(0.55)) {
    const pool = awake().filter((r) => r.persona.preferredLounges.includes(loungeId));
    const r = pick(pool.length ? pool : awake().length ? awake() : roster);
    later(rand(3_000, 15_000), () => loungeLine(r, loungeId, human.handle));
  }
}

function onThread({ threadId, authorId }) {
  if (isAi(authorId)) return;
  const n = Math.floor(rand(1, 3.5));
  for (let i = 0; i < n; i++) {
    const r = pick(roster);
    later(rand(60_000, 400_000) * (i + 1), async () => {
      const t = await db.threads.findOne({ _id: threadId });
      if (t && !(await db.replies.findOne({ threadId, authorId: r.userId }))) await replyToThread(r, t);
    });
  }
}

function onStreamStarted({ streamId, hostId }) {
  if (isAi(hostId)) return;
  const viewers = [...roster].sort(() => Math.random() - 0.5).slice(0, 3);
  viewers.forEach((r, i) =>
    later(rand(10_000, 40_000) * (i + 1), async () => {
      const s = await db.streams.findOne({ _id: streamId, endedAt: null });
      if (!s) return;
      const text =
        (await say(
          r.persona,
          `Watching a live stream titled "${s.title}" (${s.category}).`,
          'Say a short hype chat message to the streamer (max 80 chars).',
          [],
          40,
        )) ?? 'yooo just joined 🔥';
      io()
        ?.to(room.stream(streamId))
        .emit('stream:chat', await insertStreamMessage(streamId, r.userId, text));
    }),
  );
}

const guard = (fn) => (p) => {
  void isLeader()
    .then((ok) => ok && fn(p))
    .catch((e) => console.warn('[ai]', e.message));
};

export async function startPersonaEngine(leader = async () => true) {
  isLeader = leader;
  await loadRoster();
  if (!roster.length) return;
  await refreshAwake();
  // Re-read the roster too, so personas switched off in the admin panel stop acting.
  setInterval(
    () =>
      void loadRoster()
        .then(refreshAwake)
        .catch(() => {}),
    5 * 60_000,
  ).unref();
  const loop = () => {
    tick()
      .catch((e) => console.warn('[ai] tick', e.message))
      .finally(() => setTimeout(loop, rand(12_000, 30_000) / Math.max(0.2, config.ai.activity)));
  };
  setTimeout(loop, 5_000);
  // The shoutbox gets its own, steadier rhythm: a persona shouts every ~1–3 minutes (scaled by AI_ACTIVITY).
  const shoutLoop = () => {
    (async () => {
      if (!(await isLeader())) return;
      const up = awake();
      if (up.length) await actShoutbox(pick(up));
    })()
      .catch((e) => console.warn('[ai] shout', e.message))
      .finally(() => setTimeout(shoutLoop, rand(60_000, 180_000) / Math.max(0.2, config.ai.activity)).unref?.());
  };
  setTimeout(shoutLoop, rand(10_000, 30_000)).unref?.();
  await bus.listenCluster();
  bus.onEvent('post:created', guard(onHumanPost));
  bus.onEvent('dm:sent', guard(onDm));
  bus.onEvent('lounge:sent', guard(onLoungeMessage));
  bus.onEvent('thread:created', guard(onThread));
  bus.onEvent('stream:started', guard(onStreamStarted));
  bus.onEvent('shout:created', guard(onShout));
  bus.onEvent('birthday:posted', guard(onBirthday));
  console.log(`   ${roster.length} AI personas loaded (${awake().length} awake)`);
}
