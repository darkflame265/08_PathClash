"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANDROID_VERSION_CONFIG = void 0;
exports.getAndroidVersionStatus = getAndroidVersionStatus;
const app_version_json_1 = __importDefault(require("./app-version.json"));
const DEFAULT_ANDROID_APP_ID = 'com.pathclash.game';
const androidVersionConfig = app_version_json_1.default.android;
const parsedLatestVersionCode = Number(process.env.ANDROID_LATEST_VERSION_CODE?.trim() ??
    String(androidVersionConfig.latestVersionCode));
const latestVersionCode = Number.isFinite(parsedLatestVersionCode)
    ? Math.max(1, Math.trunc(parsedLatestVersionCode))
    : androidVersionConfig.latestVersionCode;
const parsedMinSupportedVersionCode = Number(process.env.ANDROID_MIN_SUPPORTED_VERSION_CODE?.trim() ??
    String(androidVersionConfig.minSupportedVersionCode));
const minSupportedVersionCode = Number.isFinite(parsedMinSupportedVersionCode)
    ? Math.max(1, Math.trunc(parsedMinSupportedVersionCode))
    : androidVersionConfig.minSupportedVersionCode;
const androidAppId = process.env.ANDROID_APP_ID?.trim() ||
    androidVersionConfig.appId ||
    DEFAULT_ANDROID_APP_ID;
const configuredStoreUrl = process.env.ANDROID_STORE_URL?.trim();
const defaultStoreUrl = `https://play.google.com/store/apps/details?id=${androidAppId}`;
exports.ANDROID_VERSION_CONFIG = {
    latestVersionCode,
    minSupportedVersionCode,
    storeUrl: configuredStoreUrl || defaultStoreUrl,
    marketUrl: `market://details?id=${androidAppId}`,
};
function getAndroidVersionStatus(currentVersionCode) {
    return {
        latestVersionCode: exports.ANDROID_VERSION_CONFIG.latestVersionCode,
        minSupportedVersionCode: exports.ANDROID_VERSION_CONFIG.minSupportedVersionCode,
        currentVersionCode,
        forceUpdate: currentVersionCode === null ||
            currentVersionCode < exports.ANDROID_VERSION_CONFIG.minSupportedVersionCode,
        storeUrl: exports.ANDROID_VERSION_CONFIG.storeUrl,
        marketUrl: exports.ANDROID_VERSION_CONFIG.marketUrl,
    };
}
