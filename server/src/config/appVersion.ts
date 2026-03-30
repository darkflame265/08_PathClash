import appVersionConfig from './app-version.json';

export interface AndroidVersionStatus {
  latestVersionCode: number;
  minSupportedVersionCode: number;
  currentVersionCode: number | null;
  forceUpdate: boolean;
  storeUrl: string;
  marketUrl: string;
}

const DEFAULT_ANDROID_APP_ID = 'com.pathclash.game';
const androidVersionConfig = appVersionConfig.android;
const parsedLatestVersionCode = Number(
  process.env.ANDROID_LATEST_VERSION_CODE?.trim() ??
    String(androidVersionConfig.latestVersionCode),
);
const latestVersionCode = Number.isFinite(parsedLatestVersionCode)
  ? Math.max(1, Math.trunc(parsedLatestVersionCode))
  : androidVersionConfig.latestVersionCode;

const parsedMinSupportedVersionCode = Number(
  process.env.ANDROID_MIN_SUPPORTED_VERSION_CODE?.trim() ??
    String(androidVersionConfig.minSupportedVersionCode),
);
const minSupportedVersionCode = Number.isFinite(parsedMinSupportedVersionCode)
  ? Math.max(1, Math.trunc(parsedMinSupportedVersionCode))
  : androidVersionConfig.minSupportedVersionCode;

const androidAppId =
  process.env.ANDROID_APP_ID?.trim() ||
  androidVersionConfig.appId ||
  DEFAULT_ANDROID_APP_ID;

const configuredStoreUrl = process.env.ANDROID_STORE_URL?.trim();
const defaultStoreUrl = `https://play.google.com/store/apps/details?id=${androidAppId}`;

export const ANDROID_VERSION_CONFIG = {
  latestVersionCode,
  minSupportedVersionCode,
  storeUrl: configuredStoreUrl || defaultStoreUrl,
  marketUrl: `market://details?id=${androidAppId}`,
};

export function getAndroidVersionStatus(
  currentVersionCode: number | null,
): AndroidVersionStatus {
  return {
    latestVersionCode: ANDROID_VERSION_CONFIG.latestVersionCode,
    minSupportedVersionCode: ANDROID_VERSION_CONFIG.minSupportedVersionCode,
    currentVersionCode,
    forceUpdate:
      currentVersionCode === null ||
      currentVersionCode < ANDROID_VERSION_CONFIG.minSupportedVersionCode,
    storeUrl: ANDROID_VERSION_CONFIG.storeUrl,
    marketUrl: ANDROID_VERSION_CONFIG.marketUrl,
  };
}
