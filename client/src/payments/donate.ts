import { Capacitor } from "@capacitor/core";
import { PRODUCT_CATEGORY, Purchases } from "@revenuecat/purchases-capacitor";

let configured = false;

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

async function ensurePurchasesConfigured(appUserId: string | null) {
  if (configured) return;

  const apiKey = import.meta.env.VITE_RC_ANDROID_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("VITE_RC_ANDROID_API_KEY is missing.");
  }

  await Purchases.configure({
    apiKey,
    appUserID: appUserId ?? undefined,
  });
  configured = true;
}

export type DonateResult =
  | "opened_web"
  | "purchased"
  | "cancelled"
  | "unavailable"
  | "failed";

export async function startDonation({
  webUrl,
  appUserId,
}: {
  webUrl: string;
  appUserId: string | null;
}): Promise<DonateResult> {
  if (!Capacitor.isNativePlatform()) {
    openExternal(webUrl);
    return "opened_web";
  }

  if (Capacitor.getPlatform() !== "android") {
    openExternal(webUrl);
    return "opened_web";
  }

  const productId = import.meta.env.VITE_DONATION_PRODUCT_ID?.trim();
  if (!productId) {
    return "unavailable";
  }

  try {
    await ensurePurchasesConfigured(appUserId);

    const { canMakePayments } = await Purchases.canMakePayments();
    if (!canMakePayments) {
      return "unavailable";
    }

    const { products } = await Purchases.getProducts({
      productIdentifiers: [productId],
      type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    });

    const product = products[0];
    if (!product) {
      return "unavailable";
    }

    await Purchases.purchaseStoreProduct({ product });
    return "purchased";
  } catch (error: unknown) {
    const maybeCancelled =
      typeof error === "object" &&
      error !== null &&
      "userCancelled" in error &&
      (error as { userCancelled?: boolean }).userCancelled === true;

    if (maybeCancelled) return "cancelled";
    console.error("[donate] purchase failed", error);
    return "failed";
  }
}

