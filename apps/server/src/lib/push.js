import { createSign, sign as cryptoSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import http2 from 'node:http2';
import webpush from 'web-push';
import { config } from '../config.js';
import { db } from '../db.js';

/**
 * Push notifications through each platform's own free service — no paid or third-party push provider:
 *  - iOS (APNs): HTTP/2 to Apple with a token signed by your developer account's .p8 key.
 *  - Android (FCM HTTP v1): Firebase with a service-account key.
 *  - Web (Web Push / VAPID): the browser's own push service (Chrome, Firefox, Edge, Safari 16.4+).
 * The desktop app gets notifications over its live socket and shows them with the OS notification centre.
 * Device tokens that the service reports as dead are deleted.
 */

/** Reads a secret given either inline (with \n escapes) or as a path to a file. */
function secret(v) {
  if (!v) return '';
  if (v.trim().startsWith('{')) return v; // JSON keeps its own \n escapes
  if (!v.includes('\n') && !v.includes('\\n') && existsSync(v)) return readFileSync(v, 'utf8');
  return v.replace(/\\n/g, '\n');
}
const b64url = (b) => Buffer.from(b).toString('base64url');

// ——— Apple Push Notification service ———
const apnsCfg = config.push.apns;
export const apnsConfigured = () => !!(apnsCfg.teamId && apnsCfg.keyId && apnsCfg.key);
let apnsJwt = { token: '', at: 0 };
function apnsToken() {
  // Apple wants a fresh token at most every 60 minutes and at least every 20; reuse for 50.
  if (apnsJwt.token && Date.now() - apnsJwt.at < 50 * 60_000) return apnsJwt.token;
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: apnsCfg.keyId }));
  const claims = b64url(JSON.stringify({ iss: apnsCfg.teamId, iat: Math.floor(Date.now() / 1000) }));
  const sig = cryptoSign('sha256', Buffer.from(`${head}.${claims}`), { key: secret(apnsCfg.key), dsaEncoding: 'ieee-p1363' });
  apnsJwt = { token: `${head}.${claims}.${b64url(sig)}`, at: Date.now() };
  return apnsJwt.token;
}
let apnsSession = null;
function apnsClient() {
  const host = apnsCfg.host || (apnsCfg.env === 'production' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com');
  if (!apnsSession || apnsSession.closed || apnsSession.destroyed) {
    apnsSession = http2.connect(host);
    apnsSession.on('error', () => (apnsSession = null));
    apnsSession.on('goaway', () => (apnsSession = null));
    apnsSession.unref();
  }
  return apnsSession;
}
/** Returns 'ok', 'dead' (token no longer valid) or 'error'. */
function sendApns(token, { title, body, data, badge }) {
  return new Promise((resolve) => {
    let client;
    try {
      client = apnsClient();
    } catch {
      return resolve('error');
    }
    const payload = JSON.stringify({ aps: { alert: { title, body }, sound: 'default', ...(badge != null ? { badge } : {}) }, ...data });
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${apnsToken()}`,
      'apns-topic': apnsCfg.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });
    let status = 0;
    let raw = '';
    req.setEncoding('utf8');
    req.on('response', (h) => (status = Number(h[':status'])));
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (status === 200) return resolve('ok');
      const reason = (() => {
        try {
          return JSON.parse(raw).reason;
        } catch {
          return '';
        }
      })();
      resolve(status === 410 || ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'].includes(reason) ? 'dead' : 'error');
    });
    req.on('error', () => resolve('error'));
    req.setTimeout(10_000, () => {
      req.close();
      resolve('error');
    });
    req.end(payload);
  });
}

// ——— Firebase Cloud Messaging (HTTP v1) ———
const fcmCfg = config.push.fcm;
let fcmAccount = null;
function fcmServiceAccount() {
  if (fcmAccount !== null) return fcmAccount;
  try {
    fcmAccount = fcmCfg.serviceAccount ? JSON.parse(secret(fcmCfg.serviceAccount)) : false;
  } catch (e) {
    console.warn('[push] FIREBASE_SERVICE_ACCOUNT is not valid JSON:', e.message);
    fcmAccount = false;
  }
  return fcmAccount;
}
export const fcmConfigured = () => !!fcmServiceAccount();
let fcmAccess = { token: '', exp: 0 };
let fcmPending = null;
/** One OAuth fetch at a time: notifications sent together share it. */
function fcmAccessToken() {
  if (fcmAccess.token && fcmAccess.exp > Date.now() + 60_000) return Promise.resolve(fcmAccess.token);
  fcmPending ??= fetchFcmAccessToken().finally(() => (fcmPending = null));
  return fcmPending;
}
async function fetchFcmAccessToken() {
  const sa = fcmServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: fcmCfg.tokenUrl, iat: now, exp: now + 3600 }),
  );
  const s = createSign('RSA-SHA256');
  s.update(`${head}.${claims}`);
  const assertion = `${head}.${claims}.${b64url(s.sign(sa.private_key))}`;
  const r = await fetch(fcmCfg.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`FCM auth failed (${r.status})`);
  const j = await r.json();
  fcmAccess = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return fcmAccess.token;
}
async function sendFcm(token, { title, body, data }) {
  try {
    const sa = fcmServiceAccount();
    const r = await fetch(`${fcmCfg.baseUrl}/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await fcmAccessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          // FCM data values must be strings.
          data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])),
          android: { priority: 'high', notification: { channel_id: 'default', sound: 'default', color: '#ff5e00' } },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) return 'ok';
    const err = await r.json().catch(() => ({}));
    const code = err?.error?.details?.find?.((d) => d.errorCode)?.errorCode ?? err?.error?.status;
    return r.status === 404 || code === 'UNREGISTERED' || (code === 'INVALID_ARGUMENT' && /token/i.test(err?.error?.message ?? '')) ? 'dead' : 'error';
  } catch {
    return 'error';
  }
}

// ——— Web Push (VAPID) ———
let vapid = null;
/** VAPID keys from the env, or generated once and kept in the database so browser subscriptions survive restarts. */
export async function vapidKeys() {
  if (vapid) return vapid;
  const w = config.push.web;
  if (w.publicKey && w.privateKey) vapid = { publicKey: w.publicKey, privateKey: w.privateKey };
  else {
    const kv = db.kv.raw;
    const stored = await kv.findOne({ _id: 'config:vapid' });
    if (stored?.v) vapid = JSON.parse(stored.v);
    else {
      const fresh = webpush.generateVAPIDKeys();
      await kv.updateOne({ _id: 'config:vapid' }, { $setOnInsert: { v: JSON.stringify(fresh), exp: null } }, { upsert: true });
      vapid = JSON.parse((await kv.findOne({ _id: 'config:vapid' })).v); // another instance may have won the race
    }
  }
  webpush.setVapidDetails(w.subject, vapid.publicKey, vapid.privateKey);
  return vapid;
}
async function sendWeb(subscription, { title, body, data }) {
  try {
    await vapidKeys();
    await webpush.sendNotification(subscription, JSON.stringify({ title, body, ...data }), { TTL: 3600, urgency: 'high' });
    return 'ok';
  } catch (e) {
    return e.statusCode === 404 || e.statusCode === 410 ? 'dead' : 'error';
  }
}

/** Sends a notification to every device the user has registered. */
export async function sendPush(userId, title, body, data = {}) {
  const devices = await db.pushTokens.find({ userId }).toArray();
  if (!devices.length) return { sent: 0 };
  const msg = { title, body, data };
  let sent = 0;
  await Promise.all(
    devices.map(async (d) => {
      const provider = d.provider ?? (d.platform === 'ios' ? 'apns' : d.platform === 'android' ? 'fcm' : null);
      let r = 'error';
      if (provider === 'apns' && apnsConfigured()) r = await sendApns(d.token, msg);
      else if (provider === 'fcm' && fcmConfigured()) r = await sendFcm(d.token, msg);
      else if (provider === 'webpush' && d.subscription) r = await sendWeb(d.subscription, msg);
      else return;
      if (r === 'ok') sent++;
      if (r === 'dead') await db.pushTokens.deleteOne({ _id: d._id });
    }),
  );
  return { sent };
}

/** For tests: forget cached credentials and connections after the config changes. */
export function resetPushState() {
  apnsJwt = { token: '', at: 0 };
  apnsSession?.close();
  apnsSession = null;
  fcmAccount = null;
  fcmAccess = { token: '', exp: 0 };
  vapid = null;
}
