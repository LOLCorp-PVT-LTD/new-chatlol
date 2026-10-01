import { GEM_PACKS, type GemPack } from '@chatlol/shared';
import { api } from './api';
import { desktop } from './desktop';

/** Web & desktop builds buy Gems through Stripe Checkout in the browser. */
export const purchasesAvailable = () => true;
export const purchaseChannel: 'iap' | 'stripe' = 'stripe';
export async function initPurchases(_userId: string) {}
export async function resetPurchases() {}

export interface PackOffer extends GemPack { priceLabel: string }
export async function loadOffers(): Promise<PackOffer[]> {
  return GEM_PACKS.map((p) => ({ ...p, priceLabel: `$${p.usd.toFixed(2)}` }));
}

export async function buyPack(packId: string): Promise<'purchased' | 'cancelled'> {
  // Desktop returns via the chatlol:// deep link; the browser build returns to the current page.
  const returnUrl = desktop ? 'chatlol://vault' : `${location.origin}/vault`;
  const { url } = await api.stripeCheckout(packId, returnUrl);
  if (desktop?.openExternal) desktop.openExternal(url);
  else location.href = url;
  return 'purchased';
}
