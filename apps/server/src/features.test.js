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
process.env.NIM_PREFERRED_MODELS = '';
process.env.NIM_MODELS = 'meta/llama-3.1-8b-instruct';
process.env.AI_ACTIVITY = '0.01';
process.env.AI_REPLY_PACE = '0.001';
process.env.ADMIN_EMAILS = 'boss@example.com';
process.env.RATE_LIMIT_SCALE = '50';

const { createApp } = await import('./app.js');
const { initDb, db, COLLECTIONS } = await import('./db.js');
const { initShared, closeShared } = await import('./lib/shared.js');
const { seed } = await import('./seed.js');
const { attachRealtime } = await import('./realtime.js');
const { startPersonaEngine } = await import('./ai/engine.js');
const { createApi, xpForLevel } = await import('@chatlol/shared');
const { personaUserId } = await import('./lib/ids.js');
const MIA = personaUserId('mia');

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
const levelUp = (u, level = 10) => db.users.updateOne({ _id: u.id }, { $set: { xp: xpForLevel(level) } });
const makePremium = (u) => db.users.updateOne({ _id: u.id }, { $set: { premium: { until: new Date(Date.now() + 86_400_000).toISOString() } } });
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
  await assert.rejects(c.updateProfile({ song: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT' }), (e) => e.code === 'premium_required');
  await makePremium(u);
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
  await levelUp(bully);
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
  await as('boss').admin.updatePersona(MIA, { dmFrom: 'everyone' });
});

test('staff powers: roles, permissions, Sparks/Gems, items, Premium, boost, payments, refunds, termination', async () => {
  const mod = await signUp('modguy');
  const member = await signUp('member');
  const other = await signUp('other');
  // Admins make moderators; moderators get the moderation basics only.
  let m = (await as('boss').admin.setRole(mod.id, 'mod')).user;
  assert.deepEqual(m.allPerms.sort(), ['mute', 'overview', 'reports']);
  assert.ok((await as('modguy').me()).user.perms.includes('reports'));
  await assert.rejects(as('modguy').admin.wallet(member.id, { sparks: 100 }), (e) => e.status === 403);
  await assert.rejects(as('modguy').admin.payments(), (e) => e.status === 403);
  await assert.rejects(as('modguy').admin.action(member.id, { action: 'ban', reason: 'nope nope' }), (e) => e.status === 403);
  await as('modguy').admin.action(member.id, { action: 'warn', reason: 'be nice' });
  // An admin hands the mod extra powers; the mod can pass on only what they hold, and can't make admins.
  m = (await as('boss').admin.setPerms(mod.id, ['wallet', 'staff'])).user;
  assert.ok(m.allPerms.includes('wallet'));
  await as('modguy').admin.setPerms(other.id, ['wallet']);
  await assert.rejects(as('modguy').admin.setPerms(other.id, ['payments']), (e) => e.status === 403);
  await assert.rejects(as('modguy').admin.setRole(other.id, 'admin'), (e) => e.status === 403);
  await assert.rejects(as('modguy').admin.action(mod.id, { action: 'mute', minutes: 5, reason: 'self' }), (e) => e.status === 400);
  // Sparks and Gems, never below zero.
  const before = (await as('member').me()).user;
  let u = (await as('modguy').admin.wallet(member.id, { sparks: 5000, gems: 40, reason: 'contest winner' })).user;
  assert.equal(u.sparks, before.sparks + 5000);
  assert.equal(u.gems, before.gems + 40);
  u = (await as('boss').admin.wallet(member.id, { gems: -1000 })).user;
  assert.equal(u.gems, 0);
  // Premium, items, boost.
  u = (await as('boss').admin.grantPremium(member.id, 30)).user;
  assert.ok(u.premiumUntil);
  const { items } = await as('boss').admin.items();
  const pack = items.find((i) => i.kind === 'stickers');
  await as('boss').admin.giveItem(member.id, pack.key);
  assert.ok((await as('member').stickers()).owned.includes(pack.key));
  u = (await as('boss').admin.boost(member.id, 24)).user;
  assert.ok(u.boostUntil > new Date().toISOString());
  const browse = await as('other').members({ sort: 'new' });
  assert.equal(browse.items[0].id, member.id, 'boosted member leads Browse Members');
  assert.equal(browse.items[0].boosted, true);
  // Payments: who paid what, and refunds take back what was credited.
  const { creditPurchase } = await import('./routes/payments.js');
  await creditPurchase({
    id: 'rc:test-tx-1',
    userId: member.id,
    provider: 'app_store',
    productId: 'gems_450',
    amountCents: 499,
    currency: 'usd',
  });
  const pay = await as('boss').admin.payments({ user: member.handle });
  assert.equal(pay.items.length, 1);
  assert.equal(pay.items[0].user.id, member.id);
  assert.equal(pay.items[0].amountCents, 499);
  assert.ok(pay.totals.some((t) => t.status === 'completed' && t.cents === 499));
  const gemsAfterBuy = (await as('member').me()).user.gems;
  assert.ok(gemsAfterBuy >= 450);
  const r = await as('boss').admin.refund(pay.items[0].id);
  assert.equal(r.moneyBack, false);
  assert.equal((await as('boss').admin.payments({ user: member.handle, status: 'refunded' })).items.length, 1);
  assert.ok((await as('member').me()).user.gems < gemsAfterBuy);
  // Terminate closes the account for good.
  await assert.rejects(as('modguy').admin.terminate(member.id, 'spam ring'), (e) => e.status === 403);
  u = (await as('boss').admin.terminate(member.id, 'spam ring')).user;
  assert.equal(u.deleted, true);
  assert.equal(u.standing.status, 'banned');
  await assert.rejects(as('member').me(), (e) => e.status === 401 || e.status === 403);
  const log = await as('boss').admin.user(member.id);
  for (const k of ['terminate', 'refund', 'boost', 'item', 'premium', 'wallet', 'warn'])
    assert.ok(
      log.events.some((e) => e.kind === k),
      k,
    );
});

test('home dashboard has every section', async () => {
  const h = await as('anon').home();
  for (const k of ['popularMembers', 'forums', 'streams', 'hallOfFame', 'shouts', 'drop', 'arena', 'lounges', 'newMembers'])
    assert.ok(k in h, k);
  assert.ok(h.forums.length > 0 && h.shouts.length > 0 && h.lounges.length > 0);
});

test('personas text back like people: wait for the burst, answer what was said, multiple bubbles', async () => {
  const me = await signUp('texter');
  const { conversation } = await as('texter').openConversation(MIA);
  await as('texter').sendMessage(conversation.id, { body: 'heyy' });
  await as('texter').sendMessage(conversation.id, { body: 'i went to the beach today' });
  const msgs = await until(async () => {
    const m = (await as('texter').messages(conversation.id)).messages.filter((x) => x.author.id === MIA && x.createdAt > me.createdAt);
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
  await db.users.updateOne({ _id: MIA }, { $set: { 'settings.celebrateBirthday': false } }); // opt-outs are skipped
  await runBirthdays(day);
  await runBirthdays(day); // a second run the same day does nothing
  const posts = await db.posts.find({ kind: 'birthday', authorId: r.user.id }).toArray();
  assert.equal(posts.length, 1);
  const postId = posts[0]._id;
  assert.equal(posts[0].systemKey, `birthday:${r.user.id}:${day.slice(0, 4)}`);
  assert.equal((await db.users.findOne({ _id: r.user.id })).sparks, sparksBefore + 100);
  assert.ok((await as('bdayfan').notifications()).items.some((n) => n.kind === 'birthday' && n.link === `/p/${postId}`));
  const { post } = await as('bdayfan').post(postId);
  assert.equal(post.system, true);
  await assert.rejects(as('bdayfan').rate(postId, 5), (e) => e.status === 400);
  await as('bdayfan').comment(postId, 'happy birthday!!');
  assert.ok((await as('bday').notifications()).items.some((n) => /birthday wish/.test(n.title)));
  const home = await as('bdayfan').home();
  assert.equal(home.birthdays.find((b) => b.user.id === r.user.id)?.postId, postId);
  assert.ok(fan.id);
});

test('profile builder: layouts are cleaned, saved, moderated and shown to visitors', async () => {
  const u = await signUp('lay');
  const c = as('lay');
  await makePremium(u);
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
      {
        id: 'l1',
        type: 'links',
        size: 'gigantic',
        config: {
          items: [
            { label: 'x', url: 'javascript:alert(1)' },
            { label: 'IG', url: 'https://instagram.com/lay' },
          ],
        },
      },
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
  await as('sha').addFriend(b.id);
  await as('shb').acceptFriend(a.id); // a ↔ b: friends (and following each other)
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
  assert.deepEqual(
    s.topPhotos.map((p) => p.id),
    [high.id, low.id],
    'best rated first',
  );
  assert.equal(s.photos[0].id, high.id, 'latest first');
  assert.deepEqual(s.threads, []);
  const only = await as('anon').showcase(a.id, ['friends'], 5);
  assert.deepEqual(Object.keys(only), ['friends'], 'only what was asked for');
});

test('song search is Spotify only: clear error without keys, Spotify results with keys, never Apple', async () => {
  await makePremium(await signUp('song'));
  const c = as('song');
  const { config } = await import('./config.js');
  const keys = { ...config.spotify };
  const realFetch = globalThis.fetch;
  const called = [];
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (/itunes\.apple\.com|spotify\.com/.test(u)) called.push(u.split('?')[0]);
    if (u === 'https://accounts.spotify.com/api/token')
      return Response.json({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600 });
    if (u.startsWith('https://api.spotify.com/v1/search')) {
      assert.equal(opts.headers.Authorization, 'Bearer tok');
      return Response.json({
        tracks: {
          items: [
            {
              id: '0VjIjW4GlUZAMYd2vXMi3b',
              name: 'Blinding Lights',
              artists: [{ name: 'The Weeknd' }],
              album: { images: [{ url: 'https://i.scdn.co/image/big' }, { url: 'https://i.scdn.co/image/small' }] },
            },
          ],
        },
      });
    }
    return realFetch(url, opts);
  };
  try {
    config.spotify.clientId = '';
    config.spotify.clientSecret = '';
    await assert.rejects(c.songSearch('blinding lights'), (e) => e.status === 503 && e.code === 'spotify_not_configured');
    config.spotify.clientId = 'id';
    config.spotify.clientSecret = 'secret';
    const r = await c.songSearch('blinding lights');
    assert.equal(r.source, 'spotify');
    assert.deepEqual(r.tracks[0], {
      source: 'spotify',
      type: 'track',
      id: '0VjIjW4GlUZAMYd2vXMi3b',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      artUrl: 'https://i.scdn.co/image/small',
    });
    assert.ok(!called.some((u) => u.includes('itunes')), 'Apple Music is never searched');
    const saved = await c.updateProfile({ song: r.tracks[0] });
    assert.equal(saved.user.profile.song.source, 'spotify');
    // Apple songs picked in older versions are still accepted, but only real Apple preview clips.
    const apple = {
      source: 'apple',
      type: 'track',
      id: '1488408568',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/x.m4a',
    };
    assert.equal((await c.updateProfile({ song: apple })).user.profile.song.source, 'apple');
    await assert.rejects(c.updateProfile({ song: { ...apple, previewUrl: 'https://evil.example/x.mp3' } }), (e) => e.status === 400);
  } finally {
    globalThis.fetch = realFetch;
    Object.assign(config.spotify, keys);
  }
});

test('app colour theme: presets, a custom colour, saved on the account', async () => {
  await signUp('themer');
  const c = as('themer');
  assert.deepEqual((await c.me()).user.settings.appTheme, { preset: 'sunset', custom: null });
  assert.deepEqual((await c.updateSettings({ appTheme: { preset: 'ocean', custom: null } })).user.settings.appTheme, {
    preset: 'ocean',
    custom: null,
  });
  assert.equal((await c.updateSettings({ appTheme: { preset: 'custom', custom: '#7c5cff' } })).user.settings.appTheme.custom, '#7c5cff');
  await assert.rejects(c.updateSettings({ appTheme: { preset: 'custom', custom: null } }), (e) => e.status === 400);
  await assert.rejects(c.updateSettings({ appTheme: { preset: 'neon', custom: null } }), (e) => e.status === 400);
  await assert.rejects(c.updateSettings({ appTheme: { preset: 'custom', custom: 'red; background:url(x)' } }), (e) => e.status === 400);
  // The palette keeps Sunset's lightness, so text contrast is the same in every theme.
  const { themePalette, hexToHsl, colors } = await import('@chatlol/shared');
  const ocean = themePalette({ preset: 'ocean', custom: null });
  for (const k of ['surface', 'onSurface', 'onSurfaceVariant', 'flame', 'outline'])
    assert.ok(Math.abs(hexToHsl(ocean[k])[2] - hexToHsl(colors[k])[2]) < 0.01, k);
  assert.deepEqual(themePalette({ preset: 'sunset', custom: null }), {
    ...colors,
    selBg: colors.flame,
    selFg: '#ffffff',
    selBorder: colors.flame,
  });
});

test('every _id and every reference is a real ObjectId in MongoDB', async () => {
  const { ObjectId } = await import('mongodb');
  const a = await signUp('oid');
  const b = await signUp('oidb');
  await levelUp(a);
  await as('oid').follow(b.id);
  const { post } = await as('oid').createPost({ body: 'object ids!', mediaUrl: 'https://picsum.photos/seed/oid/600/800' });
  await as('oidb').comment(post.id, 'nice');
  await as('oid').shout({ body: `hey @${b.handle}` });
  const { conversation } = await as('oid').openConversation(b.id);
  await as('oid').sendMessage(conversation.id, { body: 'hi' });
  await as('oid').claimDaily();
  assert.match(a.id, /^[0-9a-f]{24}$/, 'the API sends ids as hex strings');
  const raw = (name) => db[name].raw;
  const isOid = (v) => v instanceof ObjectId;
  assert.ok(isOid((await raw('users').findOne({ handleLower: a.handle.toLowerCase() }))._id));
  const p = await raw('posts').findOne({ _id: new ObjectId(post.id) });
  assert.ok(isOid(p._id) && isOid(p.authorId));
  const c = await raw('comments').findOne({ postId: new ObjectId(post.id) });
  assert.ok(isOid(c._id) && isOid(c.postId) && isOid(c.authorId));
  const f = await raw('follows').findOne({ followerId: new ObjectId(a.id) });
  assert.ok(isOid(f.followeeId));
  const sh = await raw('shouts').findOne({ authorId: new ObjectId(a.id) });
  assert.ok(isOid(sh._id) && sh.mentions.every(isOid) && sh.mentions.length === 1);
  const conv = await raw('conversations').findOne({ _id: new ObjectId(conversation.id) });
  assert.ok(conv.members.every((m) => isOid(m.userId)));
  const msg = await raw('messages').findOne({ roomId: new ObjectId(conversation.id) });
  assert.ok(isOid(msg._id) && isOid(msg.authorId));
  const counter = await raw('dailyCounters').findOne({ userId: new ObjectId(a.id), key: 'daily_chest' });
  assert.ok(isOid(counter._id));
  // Nothing anywhere still has a string _id (shared-state keys and locks are cache entries, not records).
  for (const name of COLLECTIONS.filter((n) => !['kv', 'locks', 'settings'].includes(n))) {
    const bad = await raw(name).countDocuments({ _id: { $type: 'string' } });
    assert.equal(bad, 0, `${name} has string _ids`);
  }
});

test('custom emoji and stickers: free starter packs, paid packs locked until bought with Sparks', async () => {
  const u = await signUp('stick');
  const c = as('stick');
  await db.users.updateOne({ _id: u.id }, { $set: { sparks: 5000, xp: xpForLevel(10) } });
  const cat = await c.stickers();
  assert.ok(cat.owned.includes('emoji_basics') && cat.owned.includes('stickers_feels'), 'starter packs are free');
  assert.ok(!cat.owned.includes('emoji_slang'));
  // Free custom emoji and stickers work everywhere straight away.
  const { shout } = await c.shout({ body: 'gg everyone :gg: :w:' });
  assert.equal(shout.body, 'gg everyone :gg: :w:');
  const { post } = await c.createPost({ body: 'sticker me', mediaUrl: 'https://picsum.photos/seed/st/600/800' });
  const { comment } = await c.comment(post.id, '', { kind: 'noto', id: 'stickers_feels/fire' });
  assert.equal(comment.sticker.kind, 'noto');
  assert.match(comment.sticker.url, /^https:\/\/fonts\.gstatic\.com\/s\/e\/notoemoji\/latest\/1f525\/512\.webp$/);
  // Paid ones are refused until unlocked.
  await assertLocked(c.comment(post.id, 'so :rizz:'), 'emoji_locked');
  await assertLocked(c.comment(post.id, '', { kind: 'noto', id: 'stickers_party/confetti' }), 'sticker_locked');
  await assertLocked(
    c.postWall(u.id, { body: '', sticker: { kind: 'giphy', id: 'abc123', url: 'https://media1.giphy.com/media/abc123/200.webp' } }),
    'giphy_locked',
  );
  // Sparks only — packs can't be bought with Gems.
  await assert.rejects(c.buy('emoji_slang', 'gems'), (e) => e.status === 400);
  const before = (await db.users.findOne({ _id: u.id })).sparks;
  await c.buy('emoji_slang');
  await c.buy('stickers_party');
  const spent = before - (await db.users.findOne({ _id: u.id })).sparks;
  assert.ok(spent > 550 && spent <= 650, `paid 250 + 400 Sparks (less any level-up bonus the purchases earned), paid ${spent}`);
  const after = await c.stickers();
  assert.ok(after.owned.includes('emoji_slang') && after.owned.includes('stickers_party'));
  await c.comment(post.id, 'so :rizz:');
  const { conversation } = await c.openConversation((await signUp('stickfriend')).id);
  const { message } = await c.sendMessage(conversation.id, { body: '', sticker: { kind: 'noto', id: 'stickers_party/confetti' } });
  assert.equal(message.kind, 'sticker');
  assert.equal(message.sticker.label, 'Confetti');
  // Made-up stickers and non-GIPHY urls are refused.
  await assert.rejects(c.comment(post.id, '', { kind: 'noto', id: 'stickers_party/nope' }), (e) => e.status === 400);
  // The Vault lists the packs.
  const vault = await c.store();
  assert.ok(vault.items.some((i) => i.id === 'stickers_spooky' && i.kind === 'stickers' && i.gemPrice === null));
  assert.ok(vault.items.some((i) => i.id === 'giphy_stickers' && i.kind === 'unlock'));
});

async function assertLocked(p, code) {
  await assert.rejects(p, (e) => e.status === 402 && e.code === code);
}

test('friend requests: send, accept, decline, cancel, unfriend, privacy setting, personas answer', async () => {
  const a = await signUp('fra');
  const b = await signUp('frb');
  const d = await signUp('frd');
  const A = as('fra');
  const B = as('frb');
  assert.equal((await A.user(b.handle)).user.friendship, 'none');
  assert.equal((await A.addFriend(b.id)).friendship, 'outgoing');
  assert.equal((await B.user(a.handle)).user.friendship, 'incoming');
  const reqs = await B.friendRequests();
  assert.deepEqual(
    reqs.incoming.map((r) => r.user.id),
    [a.id],
  );
  assert.ok((await B.notifications()).items.some((n) => n.kind === 'friend_request' && n.link === '/friends'));
  assert.equal((await B.acceptFriend(a.id)).friendship, 'friends');
  assert.equal((await A.user(b.handle)).user.friendship, 'friends');
  assert.ok((await A.notifications()).items.some((n) => n.kind === 'friend_accepted'));
  assert.equal((await A.user(b.handle)).user.isFollowing, true, 'friends follow each other');
  assert.deepEqual(
    (await A.friends()).items.map((f) => f.user.id).filter((id) => id === b.id),
    [b.id],
  );
  assert.equal((await A.user(a.handle)).user.friendsCount >= 1, true);
  // Following back alone no longer makes friends; mutual requests do.
  await as('frd').follow(a.id);
  await A.follow(d.id);
  assert.equal((await A.user(d.handle)).user.friendship, 'none');
  await as('frd').addFriend(a.id);
  assert.equal((await A.addFriend(d.id)).friendship, 'friends', 'asking someone who already asked you = friends');
  // Decline is quiet; cancel withdraws.
  const e = await signUp('fre');
  await as('fre').addFriend(b.id);
  await B.declineFriend(e.id);
  assert.equal((await as('fre').user(b.handle)).user.friendship, 'none');
  await as('fre').addFriend(d.id);
  await as('fre').cancelFriendRequest(d.id);
  assert.deepEqual((await as('frd').friendRequests()).incoming, []);
  // Unfriend.
  await A.unfriend(b.id);
  assert.equal((await A.user(b.handle)).user.friendship, 'none');
  // Privacy: nobody can send requests.
  await B.updateSettings({ friendRequestsFrom: 'nobody' });
  await assert.rejects(as('fre').addFriend(b.id), (err) => err.status === 403);
  // Showcase friends come from friendships.
  const sc = await A.showcase(a.id, ['friends'], 10);
  assert.ok(sc.friends.some((f) => f.id === d.id) && !sc.friends.some((f) => f.id === b.id));
  // Personas answer requests (most accept) after a short while.
  await A.addFriend(MIA);
  const mia = await until(
    async () =>
      (await A.user('mia.goldenhour').catch(() => null))?.user.friendship === 'friends'
        ? true
        : (await db.friendRequests.findOne({ fromId: a.id, toId: MIA }))?.status !== 'pending'
          ? true
          : null,
    8000,
  ).catch(() => false);
  assert.ok(mia, 'the persona responded to the request');
});

test('progression: power-ups, level gates, daily check-in streak and the 7-day inactivity reset', async () => {
  const { runInactivity, setLevelGates } = await import('./lib/progression.js');
  const { itemIdFor } = await import('./lib/ids.js');
  const u = await signUp('pow');
  const stranger = await signUp('powb');
  const c = as('pow');
  await db.users.updateOne({ _id: u.id }, { $set: { sparks: 5000 } });

  // Level gate: a level-1 member can't open a DM with a stranger…
  await assert.rejects(c.openConversation(stranger.id), (e) => e.status === 403 && e.code === 'level_required');
  // …until an All-Access Pass is running.
  await c.buy('gate_pass');
  const used = await c.usePower('gate_pass');
  assert.ok(used.powers.gate_pass > new Date().toISOString());
  await c.openConversation(stranger.id);
  await assert.rejects(c.usePower('gate_pass'), (e) => e.code === 'power_missing');
  await assert.rejects(c.usePower('wipe_shield'), (e) => e.code === 'power_auto');

  // XP Surge doubles reward XP.
  await c.buy('xp_surge');
  await c.usePower('xp_surge');
  const xp0 = (await db.users.findOne({ _id: u.id })).xp;
  await c.createPost({ body: 'surging', mediaUrl: 'https://picsum.photos/seed/surge/600/800' });
  assert.ok((await db.users.findOne({ _id: u.id })).xp - xp0 >= 60, 'post XP (30) doubled');

  // Spotlight boosts the profile.
  await c.buy('spotlight');
  await c.usePower('spotlight');
  assert.equal((await as('anon').user(u.handle)).user.boosted, true);

  // Admin-adjustable gates.
  await setLevelGates({ dm: 1 });
  await as('powb').openConversation((await signUp('powc')).id);
  await setLevelGates({ dm: 3 });

  // Check-in streak: yesterday's claim → day 2 pays more than day 1.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await db.users.updateOne({ _id: u.id }, { $set: { lastDailyClaim: yesterday, loginStreak: 1 } });
  const me = await c.me();
  assert.equal(me.reward.loginStreak, 2);
  assert.equal(me.user.loginStreak, 2);

  // Inactivity: warned at 5 days away; reset at 7 unless a Comeback Shield saves them.
  await c.buy('wipe_shield');
  await c.buy('arena_shield');
  await db.inventory.updateOne({ userId: u.id, itemId: itemIdFor('frame_sunset') }, { $set: { qty: 1, via: 'gems' } }, { upsert: true });
  await wait(300); // let the last request's lastSeenAt write land first
  const away = (days) => db.users.updateOne({ _id: u.id }, { $set: { lastSeenAt: new Date(Date.now() - days * 86_400_000).toISOString() } });
  await away(5.5);
  assert.ok((await runInactivity({ force: true })).warned >= 1);
  await away(8);
  await db.users.updateOne({ _id: u.id }, { $set: { inactivityWarnedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() } });
  assert.ok((await runInactivity({ force: true })).shielded >= 1);
  assert.ok((await db.users.findOne({ _id: u.id })).xp > 0, 'the shield kept everything');
  const longAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
  await db.users.updateOne({ _id: u.id }, { $set: { wipeGraceUntil: null, gems: 40, inactivityWarned: ['final'], inactivityWarnedAt: longAgo } });
  assert.ok((await runInactivity({ force: true })).reset >= 1);
  const after = await db.users.findOne({ _id: u.id });
  assert.deepEqual([after.xp, after.sparks, after.gems], [0, 0, 40], 'level and Sparks reset, Gems kept');
  assert.ok(await db.inventory.findOne({ userId: u.id, itemId: itemIdFor('frame_sunset') }), 'Gem-bought items kept');
  assert.equal(await db.inventory.findOne({ userId: u.id, itemId: itemIdFor('arena_shield') }), null, 'Spark-bought items gone');
  assert.equal((await runInactivity({ force: true })).reset, 0, 'only reset once per absence');
});
