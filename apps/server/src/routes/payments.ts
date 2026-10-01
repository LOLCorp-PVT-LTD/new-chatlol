import { Router, type Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { GEM_PACKS, gemPack } from '@chatlol/shared';
import { db, now, type Row } from '../db';
import { requireAuth, uid } from '../lib/auth';
import { HttpError, parse, rateLimit } from '../lib/http';
import { emitWallet, notify } from '../lib/rewards';
import { config } from '../config';

/**
 * Buying Gems with real money.
 *  - iOS / Android: in-app purchase through RevenueCat (required by App Store & Play rules for digital goods).
 *    RevenueCat calls our webhook; the app user id is our user id.
 *  - Web / desktop: Stripe Checkout; Stripe calls our webhook.
 * Every credit goes through `creditPurchase`, keyed by the provider's transaction id, so retries never double-credit.
 */
export const paymentsRouter = Router();

paymentsRouter.get('/payments/packs', (_req, res) => {
  res.json({ packs: GEM_PACKS, stripe: !!config.payments.stripeSecretKey, iap: !!config.payments.revenueCatWebhookAuth });
});

export async function creditPurchase(p: { id: string; userId: string; provider: string; productId: string; amountCents?: number | null; currency?: string | null }) {
  const pack = gemPack(p.productId);
  if (!pack) throw new HttpError(400, `Unknown product ${p.productId}`);
  const gems = pack.gems + pack.bonus;
  const credited = await db.tx(async () => {
    if (!(await db.one('SELECT 1 AS x FROM users WHERE id = ?', p.userId))) return false;
    const ins = await db.run(
      `INSERT INTO purchases (id, user_id, provider, product_id, gems, amount_cents, currency, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?) ON CONFLICT (id) DO NOTHING`,
      p.id, p.userId, p.provider, p.productId, gems, p.amountCents ?? null, p.currency ?? null, now());
    if (!ins.changes) return false;
    await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', gems, p.userId);
    return true;
  });
  if (credited) {
    await notify(p.userId, { kind: 'system', title: `+${gems} Gems landed 💎`, body: `${pack.label} — thanks for supporting ChatLOL!`, link: '/vault' });
    await emitWallet(p.userId);
  }
  return credited;
}

/** Refunds claw the Gems back (never below zero) and mark the purchase. */
export async function refundPurchase(id: string) {
  const done = await db.tx(async () => {
    const p = await db.one<Row>(`SELECT * FROM purchases WHERE id = ? AND status = 'completed'`, id);
    if (!p) return null;
    await db.run(`UPDATE purchases SET status = 'refunded' WHERE id = ?`, id);
    await db.run('UPDATE users SET gems = CASE WHEN gems - ? < 0 THEN 0 ELSE gems - ? END WHERE id = ?', p.gems, p.gems, p.user_id);
    return p.user_id as string;
  });
  if (done) await emitWallet(done);
  return !!done;
}

paymentsRouter.get('/payments/history', requireAuth, async (req, res) => {
  const rows = await db.all<Row>('SELECT id, provider, product_id, gems, amount_cents, currency, status, created_at FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', uid(req));
  res.json({ purchases: rows });
});

// ——— Stripe (web + desktop) ———
async function stripe(path: string, form: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.payments.stripeSecretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  const data = (await res.json()) as { url?: string; id?: string; error?: { message: string } };
  if (!res.ok) throw new HttpError(502, data.error?.message ?? 'Payment provider error');
  return data;
}

paymentsRouter.post('/payments/stripe/checkout', requireAuth, async (req, res) => {
  const me = uid(req);
  await rateLimit(`checkout:${me}`, 10);
  if (!config.payments.stripeSecretKey) throw new HttpError(503, 'Card payments are not enabled yet');
  const { packId, returnUrl } = parse(z.object({ packId: z.string(), returnUrl: z.string().url().optional() }), req.body);
  const pack = gemPack(packId);
  if (!pack) throw new HttpError(404, 'Unknown pack');
  const u = (await db.one<Row>('SELECT email, email_verified_at FROM users WHERE id = ?', me))!;
  if (!u.email_verified_at) throw new HttpError(403, 'Verify your email before buying Gems', 'email_unverified');
  // Only allow returning to our own app origin (or the desktop scheme).
  const base = returnUrl && (returnUrl.startsWith(config.appUrl) || returnUrl.startsWith('chatlol://')) ? returnUrl : `${config.appUrl}/vault`;
  const session = await stripe('checkout/sessions', {
    mode: 'payment',
    client_reference_id: me,
    customer_email: u.email,
    'metadata[user_id]': me,
    'metadata[pack_id]': pack.id,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(Math.round(pack.usd * 100)),
    'line_items[0][price_data][product_data][name]': `${pack.gems + pack.bonus} Gems — ${pack.label}`,
    success_url: `${base}${base.includes('?') ? '&' : '?'}purchase=success`,
    cancel_url: `${base}${base.includes('?') ? '&' : '?'}purchase=cancelled`,
  });
  res.json({ url: session.url });
});

/** Verifies the Stripe-Signature header (HMAC-SHA256 over `${t}.${rawBody}`, 5 minute tolerance). */
export function verifyStripeSignature(raw: Buffer, header: string | undefined, secret: string, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  const sigs = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  if (!t || !sigs.length || Math.abs(nowSec - t) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest();
  return sigs.some((s) => {
    const given = Buffer.from(s, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

paymentsRouter.post('/payments/stripe/webhook', async (req: Request, res) => {
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !verifyStripeSignature(raw, req.header('stripe-signature'), config.payments.stripeWebhookSecret)) {
    throw new HttpError(400, 'Bad signature');
  }
  const event = JSON.parse(raw.toString('utf8')) as { type: string; data: { object: Row } };
  const obj = event.data.object;
  // Purchases are keyed by PaymentIntent so a later charge.refunded event can find them.
  const paid = (event.type === 'checkout.session.completed' && obj.payment_status === 'paid') || event.type === 'checkout.session.async_payment_succeeded';
  if (paid) {
    await creditPurchase({
      id: `stripe:${obj.payment_intent ?? obj.id}`, userId: obj.metadata?.user_id ?? obj.client_reference_id, provider: 'stripe',
      productId: obj.metadata?.pack_id, amountCents: obj.amount_total, currency: obj.currency,
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
  const ev = (req.body as { event?: Row }).event;
  if (!ev) throw new HttpError(400, 'No event');
  const txId = ev.transaction_id ?? ev.id;
  if (['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE'].includes(ev.type)) {
    // Sandbox purchases are credited too — App Review and TestFlight testers buy in the sandbox.
    const store = ev.store === 'PLAY_STORE' ? 'google_play' : 'app_store';
    await creditPurchase({
      id: `rc:${txId}`, userId: ev.app_user_id, provider: ev.environment === 'SANDBOX' ? `${store}_sandbox` : store,
      productId: ev.product_id, amountCents: ev.price_in_purchased_currency != null ? Math.round(ev.price_in_purchased_currency * 100) : null, currency: ev.currency,
    });
  } else if (ev.type === 'CANCELLATION' && ev.cancel_reason === 'CUSTOMER_SUPPORT') {
    // Apple/Google refund of a consumable.
    await refundPurchase(`rc:${txId}`);
  }
  res.json({ ok: true });
});
