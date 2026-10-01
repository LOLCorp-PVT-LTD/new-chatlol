import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs against SQLite by default; set TEST_DATABASE_URL=postgres://… (and TEST_REDIS_URL) to run the same suite on Postgres/Redis.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else process.env.DATABASE_PATH = ':memory:';
if (process.env.TEST_REDIS_URL) process.env.REDIS_URL = process.env.TEST_REDIS_URL;
process.env.UPLOAD_DIR = join(tmpdir(), 'chatlol-test-uploads');
process.env.AI_PERSONAS_ENABLED = '0';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.REVENUECAT_WEBHOOK_AUTH = 'rc_secret';
process.env.TURN_URLS = 'turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349';
process.env.TURN_SECRET = 'coturn-secret';
process.env.LIVE_MAX_VIEWERS = '1';

const { createApp } = await import('./app');
const { initDb, db } = await import('./db');
const { initShared, redisClient, closeShared } = await import('./lib/shared');
const { seed } = await import('./seed');
const { attachRealtime } = await import('./realtime');
const { outbox } = await import('./lib/mailer');
const { createApi } = await import('@chatlol/shared');
const { io: ioClient } = await import('socket.io-client');

let server: Server;
let ioServer: Awaited<ReturnType<typeof attachRealtime>>;
let base = '';
let token: string | null = null;
let client: ReturnType<typeof createApi>;
const anon = () => createApi({ baseUrl: base, getToken: () => null });
const lastLink = (path: string) => {
  const m = [...outbox].reverse().find((x) => x.text.includes(path));
  return new URL(m!.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;
};

before(async () => {
  await initShared();
  await initDb();
  await redisClient()?.flushdb();
  await seed(true);
  server = createServer(createApp());
  ioServer = await attachRealtime(server);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  client = createApi({ baseUrl: base, getToken: () => token });
});
after(async () => {
  await new Promise<void>((r) => ioServer.close(() => r()));
  server.closeAllConnections();
  await db.close();
  await closeShared();
});

test('rejects under-18 signups', async () => {
  const minor = new Date(Date.now() - 17 * 365.25 * 86_400_000).toISOString().slice(0, 10);
  await assert.rejects(
    client.register({ email: 'kid@example.com', password: 'password123', handle: 'kiddo', displayName: 'Kid', birthdate: minor }),
    (e: any) => e.status === 403 && e.code === 'underage',
  );
});

test('register → verification email → me → daily bonus', async () => {
  const r = await client.register({ email: 'sam@example.com', password: 'password123', handle: 'sam_sunset', displayName: 'Sam', birthdate: '1998-04-01', interests: ['lofi'] });
  token = r.token;
  assert.equal(r.user.handle, 'sam_sunset');
  assert.equal(r.user.emailVerified, false);
  assert.match(outbox.at(-1)!.subject, /Confirm/);
  const me = await client.me();
  assert.ok(me.reward && me.reward.sparks > 0, 'first open grants daily bonus');
  assert.equal((await client.me()).reward, null);
  await assert.rejects(client.register({ email: 'other@example.com', password: 'password123', handle: 'SAM_SUNSET', displayName: 'x', birthdate: '1990-01-01' }), (e: any) => e.code === 'handle_taken');
});

test('email verification is single-use and grants a bonus', async () => {
  const t = lastLink('/verify');
  const before = (await client.me()).user.sparks;
  await anon().verifyEmail(t);
  const me = (await client.me()).user;
  assert.equal(me.emailVerified, true);
  assert.equal(me.sparks, before + 50);
  await assert.rejects(anon().verifyEmail(t), (e: any) => e.code === 'invalid_token');
});

test('feed, rating, quest progress', async () => {
  const feed = await client.feed();
  assert.ok(feed.items.length > 0);
  const target = feed.items.find((p) => p.author.handle !== 'sam_sunset' && !p.myRating)!;
  const r = await client.rate(target.id, 5);
  assert.equal(r.post.myRating, 5);
  assert.ok(r.reward && r.reward.xp > 0);
  assert.equal((await client.me()).user.dailyGoal.done, 1);
  assert.ok((await client.feed({ tab: 'top' })).items.length > 0);
  assert.ok((await client.trending()).top.length > 0);
});

test('cannot rate own post; can post & comment; moderation', async () => {
  const { post, reward } = await client.createPost({ body: 'first post #goldenhour' });
  assert.deepEqual(post.tags, ['goldenhour']);
  assert.ok(reward);
  await assert.rejects(client.rate(post.id, 5), (e: any) => e.status === 400);
  const c = await client.comment(post.id, 'nice');
  assert.equal(c.comment.body, 'nice');
  await assert.rejects(client.comment(post.id, 'kys'), (e: any) => e.status === 422);
});

test('roulette hides consensus until vote, then scores', async () => {
  const card = await client.rouletteNext();
  assert.ok(card);
  assert.deepEqual(card!.post.ratings.dist, [0, 0, 0, 0, 0]);
  const res = await client.rouletteVote(card!.post.id, 4);
  assert.equal(typeof res.match, 'boolean');
  assert.ok(res.ratings.count >= 1);
  await assert.rejects(client.rouletteVote(card!.post.id, 4), (e: any) => e.status === 409);
});

test('daily drop once per day + streak', async () => {
  const d = await client.drop();
  assert.ok(d.drop.prompt);
  const r = await client.submitDrop({ body: 'my drop', mediaUrl: 'https://picsum.photos/seed/x/600/800' });
  assert.equal(r.post.kind, 'drop');
  assert.match(r.reward!.reason, /1 day streak/);
  await assert.rejects(client.submitDrop({ body: 'again', mediaUrl: 'https://picsum.photos/seed/y/600/800' }), (e: any) => e.status === 409);
});

test('arena: stake deducts sparks atomically, no double stake, resolution pays out once', async () => {
  const { takes } = await client.hotTakes();
  const before = (await client.me()).user.sparks;
  const r = await client.stake(takes[0].id, 'agree', 10);
  assert.equal(r.sparks, before - 10);
  await assert.rejects(client.stake(takes[0].id, 'disagree', 10), (e: any) => e.status === 409);
  const { resolveExpiredTakes } = await import('./routes/arena');
  await db.run('UPDATE hot_takes SET ends_at = ? WHERE id = ?', new Date(Date.now() - 1000).toISOString(), takes[0].id);
  await Promise.all([resolveExpiredTakes(), resolveExpiredTakes()]); // two "instances" racing
  const resolved = await db.one<any>('SELECT resolved FROM hot_takes WHERE id = ?', takes[0].id);
  assert.equal(resolved.resolved, 1);
  const wins = await db.all('SELECT * FROM notifications WHERE user_id = (SELECT id FROM users WHERE handle = ?) AND kind = ?', 'sam_sunset', 'arena');
  assert.equal(wins.length, 1, 'exactly one payout notification');
});

test('store: sparks & gems currencies, crates are sparks-only', async () => {
  const { items } = await client.store();
  const flair = items.find((i) => i.id === 'flair_fire')!;
  assert.equal(flair.gemPrice, 12);
  assert.equal(items.find((i) => i.kind === 'crate')!.gemPrice, null);
  await client.buy(flair.id);
  assert.equal((await client.equip({ flair: 'flair_fire' })).user.cosmetics.flair, 'flair_fire');
  await assert.rejects(client.equip({ frame: 'frame_god' }), (e: any) => e.status === 403);
  await assert.rejects(client.buy('frame_god'), (e: any) => e.status === 402);
  await assert.rejects(client.buy('crate_sunset', 'gems'), (e: any) => e.code === 'sparks_only');
  await assert.rejects(client.buy('flair_sparkle', 'gems'), (e: any) => e.code === 'insufficient_gems');
});

test('payments: Stripe webhook (signed, idempotent) and RevenueCat webhook credit Gems; refunds claw back', async () => {
  const me = (await client.me()).user;
  const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_intent: 'pi_1', payment_status: 'paid', amount_total: 999, currency: 'usd', metadata: { user_id: me.id, pack_id: 'gems_1000' } } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', 'whsec_test').update(`${t}.${event}`).digest('hex');
  const post = (s: string) => fetch(`${base}/api/payments/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${s}` }, body: event });
  assert.equal((await post('deadbeef')).status, 400, 'bad signature rejected');
  assert.equal((await post(sig)).status, 200);
  assert.equal((await post(sig)).status, 200, 'retry is fine');
  assert.equal((await client.me()).user.gems, 1000, 'credited once');

  const rc = (body: object, auth = 'Bearer rc_secret') => fetch(`${base}/api/payments/revenuecat/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(body) });
  assert.equal((await rc({ event: {} }, 'Bearer nope')).status, 401);
  assert.equal((await rc({ event: { type: 'NON_RENEWING_PURCHASE', id: 'e1', transaction_id: 'tx1', app_user_id: me.id, product_id: 'gems_80', store: 'APP_STORE', environment: 'SANDBOX' } })).status, 200);
  assert.equal((await client.me()).user.gems, 1080);
  await rc({ event: { type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', transaction_id: 'tx1', app_user_id: me.id, product_id: 'gems_80' } });
  assert.equal((await client.me()).user.gems, 1000, 'refund clawed back');

  const r = await client.buy('flair_sparkle', 'gems');
  assert.equal(r.gems, 988);
});

test('password reset: generic response, single-use token, old sessions revoked', async () => {
  const oldToken = token;
  await anon().forgotPassword('nobody@example.com'); // no error for unknown emails
  await anon().forgotPassword('sam@example.com');
  const t = lastLink('/reset-password');
  const r = await anon().resetPassword(t, 'newpassword456');
  assert.ok(r.token);
  await assert.rejects(anon().resetPassword(t, 'again12345'), (e: any) => e.code === 'invalid_token');
  token = oldToken;
  await assert.rejects(client.me(), (e: any) => e.status === 401, 'old session revoked');
  token = (await anon().login({ login: 'sam_sunset', password: 'newpassword456' })).token;
  assert.ok((await client.me()).user);
});

test('DMs with an AI persona + AI flag disclosed; deterministic 1:1 conversation id', async () => {
  const { user } = await client.user('mia.goldenhour');
  assert.equal(user.isAI, true);
  const [a, b] = await Promise.all([client.openConversation(user.id), client.openConversation(user.id)]);
  assert.equal(a.conversation.id, b.conversation.id);
  const { message } = await client.sendMessage(a.conversation.id, { body: 'hey!' });
  assert.equal(message.body, 'hey!');
});

test('shouts, lounges, leaderboard', async () => {
  const { boards } = await client.boards();
  const t = await client.createThread({ board: boards[0].id, title: 'Test thread title', body: 'hello' });
  await client.replyThread(t.thread.id, 'reply');
  assert.equal((await client.voteThread(t.thread.id, 1)).thread.myVote, 1);
  assert.ok((await client.threads({ sort: 'hot' })).items.length > 0);
  assert.ok((await client.lounges()).lounges.length >= 5);
  for (const k of ['vibe', 'xp', 'streak'] as const) assert.ok((await client.leaderboard(k)).entries.length > 0);
});

test('live video: TURN creds, verified-only go-live, mesh signalling relay with viewer cap', async () => {
  const ice = await client.iceServers();
  const turn = ice.iceServers.find((s) => String(s.urls).includes('turn:'))!;
  const expected = createHmac('sha1', 'coturn-secret').update(turn.username!).digest('base64');
  assert.equal(turn.credential, expected, 'coturn REST credential');
  assert.match(turn.username!, /^\d+:u_/);
  assert.equal(ice.maxViewers, 1);

  const host = await anon().register({ email: 'host@example.com', password: 'password123', handle: 'hostess', displayName: 'Host', birthdate: '1995-01-01' });
  const hostApi = createApi({ baseUrl: base, getToken: () => host.token });
  await assert.rejects(hostApi.goLive({ title: 'sunset session', category: 'Music' }), (e: any) => e.code === 'email_unverified');
  await anon().verifyEmail(lastLink('/verify'));
  const { stream } = await hostApi.goLive({ title: 'sunset session', category: 'Music', video: true });
  assert.equal(stream.video, true);

  const connect = (tk: string) => new Promise<any>((res) => { const s = ioClient(base, { auth: { token: tk }, transports: ['websocket'] }); s.on('connect', () => res(s)); });
  const hs = await connect(host.token);
  const vs = await connect(token!);
  const third = await anon().register({ email: 'v2@example.com', password: 'password123', handle: 'viewer2', displayName: 'V2', birthdate: '1995-01-01' });
  const v2 = await connect(third.token);
  const ack = <T>(s: any, ev: string, arg: unknown) => new Promise<T>((r) => s.emit(ev, arg, r));
  const once = <T>(s: any, ev: string) => new Promise<T>((r) => s.once(ev, r));

  assert.deepEqual(await ack(hs, 'rtc:host', stream.id), { ok: true });
  vs.emit('stream:join', stream.id);
  v2.emit('stream:join', stream.id);
  await new Promise((r) => setTimeout(r, 150));
  const joined = once<any>(hs, 'rtc:viewer-joined');
  assert.deepEqual(await ack(vs, 'rtc:watch', stream.id), { ok: true });
  const { peer } = await joined;
  assert.equal(peer, vs.id);
  assert.deepEqual(await ack(v2, 'rtc:watch', stream.id), { ok: false, reason: 'full' }, 'mesh cap enforced');

  // Host → viewer offer, viewer → host answer, both relayed with sender ids.
  const gotOffer = once<any>(vs, 'rtc:signal');
  hs.emit('rtc:signal', { streamId: stream.id, peer: vs.id, description: { type: 'offer', sdp: 'v=0 offer' } });
  const offer = await gotOffer;
  assert.equal(offer.peer, hs.id);
  assert.equal(offer.description.sdp, 'v=0 offer');
  const gotAnswer = once<any>(hs, 'rtc:signal');
  vs.emit('rtc:signal', { streamId: stream.id, peer: hs.id, description: { type: 'answer', sdp: 'v=0 answer' } });
  assert.equal((await gotAnswer).description.type, 'answer');

  // A viewer that wasn't admitted can't signal the host.
  let leaked = false;
  hs.once('rtc:signal', () => (leaked = true));
  v2.emit('rtc:signal', { streamId: stream.id, peer: hs.id, description: { type: 'answer', sdp: 'evil' } });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(leaked, false);

  const left = once<any>(hs, 'rtc:peer-left');
  vs.emit('rtc:unwatch', stream.id);
  assert.equal((await left).peer, vs.id);
  assert.deepEqual(await ack(v2, 'rtc:watch', stream.id), { ok: true }, 'slot frees up');

  const before = (await client.me()).user.sparks;
  assert.equal((await client.sendGift(stream.id, 'gift_spark')).sparks, before - 5);
  [hs, vs, v2].forEach((s) => s.close());
});

test('uploads reject non-images by content, not extension', async () => {
  const form = new FormData();
  form.append('file', new Blob(['<html><script>alert(1)</script></html>'], { type: 'image/png' }), 'evil.png');
  await assert.rejects(client.upload(form), (e: any) => e.status === 415);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c00000000049454e44ae426082', 'hex');
  const ok = new FormData();
  ok.append('file', new Blob([png], { type: 'image/png' }), 'dot.png');
  assert.match((await client.upload(ok)).url, /\/uploads\/u_[a-z0-9]+\.png$/);
});

test('account deletion', async () => {
  await client.deleteAccount();
  await assert.rejects(client.me(), (e: any) => e.status === 401);
});
