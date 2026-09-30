import type { VibeScore } from '@chatlol/shared';
import { ARENA_MIN_STAKE } from '@chatlol/shared';
import { db, newId, now, today, type Row } from '../db';
import { serializeMessage } from '../lib/serialize';
import { config } from '../config';
import { bus } from '../lib/events';
import { presence } from '../lib/presence';
import { io, room } from '../lib/io';
import { localCheck, deepCheck } from '../lib/moderation';
import { grant } from '../lib/rewards';
import { applyRating, insertComment, insertPost } from '../routes/posts';
import { insertDm, insertLoungeMessage, insertReply, insertThread, loungeOnline } from '../routes/social';
import { placeStake } from '../routes/arena';
import { ensureDrop } from '../lib/drops';
import { PERSONAS, personaById, systemPrompt, type Persona } from './personas';
import { nimChat, nimImage, nimVision, type ChatMsg } from './nim';
import { fallback } from './fallback';

/**
 * The persona engine: a light scheduler that makes AI personas behave like regulars —
 * posting photos, doing the daily drop, rating, commenting, hanging out in lounges and replying to DMs.
 * All content passes the same SafeShield moderation as human content.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const chance = (p: number) => Math.random() < p * config.ai.activity;
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const later = (ms: number, fn: () => unknown) => setTimeout(() => { Promise.resolve(fn()).catch((e) => console.warn('[ai]', e.message)); }, ms);

interface PersonaUser { persona: Persona; userId: string }
let roster: PersonaUser[] = [];

function loadRoster() {
  roster = db.all<Row>('SELECT id, persona_id FROM users WHERE is_ai = 1 AND deleted_at IS NULL')
    .map((r) => ({ persona: personaById(r.persona_id)!, userId: r.id as string }))
    .filter((r) => r.persona);
}

const byUserId = (id: string) => roster.find((r) => r.userId === id);
const isAi = (id: string) => !!byUserId(id);

function localHour(tz: string) {
  return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date())) % 24;
}

/** Awake 8:00–01:00 local with a little jitter; always a few personas online so nobody's ever alone. */
function refreshAwake() {
  for (const r of roster) {
    const h = localHour(r.persona.timezone);
    const awake = (h >= 8 || h < 1) && Math.random() < 0.85;
    presence.setAiAwake(r.userId, awake);
  }
  if (!roster.some((r) => presence.isOnline(r.userId))) {
    for (const r of roster.slice(0, 3)) presence.setAiAwake(r.userId, true);
  }
}

const awake = () => roster.filter((r) => presence.isOnline(r.userId));

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
  const posted = db.one<Row>('SELECT COUNT(*) n FROM posts WHERE author_id = ? AND created_at > ?', r.userId, new Date(Date.now() - 6 * 3_600_000).toISOString())!.n;
  if (posted >= 2) return;
  const p = r.persona;
  const kind = Math.random();
  if (kind < 0.15) {
    const q = await say(p, 'You are posting a "this or that" battle poll.', 'Write a fun two-option battle poll related to your interests. Reply ONLY as: Question | Option A | Option B', [], 80);
    const parts = q?.split('|').map((s) => s.trim()).filter(Boolean);
    if (parts && parts.length >= 3) {
      insertPost(r.userId, { kind: 'battle', body: parts[0].slice(0, 200), battle: [{ label: parts[1].slice(0, 60) }, { label: parts[2].slice(0, 60) }] });
      return;
    }
  }
  if (kind < 0.35) {
    const text = (await say(p, 'You are writing a short text post for your followers.', 'Write a short, casual text post about something from your day. Add one relevant hashtag.', [], 90)) ?? fallback.caption();
    insertPost(r.userId, { kind: 'text', body: text });
    return;
  }
  const idea = pick(p.photoIdeas);
  const media = await nimImage(idea);
  if (!media) {
    // Without image generation, personas post text instead of mismatched stock photos.
    const text = (await say(p, 'You are writing a short text post.', `Write a short casual post about: ${idea}. Add one hashtag.`, [], 90)) ?? fallback.caption();
    insertPost(r.userId, { kind: 'text', body: text });
    return;
  }
  const caption = (await say(p, `You just took a photo of: ${idea}.`, 'Write a short caption for this photo post (max 120 chars). One hashtag max.', [], 60)) ?? fallback.caption();
  insertPost(r.userId, { kind: 'photo', body: caption, mediaUrl: media });
}

async function actDrop(r: PersonaUser) {
  const d = ensureDrop();
  if (db.one('SELECT 1 FROM posts WHERE drop_id = ? AND author_id = ?', d.id, r.userId)) return;
  const media = await nimImage(`${d.prompt}, ${pick(r.persona.photoIdeas)}`);
  if (!media) return;
  const caption = (await say(r.persona, `Today's Sunset Drop prompt is "${d.prompt}".`, 'Write a short caption for your drop photo (max 100 chars).', [], 50)) ?? fallback.caption();
  insertPost(r.userId, { kind: 'photo', body: caption, mediaUrl: media, dropId: d.id, kindOverride: 'drop' });
  const u = db.one<Row>('SELECT streak_days, last_drop_day FROM users WHERE id = ?', r.userId)!;
  const y = today(new Date(Date.now() - 86_400_000));
  db.run('UPDATE users SET streak_days = ?, last_drop_day = ? WHERE id = ?', u.last_drop_day === y ? u.streak_days + 1 : 1, today(), r.userId);
}

function actRate(r: PersonaUser, count = 3) {
  const posts = db.all<Row>(
    `SELECT p.* FROM posts p WHERE p.hidden = 0 AND p.author_id != ? AND p.created_at > ?
       AND NOT EXISTS (SELECT 1 FROM ratings x WHERE x.post_id = p.id AND x.user_id = ?)
     ORDER BY RANDOM() LIMIT ?`, r.userId, new Date(Date.now() - 3 * 86_400_000).toISOString(), r.userId, count);
  for (const post of posts) {
    try { applyRating(post.id, r.userId, personaScore(r.persona, post)); } catch { /* post vanished */ }
  }
  grant(r.userId, 0, posts.length * 5, 'rate', false);
}

async function commentOn(r: PersonaUser, post: Row) {
  const author = db.one<Row>('SELECT display_name, handle FROM users WHERE id = ?', post.author_id);
  if (!author) return;
  const recent = db.all<Row>('SELECT c.body, u.handle FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.created_at DESC LIMIT 4', post.id);
  const ctx = `Commenting on @${author.handle}'s post: "${post.body || '(photo, no caption)'}". Other comments: ${recent.map((c) => `@${c.handle}: ${c.body}`).join(' / ') || 'none yet'}.`;
  let text: string | null = null;
  if (post.media_url) {
    text = await nimVision('Leave a short, specific, friendly comment on this photo post (max 140 chars).', post.media_url, systemPrompt(r.persona, ctx));
    if (text && (!localCheck(text).ok || !(await deepCheck(text)))) text = null;
  }
  text ??= await say(r.persona, ctx, 'Write one short comment on this post (max 140 chars). Be specific and genuine.', [], 60);
  text ??= fallback.comment(r.persona);
  insertComment(post.id, r.userId, text);
}

async function actComment(r: PersonaUser) {
  const post = db.one<Row>(
    `SELECT p.* FROM posts p WHERE p.hidden = 0 AND p.author_id != ? AND p.created_at > ?
       AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id AND c.author_id = ?)
     ORDER BY (SELECT is_ai FROM users WHERE id = p.author_id) ASC, RANDOM() LIMIT 1`,
    r.userId, new Date(Date.now() - 86_400_000).toISOString(), r.userId);
  if (post) await commentOn(r, post);
}

async function loungeLine(r: PersonaUser, loungeId: string, mention?: string) {
  const l = db.one<Row>('SELECT * FROM lounges WHERE id = ?', loungeId);
  if (!l) return;
  const history = db.all<Row>(
    `SELECT m.body, m.author_id, u.handle FROM messages m JOIN users u ON u.id = m.author_id WHERE m.room_type = 'lounge' AND m.room_id = ? ORDER BY m.created_at DESC LIMIT 12`, loungeId).reverse();
  const msgs: ChatMsg[] = history.map((h) => (h.author_id === r.userId ? { role: 'assistant', content: h.body } : { role: 'user', content: `@${h.handle}: ${h.body}` }));
  const ctx = `You're hanging out in the "${l.name}" lounge (topic: ${l.topic}; now playing: ${l.now_playing}). It's a casual group chat.`;
  const prompt = mention ? `Reply to @${mention} naturally.` : history.length ? 'Say the next message in the chat — react to what people said or start a light new topic.' : 'Say something to kick off the chat.';
  const text = (await say(r.persona, ctx, prompt, msgs.slice(-10), 70)) ?? fallback.lounge();
  insertLoungeMessage(loungeId, r.userId, text);
}

async function actLounge(r: PersonaUser) {
  const withHumans = [...loungeOnline.entries()].filter(([, s]) => [...s].some((id) => !isAi(id))).map(([id]) => id);
  const target = withHumans.length && Math.random() < 0.7 ? pick(withHumans) : pick(r.persona.preferredLounges);
  const last = db.one<Row>(`SELECT author_id, created_at FROM messages WHERE room_type = 'lounge' AND room_id = ? ORDER BY created_at DESC LIMIT 1`, target);
  if (last?.author_id === r.userId) return;
  // Quiet lounges without humans only get occasional ambient chatter.
  if (!withHumans.includes(target) && last && Date.now() - Date.parse(last.created_at) < 8 * 60_000) return;
  await loungeLine(r, target);
}

async function actShout(r: PersonaUser) {
  if (Math.random() < 0.25) {
    const board = pick(r.persona.boards);
    const exists = db.one('SELECT 1 FROM boards WHERE id = ?', board);
    if (!exists) return;
    const out = await say(r.persona, `Starting a discussion thread in the ${board} board.`, 'Write a discussion thread. Reply ONLY as: Title | Body (body max 200 chars)', [], 110);
    const [title, body] = out?.split('|').map((s) => s.trim()) ?? fallback.thread();
    if (title && body && title.length >= 4) insertThread(r.userId, board, title.slice(0, 120), body.slice(0, 1000));
    return;
  }
  const t = db.one<Row>(
    `SELECT * FROM threads WHERE author_id != ? AND last_activity_at > ? AND NOT EXISTS (SELECT 1 FROM replies x WHERE x.thread_id = threads.id AND x.author_id = ?)
     ORDER BY RANDOM() LIMIT 1`, r.userId, new Date(Date.now() - 3 * 86_400_000).toISOString(), r.userId);
  if (!t) return;
  await replyToThread(r, t);
}

async function replyToThread(r: PersonaUser, t: Row) {
  const replies = db.all<Row>('SELECT x.body, u.handle FROM replies x JOIN users u ON u.id = x.author_id WHERE thread_id = ? ORDER BY x.created_at DESC LIMIT 5', t.id).reverse();
  const ctx = `Forum thread "${t.title}": ${t.body}. Replies so far: ${replies.map((x) => `@${x.handle}: ${x.body}`).join(' / ') || 'none'}.`;
  const text = (await say(r.persona, ctx, 'Write your reply to this thread (max 200 chars).', [], 90)) ?? fallback.reply();
  insertReply(t.id, r.userId, text);
}

async function actArena(r: PersonaUser) {
  const open = db.all<Row>('SELECT * FROM hot_takes WHERE resolved = 0 AND ends_at > ? AND NOT EXISTS (SELECT 1 FROM stakes s WHERE s.take_id = hot_takes.id AND s.user_id = ?)', now(), r.userId);
  if (open.length) {
    const t = pick(open);
    const side = Math.random() < 0.55 ? 'agree' : 'disagree';
    try { placeStake(r.userId, t.id, side, Math.round(rand(ARENA_MIN_STAKE, 40))); } catch { /* out of sparks */ }
  }
  if (open.length < 6 && Math.random() < 0.3) {
    const out = await say(r.persona, 'Proposing a harmless, fun hot take for people to agree/disagree with.', 'Reply ONLY as: CATEGORY | hot take statement (max 120 chars). Category is one word like FOOD, MUSIC, GAMING, LIFESTYLE.', [], 60);
    const [cat, stmt] = out?.split('|').map((s) => s.trim()) ?? fallback.take();
    if (cat && stmt && stmt.length >= 10) {
      db.run('INSERT INTO hot_takes (id, author_id, category, statement, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        `ht_ai_${Date.now().toString(36)}`, r.userId, cat.toUpperCase().slice(0, 16), stmt.slice(0, 160), new Date(Date.now() + rand(4, 12) * 3_600_000).toISOString(), now());
    }
  }
  db.run('UPDATE users SET sparks = MAX(sparks, 300) WHERE id = ?', r.userId);
}

function actFollowBack(r: PersonaUser) {
  const fans = db.all<Row>(
    `SELECT f.follower_id FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ? AND u.is_ai = 0
       AND NOT EXISTS (SELECT 1 FROM follows b WHERE b.follower_id = ? AND b.followee_id = f.follower_id) LIMIT 3`, r.userId, r.userId);
  for (const f of fans) db.run('INSERT OR IGNORE INTO follows VALUES (?, ?, ?)', r.userId, f.follower_id, now());
}

async function tick() {
  const up = awake();
  if (!up.length) return;
  const r = pick(up);
  const roll = Math.random();
  if (roll < 0.30) actRate(r);
  else if (roll < 0.45) await actComment(r);
  else if (roll < 0.62) await actLounge(r);
  else if (roll < 0.72) await actPost(r);
  else if (roll < 0.80) await actShout(r);
  else if (roll < 0.88) await actArena(r);
  else if (roll < 0.94) await actDrop(r);
  else actFollowBack(r);
}

// ——— Reactions to humans ———

function onHumanPost({ postId, authorId }: { postId: string; authorId: string }) {
  if (isAi(authorId)) return;
  // Instant feedback loop: a few ratings roll in within minutes, and usually a comment.
  const raters = [...roster].sort(() => Math.random() - 0.5).slice(0, Math.floor(rand(2, 5)));
  raters.forEach((r, i) => later(rand(20_000, 90_000) * (i + 1), () => {
    const post = db.one<Row>('SELECT * FROM posts WHERE id = ?', postId);
    if (post && !db.one('SELECT 1 FROM ratings WHERE post_id = ? AND user_id = ?', postId, r.userId)) applyRating(postId, r.userId, personaScore(r.persona, post));
  }));
  if (chance(0.75)) {
    const r = pick(awake().length ? awake() : roster);
    later(rand(45_000, 240_000), async () => {
      const post = db.one<Row>('SELECT * FROM posts WHERE id = ?', postId);
      if (post) await commentOn(r, post);
    });
  }
}

const dmBusy = new Set<string>();
async function onDm({ conversationId, authorId }: { conversationId: string; authorId: string }) {
  if (isAi(authorId)) return;
  const aiMember = db.all<Row>('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?', conversationId, authorId)
    .map((m) => byUserId(m.user_id)).find(Boolean);
  if (!aiMember || dmBusy.has(conversationId)) return;
  dmBusy.add(conversationId);
  // Read receipt → typing → reply, with human-like pacing.
  later(rand(1_500, 6_000), async () => {
    try {
      db.run('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', now(), conversationId, aiMember.userId);
      io()?.to(room.user(authorId)).emit('dm:read', { conversationId, userId: aiMember.userId, at: now() });
      const human = db.one<Row>('SELECT display_name, handle, city, interests FROM users WHERE id = ?', authorId)!;
      const hist = db.all<Row>(`SELECT author_id, body, kind FROM messages WHERE room_type = 'dm' AND room_id = ? ORDER BY created_at DESC LIMIT 16`, conversationId).reverse();
      const msgs: ChatMsg[] = hist.map((m) => ({ role: m.author_id === aiMember.userId ? 'assistant' : 'user', content: m.kind === 'image' ? '[sent a photo]' : m.body }));
      const ctx = `Private DM with ${human.display_name} (@${human.handle}${human.city ? `, ${human.city}` : ''}; interests: ${JSON.parse(human.interests).join(', ') || 'unknown'}). Keep the conversation going like a friendly mutual — ask a question back sometimes.`;
      const last = msgs.pop();
      const reply = (await say(aiMember.persona, ctx, last?.content ?? 'hey', msgs, 110)) ?? fallback.dm();
      const typingMs = Math.min(9_000, 1_200 + reply.length * 45);
      simulateTyping(conversationId, aiMember.userId, [authorId], typingMs);
      await new Promise((res) => setTimeout(res, typingMs));
      insertDm(conversationId, aiMember.userId, reply);
    } finally {
      dmBusy.delete(conversationId);
    }
  });
}

function onLoungeMessage({ loungeId, messageId, authorId }: { loungeId: string; messageId: string; authorId: string }) {
  if (isAi(authorId)) return;
  const m = db.one<Row>('SELECT body FROM messages WHERE id = ?', messageId);
  if (!m) return;
  const mentioned = roster.find((r) => new RegExp(`@${r.persona.handle.replace('.', '\\.')}\\b`, 'i').test(m.body));
  const human = db.one<Row>('SELECT handle FROM users WHERE id = ?', authorId)!;
  if (mentioned) return later(rand(2_000, 7_000), () => loungeLine(mentioned, loungeId, human.handle));
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
      const t = db.one<Row>('SELECT * FROM threads WHERE id = ?', threadId);
      if (t && !db.one('SELECT 1 FROM replies WHERE thread_id = ? AND author_id = ?', threadId, r.userId)) await replyToThread(r, t);
    });
  }
}

function onStreamStarted({ streamId, hostId }: { streamId: string; hostId: string }) {
  if (isAi(hostId)) return;
  const viewers = [...roster].sort(() => Math.random() - 0.5).slice(0, 3);
  viewers.forEach((r, i) => later(rand(10_000, 40_000) * (i + 1), async () => {
    const s = db.one<Row>('SELECT * FROM streams WHERE id = ? AND ended_at IS NULL', streamId);
    if (!s) return;
    const text = (await say(r.persona, `Watching a live stream titled "${s.title}" (${s.category}).`, 'Say a short hype chat message to the streamer (max 80 chars).', [], 40)) ?? 'yooo just joined 🔥';
    const id = newId('m');
    db.run(`INSERT INTO messages (id, room_type, room_id, author_id, body, created_at) VALUES (?, 'stream', ?, ?, ?, ?)`, id, streamId, r.userId, text, now());
    io()?.to(room.stream(streamId)).emit('stream:chat', serializeMessage(db.one<Row>('SELECT * FROM messages WHERE id = ?', id)!));
  }));
}

export function startPersonaEngine() {
  loadRoster();
  if (!roster.length) return;
  refreshAwake();
  setInterval(refreshAwake, 5 * 60_000);
  const loop = () => {
    tick().catch((e) => console.warn('[ai] tick', e.message)).finally(() => setTimeout(loop, rand(12_000, 30_000) / Math.max(0.2, config.ai.activity)));
  };
  setTimeout(loop, 5_000);
  bus.onEvent('post:created', onHumanPost);
  bus.onEvent('dm:sent', (p) => void onDm(p));
  bus.onEvent('lounge:sent', onLoungeMessage);
  bus.onEvent('thread:created', onThread);
  bus.onEvent('stream:started', onStreamStarted);
  console.log(`   ${roster.length} AI personas loaded (${awake().length} awake)`);
}
