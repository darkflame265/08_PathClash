import { Capacitor } from "@capacitor/core";
import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases";

const SERVER_URL = import.meta.env.VITE_SERVER_URL?.trim();

export type TokenPackId = "starter" | "small" | "medium" | "large" | "whale";

export type TokenPurchaseResult =
  | "purchased"
  | "cancelled"
  | "unavailable"
  | "failed";

const tokenPackCatalog: Record<
  TokenPackId,
  { productId: string; tokens: number }
> = {
  starter: {
    productId:
      import.meta.env.VITE_TOKEN_PACK_STARTER_PRODUCT_ID?.trim() ||
      "token_pack_starter",
    tokens: 150,
  },
  small: {
    productId:
      import.meta.env.VITE_TOKEN_PACK_SMALL_PRODUCT_ID?.trim() ||
      "token_pack_small",
    tokens: 500,
  },
  medium: {
    productId:
      import.meta.env.VITE_TOKEN_PACK_MEDIUM_PRODUCT_ID?.trim() ||
      "token_pack_medium",
    tokens: 1200,
  },
  large: {
    productId:
      import.meta.env.VITE_TOKEN_PACK_LARGE_PRODUCT_ID?.trim() ||
      "token_pack_large",
    tokens: 3000,
  },
  whale: {
    productId:
      import.meta.env.VITE_TOKEN_PACK_WHALE_PRODUCT_ID?.trim() ||
      "token_pack_whale",
    tokens: 7000,
  },
};

function isUserCancelledError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("cancel") ||
    message.includes("user canceled") ||
    message.includes("user cancelled")
  );
}

function isAlreadyOwnedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("already owned") ||
    message.includes("item_already_owned")
  );
}

function getPackIdByProductId(productId: string): TokenPackId | null {
  const entry = (Object.entries(tokenPackCatalog) as Array<
    [TokenPackId, (typeof tokenPackCatalog)[TokenPackId]]
  >).find(([, pack]) => pack.productId === productId);

  return entry?.[0] ?? null;
}

async function grantPurchasedTokens({
  accessToken,
  packId,
  productId,
  purchaseToken,
}: {
  accessToken: string;
  packId: TokenPackId;
  productId: string;
  purchaseToken: string;
}) {
  if (!SERVER_URL) throw new Error("missing server url");

  const response = await fetch(`${SERVER_URL}/payments/google-play/token-grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accessToken,
      packId,
      productId,
      purchaseToken,
    }),
  });

  if (!response.ok) {
    let error = "token grant failed";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        error = `token grant failed: ${body.error}`;
      }
    } catch {
      // Ignore response body parse failures and keep generic error text.
    }
    throw new Error(error);
  }
}

async function recoverOwnedTokenPackPurchases(accessToken: string): Promise<void> {
  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.INAPP,
  });

  for (const purchase of purchases) {
    const productId = purchase.productIdentifier?.trim();
    const purchaseToken = purchase.purchaseToken?.trim();
    if (!productId || !purchaseToken) continue;

    const packId = getPackIdByProductId(productId);
    if (!packId) continue;

    try {
      await grantPurchasedTokens({
        accessToken,
        packId,
        productId,
        purchaseToken,
      });

      try {
        await NativePurchases.consumePurchase({ purchaseToken });
      } catch {
        // Leave stale owned purchase in place; next recovery attempt can retry consume.
      }
    } catch {
      // Keep the purchase unconsumed so it can be retried later.
    }
  }
}

export async function startTokenPackPurchase({
  packId,
  accessToken,
  appUserId,
}: {
  packId: TokenPackId;
  accessToken: string | null;
  appUserId: string | null;
}): Promise<TokenPurchaseResult> {
  const isAndroidNative =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

  if (!isAndroidNative) {
    return "unavailable";
  }

  if (!accessToken) {
    return "failed";
  }

  const pack = tokenPackCatalog[packId];
  if (!pack.productId) {
    return "unavailable";
  }

  try {
    const { isBillingSupported } = await NativePurchases.isBillingSupported();
    if (!isBillingSupported) {
      return "unavailable";
    }

    await recoverOwnedTokenPackPurchases(accessToken);

    await NativePurchases.getProduct({
      productIdentifier: pack.productId,
      productType: PURCHASE_TYPE.INAPP,
    });

    const purchase = await NativePurchases.purchaseProduct({
      productIdentifier: pack.productId,
      productType: PURCHASE_TYPE.INAPP,
      isConsumable: true,
      appAccountToken: appUserId ?? undefined,
    });

    if (
      purchase.purchaseState !== "PURCHASED" &&
      purchase.purchaseState !== "1" &&
      purchase.purchaseState
    ) {
      return "failed";
    }

    if (!purchase.purchaseToken) {
      return "failed";
    }

    await grantPurchasedTokens({
      accessToken,
      packId,
      productId: pack.productId,
      purchaseToken: purchase.purchaseToken,
    });

    try {
      await NativePurchases.consumePurchase({
        purchaseToken: purchase.purchaseToken,
      });
    } catch {
      // Token grant already completed; stale consume failures can be retried later.
    }

    return "purchased";
  } catch (error) {
    if (isUserCancelledError(error)) {
      return "cancelled";
    }

    if (isAlreadyOwnedError(error)) {
      try {
        await recoverOwnedTokenPackPurchases(accessToken);
      } catch {
        // Ignore and surface the original purchase failure state.
      }
    }

    return "failed";
  }
}

export function getTokenPackTokenAmount(packId: TokenPackId): number {
  return tokenPackCatalog[packId].tokens;
}
