import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http2 from 'node:http2';
import { createECDH, createPublicKey, createVerify, generateKeyPairSync, randomBytes, verify } from 'node:crypto';

/**
 * Push through the platforms' own services, against local stand-ins that check what Apple / Google / a browser
 * push service would: APNs (HTTP/2, ES256 provider token signed with the .p8 key), FCM HTTP v1 (OAuth with a
 * service-account-signed RS256 assertion) and Web Push (VAPID-signed, aes128gcm-encrypted). Dead tokens are removed.
 */
const apnsKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const fcmKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const got = { apns: [], fcm: [], web: [], fcmAuth: 0 };

// ——— APNs stand-in (HTTP/2 cleartext) ———
const apns = http2.createServer();
apns.on('stream', (stream, h) => {
  let body = '';
  stream.on('data', (c) => (body += c));
  stream.on('end', () => {
    const [head, claims, sig] = String(h.authorization).replace('bearer ', '').split('.');
    const ok = verify('sha256', Buffer.from(`${head}.${claims}`), { key: apnsKey.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
    const token = h[':path'].split('/').pop();
    got.apns.push({ token, topic: h['apns-topic'], ok, kid: JSON.parse(Buffer.from(head, 'base64url')).kid, iss: JSON.parse(Buffer.from(claims, 'base64url')).iss, body: JSON.parse(body) });
    const dead = token === 'dead'.padEnd(64, '0');
    stream.respond({ ':status': !ok ? 403 : dead ? 410 : 200 });
    stream.end(dead ? JSON.stringify({ reason: 'Unregistered' }) : '');
  });
});

// ——— FCM + Google OAuth stand-in ———
const fcm = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.url === '/token') {
      const assertion = new URLSearchParams(body).get('assertion');
      const [h, c, s] = assertion.split('.');
      const v = createVerify('RSA-SHA256');
      v.update(`${h}.${c}`);
      if (!v.verify(fcmKey.publicKey, Buffer.from(s, 'base64url'))) return res.writeHead(401).end();
      got.fcmAuth++;
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }));
    }
    if (req.headers.authorization !== 'Bearer ya29.test') return res.writeHead(401).end();
    const msg = JSON.parse(body).message;
    got.fcm.push({ url: req.url, ...msg });
    if (msg.token === 'dead-android-token') return res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }));
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"name":"projects/p/messages/1"}');
  });
});

// ——— Browser push service stand-in (push services are always HTTPS; this one has a throwaway certificate) ———
const certDir = mkdtempSync(join(tmpdir(), 'chatlol-push-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1', '-keyout', join(certDir, 'k.pem'), '-out', join(certDir, 'c.pem')], { stdio: 'ignore' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // trust the throwaway certificate in this test process only
const pushService = createHttpsServer({ key: readFileSync(join(certDir, 'k.pem')), cert: readFileSync(join(certDir, 'c.pem')) }, (req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    got.web.push({ url: req.url, auth: req.headers.authorization, encoding: req.headers['content-encoding'], ttl: req.headers.ttl, size: Buffer.concat(chunks).length });
    res.writeHead(req.url === '/gone' ? 410 : 201).end();
  });
});

await Promise.all([apns, fcm, pushService].map((s) => new Promise((r) => s.listen(0, '127.0.0.1', r))));
process.env.APNS_TEAM_ID = 'TEAM123456';
process.env.APNS_KEY_ID = 'KEY1234567';
process.env.APNS_KEY = apnsKey.privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n');
process.env.APNS_BUNDLE_ID = 'app.chatlol';
process.env.APNS_HOST = `http://127.0.0.1:${apns.address().port}`;
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'chatlol-test', client_email: 'push@chatlol-test.iam.gserviceaccount.com', private_key: fcmKey.privateKey.export({ type: 'pkcs8', format: 'pem' }) });
process.env.FCM_BASE_URL = `http://127.0.0.1:${fcm.address().port}`;
process.env.FCM_TOKEN_URL = `http://127.0.0.1:${fcm.address().port}/token`;
process.env.RATE_LIMIT_SCALE = '50';

const { useTestMongo } = await import('./testDb.js');
const mongo = await useTestMongo('push');
const { initDb, db } = await import('./db.js');
const { sendPush } = await import('./lib/push.js');
const { createApp } = await import('./app.js');
const { createApi } = await import('@chatlol/shared');
let server;
let api;
let user;

before(async () => {
  await initDb();
  server = createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const r = await createApi({ baseUrl: base, getToken: () => null }).register({
    email: 'push@example.com',
    password: 'password123',
    handle: 'pushy',
    displayName: 'Pushy',
    birthdate: '1990-01-01',
    gender: 'female',
  });
  user = r.user;
  api = createApi({ baseUrl: base, getToken: () => r.token });
});
after(async () => {
  server.closeAllConnections();
  server.close();
  [apns, fcm, pushService].forEach((s) => s.close());
  await db.dropDatabase({ reindex: false });
  await db.close();
  await mongo.stop();
  setTimeout(() => process.exit(0), 50).unref();
});

const webSub = (path) => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { endpoint: `https://127.0.0.1:${pushService.address().port}${path}`, keys: { p256dh: ecdh.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url') } };
};

test('devices register their native tokens (Expo tokens are refused) and web browsers their subscriptions', async () => {
  await api.registerPushToken({ token: 'a'.repeat(64), platform: 'ios' });
  await api.registerPushToken({ token: 'dead'.padEnd(64, '0'), platform: 'ios' });
  await api.registerPushToken({ token: 'android-fcm-token-123', platform: 'android' });
  await api.registerPushToken({ token: 'dead-android-token', platform: 'android' });
  await assert.rejects(api.registerPushToken({ token: 'ExponentPushToken[abc123]', platform: 'ios' }), (e) => e.status === 400);
  const { publicKey } = await api.webPushKey();
  assert.equal(Buffer.from(publicKey, 'base64url').length, 65, 'an uncompressed P-256 VAPID public key');
  assert.equal((await api.webPushKey()).publicKey, publicKey, 'the generated VAPID keys are kept');
  await api.saveWebPush(webSub('/sub-1'));
  await api.saveWebPush(webSub('/gone'));
  assert.equal(await db.pushTokens.countDocuments({ userId: user.id }), 6);
});

test('one notification reaches the iPhone (APNs), the Android phone (FCM) and the browser (Web Push)', async () => {
  const r = await sendPush(user.id, 'Mia liked your photo', '🔥 Fire', { link: '/p/123' });
  assert.equal(r.sent, 3);
  const ios = got.apns.find((x) => x.token === 'a'.repeat(64));
  assert.ok(ios.ok, 'APNs provider token is signed with the .p8 key');
  assert.equal(ios.kid, 'KEY1234567');
  assert.equal(ios.iss, 'TEAM123456');
  assert.equal(ios.topic, 'app.chatlol');
  assert.deepEqual(ios.body.aps.alert, { title: 'Mia liked your photo', body: '🔥 Fire' });
  assert.equal(ios.body.link, '/p/123');
  assert.equal(got.fcmAuth, 1, 'FCM OAuth token fetched with a signed service-account assertion');
  const android = got.fcm.find((x) => x.token === 'android-fcm-token-123');
  assert.equal(android.url, '/v1/projects/chatlol-test/messages:send');
  assert.equal(android.notification.title, 'Mia liked your photo');
  assert.equal(android.data.link, '/p/123');
  assert.equal(android.android.notification.channel_id, 'default');
  const web = got.web.find((x) => x.url === '/sub-1');
  assert.match(web.auth, /^vapid t=.+, k=.+/);
  assert.equal(web.encoding, 'aes128gcm');
  assert.ok(web.size > 0, 'the payload is encrypted for the browser');
});

test('tokens the services report as gone are deleted; working ones stay', async () => {
  const left = (await db.pushTokens.find({ userId: user.id }).toArray()).map((d) => d.token).sort();
  assert.deepEqual(left, ['a'.repeat(64), 'android-fcm-token-123', webSub('/sub-1').endpoint].sort());
  await sendPush(user.id, 'again', 'x');
  assert.equal(got.fcmAuth, 1, 'the OAuth token is reused');
});
