import { Capacitor } from "@capacitor/core";
import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases";

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export type DonateResult =
  | "opened_web"
  | "purchased"
  | "cancelled"
  | "unavailable"
  | "failed";

const DONATION_PRODUCT_ID = import.meta.env.VITE_DONATION_PRODUCT_ID?.trim() || "donation_5000";

function isUserCancelledError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("cancel") || message.includes("user canceled") || message.includes("user cancelled");
}

function isAlreadyOwnedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("already owned") || message.includes("item_already_owned");
}

async function consumeOwnedDonationPurchases(): Promise<void> {
  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.INAPP,
  });

  const tokens = purchases
    .filter((purchase) => purchase.productIdentifier === DONATION_PRODUCT_ID)
    .map((purchase) => purchase.purchaseToken)
    .filter((token): token is string => Boolean(token));

  for (const token of tokens) {
    try {
      await NativePurchases.consumePurchase({ purchaseToken: token });
    } catch {
      // Ignore individual consume failures; purchase flow will surface actionable errors.
    }
  }
}

export async function startDonation({
  webUrl,
  appUserId,
}: {
  webUrl: string;
  appUserId: string | null;
}): Promise<DonateResult> {
  const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

  if (!isAndroidNative) {
    openExternal(webUrl);
    return "opened_web";
  }

  if (!DONATION_PRODUCT_ID) {
    return "unavailable";
  }

  try {
    const { isBillingSupported } = await NativePurchases.isBillingSupported();
    if (!isBillingSupported) {
      return "unavailable";
    }

    // Clear stale owned consumables so repeated donations remain purchasable.
    await consumeOwnedDonationPurchases();

    await NativePurchases.getProduct({
      productIdentifier: DONATION_PRODUCT_ID,
      productType: PURCHASE_TYPE.INAPP,
    });

    const purchase = await NativePurchases.purchaseProduct({
      productIdentifier: DONATION_PRODUCT_ID,
      productType: PURCHASE_TYPE.INAPP,
      isConsumable: true,
      appAccountToken: appUserId ?? undefined,
    });

    if (purchase.purchaseState === "PURCHASED" || purchase.purchaseState === "1" || !purchase.purchaseState) {
      return "purchased";
    }

    return "failed";
  } catch (error) {
    if (isUserCancelledError(error)) {
      return "cancelled";
    }
    if (isAlreadyOwnedError(error)) {
      try {
        await consumeOwnedDonationPurchases();
      } catch {
        // Ignore and fall through to failed.
      }
      return "failed";
    }

    return "failed";
  }
}
