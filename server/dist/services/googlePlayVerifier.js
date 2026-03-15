"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyGooglePlayProductPurchase = verifyGooglePlayProductPurchase;
const google_auth_library_1 = require("google-auth-library");
const GOOGLE_PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
let cachedJwtClient = null;
let cachedCredentialFingerprint = '';
function getConfiguredPackageName() {
    return process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || 'com.pathclash.game';
}
function getServiceAccountJson() {
    const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
    return raw ? raw : null;
}
function buildJwtClient() {
    const serviceAccountJson = getServiceAccountJson();
    if (!serviceAccountJson)
        return null;
    if (cachedJwtClient && cachedCredentialFingerprint === serviceAccountJson) {
        return cachedJwtClient;
    }
    try {
        const credentials = JSON.parse(serviceAccountJson);
        if (!credentials.client_email || !credentials.private_key) {
            return null;
        }
        const jwtClient = new google_auth_library_1.JWT({
            email: credentials.client_email,
            key: credentials.private_key.replace(/\\n/g, '\n'),
            scopes: [GOOGLE_PLAY_SCOPE],
        });
        cachedJwtClient = jwtClient;
        cachedCredentialFingerprint = serviceAccountJson;
        return jwtClient;
    }
    catch {
        return null;
    }
}
async function verifyGooglePlayProductPurchase({ productId, purchaseToken, }) {
    const jwtClient = buildJwtClient();
    if (!jwtClient) {
        return { ok: false, reason: 'config_missing' };
    }
    const packageName = getConfiguredPackageName();
    const encodedPackageName = encodeURIComponent(packageName);
    const encodedProductId = encodeURIComponent(productId);
    const encodedPurchaseToken = encodeURIComponent(purchaseToken);
    const endpoint = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodedPackageName}/purchases/products/${encodedProductId}/tokens/${encodedPurchaseToken}`;
    try {
        await jwtClient.authorize();
    }
    catch (error) {
        console.error('[google-play] authorize failed', error);
        return { ok: false, reason: 'invalid_credentials' };
    }
    try {
        const response = await jwtClient.request({
            url: endpoint,
            method: 'GET',
        });
        const purchase = response.data;
        if (purchase.productId && purchase.productId !== productId) {
            return { ok: false, reason: 'product_mismatch' };
        }
        if (purchase.purchaseState !== 0) {
            return { ok: false, reason: 'purchase_not_completed' };
        }
        return { ok: true };
    }
    catch (error) {
        const status = typeof error === 'object' && error !== null && 'response' in error
            ? Number(error.response?.status ?? 0)
            : 0;
        if (status === 404) {
            return { ok: false, reason: 'purchase_not_found' };
        }
        console.error('[google-play] purchase verification failed', error);
        return { ok: false, reason: 'google_request_failed' };
    }
}
