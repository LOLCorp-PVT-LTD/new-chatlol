import type { VibeScore } from '@chatlol/shared';
import { ARENA_MIN_STAKE } from '@chatlol/shared';
import { db, newId, now, today, type Row } from '../db';
import { config } from '../config';
import { bus } from '../lib/events';
import { presence } from '../lib/presence';
import { io, room } from '../lib/io';
import { localCheck, deepCheck } from '../lib/moderation';
import { grant } from '../lib/rewards';
import { serializeMessage } from '../lib/serialize';
import { shared } from '../lib/shared';
import { applyRating, insertComment, insertPost } from '../routes/posts';
import { insertDm, insertLoungeMessage, insertReply, insertThread, loungeKey } from '../routes/social';
import { placeStake } from '../routes/arena';
import { ensureDrop } from '../lib/drops';
import { personaById, systemPrompt, type Persona } from './personas';
import { nimChat, nimImage, nimVision, type ChatMsg } from './nim';
import { fallback } from './fallback';

/**
 * The persona engine: a light scheduler that makes AI personas behave like regulars —
 * posting photos, doing the daily drop, rating, commenting, hanging out in lounges and replying to DMs.
 * All content passes the same SafeShield moderation as human content. Runs on one elected worker instance.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const chance = (p: number) => Math.random() < p * config.ai.activity;
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const later = (ms: number, fn: () => unknown) => setTimeout(() => { Promise.resolve(fn()).catch((e) => console.warn('[ai]', (e as Error).message)); }, ms);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PersonaUser { persona: Persona; userId: string }
let roster: PersonaUser[] = [];
let awakeIds = new Set<string>();
let isLeader: () => Promise<boolean> = async () => true;

async function loadRoster() {
  roster = (await db.all<Row>('SELECT id, persona_id FROM users WHERE is_ai = 1 AND deleted_at IS NULL'))
    .map((r) => ({ persona: personaById(r.persona_id)!, userId: r.id as string }))
    .filter((r) => r.persona);
}

const byUserId = (id: string) => roster.find((r) => r.userId === id);
const isAi = (id: string) => !!byUserId(id);

function localHour(tz: string) {
  return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date())) % 24;
}

/** Awake 8:00–01:00 local with a little jitter; always a few personas online so nobody's ever alone. */
async function refreshAwake() {
  const next = new Set<string>();
  for (const r of roster) {
    const h = localHour(r.persona.timezone);
    if ((h >= 8 || h < 1) && Math.random() < 0.85) next.add(r.userId);
  }
  if (!next.size) roster.slice(0, 3).forEach((r) => next.add(r.userId));
  for (const r of roster) await presence.setAiAwake(r.userId, next.has(r.userId));
  awakeIds = next;
}

const awake = () => roster.filter((r) => awakeIds.has(r.userId));

async function say(p: Persona, context: string, prompt: string, history: ChatMsg[] = [], maxTokens = 90): Promise<string | null> {
  const text = await nimChat([{ role: 'system', content: systemPrompt(p, context) }, ...history, { role: 'user', content: prompt }], { model: p.model, maxTokens });
  if (!text) return null;
  if (!localCheck(text).ok || !(await deepCheck(text))) return null;
  return text;
}

function simulateTyping(convId: string, aiUserId: string, humanIds: string[], ms: number) {
  for (const h of humanIds) io()?.to(room.user(h)).emit('dm:typing', { conversationId: convId, userId: aiUserId, typing: true });
  setTimeout(() => { for (const h of humanIds) io()?.to(room.user(h)).emit('dm:typing', { conversationId: convId, userId: aiUserId, typing: false }); }, ms);
}

/** Persona-biased rating: centred on their generosity, nudged toward the existing consensus so tiers feel "real". */
function personaScore(p: Persona, post: Row): VibeScore {
  const n = post.r1 + post.r2 + post.r3 + post.r4 + post.r5;
  const avg = n ? (post.r1 + 2 * post.r2 + 3 * post.r3 + 4 * post.r4 + 5 * post.r5) / n : p.generosity;
  const mean = n >= 3 ? avg * 0.6 + p.generosity * 0.4 : p.generosity;
  const s = Math.round(mean + (Math.random() - 0.5) * 1.6);
  return Math.min(5, Math.max(1, s)) as VibeScore;
}

// ——— Ambient actions ———

async function actPost(r: PersonaUser) {
  const posted = (await db.one<Row>('SELECT COUNT(*) AS n FROM posts WHERE author_id = ? AND created_at > ?', r.userId, new Date(Date.now() - 6 * 3_600_000).toISOString()))!.n;
  if (posted >= 2) return;
  const p = r.persona;
  const kind = Math.random();
  if (kind < 0.15) {
    const q = await say(p, 'You are posting a "this or that" battle poll.', 'Write a fun two-option battle poll related to your interests. Reply ONLY as: Question | Option A | Option B', [], 80);
    const parts = q?.split('|').map((s) => s.trim()).filter(Boolean);
    if (parts && parts.length >= 3) {
      await insertPost(r.userId, { kind: 'battle', body: parts[0].slice(0, 200), battle: [{ label: parts[1].slice(0, 60) }, { label: parts[2].slice(0, 60) }] });
      return;
    }
  }
  if (kind < 0.35) {
    const text = (await say(p, 'You are writing a short text post for your followers.', 'Write a short, casual text post about something from your day. Add one relevant hashtag.', [], 90)) ?? fallback.caption();
    await insertPost(r.userId, { kind: 'text', body: text });
    return;
  }
  const idea = pick(p.photoIdeas);
  const media = await nimImage(idea);
  if (!media) {
    // Without image generation, personas post text instead of mismatched stock photos.
    const text = (await say(p, 'You are writing a short text post.', `Write a short casual post about: ${idea}. Add one hashtag.`, [], 90)) ?? fallback.caption();
    await insertPost(r.userId, { kind: 'text', body: text });
    return;
  }
  const caption = (await say(p, `You just took a photo of: ${idea}.`, 'Write a short caption for this photo post (max 120 chars). One hashtag max.', [], 60)) ?? fallback.caption();
  await insertPost(r.userId, { kind: 'photo', body: caption, mediaUrl: media });
}

async function actDrop(r: PersonaUser) {
  const d = await ensureDrop();
  if (await db.one('SELECT 1 AS x FROM posts WHERE drop_id = ? AND author_id = ?', d.id, r.userId)) return;
  const media = await nimImage(`${d.prompt}, ${pick(r.persona.photoIdeas)}`);
  if (!media) return;
  const caption = (await say(r.persona, `Today's Sunset Drop prompt is "${d.prompt}".`, 'Write a short caption for your drop photo (max 100 chars).', [], 50)) ?? fallback.caption();
  await insertPost(r.userId, { kind: 'photo', body: caption, mediaUrl: media, dropId: d.id, kindOverride: 'drop' });
  const u = (await db.one<Row>('SELECT streak_days, last_drop_day FROM users WHERE id = ?', r.userId))!;
  const y = today(new Date(Date.now() - 86_400_000));
  await db.run('UPDATE users SET streak_days = ?, last_drop_day = ? WHERE id = ?', u.last_drop_day === y ? u.streak_days + 1 : 1, today(), r.userId);
}

async function actRate(r: PersonaUser, count = 3) {
  const posts = await db.all<Row>(
    `SELECT p.* FROM posts p WHERE p.hidden = 0 AND p.author_id != ? AND p.created_at > ?
       AND NOT EXISTS (SELECT 1 FROM ratings x WHERE x.post_id = p.id AND x.user_id = ?)
     ORDER BY RANDOM() LIMIT ?`, r.userId, new Date(Date.now() - 3 * 86_400_000).toISOString(), r.userId, count);
  for (const post of posts) {
    try { await applyRating(post.id, r.userId, personaScore(r.persona, post)); } catch { /* post vanished */ }
  }
  await grant(r.userId, 0, posts.length * 5, 'rate', false);
}

async function commentOn(r: PersonaUser, post: Row) {
  const author = await db.one<Row>('SELECT display_name, handle FROM users WHERE id = ?', post.author_id);
  if (!author) return;
  const recent = await db.all<Row>('SELECT c.body, u.handle FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.created_at DESC LIMIT 4', post.id);
  const ctx = `Commenting on @${author.handle}'s post: "${post.body || '(photo, no caption)'}". Other comments: ${recent.map((c) => `@${c.handle}: ${c.body}`).join(' / ') || 'none yet'}.`;
  let text: string | null = null;
  if (post.media_url) {
    text = await nimVision('Leave a short, specific, friendly comment on this photo post (max 140 chars).', post.media_url, systemPrompt(r.persona, ctx));
    if (text && (!localCheck(text).ok || !(await deepCheck(text)))) text = null;
  }
  text ??= await say(r.persona, ctx, 'Write one short comment on this post (max 140 chars). Be specific and genuine.', [], 60);
  text ??= fallback.comment(r.persona);
  await insertComment(post.id, r.userId, text);
}

async function actComment(r: PersonaUser) {
  const post = await db.one<Row>(
    `SELECT p.* FROM posts p JOIN users u ON u.id = p.author_id WHERE p.hidden = 0 AND p.author_id != ? AND p.created_at > ?
       AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id AND c.author_id = ?)
     ORDER BY u.is_ai ASC, RANDOM() LIMIT 1`,
    r.userId, new Date(Date.now() - 86_400_000).toISOString(), r.userId);
  if (post) await commentOn(r, post);
}

async function loungeLine(r: PersonaUser, loungeId: string, mention?: string) {
  const l = await db.one<Row>('SELECT * FROM lounges WHERE id = ?', loungeId);
  if (!l) return;
  const history = (await db.all<Row>(
    `SELECT m.body, m.author_id, u.handle FROM messages m JOIN users u ON u.id = m.author_id WHERE m.room_type = 'lounge' AND m.room_id = ? ORDER BY m.created_at DESC LIMIT 12`, loungeId)).reverse();
  const msgs: ChatMsg[] = history.map((h) => (h.author_id === r.userId ? { role: 'assistant', content: h.body } : { role: 'user', content: `@${h.handle}: ${h.body}` }));
  const ctx = `You're hanging out in the "${l.name}" lounge (topic: ${l.topic}; now playing: ${l.now_playing}). It's a casual group chat.`;
  const prompt = mention ? `Reply to @${mention} naturally.` : history.length ? 'Say the next message in the chat — react to what people said or start a light new topic.' : 'Say something to kick off the chat.';
  const text = (await say(r.persona, ctx, prompt, msgs.slice(-10), 70)) ?? fallback.lounge();
  await insertLoungeMessage(loungeId, r.userId, text);
}

async function loungesWithHumans() {
  const out: string[] = [];
  for (const l of await db.all<Row>('SELECT id FROM lounges')) {
    const ids = await shared().smembers(loungeKey(l.id));
    if (ids.some((id) => !isAi(id))) out.push(l.id);
  }
  return out;
}

async function actLounge(r: PersonaUser) {
  const withHumans = await loungesWithHumans();
  const target = withHumans.length && Math.random() < 0.7 ? pick(withHumans) : pick(r.persona.preferredLounges);
  const last = await db.one<Row>(`SELECT author_id, created_at FROM messages WHERE room_type = 'lounge' AND room_id = ? ORDER BY created_at DESC LIMIT 1`, target);
  if (last?.author_id === r.userId) return;
  // Quiet lounges without humans only get occasional ambient chatter.
  if (!withHumans.includes(target) && last && Date.now() - Date.parse(last.created_at) < 8 * 60_000) return;
  await loungeLine(r, target);
}

async function actShout(r: PersonaUser) {
  if (Math.random() < 0.25) {
    const board = pick(r.persona.boards);
    if (!(await db.one('SELECT 1 AS x FROM boards WHERE id = ?', board))) return;
    const out = await say(r.persona, `Starting a discussion thread in the ${board} board.`, 'Write a discussion thread. Reply ONLY as: Title | Body (body max 200 chars)', [], 110);
    const [title, body] = out?.split('|').map((s) => s.trim()) ?? fallback.thread();
    if (title && body && title.length >= 4) await insertThread(r.userId, board, title.slice(0, 120), body.slice(0, 1000));
    return;
  }
  const t = await db.one<Row>(
    `SELECT * FROM threads WHERE author_id != ? AND last_activity_at > ? AND NOT EXISTS (SELECT 1 FROM replies x WHERE x.thread_id = threads.id AND x.author_id = ?)
     ORDER BY RANDOM() LIMIT 1`, r.userId, new Date(Date.now() - 3 * 86_400_000).toISOString(), r.userId);
  if (t) await replyToThread(r, t);
}

async function replyToThread(r: PersonaUser, t: Row) {
  const replies = (await db.all<Row>('SELECT x.body, u.handle FROM replies x JOIN users u ON u.id = x.author_id WHERE thread_id = ? ORDER BY x.created_at DESC LIMIT 5', t.id)).reverse();
  const ctx = `Forum thread "${t.title}": ${t.body}. Replies so far: ${replies.map((x) => `@${x.handle}: ${x.body}`).join(' / ') || 'none'}.`;
  const text = (await say(r.persona, ctx, 'Write your reply to this thread (max 200 chars).', [], 90)) ?? fallback.reply();
  await insertReply(t.id, r.userId, text);
}

async function actArena(r: PersonaUser) {
  await db.run('UPDATE users SET sparks = CASE WHEN sparks < 300 THEN 300 ELSE sparks END WHERE id = ?', r.userId);
  const open = await db.all<Row>('SELECT * FROM hot_takes WHERE resolved = 0 AND ends_at > ? AND NOT EXISTS (SELECT 1 FROM stakes s WHERE s.take_id = hot_takes.id AND s.user_id = ?)', now(), r.userId);
  if (open.length) {
    const t = pick(open);
    try { await placeStake(r.userId, t.id, Math.random() < 0.55 ? 'agree' : 'disagree', Math.round(rand(ARENA_MIN_STAKE, 40))); } catch { /* raced */ }
  }
  if (open.length < 6 && Math.random() < 0.3) {
    const out = await say(r.persona, 'Proposing a harmless, fun hot take for people to agree/disagree with.', 'Reply ONLY as: CATEGORY | hot take statement (max 120 chars). Category is one word like FOOD, MUSIC, GAMING, LIFESTYLE.', [], 60);
    const [cat, stmt] = out?.split('|').map((s) => s.trim()) ?? fallback.take();
    if (cat && stmt && stmt.length >= 10) {
      await db.run('INSERT INTO hot_takes (id, author_id, category, statement, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        newId('ht'), r.userId, cat.toUpperCase().slice(0, 16), stmt.slice(0, 160), new Date(Date.now() + rand(4, 12) * 3_600_000).toISOString(), now());
    }
  }
}

async function actFollowBack(r: PersonaUser) {
  const fans = await db.all<Row>(
    `SELECT f.follower_id FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ? AND u.is_ai = 0
       AND NOT EXISTS (SELECT 1 FROM follows b WHERE b.follower_id = ? AND b.followee_id = f.follower_id) LIMIT 3`, r.userId, r.userId);
  for (const f of fans) await db.run('INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', r.userId, f.follower_id, now());
}

async function tick() {
  if (!(await isLeader())) return;
  const up = awake();
  if (!up.length) return;
  const r = pick(up);
  const roll = Math.random();
  if (roll < 0.30) await actRate(r);
  else if (roll < 0.45) await actComment(r);
  else if (roll < 0.62) await actLounge(r);
  else if (roll < 0.72) await actPost(r);
  else if (roll < 0.80) await actShout(r);
  else if (roll < 0.88) await actArena(r);
  else if (roll < 0.94) await actDrop(r);
  else await actFollowBack(r);
}

// ——— Reactions to humans ———

function onHumanPost({ postId, authorId }: { postId: string; authorId: string }) {
  if (isAi(authorId)) return;
  // Instant feedback loop: a few ratings roll in within minutes, and usually a comment.
  const raters = [...roster].sort(() => Math.random() - 0.5).slice(0, Math.floor(rand(2, 5)));
  raters.forEach((r, i) => later(rand(20_000, 90_000) * (i + 1), async () => {
    const post = await db.one<Row>('SELECT * FROM posts WHERE id = ?', postId);
    if (post) await applyRating(postId, r.userId, personaScore(r.persona, post)).catch(() => {});
  }));
  if (chance(0.75)) {
    const r = pick(awake().length ? awake() : roster);
    later(rand(45_000, 240_000), async () => {
      const post = await db.one<Row>('SELECT * FROM posts WHERE id = ?', postId);
      if (post) await commentOn(r, post);
    });
  }
}

async function onDm({ conversationId, authorId }: { conversationId: string; authorId: string }) {
  if (isAi(authorId)) return;
  const members = await db.all<Row>('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?', conversationId, authorId);
  const aiMember = members.map((m) => byUserId(m.user_id)).find(Boolean);
  if (!aiMember) return;
  // One reply at a time per conversation, cluster-wide.
  if (!(await shared().setNx(`ai:dm-busy:${conversationId}`, '1', 30_000))) return;
  later(rand(1_500, 6_000), async () => {
    try {
      await db.run('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', now(), conversationId, aiMember.userId);
      io()?.to(room.user(authorId)).emit('dm:read', { conversationId, userId: aiMember.userId, at: now() });
      const human = (await db.one<Row>('SELECT display_name, handle, city, interests FROM users WHERE id = ?', authorId))!;
      const hist = (await db.all<Row>(`SELECT author_id, body, kind FROM messages WHERE room_type = 'dm' AND room_id = ? ORDER BY created_at DESC LIMIT 16`, conversationId)).reverse();
      const msgs: ChatMsg[] = hist.map((m) => ({ role: m.author_id === aiMember.userId ? 'assistant' : 'user', content: m.kind === 'image' ? '[sent a photo]' : m.body }));
      const ctx = `Private DM with ${human.display_name} (@${human.handle}${human.city ? `, ${human.city}` : ''}; interests: ${JSON.parse(human.interests).join(', ') || 'unknown'}). Keep the conversation going like a friendly mutual — ask a question back sometimes.`;
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

async function onLoungeMessage({ loungeId, messageId, authorId }: { loungeId: string; messageId: string; authorId: string }) {
  if (isAi(authorId)) return;
  const m = await db.one<Row>('SELECT body FROM messages WHERE id = ?', messageId);
  if (!m) return;
  const mentioned = roster.find((r) => new RegExp(`@${r.persona.handle.replace('.', '\\.')}\\b`, 'i').test(m.body));
  const human = (await db.one<Row>('SELECT handle FROM users WHERE id = ?', authorId))!;
  if (mentioned) return void later(rand(2_000, 7_000), () => loungeLine(mentioned, loungeId, human.handle));
  if (chance(0.55)) {
    const pool = awake().filter((r) => r.persona.preferredLounges.includes(loungeId));
    const r = pick(pool.length ? pool : awake().length ? awake() : roster);
    later(rand(3_000, 15_000), () => loungeLine(r, loungeId, human.handle));
  }
}

function onThread({ threadId, authorId }: { threadId: string; authorId: string }) {
  if (isAi(authorId)) return;
  const n = Math.floor(rand(1, 3.5));
  for (let i = 0; i < n; i++) {
    const r = pick(roster);
    later(rand(60_000, 400_000) * (i + 1), async () => {
      const t = await db.one<Row>('SELECT * FROM threads WHERE id = ?', threadId);
      if (t && !(await db.one('SELECT 1 AS x FROM replies WHERE thread_id = ? AND author_id = ?', threadId, r.userId))) await replyToThread(r, t);
    });
  }
}

function onStreamStarted({ streamId, hostId }: { streamId: string; hostId: string }) {
  if (isAi(hostId)) return;
  const viewers = [...roster].sort(() => Math.random() - 0.5).slice(0, 3);
  viewers.forEach((r, i) => later(rand(10_000, 40_000) * (i + 1), async () => {
    const s = await db.one<Row>('SELECT * FROM streams WHERE id = ? AND ended_at IS NULL', streamId);
    if (!s) return;
    const text = (await say(r.persona, `Watching a live stream titled "${s.title}" (${s.category}).`, 'Say a short hype chat message to the streamer (max 80 chars).', [], 40)) ?? 'yooo just joined 🔥';
    const id = newId('m');
    await db.run(`INSERT INTO messages (id, room_type, room_id, author_id, body, created_at) VALUES (?, 'stream', ?, ?, ?, ?)`, id, streamId, r.userId, text, now());
    io()?.to(room.stream(streamId)).emit('stream:chat', await serializeMessage((await db.one<Row>('SELECT * FROM messages WHERE id = ?', id))!));
  }));
}

const guard = <T>(fn: (p: T) => unknown) => (p: T) => {
  void isLeader().then((ok) => ok && fn(p)).catch((e) => console.warn('[ai]', (e as Error).message));
};

export async function startPersonaEngine(leader: () => Promise<boolean> = async () => true) {
  isLeader = leader;
  await loadRoster();
  if (!roster.length) return;
  await refreshAwake();
  setInterval(() => void refreshAwake().catch(() => {}), 5 * 60_000).unref();
  const loop = () => {
    tick().catch((e) => console.warn('[ai] tick', (e as Error).message)).finally(() => setTimeout(loop, rand(12_000, 30_000) / Math.max(0.2, config.ai.activity)));
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
