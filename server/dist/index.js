"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const supabase_1 = require("./lib/supabase");
const googlePlayVerifier_1 = require("./services/googlePlayVerifier");
const socketServer_1 = require("./socket/socketServer");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
app.use(express_1.default.json());
const tokenPackCatalog = {
    starter: {
        productId: process.env.GOOGLE_PLAY_TOKEN_PACK_STARTER_ID?.trim() ||
            "token_pack_starter",
        tokens: 150,
    },
    small: {
        productId: process.env.GOOGLE_PLAY_TOKEN_PACK_SMALL_ID?.trim() ||
            "token_pack_small",
        tokens: 500,
    },
    medium: {
        productId: process.env.GOOGLE_PLAY_TOKEN_PACK_MEDIUM_ID?.trim() ||
            "token_pack_medium",
        tokens: 1200,
    },
    large: {
        productId: process.env.GOOGLE_PLAY_TOKEN_PACK_LARGE_ID?.trim() ||
            "token_pack_large",
        tokens: 3000,
    },
    whale: {
        productId: process.env.GOOGLE_PLAY_TOKEN_PACK_WHALE_ID?.trim() ||
            "token_pack_whale",
        tokens: 7000,
    },
};
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
    .filter((origin) => Boolean(origin));
const allowedOrigins = [...new Set([...defaultOrigins, ...configuredOrigins])];
const io = new socket_io_1.Server(httpServer, {
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
});
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.post("/payments/google-play/token-grant", async (req, res) => {
    if (!supabase_1.supabaseAdmin) {
        res.status(503).json({ error: "supabase_unavailable" });
        return;
    }
    const { accessToken, packId, purchaseToken, productId } = (req.body ?? {});
    if (!accessToken || !packId || !purchaseToken || !productId) {
        res.status(400).json({ error: "invalid_request" });
        return;
    }
    if (!(packId in tokenPackCatalog)) {
        res.status(400).json({ error: "invalid_pack" });
        return;
    }
    const pack = tokenPackCatalog[packId];
    if (productId !== pack.productId) {
        res.status(400).json({ error: "product_mismatch" });
        return;
    }
    const { data, error } = await supabase_1.supabaseAdmin.auth.getUser(accessToken);
    if (error || !data.user) {
        res.status(401).json({ error: "auth_invalid" });
        return;
    }
    const verification = await (0, googlePlayVerifier_1.verifyGooglePlayProductPurchase)({
        productId,
        purchaseToken,
    });
    if (!verification.ok) {
        const statusCode = verification.reason === "config_missing" ||
            verification.reason === "invalid_credentials" ||
            verification.reason === "google_request_failed"
            ? 503
            : 400;
        res.status(statusCode).json({ error: verification.reason });
        return;
    }
    const { data: granted, error: grantError } = await supabase_1.supabaseAdmin.rpc("grant_tokens_from_google_purchase", {
        p_purchase_token: purchaseToken,
        p_user_id: data.user.id,
        p_pack_id: packId,
        p_product_id: productId,
        p_tokens: pack.tokens,
    });
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
(0, socketServer_1.initSocketServer)(io);
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`PathClash server running on http://localhost:${PORT}`);
});
