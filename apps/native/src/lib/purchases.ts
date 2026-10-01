import { Platform } from 'react-native';
import Purchases, { PRODUCT_CATEGORY, type PurchasesStoreProduct } from 'react-native-purchases';
import { GEM_PACKS, type GemPack } from '@chatlol/shared';

/**
 * Gems on iOS / Android go through Apple / Google in-app purchase (store rules for digital goods),
 * managed by RevenueCat. Create consumable products with the same ids as GEM_PACKS in App Store Connect
 * and Play Console, attach them in RevenueCat, and point RevenueCat's webhook at /api/payments/revenuecat/webhook.
 */
const KEY = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
let configuredFor: string | null = null;
let products: PurchasesStoreProduct[] = [];

export const purchasesAvailable = () => !!KEY;
export const purchaseChannel: 'iap' | 'stripe' = 'iap';

export async function initPurchases(userId: string) {
  if (!KEY || configuredFor === userId) return;
  if (!configuredFor) Purchases.configure({ apiKey: KEY, appUserID: userId });
  else await Purchases.logIn(userId);
  configuredFor = userId;
}

export async function resetPurchases() {
  if (configuredFor) await Purchases.logOut().catch(() => {});
  configuredFor = null;
}

export interface PackOffer extends GemPack { priceLabel: string }

export async function loadOffers(): Promise<PackOffer[]> {
  if (!KEY) return GEM_PACKS.map((p) => ({ ...p, priceLabel: `$${p.usd.toFixed(2)}` }));
  products = await Purchases.getProducts(GEM_PACKS.map((p) => p.id), PRODUCT_CATEGORY.NON_SUBSCRIPTION);
  return GEM_PACKS.map((p) => ({ ...p, priceLabel: products.find((x) => x.identifier === p.id)?.priceString ?? `$${p.usd.toFixed(2)}` }));
}

/** Returns 'purchased' | 'cancelled'. Gems are credited server-side by the RevenueCat webhook. */
export async function buyPack(packId: string): Promise<'purchased' | 'cancelled'> {
  if (!KEY) throw new Error('In-app purchases are not configured for this build');
  const product = products.find((p) => p.identifier === packId) ?? (await Purchases.getProducts([packId], PRODUCT_CATEGORY.NON_SUBSCRIPTION))[0];
  if (!product) throw new Error('This pack isn’t available in your store yet');
  try {
    await Purchases.purchaseStoreProduct(product);
    return 'purchased';
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return 'cancelled';
    throw e;
  }
}
