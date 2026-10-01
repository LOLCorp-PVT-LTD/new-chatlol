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
import { ensureDrop } from '../lib/drops.js';
import { personaById, systemPrompt } from './personas.js';
import { nimChat, nimImage, nimVision } from './nim.js';
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

async function say(p, context, prompt, history = [], maxTokens = 90) {
  const text = await nimChat([{ role: 'system', content: systemPrompt(p, context) }, ...history, { role: 'user', content: prompt }], {
    model: p.model,
    maxTokens,
  });
  if (!text) return null;
  if (!localCheck(text).ok || !(await deepCheck(text))) return null;
  return text;
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
  const text = (await say(r.persona, ctx, prompt, msgs.slice(-10), 70)) ?? fallback.lounge();
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

async function actShout(r) {
  if (Math.random() < 0.25) {
    const board = pick(r.persona.boards);
    if (!(await db.boards.findOne({ _id: board }))) return;
    const out = await say(
      r.persona,
      `Starting a discussion thread in the ${board} board.`,
      'Write a discussion thread. Reply ONLY as: Title | Body (body max 200 chars)',
      [],
      110,
    );
    const [title, body] = out?.split('|').map((s) => s.trim()) ?? fallback.thread();
    if (title && body && title.length >= 4) await insertThread(r.userId, board, title.slice(0, 120), body.slice(0, 1000));
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
          _id: newId('ht'),
          authorId: r.userId,
          category: cat.toUpperCase().slice(0, 16),
          statement: stmt.slice(0, 160),
          hours: rand(4, 12),
        }),
      );
    }
  }
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
  else if (roll < 0.8) await actShout(r);
  else if (roll < 0.88) await actArena(r);
  else if (roll < 0.94) await actDrop(r);
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

async function onDm({ conversationId, authorId }) {
  if (isAi(authorId)) return;
  const c = await db.conversations.findOne({ _id: conversationId }, { projection: { members: 1 } });
  const aiMember = (c?.members ?? [])
    .filter((m) => m.userId !== authorId)
    .map((m) => byUserId(m.userId))
    .find(Boolean);
  if (!aiMember) return;
  // One reply at a time per conversation, cluster-wide.
  if (!(await shared().setNx(`ai:dm-busy:${conversationId}`, '1', 30_000))) return;
  later(rand(1_500, 6_000), async () => {
    try {
      await markRead(conversationId, aiMember.userId);
      io()?.to(room.user(authorId)).emit('dm:read', { conversationId, userId: aiMember.userId, at: now() });
      const human = await db.users.findOne({ _id: authorId }, { projection: { displayName: 1, handle: 1, city: 1, interests: 1 } });
      const hist = (await recentMessages('dm', conversationId, 16)).reverse();
      const msgs = hist.map((m) => ({
        role: m.authorId === aiMember.userId ? 'assistant' : 'user',
        content: m.kind === 'image' ? '[sent a photo]' : m.body,
      }));
      const ctx = `Private DM with ${human.displayName} (@${human.handle}${human.city ? `, ${human.city}` : ''}; interests: ${(human.interests ?? []).join(', ') || 'unknown'}). Keep the conversation going like a friendly mutual — ask a question back sometimes.`;
      const last = msgs.pop();
      const reply = (await say(aiMember.persona, ctx, last?.content ?? 'hey', msgs, 110)) ?? fallback.dm();
      const typingMs = Math.min(9_000, 1_200 + reply.length * 45);
      simulateTyping(conversationId, aiMember.userId, [authorId], typingMs);
      await sleep(typingMs);
      await insertDm(conversationId, aiMember.userId, reply);
    } finally {
      await shared().del(`ai:dm-busy:${conversationId}`);
    }
  });
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
  setInterval(() => void refreshAwake().catch(() => {}), 5 * 60_000).unref();
  const loop = () => {
    tick()
      .catch((e) => console.warn('[ai] tick', e.message))
      .finally(() => setTimeout(loop, rand(12_000, 30_000) / Math.max(0.2, config.ai.activity)));
  };
  setTimeout(loop, 5_000);
  await bus.listenCluster();
  bus.onEvent('post:created', guard(onHumanPost));
  bus.onEvent('dm:sent', guard(onDm));
  bus.onEvent('lounge:sent', guard(onLoungeMessage));
  bus.onEvent('thread:created', guard(onThread));
  bus.onEvent('stream:started', guard(onStreamStarted));
  console.log(`   ${roster.length} AI personas loaded (${awake().length} awake)`);
}
