import 'dotenv/config';
import express from "express";
import type { Request, Response } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { supabaseAdmin } from "./lib/supabase";
import { verifyGooglePlayProductPurchase } from "./services/googlePlayVerifier";
import { initSocketServer } from "./socket/socketServer";
import { getAndroidVersionStatus } from "./config/appVersion";
import { getUserFromToken } from "./services/playerAuth";

const app = express();
const httpServer = createServer(app);
app.use(express.json());

const tokenPackCatalog = {
  starter: {
    productId:
      process.env.GOOGLE_PLAY_TOKEN_PACK_STARTER_ID?.trim() ||
      "token_pack_starter",
    tokens: 150,
  },
  small: {
    productId:
      process.env.GOOGLE_PLAY_TOKEN_PACK_SMALL_ID?.trim() ||
      "token_pack_small",
    tokens: 500,
  },
  medium: {
    productId:
      process.env.GOOGLE_PLAY_TOKEN_PACK_MEDIUM_ID?.trim() ||
      "token_pack_medium",
    tokens: 1200,
  },
  large: {
    productId:
      process.env.GOOGLE_PLAY_TOKEN_PACK_LARGE_ID?.trim() ||
      "token_pack_large",
    tokens: 3000,
  },
  whale: {
    productId:
      process.env.GOOGLE_PLAY_TOKEN_PACK_WHALE_ID?.trim() ||
      "token_pack_whale",
    tokens: 7000,
  },
} as const;

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost",
  "http://127.0.0.1",
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost",
  "https://zero8-pathclash-1.onrender.com",
  "https://pathclash.com",
  "https://www.pathclash.com",
];
const configuredOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.ALLOWED_ORIGINS?.split(",") ?? []),
]
  .map((origin) => origin?.trim())
  .filter((origin): origin is string => Boolean(origin));

const allowedOrigins = [...new Set([...defaultOrigins, ...configuredOrigins])];

function applyApiCors(origin: string | undefined, res: Response) {
  if (!origin || !allowedOrigins.includes(origin)) {
    return false;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return true;
}

app.use((req: Request, res: Response, next) => {
  const origin = req.header("Origin") ?? undefined;
  const corsApplied = applyApiCors(origin, res);

  if (req.method === "OPTIONS") {
    if (origin && !corsApplied) {
      res.status(403).end();
      return;
    }

    res.status(204).end();
    return;
  }

  next();
});

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST"],
  },
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/app-version/android", (req, res) => {
  const versionCodeParam =
    typeof req.query.versionCode === 'string' ? req.query.versionCode : null;
  const parsedVersionCode =
    versionCodeParam !== null ? Number(versionCodeParam) : Number.NaN;
  const currentVersionCode = Number.isFinite(parsedVersionCode)
    ? Math.trunc(parsedVersionCode)
    : null;

  res.json(getAndroidVersionStatus(currentVersionCode));
});

app.post("/payments/google-play/token-grant", async (req, res) => {
  if (!supabaseAdmin) {
    res.status(503).json({ error: "supabase_unavailable" });
    return;
  }

  const { accessToken, packId, purchaseToken, productId } = (req.body ?? {}) as {
    accessToken?: string;
    packId?: keyof typeof tokenPackCatalog;
    purchaseToken?: string;
    productId?: string;
  };

  if (!accessToken || !packId || !purchaseToken || !productId) {
    console.warn("[google-play] token grant invalid request", {
      hasAccessToken: Boolean(accessToken),
      packId,
      hasPurchaseToken: Boolean(purchaseToken),
      productId,
    });
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  if (!(packId in tokenPackCatalog)) {
    console.warn("[google-play] token grant invalid pack", {
      packId,
      productId,
    });
    res.status(400).json({ error: "invalid_pack" });
    return;
  }

  const pack = tokenPackCatalog[packId];
  if (productId !== pack.productId) {
    console.warn("[google-play] token grant product mismatch", {
      packId,
      expectedProductId: pack.productId,
      productId,
    });
    res.status(400).json({ error: "product_mismatch" });
    return;
  }

  console.info("[google-play] token grant request", {
    packId,
    productId,
    purchaseTokenPrefix: purchaseToken.slice(0, 12),
  });

  const user = await getUserFromToken(accessToken);
  if (!user) {
    console.warn("[google-play] token grant auth invalid", {
      packId,
      productId,
    });
    res.status(401).json({ error: "auth_invalid" });
    return;
  }

  const verification = await verifyGooglePlayProductPurchase({
    productId,
    purchaseToken,
  });
  if (!verification.ok) {
    console.warn("[google-play] token grant rejected", {
      packId,
      productId,
      reason: verification.reason,
      userId: user.id,
    });
    const statusCode =
      verification.reason === "config_missing" ||
      verification.reason === "invalid_credentials" ||
      verification.reason === "google_request_failed"
        ? 503
        : 400;
    res.status(statusCode).json({ error: verification.reason });
    return;
  }

  const { data: granted, error: grantError } = await supabaseAdmin.rpc(
    "grant_tokens_from_google_purchase",
    {
      p_purchase_token: purchaseToken,
      p_user_id: user.id,
      p_pack_id: packId,
      p_product_id: productId,
      p_tokens: pack.tokens,
    },
  );

  if (grantError) {
    console.error("[google-play] failed to grant tokens", grantError);
    res.status(500).json({ error: "grant_failed" });
    return;
  }

  res.json({
    ok: true,
    granted: Boolean(granted),
    tokens: pack.tokens,
  });
});

initSocketServer(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`PathClash server running on http://localhost:${PORT}`);
});
