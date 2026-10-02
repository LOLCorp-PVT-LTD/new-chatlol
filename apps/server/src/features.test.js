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

test('birthdays: one system post per year, a gift, follower alerts, wishes not ratings', async () => {
  const { runBirthdays, birthdaySuffixes } = await import('./lib/birthdays.js');
  assert.deepEqual(birthdaySuffixes('2027-02-28'), ['-02-28', '-02-29'], 'Feb 29 birthdays count on Feb 28 in non-leap years');
  assert.deepEqual(birthdaySuffixes('2028-02-28'), ['-02-28']);
  const day = new Date().toISOString().slice(0, 10);
  const r = await as('anon').register({
    email: 'bday@example.com',
    password: 'password123',
    handle: 'bday_kid',
    displayName: 'Bday Kid',
    birthdate: `1995${day.slice(4)}`,
    gender: 'male',
  });
  tokens.bday = r.token;
  const fan = await signUp('bdayfan');
  await as('bdayfan').follow(r.user.id);
  const sparksBefore = (await db.users.findOne({ _id: r.user.id })).sparks;
  await db.users.updateOne({ _id: 'ai_mia' }, { $set: { 'settings.celebrateBirthday': false } }); // opt-outs are skipped
  await runBirthdays(day);
  await runBirthdays(day); // a second run the same day does nothing
  const postId = `bday_${r.user.id}_${day.slice(0, 4)}`;
  const posts = await db.posts.find({ kind: 'birthday', authorId: r.user.id }).toArray();
  assert.equal(posts.length, 1);
  assert.equal(posts[0]._id, postId);
  assert.equal((await db.users.findOne({ _id: r.user.id })).sparks, sparksBefore + 100);
  assert.ok((await as('bdayfan').notifications()).items.some((n) => n.kind === 'birthday' && n.link === `/p/${postId}`));
  const { post } = await as('bdayfan').post(postId);
  assert.equal(post.system, true);
  await assert.rejects(as('bdayfan').rate(postId, 5), (e) => e.status === 400);
  await as('bdayfan').comment(postId, 'happy birthday!!');
  assert.ok((await as('bday').notifications()).items.some((n) => /birthday wish/.test(n.title)));
  const home = await as('bdayfan').home();
  assert.ok(home.birthdays.some((b) => b.user.id === r.user.id));
  assert.ok(fan.id);
});

test('profile builder: layouts are cleaned, saved, moderated and shown to visitors', async () => {
  const u = await signUp('lay');
  const c = as('lay');
  const fresh = await as('anon').user(u.handle);
  assert.equal(fresh.user.profile.layout.header, 'cover', 'new profiles start from the default layout');
  assert.ok(fresh.user.profile.layout.sections.some((s) => s.type === 'wall'));
  const r = await c.updateLayout({
    header: 'split',
    width: 'wide',
    gap: 'airy',
    corners: 'round',
    font: 'serif',
    sections: [
      { id: 'a1', type: 'about', size: 'third', style: 'glass', title: 'Me!', config: {} },
      { id: 'a2', type: 'about', size: 'full' }, // duplicate single-use section → dropped
      { id: 'v1', type: 'video', size: 'half', config: { videoId: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1' } },
      { id: 'l1', type: 'links', size: 'gigantic', config: { items: [{ label: 'x', url: 'javascript:alert(1)' }, { label: 'IG', url: 'https://instagram.com/lay' }] } },
      { id: 'f1', type: 'friends', config: { limit: 999 } },
      { id: 'z1', type: 'not-a-section' },
    ],
  });
  const l = r.layout;
  assert.deepEqual([l.header, l.width, l.gap, l.corners, l.font], ['split', 'wide', 'airy', 'round', 'serif']);
  assert.deepEqual(
    l.sections.map((s) => s.type),
    ['about', 'video', 'links', 'friends'],
  );
  assert.equal(l.sections[0].style, 'glass');
  assert.equal(l.sections[1].config.videoId, 'dQw4w9WgXcQ');
  assert.equal(l.sections[2].size, 'third', 'an unknown size falls back to the section default');
  assert.deepEqual(l.sections[2].config.items, [{ label: 'IG', url: 'https://instagram.com/lay' }]);
  assert.equal(l.sections[3].config.limit, 24, 'limits are clamped');
  const seen = await as('anon').user(u.handle);
  assert.deepEqual(
    seen.user.profile.layout.sections.map((s) => s.id),
    ['a1', 'v1', 'l1', 'f1'],
  );
  // Authors embedded in feeds don't carry the layout.
  await c.createPost({ body: 'hello', mediaUrl: 'https://picsum.photos/seed/lay/600/800' });
  const feed = await c.feed({});
  assert.equal(feed.items[0].author.profile.layout, undefined);
  await assert.rejects(
    c.updateLayout({ sections: [{ type: 'text', config: { body: 'I will kill you' } }] }),
    (e) => e.status === 400 || e.status === 422,
  );
  await assert.rejects(c.updateLayout({ nope: true }), (e) => e.status === 400);
});

test('profile showcase: friends, followers, following, shouts and top photos', async () => {
  const a = await signUp('sha');
  const b = await signUp('shb');
  const d = await signUp('shd');
  await as('sha').follow(b.id);
  await as('shb').follow(a.id); // a ↔ b: friends
  await as('shd').follow(a.id); // d → a: follower only
  await as('sha').shout({ body: 'showcase shout' });
  const low = (await as('sha').createPost({ body: 'meh', mediaUrl: 'https://picsum.photos/seed/s1/600/800' })).post;
  const high = (await as('sha').createPost({ body: 'yes', mediaUrl: 'https://picsum.photos/seed/s2/600/800' })).post;
  await as('shb').rate(low.id, 1);
  await as('shb').rate(high.id, 5);
  const s = await as('shd').showcase(a.id, ['friends', 'followers', 'following', 'shouts', 'topPhotos', 'photos', 'threads'], 12);
  // New members also follow a few personas at signup, so check membership rather than exact lists.
  const ids = (list) => list.map((x) => x.id);
  assert.ok(ids(s.friends).includes(b.id), 'mutual follow = friend');
  assert.ok(!ids(s.friends).includes(d.id), 'a one-way follower is not a friend');
  assert.ok(ids(s.followers).includes(b.id) && ids(s.followers).includes(d.id));
  assert.equal(s.following[0].id, b.id, 'most recent follow first');
  assert.ok(!ids(s.following).includes(d.id));
  assert.equal(s.shouts[0].body, 'showcase shout');
  assert.deepEqual(s.topPhotos.map((p) => p.id), [high.id, low.id], 'best rated first');
  assert.equal(s.photos[0].id, high.id, 'latest first');
  assert.deepEqual(s.threads, []);
  const only = await as('anon').showcase(a.id, ['friends'], 5);
  assert.deepEqual(Object.keys(only), ['friends'], 'only what was asked for');
});

test('song search works without Spotify keys (Apple Music previews) and only Apple clips are accepted', async () => {
  await signUp('song');
  const c = as('song');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith('https://itunes.apple.com/search')) {
      return new Response(
        JSON.stringify({
          results: [
            {
              trackId: 1488408568,
              trackName: 'Blinding Lights',
              artistName: 'The Weeknd',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/a/100x100bb.jpg',
              previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/x.m4a',
              trackViewUrl: 'https://music.apple.com/us/album/blinding-lights/1488408555?i=1488408568',
            },
            { trackId: 2, trackName: 'Bad', artistName: 'X', previewUrl: 'https://evil.example/x.mp3' },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }
    return realFetch(url, opts);
  };
  try {
    const r = await c.songSearch('blinding lights');
    assert.equal(r.source, 'apple');
    assert.equal(r.tracks.length, 1, 'tracks without an Apple preview are left out');
    const t = r.tracks[0];
    assert.equal(t.artUrl, 'https://is1-ssl.mzstatic.com/image/thumb/a/300x300bb.jpg');
    const saved = await c.updateProfile({ song: t });
    assert.equal(saved.user.profile.song.source, 'apple');
    assert.equal(saved.user.profile.song.previewUrl, t.previewUrl);
    await assert.rejects(c.updateProfile({ song: { ...t, previewUrl: 'https://evil.example/x.mp3' } }), (e) => e.status === 400);
  } finally {
    globalThis.fetch = realFetch;
  }
});
