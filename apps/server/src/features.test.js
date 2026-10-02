import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Profiles, Shoutbox, Premium, SafeShield moderation, admin panel and human-like persona DMs.
 * NVIDIA NIM is replaced by a local mock so the persona DM path can be exercised offline.
 */
const nimCalls = [];
const nim = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    nimCalls.push(body);
    res.setHeader('Content-Type', 'application/json');
    const say = (content) => res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    if (body.model?.includes('safety')) return say('{"User Safety": "safe"}');
    const system = body.messages?.[0]?.content ?? '';
    if (system.includes("You're DMing")) {
      const last = body.messages.at(-1).content;
      return say(last.includes('beach') ? 'wait which beach?? 🌊\ni haven’t seen the ocean in months' : 'ok tell me everything');
    }
    if (system.includes('memory notes')) return say('Went to the beach recently.');
    say('');
  });
});
await new Promise((r) => nim.listen(0, r));

const { useTestMongo } = await import('./testDb.js');
const mongo = await useTestMongo('features');
process.env.UPLOAD_DIR = join(tmpdir(), 'chatlol-features-uploads');
process.env.NVIDIA_API_KEY = 'nvapi-test';
process.env.NIM_BASE_URL = `http://127.0.0.1:${nim.address().port}/v1`;
process.env.NIM_IMAGE_URL = '';
process.env.NIM_SAFETY_MODEL = 'nvidia/llama-3.1-nemoguard-8b-content-safety';
process.env.NIM_MODELS = 'meta/llama-3.1-8b-instruct';
process.env.AI_ACTIVITY = '0.01';
process.env.AI_REPLY_PACE = '0.001';
process.env.ADMIN_EMAILS = 'boss@example.com';
process.env.RATE_LIMIT_SCALE = '50';

const { createApp } = await import('./app.js');
const { initDb, db } = await import('./db.js');
const { initShared, closeShared } = await import('./lib/shared.js');
const { seed } = await import('./seed.js');
const { attachRealtime } = await import('./realtime.js');
const { startPersonaEngine } = await import('./ai/engine.js');
const { createApi } = await import('@chatlol/shared');

let server;
let ioServer;
let base = '';
const tokens = {};
const as = (who) => createApi({ baseUrl: base, getToken: () => tokens[who] ?? null });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await wait(100);
  }
}
let n = 0;
async function signUp(who, extra = {}) {
  n++;
  const r = await as('anon').register({
    email: extra.email ?? `${who}${n}@example.com`,
    password: 'password123',
    handle: `${who}_${n}`,
    displayName: who,
    birthdate: '1996-02-02',
    gender: extra.gender ?? 'female',
  });
  tokens[who] = r.token;
  return r.user;
}

before(async () => {
  await initShared();
  await initDb();
  await seed(true);
  server = createServer(createApp());
  ioServer = await attachRealtime(server);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  await startPersonaEngine();
});
after(async () => {
  await new Promise((r) => ioServer.close(() => r()));
  server.closeAllConnections();
  nim.close();
  await db.dropDatabase({ reindex: false });
  await db.close();
  await mongo.stop();
  await closeShared();
  setTimeout(() => process.exit(0), 50).unref(); // persona engine timers
});

test('registration requires Male or Female, and it shows on the profile', async () => {
  await assert.rejects(
    as('anon').register({ email: 'g@example.com', password: 'password123', handle: 'nogender', displayName: 'X', birthdate: '1990-01-01' }),
    (e) => e.status === 400 && /gender/.test(e.message),
  );
  const u = await signUp('gina', { gender: 'female' });
  assert.equal(u.gender, 'female');
  const p = await as('gina').user(u.handle);
  assert.equal(p.user.gender, 'female');
  await as('gina').updateSettings({ showGender: false });
  assert.equal((await as('anon').user(u.handle)).user.gender, null);
});

test('news feed is newest-first: a new post is always at the top after a refresh', async () => {
  await signUp('fred');
  const { post } = await as('fred').createPost({ body: 'brand new post #fresh' });
  for (let i = 0; i < 3; i++) {
    const feed = await as('fred').feed({ tab: 'foryou' });
    assert.equal(feed.items[0].id, post.id);
    const times = feed.items.map((p) => p.createdAt);
    assert.deepEqual(times, [...times].sort().reverse());
  }
  // Paging never skips: page 2 starts right after page 1.
  const p1 = await as('fred').feed({});
  const p2 = await as('fred').feed({ cursor: p1.nextCursor });
  assert.ok(p2.items[0].createdAt <= p1.items.at(-1).createdAt);
});

test('profile customisation: background, accent, headline, Spotify song, gallery-only photos', async () => {
  const u = await signUp('pat');
  const c = as('pat');
  const r = await c.updateProfile({
    background: { kind: 'preset', value: 'ocean' },
    accent: '#9333ea',
    headline: 'film nerd',
    song: 'https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT?si=abc',
  });
  assert.equal(r.user.profile.background.value, 'ocean');
  assert.equal(r.user.profile.song.id, '4cOdK2wGLETKBW3PvgPWqT');
  await assert.rejects(c.updateProfile({ song: 'not a link' }), (e) => e.status === 400);
  await assert.rejects(c.updateProfile({ background: { kind: 'preset', value: 'nope' } }), (e) => e.status === 400);
  const { post } = await c.createPost({
    body: 'gallery only',
    mediaUrl: 'https://picsum.photos/seed/g1/600/800',
    album: 'Golden Hour',
    inFeed: false,
  });
  const gallery = await c.gallery(u.id);
  assert.deepEqual(gallery.albums, ['Golden Hour']);
  assert.equal(gallery.photos[0].id, post.id);
  assert.ok(!(await c.feed({})).items.some((p) => p.id === post.id), 'gallery-only photo stays out of the feed');
});

test('email change needs the password and re-verification', async () => {
  await signUp('eve');
  await assert.rejects(as('eve').changeEmail('eve.new@example.com', 'wrong'), (e) => e.status === 403);
  const r = await as('eve').changeEmail('eve.new@example.com', 'password123');
  assert.equal(r.user.email, 'eve.new@example.com');
  assert.equal(r.user.emailVerified, false);
});

test('shoutbox: post, 45s cooldown, reactions, replies and @mentions', async () => {
  const a = await signUp('shouter');
  const b = await signUp('tagged');
  const { shout } = await as('shouter').shout({ body: `yo @${b.handle} golden hour now`, mood: 'hyped' });
  assert.deepEqual(shout.mentions, [b.handle]);
  await assert.rejects(as('shouter').shout({ body: 'again' }), (e) => e.status === 429 && e.code === 'shout_cooldown');
  const reacted = await as('tagged').reactShout(shout.id, 'fire');
  assert.equal(reacted.shout.reactions.fire, 1);
  const reply = await as('tagged').shout({ body: 'omw!', replyToId: shout.id });
  assert.equal(reply.shout.replyTo.id, shout.id);
  const board = await as('anon').shouts();
  assert.equal(board.items[0].id, reply.shout.id);
  // The tagged person learns *someone* mentioned them — not who (that's Premium).
  const { items } = await as('tagged').notifications();
  const mention = items.find((x) => x.kind === 'mention' && x.anonymous);
  assert.ok(mention);
  assert.equal(mention.actor, null);
  assert.match(mention.title, /^Someone mentioned you/);
  assert.ok(mention.teaserAvatar);
  // The original shouter sees who replied (replies are public on the board anyway).
  assert.ok((await as('shouter').notifications()).items.some((x) => /replied to your shout/.test(x.title) && x.actor?.id === b.id));
  assert.ok(a.id);
});

test('premium: steep in Sparks, unlocks who viewed / rated / mentioned you', async () => {
  const me = await signUp('prem');
  const fan = await signUp('fan');
  await as('fan').user(me.handle); // profile view
  await as('fan').rateProfile(me.id, 5);
  let ins = await as('prem').insights();
  assert.equal(ins.premium, false);
  assert.equal(ins.viewCount, 1);
  assert.equal(ins.views[0].user, null);
  assert.ok(ins.views[0].teaserAvatar);
  assert.equal(ins.raters[0].user, null);
  assert.equal(ins.ratings.count, 1);
  await assert.rejects(as('prem').buyPremium('premium_7d'), (e) => e.status === 402);
  await db.users.updateOne({ _id: me.id }, { $set: { sparks: 30_000 } });
  const bought = await as('prem').buyPremium('premium_7d');
  assert.equal(bought.user.sparks, 5_000);
  assert.ok(bought.user.premium);
  ins = await as('prem').insights();
  assert.equal(ins.views[0].user.id, fan.id);
  assert.equal(ins.raters[0].user.id, fan.id);
  const notes = (await as('prem').notifications()).items.filter((x) => x.kind === 'profile_view' || x.kind === 'profile_rating');
  assert.ok(notes.length >= 2 && notes.every((x) => !x.anonymous && x.actor?.id === fan.id));
});

test('profile wall respects the owner’s wall setting', async () => {
  const owner = await signUp('wallowner');
  await signUp('visitor');
  await as('visitor').postWall(owner.id, { body: 'love your photos!', mood: 'love' });
  assert.equal((await as('anon').wall(owner.id)).notes.length, 1);
  await as('wallowner').updateSettings({ wallFrom: 'nobody' });
  await assert.rejects(as('visitor').postWall(owner.id, { body: 'hi again' }), (e) => e.status === 403);
});

test('SafeShield: threats suspend immediately; repeated insults escalate to a mute', async () => {
  await signUp('menace');
  const victim = await signUp('victim');
  await as('menace').shout({ body: `@${victim.handle} i will kill you` });
  await until(async () => (await db.users.findOne({ handleLower: `menace_${n - 1}` }))?.moderation?.status === 'suspended');
  await assert.rejects(as('menace').me(), (e) => e.status === 403 && e.code === 'account_suspended');
  await assert.rejects(as('anon').login({ login: `menace_${n - 1}`, password: 'password123' }), (e) => e.code === 'account_suspended');
  assert.ok(await db.modFlags.findOne({ priority: 'high' }), 'flagged for a human to consider termination');

  const bully = await signUp('bully');
  const { conversation } = await as('bully').openConversation(victim.id);
  for (const body of ['you are so stupid', 'shut up', 'you are a loser']) await as('bully').sendMessage(conversation.id, { body });
  // Insulting the same person twice and three insults in an hour are two strikes: warned, then muted.
  await until(async () => (await db.users.findOne({ _id: bully.id }))?.moderation?.status === 'muted');
  assert.equal(await db.modEvents.countDocuments({ userId: bully.id, kind: 'strike' }), 2);
  await assert.rejects(as('bully').createPost({ body: 'hello' }), (e) => e.status === 403 && e.code === 'muted');
  assert.ok((await as('bully').feed({})).items.length > 0);
});

test('reports are reviewed by SafeShield automatically', async () => {
  const rude = await signUp('rude');
  await signUp('reporter');
  const { post } = await as('rude').createPost({ body: 'normal post here' });
  await db.posts.updateOne({ _id: post.id }, { $set: { body: 'buy cocaine from me' } }); // slipped past the write filter
  await as('reporter').report({ targetType: 'post', targetId: post.id, reason: 'drugs' });
  await until(async () => (await db.reports.findOne({ targetId: post.id }))?.status === 'actioned');
  assert.equal((await db.posts.findOne({ _id: post.id })).hidden, true);
  assert.equal((await db.users.findOne({ _id: rude.id })).moderation.status, 'suspended');
});

test('admin panel: admins only; mute, unmute, ban and persona DM controls', async () => {
  await signUp('boss', { email: 'boss@example.com' });
  const target = await signUp('target');
  await assert.rejects(as('target').admin.overview(), (e) => e.status === 403);
  const overview = await as('boss').admin.overview();
  assert.equal(overview.integrations.database, 'mongodb');
  assert.equal(overview.integrations.nvidiaNim, true);
  assert.ok(overview.counts.users > 0);
  let u = (await as('boss').admin.action(target.id, { action: 'mute', minutes: 60, reason: 'cool off' })).user;
  assert.equal(u.standing.status, 'muted');
  u = (await as('boss').admin.action(target.id, { action: 'unmute', reason: 'appeal accepted' })).user;
  assert.equal(u.standing.status, 'active');
  await as('boss').admin.action(target.id, { action: 'ban', reason: 'harassment' });
  await assert.rejects(as('anon').login({ login: target.handle, password: 'password123' }), (e) => e.code === 'account_banned');
  const detail = await as('boss').admin.user(target.id);
  assert.deepEqual(
    detail.events.slice(0, 3).map((e) => e.kind),
    ['ban', 'unmute', 'mute'],
  );
  const { items } = await as('boss').admin.personas();
  assert.ok(
    items.some((p) => p.dmFrom !== 'everyone'),
    'some personas don’t take DMs from everyone',
  );
  await as('boss').admin.updatePersona('ai_mia', { dmFrom: 'everyone' });
});

test('home dashboard has every section', async () => {
  const h = await as('anon').home();
  for (const k of ['popularMembers', 'forums', 'streams', 'hallOfFame', 'shouts', 'drop', 'arena', 'lounges', 'newMembers'])
    assert.ok(k in h, k);
  assert.ok(h.forums.length > 0 && h.shouts.length > 0 && h.lounges.length > 0);
});

test('personas text back like people: wait for the burst, answer what was said, multiple bubbles', async () => {
  const me = await signUp('texter');
  const { conversation } = await as('texter').openConversation('ai_mia');
  await as('texter').sendMessage(conversation.id, { body: 'heyy' });
  await as('texter').sendMessage(conversation.id, { body: 'i went to the beach today' });
  const msgs = await until(async () => {
    const m = (await as('texter').messages(conversation.id)).messages.filter((x) => x.author.id === 'ai_mia' && x.createdAt > me.createdAt);
    return m.length >= 2 ? m : null;
  }, 15000);
  assert.deepEqual(
    msgs.map((m) => m.body),
    ['wait which beach?? 🌊', 'i haven’t seen the ocean in months'],
  );
  const dmCall = nimCalls.find((c) => c.messages?.[0]?.content.includes("You're DMing"));
  assert.equal(dmCall.model, 'meta/llama-3.3-70b-instruct', 'DMs use the bigger chat model');
  assert.equal(dmCall.messages.at(-1).content, 'heyy\ni went to the beach today', 'both texts answered together');
});
