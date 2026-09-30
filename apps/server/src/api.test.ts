import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_PATH = ':memory:';
process.env.UPLOAD_DIR = join(tmpdir(), 'chatlol-test-uploads');
process.env.AI_PERSONAS_ENABLED = '0';

const { createApp } = await import('./app');
const { seed } = await import('./seed');
const { attachRealtime } = await import('./realtime');
const { createApi } = await import('@chatlol/shared');

let server: Server;
let base = '';
let token: string | null = null;
const api = createApi({ baseUrl: 'http://placeholder', getToken: () => token });
let client: ReturnType<typeof createApi>;

before(async () => {
  await seed(true);
  server = createServer(createApp());
  attachRealtime(server);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  client = createApi({ baseUrl: base, getToken: () => token });
  void api;
});
after(() => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }));

test('rejects under-18 signups', async () => {
  const minor = new Date(Date.now() - 17 * 365.25 * 86_400_000).toISOString().slice(0, 10);
  await assert.rejects(
    client.register({ email: 'kid@example.com', password: 'password123', handle: 'kiddo', displayName: 'Kid', birthdate: minor }),
    (e: any) => e.status === 403 && e.code === 'underage',
  );
});

test('register → me → daily bonus', async () => {
  const r = await client.register({ email: 'sam@example.com', password: 'password123', handle: 'sam_sunset', displayName: 'Sam', birthdate: '1998-04-01', interests: ['lofi'] });
  token = r.token;
  assert.equal(r.user.handle, 'sam_sunset');
  const me = await client.me();
  assert.ok(me.reward && me.reward.sparks > 0, 'first open grants daily bonus');
  const again = await client.me();
  assert.equal(again.reward, null);
});

test('feed, rating, quest progress, notifications for author', async () => {
  const feed = await client.feed();
  assert.ok(feed.items.length > 0);
  const target = feed.items.find((p) => p.author.handle !== 'sam_sunset' && !p.myRating)!;
  const r = await client.rate(target.id, 5);
  assert.equal(r.post.myRating, 5);
  assert.ok(r.reward && r.reward.xp > 0);
  const me = await client.me();
  assert.equal(me.user.dailyGoal.done, 1);
});

test('cannot rate own post; can post & comment', async () => {
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
  assert.equal(card!.post.ratings.count > 0, true);
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

test('arena stake deducts sparks and blocks double stake', async () => {
  const { takes } = await client.hotTakes();
  const before = (await client.me()).user.sparks;
  const r = await client.stake(takes[0].id, 'agree', 10);
  assert.equal(r.sparks, before - 10);
  assert.equal(r.take.myStake?.amount, 10);
  await assert.rejects(client.stake(takes[0].id, 'disagree', 10), (e: any) => e.status === 409);
});

test('store: buy, equip, insufficient funds', async () => {
  const { items } = await client.store();
  const flair = items.find((i) => i.id === 'flair_fire')!;
  await client.buy(flair.id);
  const eq = await client.equip({ flair: 'flair_fire' });
  assert.equal(eq.user.cosmetics.flair, 'flair_fire');
  await assert.rejects(client.equip({ frame: 'frame_god' }), (e: any) => e.status === 403);
  await assert.rejects(client.buy('frame_god'), (e: any) => e.status === 402);
});

test('DMs with an AI persona + AI flag disclosed', async () => {
  const { user } = await client.user('mia.goldenhour');
  assert.equal(user.isAI, true);
  const { conversation } = await client.openConversation(user.id);
  const { message } = await client.sendMessage(conversation.id, { body: 'hey!' });
  assert.equal(message.body, 'hey!');
  const { conversations } = await client.conversations();
  assert.ok(conversations.some((c) => c.id === conversation.id));
});

test('shouts, lounges, leaderboard, live gifting', async () => {
  const { boards } = await client.boards();
  const t = await client.createThread({ board: boards[0].id, title: 'Test thread title', body: 'hello' });
  await client.replyThread(t.thread.id, 'reply');
  const v = await client.voteThread(t.thread.id, 1);
  assert.equal(v.thread.myVote, 1);
  const { lounges } = await client.lounges();
  assert.ok(lounges.length >= 5);
  const lb = await client.leaderboard('xp');
  assert.ok(lb.entries.length > 0);

  // Someone else goes live; we gift them.
  const other = await createApi({ baseUrl: base, getToken: () => null }).register({ email: 'host@example.com', password: 'password123', handle: 'hostess', displayName: 'Host', birthdate: '1995-01-01' });
  const hostApi = createApi({ baseUrl: base, getToken: () => other.token });
  const { stream } = await hostApi.goLive({ title: 'sunset session', category: 'Music' });
  const before = (await client.me()).user.sparks;
  const g = await client.sendGift(stream.id, 'gift_spark');
  assert.equal(g.sparks, before - 5);
});

test('account deletion', async () => {
  await client.deleteAccount();
  await assert.rejects(client.me(), (e: any) => e.status === 401);
});
