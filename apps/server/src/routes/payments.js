import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { GEM_PACKS, PREMIUM_PLANS, gemPack, premiumPlan } from '@chatlol/shared';
import { extendPremium } from './profile.js';
import { db, now } from '../db.js';
import { requireAuth, uid } from '../lib/auth.js';
import { HttpError, parse, rateLimit } from '../lib/http.js';
import { emitWallet, notify } from '../lib/rewards.js';
import { config } from '../config.js';

/**
 * Buying Gems with real money.
 *  - iOS / Android: in-app purchase through RevenueCat (required by App Store & Play rules for digital goods).
 *    RevenueCat calls our webhook; the app user id is our user id.
 *  - Web / desktop: Stripe Checkout; Stripe calls our webhook.
 * Every credit goes through `creditPurchase`, keyed by the provider's transaction id, so retries never double-credit.
 */
export const paymentsRouter = Router();

paymentsRouter.get('/payments/packs', (_req, res) => {
  res.json({
    packs: GEM_PACKS,
    premiumPlans: PREMIUM_PLANS,
    stripe: !!config.payments.stripeSecretKey,
    iap: !!config.payments.revenueCatWebhookAuth,
  });
});

export async function creditPurchase(p) {
  const pack = gemPack(p.productId);
  const plan = premiumPlan(p.productId);
  if (!pack && !plan) throw new HttpError(400, `Unknown product ${p.productId}`);
  const gems = pack ? pack.gems + pack.bonus : 0;
  let premiumUntil = null;
  const credited = await db.tx(async () => {
    if (!(await db.users.findOne({ _id: p.userId }, { projection: { _id: 1 } }))) return false;
    // The provider's transaction id is unique (providerTxId), so a retried webhook can't credit twice.
    const fresh = await db.purchases.insertIfMissing(
      { providerTxId: p.id },
      {
        userId: p.userId,
        provider: p.provider,
        productId: p.productId,
        gems,
        premiumDays: plan?.days ?? 0,
        amountCents: p.amountCents ?? null,
        currency: p.currency ?? null,
        status: 'completed',
        createdAt: now(),
      },
    );
    if (!fresh) return false;
    if (pack) await db.users.updateOne({ _id: p.userId }, { $inc: { gems } });
    if (plan) premiumUntil = await extendPremium(p.userId, plan.days);
    return true;
  });
  if (credited) {
    await notify(p.userId, {
      kind: 'system',
      title: pack ? `+${gems} Gems landed 💎` : 'Welcome to Premium 👑',
      body: pack
        ? `${pack.label} — thanks for supporting ChatLOL!`
        : `${plan.label} active until ${new Date(premiumUntil).toDateString()}.`,
      link: pack ? '/vault' : '/insights',
    });
    await emitWallet(p.userId);
  }
  return credited;
}

/** Refunds claw the Gems back (never below zero) or take the Premium days back, and mark the purchase. */
export async function refundPurchase(id) {
  const done = await db.tx(async () => {
    // Flipping the status is the claim: only one refund event can win it.
    const p = await db.purchases.findOneAndUpdate({ providerTxId: id, status: 'completed' }, { $set: { status: 'refunded' } });
    if (!p) return null;
    if (p.gems) await db.users.updateOne({ _id: p.userId }, [{ $set: { gems: { $max: [0, { $subtract: ['$gems', p.gems] }] } } }]);
    if (p.premiumDays) {
      const u = await db.users.findOne({ _id: p.userId }, { projection: { premium: 1 } });
      if (u?.premium?.until) {
        const until = new Date(Date.parse(u.premium.until) - p.premiumDays * 86_400_000).toISOString();
        await db.users.updateOne({ _id: p.userId }, { $set: { 'premium.until': until } });
      }
    }
    return p.userId;
  });
  if (done) await emitWallet(done);
  return !!done;
}

paymentsRouter.get('/payments/history', requireAuth, async (req, res) => {
  const rows = await db.purchases
    .find({ userId: uid(req) })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  res.json({
    purchases: rows.map((p) => ({
      id: p._id,
      provider: p.provider,
      product_id: p.productId,
      gems: p.gems,
      amount_cents: p.amountCents,
      currency: p.currency,
      status: p.status,
      created_at: p.createdAt,
    })),
  });
});

// ——— Stripe (web + desktop) ———
async function stripe(path, form) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.payments.stripeSecretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(502, data.error?.message ?? 'Payment provider error');
  return data;
}

paymentsRouter.post('/payments/stripe/checkout', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`checkout:${me}`, 10);
  if (!config.payments.stripeSecretKey) throw new HttpError(503, 'Card payments are not enabled yet');
  const { packId, returnUrl } = parse(z.object({ packId: z.string(), returnUrl: z.string().url().optional() }), req.body);
  const pack = gemPack(packId);
  const plan = premiumPlan(packId);
  if (!pack && !plan) throw new HttpError(404, 'Unknown pack');
  const usd = pack?.usd ?? plan.usd;
  const name = pack ? `${pack.gems + pack.bonus} Gems — ${pack.label}` : `ChatLOL Premium — ${plan.label} (${plan.days} days)`;
  const u = await db.users.findOne({ _id: me }, { projection: { email: 1, emailVerifiedAt: 1 } });
  if (!u.emailVerifiedAt) throw new HttpError(403, 'Verify your email before buying Gems', 'email_unverified');
  // Only return to our own web origin. Desktop checkouts land on the web Vault, which hands off to chatlol://.
  const toApp = !!returnUrl?.startsWith('chatlol://');
  const base = returnUrl && returnUrl.startsWith(config.appUrl) ? returnUrl : `${config.appUrl}/vault${toApp ? '?app=1' : ''}`;
  const session = await stripe('checkout/sessions', {
    mode: 'payment',
    client_reference_id: me,
    customer_email: u.email,
    'metadata[user_id]': me,
    'metadata[pack_id]': packId,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(Math.round(usd * 100)),
    'line_items[0][price_data][product_data][name]': name,
    success_url: `${base}${base.includes('?') ? '&' : '?'}purchase=success`,
    cancel_url: `${base}${base.includes('?') ? '&' : '?'}purchase=cancelled`,
  });
  res.json({ url: session.url });
});

/** Verifies the Stripe-Signature header (HMAC-SHA256 over `${t}.${rawBody}`, 5 minute tolerance). */
export function verifyStripeSignature(raw, header, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
  const t = Number(parts.t);
  const sigs = header
    .split(',')
    .filter((kv) => kv.startsWith('v1='))
    .map((kv) => kv.slice(3));
  if (!t || !sigs.length || Math.abs(nowSec - t) > 300) return false;
  const expected = createHmac('sha256', secret)
    .update(`${t}.${raw.toString('utf8')}`)
    .digest();
  return sigs.some((s) => {
    const given = Buffer.from(s, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

paymentsRouter.post('/payments/stripe/webhook', async (req, res) => {
  const raw = req.body;
  if (!Buffer.isBuffer(raw) || !verifyStripeSignature(raw, req.header('stripe-signature'), config.payments.stripeWebhookSecret)) {
    throw new HttpError(400, 'Bad signature');
  }
  const event = JSON.parse(raw.toString('utf8'));
  const obj = event.data.object;
  // Purchases are keyed by PaymentIntent so a later charge.refunded event can find them.
  const paid =
    (event.type === 'checkout.session.completed' && obj.payment_status === 'paid') ||
    event.type === 'checkout.session.async_payment_succeeded';
  if (paid) {
    await creditPurchase({
      id: `stripe:${obj.payment_intent ?? obj.id}`,
      userId: obj.metadata?.user_id ?? obj.client_reference_id,
      provider: 'stripe',
      productId: obj.metadata?.pack_id,
      amountCents: obj.amount_total,
      currency: obj.currency,
    });
  } else if (event.type === 'charge.refunded' && obj.payment_intent) {
    await refundPurchase(`stripe:${obj.payment_intent}`);
  }
  res.json({ received: true });
});

// ——— RevenueCat (iOS + Android in-app purchases) ———
paymentsRouter.post('/payments/revenuecat/webhook', async (req, res) => {
  const expected = config.payments.revenueCatWebhookAuth;
  const got = req.header('authorization') ?? '';
  if (!expected || got.length !== `Bearer ${expected}`.length || !timingSafeEqual(Buffer.from(got), Buffer.from(`Bearer ${expected}`))) {
    throw new HttpError(401, 'Unauthorized');
  }
  const ev = req.body.event;
  if (!ev) throw new HttpError(400, 'No event');
  const txId = ev.transaction_id ?? ev.id;
  if (['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE'].includes(ev.type)) {
    // Sandbox purchases are credited too — App Review and TestFlight testers buy in the sandbox.
    const store = ev.store === 'PLAY_STORE' ? 'google_play' : 'app_store';
    await creditPurchase({
      id: `rc:${txId}`,
      userId: ev.app_user_id,
      provider: ev.environment === 'SANDBOX' ? `${store}_sandbox` : store,
      productId: ev.product_id,
      amountCents: ev.price_in_purchased_currency != null ? Math.round(ev.price_in_purchased_currency * 100) : null,
      currency: ev.currency,
    });
  } else if (ev.type === 'CANCELLATION' && ev.cancel_reason === 'CUSTOMER_SUPPORT') {
    // Apple/Google refund of a consumable.
    await refundPurchase(`rc:${txId}`);
  }
  res.json({ ok: true });
});
