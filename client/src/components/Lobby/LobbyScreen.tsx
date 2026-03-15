import { useCallback, useEffect, useRef, useState } from "react";
import { FlagSkin, isFlagSkin } from "../shared/FlagSkin";
import { StarrySkySkin } from "../shared/StarrySkySkin";
import { AtomicPreview } from "../../skins/legendary/atomic/Preview";
import {
  cancelPendingGoogleUpgradeSwitch,
  confirmPendingGoogleUpgradeSwitch,
  getSocketAuthPayload,
  linkGoogleAccount,
  logoutToGuestMode,
  purchaseSkinWithTokens,
  refreshAccountSummary,
  resolveUpgradeFlowAfterRedirect,
  type AccountProfile,
  type UpgradeResolution,
} from "../../auth/guestAuth";
import { startDonation } from "../../payments/donate";
import { startTokenPackPurchase, type TokenPackId } from "../../payments/tokenShop";
import { connectSocket } from "../../socket/socketClient";
import { useGameStore } from "../../store/gameStore";
import { useLang } from "../../hooks/useLang";
import type { Translations } from "../../i18n/translations";
import type { PieceSkin } from "../../types/game.types";
import "./LobbyScreen.css";

type LobbyView = "main" | "create" | "join";

interface Props {
  onGameStart: () => void;
}

const POLICY_URL_KR =
  import.meta.env.VITE_POLICY_URL_KR?.trim() ||
  "https://pathclash.com/privacy.html";
const POLICY_URL_EN =
  import.meta.env.VITE_POLICY_URL_EN?.trim() ||
  "https://pathclash.com/privacy-en.html";
const TERMS_URL_KR =
  import.meta.env.VITE_TERMS_URL_KR?.trim() ||
  "https://pathclash.com/terms.html";
const TERMS_URL_EN =
  import.meta.env.VITE_TERMS_URL_EN?.trim() ||
  "https://pathclash.com/terms-en.html";
const DONATE_URL =
  import.meta.env.VITE_DONATE_URL?.trim() || "https://pathclash.com";
const AI_TUTORIAL_SEEN_KEY = "pathclash.aiTutorialSeen.v1";

type SetAuthState = ReturnType<typeof useGameStore.getState>["setAuthState"];

function getUtcDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function getMsUntilNextUtcMidnight(now = new Date()) {
  const nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    50,
  );
  return Math.max(1_000, nextUtcMidnight - now.getTime());
}

function applyProfileToStore(
  profile: AccountProfile,
  setAuthState: SetAuthState,
) {
  setAuthState({
    ready: true,
    userId: profile.userId,
    accessToken: useGameStore.getState().authAccessToken,
    isGuestUser: profile.isGuestUser,
    nickname: profile.nickname,
    equippedSkin: profile.equippedSkin,
    ownedSkins: profile.ownedSkins,
    wins: profile.wins,
    losses: profile.losses,
    tokens: profile.tokens,
    dailyRewardWins: profile.dailyRewardWins,
    dailyRewardTokens: profile.dailyRewardTokens,
  });
}

function getUpgradeDisplayMsg(
  result: UpgradeResolution,
  t: Translations,
): string {
  if (result.kind === "upgrade_ok") return t.upgradeOk;
  if (result.kind === "switch_ok") {
    return t.switchOk(result.profile.wins, result.profile.losses);
  }
  if (result.kind === "auth_error") return t.authError;
  return "";
}

function AccountCard({
  myNickname,
  setNickname,
  isGuestUser,
  accountWins,
  accountLosses,
  upgradeMessage,
  onLinkGoogle,
  onLogout,
  t,
}: {
  myNickname: string;
  setNickname: (value: string) => void;
  isGuestUser: boolean;
  accountWins: number;
  accountLosses: number;
  upgradeMessage: string;
  onLinkGoogle: () => void;
  onLogout: () => void;
  t: Translations;
}) {
  return (
    <div className="lobby-card account-card">
      <div className="account-header">
        <h2 data-step="1">{t.accountTitleText}</h2>
        {!isGuestUser && (
          <button className="account-logout" onClick={onLogout}>
            {t.logout}
          </button>
        )}
      </div>

      {isGuestUser ? (
        <p>
          {t.accountDesc}{" "}
          <span className="account-record">
            {t.record(accountWins, accountLosses)}
          </span>
        </p>
      ) : (
        <p>
          {t.accountDescGoogle}{" "}
          <span className="account-record">
            {t.record(accountWins, accountLosses)}
          </span>
        </p>
      )}

      <label className="account-input-label">{t.nickLabel}</label>
      <input
        className="lobby-input"
        placeholder={t.nickPlaceholder}
        value={myNickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={16}
      />

      {isGuestUser && (
        <div className="account-upgrade">
          <button className="google-link-btn" onClick={onLinkGoogle}>
            <span className="google-link-mark">G</span>
            <span>{t.linkGoogle}</span>
          </button>
        </div>
      )}

      {upgradeMessage && <p className="account-info-msg">{upgradeMessage}</p>}
    </div>
  );
}

export function LobbyScreen({ onGameStart }: Props) {
  const {
    myNickname,
    setNickname,
    setMyColor,
    setRoomCode,
    authUserId,
    authAccessToken,
    isGuestUser,
    accountWins,
    accountLosses,
    accountTokens,
    ownedSkins,
    accountDailyRewardTokens,
    setAuthState,
    setMatchType,
    setPlayerPieceSkins,
    isMusicMuted,
    isSfxMuted,
    toggleMusicMute,
    toggleSfxMute,
    musicVolume,
    sfxVolume,
    setMusicVolume,
    setSfxVolume,
    pieceSkin,
    setPieceSkin,
  } = useGameStore();
  const { lang, setLang, t } = useLang();
  const policyUrl = lang === "en" ? POLICY_URL_EN : POLICY_URL_KR;
  const termsUrl = lang === "en" ? TERMS_URL_EN : TERMS_URL_KR;
  const [view, setView] = useState<LobbyView>("main");
  const [joinCode, setJoinCode] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [error, setError] = useState("");
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [isSkinPickerOpen, setIsSkinPickerOpen] = useState(false);
  const [isTokenShopOpen, setIsTokenShopOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false);
  const [upgradeResult, setUpgradeResult] = useState<UpgradeResolution>({
    kind: "none",
  });
  const [showUpgradeNotice, setShowUpgradeNotice] = useState(false);
  const [atomicPreviewReady, setAtomicPreviewReady] = useState(false);
  const dailyResetTimeoutRef = useRef<number | null>(null);
  const lastRewardSyncDayRef = useRef<string>(getUtcDayKey());
  const upgradeMessage = getUpgradeDisplayMsg(upgradeResult, t);
  const buildExistingAccountSwitchPrompt = (profile: AccountProfile) => {
    const nickname = profile.nickname?.trim() || "Guest";
    if (lang === "en") {
      return [
        "This Google account already has existing PathClash data.",
        "",
        `Nickname: ${nickname}`,
        `Record: ${profile.wins}W ${profile.losses}L`,
        `Tokens: ${profile.tokens}`,
        "",
        "Your current guest progress will not be moved to that account.",
        "",
        "Do you want to switch to the existing Google account?",
      ].join("\n");
    }

    return [
      "이 Google 계정에는 기존 PathClash 데이터가 있습니다.",
      "",
      `닉네임: ${nickname}`,
      `전적: ${profile.wins}승 ${profile.losses}패`,
      `토큰: ${profile.tokens}`,
      "",
      "현재 게스트 진행 상황은 이 계정으로 옮겨지지 않습니다.",
      "",
      "기존 Google 계정으로 전환하시겠습니까?",
    ].join("\n");
  };
  const settingsButtonLabel = lang === "en" ? "Settings" : "\uC124\uC815";
  const skinButtonLabel = lang === "en" ? "Skin" : "\uC2A4\uD0A8";
  const soundButtonLabel = lang === "en" ? "Sound" : "\uC18C\uB9AC";
  const termsButtonLabel = lang === "en" ? "Terms" : "\uC774\uC6A9\uC57D\uAD00";
  const skinModalTitle =
    lang === "en"
      ? "Choose Piece Skin"
      : "\uB9D0 \uC2A4\uD0A8 \uC120\uD0DD";
  const skinModalDesc =
    lang === "en"
      ? "Select the look you want to use for your piece."
      : "\uD50C\uB808\uC774\uC5B4 \uB9D0\uC5D0 \uC801\uC6A9\uD560 \uC678\uD615\uC744 \uC120\uD0DD\uD558\uC138\uC694.";
  const skinApplyLabel = lang === "en" ? "Close" : "\uB2EB\uAE30";
  const settingsModalTitle =
    lang === "en" ? "Profile Settings" : "\uD504\uB85C\uD544 \uC124\uC815";
  const settingsModalDesc =
    lang === "en"
      ? "Review your account information and support details."
      : "\uACC4\uC815 \uC815\uBCF4\uC640 \uBB38\uC758 \uC6A9 \uC138\uBD80 \uC815\uBCF4\uB97C \uD655\uC778\uD558\uC138\uC694.";
  const settingsCopyLabel = lang === "en" ? "Copy ID" : "ID \uBCF5\uC0AC";
  const settingsCopiedMsg =
    lang === "en"
      ? "User ID copied."
      : "\uC0AC\uC6A9\uC790 ID\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";
  const settingsCopyFailedMsg =
    lang === "en"
      ? "Failed to copy ID."
      : "ID \uBCF5\uC0AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const accountTypeLabel = lang === "en" ? "Account Type" : "\uACC4\uC815 \uC720\uD615";
  const nicknameLabel = lang === "en" ? "Nickname" : "\uB2C9\uB124\uC784";
  const userIdLabel = lang === "en" ? "User ID" : "\uC0AC\uC6A9\uC790 ID";
  const skinLabel = lang === "en" ? "Current Skin" : "\uD604\uC7AC \uC2A4\uD0A8";
  const recordLabel = lang === "en" ? "Record" : "\uC804\uC801";
  const audioModalTitle = lang === "en" ? "Audio Settings" : "\uC624\uB514\uC624 \uC124\uC815";
  const musicLabel = lang === "en" ? "Music" : "\uC74C\uC545";
  const sfxLabel = lang === "en" ? "SFX" : "\uD6A8\uACFC\uC74C";
  const onLabel = lang === "en" ? "ON" : "\uCF2C";
  const offLabel = lang === "en" ? "OFF" : "\uB054";
  const musicVolumeLabel = lang === "en" ? "Music Volume" : "\uC74C\uC545 \uBCFC\uB968";
  const sfxVolumeLabel = lang === "en" ? "SFX Volume" : "\uD6A8\uACFC\uC74C \uBCFC\uB968";
  const accountTypeValue = isGuestUser
    ? lang === "en"
      ? "Guest"
      : "\uAC8C\uC2A4\uD2B8"
    : "Google";
  const tokenShopTitle = lang === "en" ? "Token Shop" : "\uD1A0\uD070 \uC0F5";
  const tokenShopDesc =
    lang === "en"
      ? "Choose a token pack that matches how you want to unlock skins."
      : "\uC2A4\uD0A8 \uD574\uAE08 \uC18D\uB3C4\uC5D0 \uB9DE\uB294 \uD1A0\uD070 \uD329\uC744 \uC120\uD0DD\uD558\uC138\uC694.";
  const tokenShopCta = lang === "en" ? "Buy" : "\uAD6C\uB9E4";
  const tokenShopUnavailableMsg =
    lang === "en"
      ? "Token packs are available in the Android app only."
      : "\uD1A0\uD070 \uD329\uC740 \uC548\uB4DC\uB85C\uC774\uB4DC \uC571\uC5D0\uC11C\uB9CC \uAD6C\uB9E4\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
  const tokenShopFailedMsg =
    lang === "en"
      ? "Token purchase failed."
      : "\uD1A0\uD070 \uAD6C\uB9E4\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const tokenShopCancelledMsg =
    lang === "en"
      ? "Token purchase was cancelled."
      : "\uD1A0\uD070 \uAD6C\uB9E4\uAC00 \uCDE8\uC18C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";
  const tokenShopSuccessMsg = (tokens: number) =>
    lang === "en"
      ? `${tokens} tokens were added to your account.`
      : `${tokens}\uD1A0\uD070\uC774 \uACC4\uC815\uC5D0 \uCD94\uAC00\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`;
  const skinPurchasePrompt = (skinName: string) =>
    lang === "en"
      ? `Purchase ${skinName}?`
      : `${skinName} \uC2A4\uD0A8\uC744 \uAD6C\uB9E4\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?`;
  const skinPurchaseSuccessMsg = (skinName: string) =>
    lang === "en"
      ? `${skinName} unlocked.`
      : `${skinName} \uC2A4\uD0A8\uC774 \uD574\uAE08\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`;
  const skinPurchaseFailedMsg =
    lang === "en"
      ? "Skin purchase failed."
      : "\uC2A4\uD0A8 \uAD6C\uB9E4\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const skinPurchaseInsufficientMsg =
    lang === "en"
      ? "Not enough tokens."
      : "\uD1A0\uD070\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4.";
  const tokenPacks: Array<{
    id: TokenPackId;
    name: string;
    price: string;
    tokens: number;
    blurb: string;
    benefit: string;
  }> = [
    {
      id: "starter",
      name: "Starter",
      price: "$0.99",
      tokens: 150,
      blurb:
        lang === "en"
          ? "A little more than a day of play"
          : "\uD558\uB8E8 \uD50C\uB808\uC774\uBCF4\uB2E4 \uC870\uAE08 \uB354",
      benefit:
        lang === "en"
          ? "Can buy 1 Common skin"
          : "Common \uC2A4\uD0A8 1\uAC1C \uAD6C\uB9E4 \uAC00\uB2A5",
    },
    {
      id: "small",
      name: "Small",
      price: "$2.99",
      tokens: 500,
      blurb:
        lang === "en"
          ? "A clean step into premium skins"
          : "\uD504\uB9AC\uBBF8\uC5C4 \uC2A4\uD0A8\uC73C\uB85C \uAC00\uB294 \uAC00\uBCBC\uC6B4 \uC2DC\uC791",
      benefit:
        lang === "en"
          ? "Can buy 1 Rare skin"
          : "Rare \uC2A4\uD0A8 1\uAC1C \uAD6C\uB9E4 \uAC00\uB2A5",
    },
    {
      id: "medium",
      name: "Medium",
      price: "$6.99",
      tokens: 1200,
      blurb:
        lang === "en"
          ? "Efficient value for a serious upgrade"
          : "\uBCF8\uACA9\uC801\uC778 \uC5C5\uADF8\uB808\uC774\uB4DC\uB97C \uC704\uD55C \uD6A8\uC728\uC801 \uAD6C\uC131",
      benefit:
        lang === "en"
          ? "1 Legendary skin + leftover"
          : "Legendary 1\uAC1C + \uC5EC\uC720 \uD1A0\uD070",
    },
    {
      id: "large",
      name: "Large",
      price: "$14.99",
      tokens: 3000,
      blurb:
        lang === "en"
          ? "Built for collecting multiple premium skins"
          : "\uC5EC\uB7EC \uD504\uB9AC\uBBF8\uC5C4 \uC2A4\uD0A8 \uC218\uC9D1\uC5D0 \uB9DE\uCD98 \uAD6C\uC131",
      benefit:
        lang === "en"
          ? "Several Rares or 3 Legendaries"
          : "Rare \uC5EC\uB7EC \uAC1C \uB610\uB294 Legendary 3\uAC1C",
    },
    {
      id: "whale",
      name: "Whale",
      price: "$29.99",
      tokens: 7000,
      blurb:
        lang === "en"
          ? "For nearly the full collection"
          : "\uAC70\uC758 \uC804\uCCB4 \uCF5C\uB809\uC158\uC744 \uC704\uD55C \uAD6C\uC131",
      benefit:
        lang === "en"
          ? "Can buy almost every skin"
          : "\uAC70\uC758 \uBAA8\uB4E0 \uC2A4\uD0A8 \uAD6C\uB9E4 \uAC00\uB2A5",
    },
  ];
  const formatDisplayUserId = (userId: string | null) => {
    if (!userId) return "-";
    if (userId.length <= 13) return userId;
    return `${userId.slice(0, 8)}-${userId.slice(9, 13)}`;
  };
  const skinChoices: Array<{
    id:
      | "classic"
      | "ember"
      | "nova"
      | "aurora"
      | "void"
      | "plasma"
      | "gold_core"
      | "neon_pulse"
      | "cosmic"
      | "inferno"
      | "arc_reactor"
      | "quantum"
      | "atomic"
      | "flag_kr"
      | "flag_jp"
      | "flag_cn"
      | "flag_us"
      | "flag_uk";
    name: string;
    desc: string;
    requiredWins: number | null;
    requiredPlays?: number | null;
    tokenPrice?: number | null;
    tier?: "common" | "rare" | "legendary" | null;
  }> = [
    {
      id: "classic",
      name: lang === "en" ? "Classic" : "\uAE30\uBCF8",
      desc:
        lang === "en"
          ? "Default red glow."
          : "\uAE30\uBCF8 \uBD89\uC740 \uAE00\uB85C\uC6B0 \uC2A4\uD0C0\uC77C.",
      requiredWins: null,
      tokenPrice: null,
    },
    {
      id: "ember",
      name: lang === "en" ? "Ember" : "\uC5E0\uBC84",
      desc:
        lang === "en"
          ? "Warm orange flare."
          : "\uC8FC\uD669\uBE5B\uC774 \uB3C4\uB294 \uAC15\uD55C \uBC1C\uAD11.",
      requiredWins: 10,
      tokenPrice: null,
    },
    {
      id: "nova",
      name: lang === "en" ? "Nova" : "\uB178\uBC14",
      desc:
        lang === "en"
          ? "Cool cyan core."
          : "\uCCAD\uB85D \uACC4\uC5F4\uC758 \uCC28\uAC00\uC6B4 \uCF54\uC5B4.",
      requiredWins: 50,
      tokenPrice: null,
    },
    {
      id: "aurora",
      name: lang === "en" ? "Aurora" : "\uC624\uB85C\uB77C",
      desc:
        lang === "en"
          ? "Vivid green-yellow glow."
          : "\uC5F0\uB450\uBE5B\uACFC \uD669\uAE08\uBE5B\uC774 \uC11E\uC778 \uBC1C\uAD11.",
      requiredWins: 100,
      tokenPrice: null,
    },
    {
      id: "void",
      name: lang === "en" ? "Void" : "\uBCF4\uC774\uB4DC",
      desc:
        lang === "en"
          ? "Deep violet core."
          : "\uC9D9\uC740 \uBCF4\uB78F\uBE5B \uCF54\uC5B4 \uC2A4\uD0C0\uC77C.",
      requiredWins: 500,
      tokenPrice: null,
    },
    {
      id: "plasma",
      name: lang === "en" ? "Plasma" : "\uD50C\uB77C\uC988\uB9C8",
      desc:
        lang === "en"
          ? "Plasma energy core."
          : "\uD50C\uB77C\uC988\uB9C8 \uC5D0\uB108\uC9C0 \uCF54\uC5B4.",
      requiredWins: null,
      requiredPlays: null,
      tokenPrice: 120,
      tier: "common",
    },
    {
      id: "gold_core",
      name: lang === "en" ? "Gold Core" : "\uACE8\uB4DC \uCF54\uC5B4",
      desc:
        lang === "en"
          ? "Gilded core — a sunburst mandala spins within molten gold."
          : "황금 코어 — 녹아내린 금 속에서 선버스트 만다라가 회전.",
      requiredWins: null,
      requiredPlays: null,
      tokenPrice: 120,
      tier: "common",
    },
    {
      id: "neon_pulse",
      name: lang === "en" ? "Neon Pulse" : "\uB124\uC628 \uD384\uC2A4",
      desc:
        lang === "en"
          ? "Vibrant neon pulse."
          : "\uC120\uBA85\uD55C \uB124\uC628 \uD384\uC2A4.",
      requiredWins: null,
      requiredPlays: null,
      tokenPrice: 120,
      tier: "common",
    },
    {
      id: "inferno",
      name: lang === "en" ? "Inferno" : "\uC778\uD398\uB974\uB178",
      desc:
        lang === "en"
          ? "Burning inferno core."
          : "\uD0C0\uC624\uB974\uB294 \uC778\uD398\uB974\uB178 \uCF54\uC5B4.",
      requiredWins: null,
      requiredPlays: null,
      tokenPrice: 120,
      tier: "common",
    },
    {
      id: "quantum",
      name: lang === "en" ? "Quantum" : "퀀텀",
      desc:
        lang === "en"
          ? "Quantum flux core — mint and lavender rings oscillate in superposition."
          : "퀀텀 플럭스 코어 — 민트와 라벤더 링이 중첩 상태로 진동.",
      requiredWins: null,
      requiredPlays: null,
      tokenPrice: 120,
      tier: "common",
    },
    {
      id: "cosmic",
      name: lang === "en" ? "Cosmic" : "\uCF54\uC2A4\uBBF9",
      desc:
        lang === "en"
          ? "Rare nebula — twin orbit rings pulse with cosmic energy."
          : "희귀 성운 — 이중 궤도 링이 우주 에너지로 맥동.",
      requiredWins: null,
      requiredPlays: null,
      tokenPrice: 350,
      tier: "rare",
    },
    {
      id: "arc_reactor",
      name: lang === "en" ? "Arc Reactor" : "\uC544\uD06C \uB9AC\uC561\uD130",
      desc:
        lang === "en"
          ? "High-energy reactor core."
          : "\uACE0\uCD9C\uB825 \uB9AC\uC561\uD130 \uCF54\uC5B4.",
      requiredWins: null,
      requiredPlays: null,
      tokenPrice: 350,
      tier: "rare",
    },
    {
      id: "atomic",
      name: lang === "en" ? "Atomic" : "\uC544\uD1A0\uBBF9",
      desc:
        lang === "en"
          ? "Atomic orbit energy core."
          : "\uC6D0\uC790 \uADA4\uB3C4 \uC5D0\uB108\uC9C0 \uCF54\uC5B4.",
      requiredWins: null,
      requiredPlays: null,
      tokenPrice: 900,
      tier: "legendary",
    },
    {
      id: "flag_kr",
      name: lang === "en" ? "Korea" : "\uD55C\uAD6D",
      desc:
        lang === "en"
          ? "The Korean flag."
          : "\uB300\uD55C\uBBFC\uAD6D \uAD6D\uAE30.",
      requiredWins: null,
      requiredPlays: 100,
      tokenPrice: null,
      tier: null,
    },
    {
      id: "flag_jp",
      name: lang === "en" ? "Japan" : "\uC77C\uBCF8",
      desc:
        lang === "en"
          ? "The Japanese flag."
          : "\uC77C\uBCF8 \uAD6D\uAE30.",
      requiredWins: null,
      requiredPlays: 100,
      tokenPrice: null,
      tier: null,
    },
    {
      id: "flag_cn",
      name: lang === "en" ? "China" : "\uC911\uAD6D",
      desc:
        lang === "en"
          ? "The Chinese flag."
          : "\uC911\uAD6D \uAD6D\uAE30.",
      requiredWins: null,
      requiredPlays: 100,
      tokenPrice: null,
      tier: null,
    },
    {
      id: "flag_us",
      name: lang === "en" ? "USA" : "\uBBF8\uAD6D",
      desc:
        lang === "en"
          ? "The American flag."
          : "\uBBF8\uAD6D \uAD6D\uAE30.",
      requiredWins: null,
      requiredPlays: 100,
      tokenPrice: null,
      tier: null,
    },
    {
      id: "flag_uk",
      name: lang === "en" ? "UK" : "\uC601\uAD6D",
      desc:
        lang === "en"
          ? "The British flag."
          : "\uC601\uAD6D \uAD6D\uAE30.",
      requiredWins: null,
      requiredPlays: 100,
      tokenPrice: null,
      tier: null,
    },
  ];
  const getSkinRequirementLabel = (
    requiredWins: number | null,
    requiredPlays?: number | null,
    tokenPrice?: number | null,
  ) => {
    if (tokenPrice !== null && tokenPrice !== undefined) {
      return lang === "en"
        ? `Tokens ${tokenPrice}`
        : `\uD1A0\uD070 ${tokenPrice}`;
    }
    if (requiredPlays !== null && requiredPlays !== undefined) {
      return lang === "en"
        ? `Plays ${requiredPlays}`
        : `\uD50C\uB808\uC774 ${requiredPlays}`;
    }
    return lang === "en"
      ? `Wins ${requiredWins}`
      : `\uC2B9\uB9AC ${requiredWins}`;
  };
  const currentSkinName =
    skinChoices.find((choice) => choice.id === pieceSkin)?.name ?? pieceSkin;
  const syncAccountSummary = useCallback(() => {
    return refreshAccountSummary().then(({
      nickname,
      equippedSkin,
      ownedSkins,
      wins,
      losses,
      tokens,
      dailyRewardWins,
      dailyRewardTokens,
    }) => {
      setAuthState({
        ready: true,
        userId: authUserId,
        accessToken: useGameStore.getState().authAccessToken,
        isGuestUser,
        nickname,
        equippedSkin,
        ownedSkins,
        wins,
        losses,
        tokens,
        dailyRewardWins,
        dailyRewardTokens,
      });
      lastRewardSyncDayRef.current = getUtcDayKey();
    });
  }, [authUserId, isGuestUser, setAuthState]);

  useEffect(() => {
    void syncAccountSummary();
  }, [syncAccountSummary]);

  useEffect(() => {
    const clearDailyResetTimeout = () => {
      if (dailyResetTimeoutRef.current !== null) {
        window.clearTimeout(dailyResetTimeoutRef.current);
        dailyResetTimeoutRef.current = null;
      }
    };

    const scheduleDailyResetRefresh = () => {
      clearDailyResetTimeout();
      dailyResetTimeoutRef.current = window.setTimeout(() => {
        void syncAccountSummary().finally(() => {
          scheduleDailyResetRefresh();
        });
      }, getMsUntilNextUtcMidnight());
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const currentUtcDay = getUtcDayKey();
      if (currentUtcDay === lastRewardSyncDayRef.current) return;
      void syncAccountSummary();
      scheduleDailyResetRefresh();
    };

    scheduleDailyResetRefresh();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearDailyResetTimeout();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncAccountSummary]);

  useEffect(() => {
    let active = true;

    void resolveUpgradeFlowAfterRedirect().then((result) => {
      if (!active || result.kind === "none") return;

      if (result.kind === "switch_confirm_required") {
        const confirmed = window.confirm(
          buildExistingAccountSwitchPrompt(result.profile),
        );

        if (!confirmed) {
          void cancelPendingGoogleUpgradeSwitch().then((guestState) => {
            if (!active) return;
            setAuthState(guestState);
            setUpgradeResult({ kind: "none" });
          });
          return;
        }

        void confirmPendingGoogleUpgradeSwitch().then((confirmResult) => {
          if (!active) return;

          if (confirmResult.kind === "switch_ok") {
            applyProfileToStore(confirmResult.profile, setAuthState);
            setUpgradeResult(confirmResult);
            setShowUpgradeNotice(true);
            return;
          }

          setUpgradeResult({ kind: "auth_error" });
        });
        return;
      }

      if (result.kind === "upgrade_ok" || result.kind === "switch_ok") {
        applyProfileToStore(result.profile, setAuthState);
        setUpgradeResult(result);
        if (result.kind === "switch_ok") {
          setShowUpgradeNotice(true);
        }
        return;
      }

      setUpgradeResult(result);
    });

    return () => {
      active = false;
    };
  }, [buildExistingAccountSwitchPrompt, setAuthState]);

  useEffect(() => {
    const shouldLockScroll =
      isSkinPickerOpen ||
      isTokenShopOpen ||
      isSettingsOpen ||
      isAudioSettingsOpen;

    if (!shouldLockScroll) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlOverscrollBehavior =
      document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overscrollBehavior =
        previousHtmlOverscrollBehavior;
    };
  }, [
    isAudioSettingsOpen,
    isSettingsOpen,
    isSkinPickerOpen,
    isTokenShopOpen,
  ]);

  useEffect(() => {
    if (!isSkinPickerOpen) {
      setAtomicPreviewReady(false);
      return;
    }

    let raf1 = 0;
    let raf2 = 0;
    setAtomicPreviewReady(false);
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setAtomicPreviewReady(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [isSkinPickerOpen]);

  const getNick = () =>
    myNickname.trim() || `Guest${Math.floor(Math.random() * 9999)}`;

  const startSocket = () => {
    const socket = connectSocket();

    socket.off("room_created");
    socket.off("room_joined");
    socket.off("opponent_joined");
    socket.off("join_error");
    socket.off("matchmaking_waiting");

    socket.on(
      "room_created",
      ({
        code,
        color,
        pieceSkin: selfPieceSkin,
      }: {
        roomId: string;
        code: string;
        color: "red" | "blue";
        pieceSkin?: PieceSkin;
      }) => {
        setMyColor(color);
        setRoomCode(code);
        setPlayerPieceSkins({
          red: color === "red" ? selfPieceSkin ?? pieceSkin : "classic",
          blue: color === "blue" ? selfPieceSkin ?? pieceSkin : "classic",
        });
        setCreatedCode(code);
        setError("");
        setIsMatchmaking(false);
        setView("create");
      },
    );

    socket.on(
      "room_joined",
      ({
        color,
        roomId,
        selfPieceSkin,
        opponentPieceSkin,
      }: {
        roomId: string;
        color: "red" | "blue";
        opponentNickname: string;
        selfPieceSkin?: PieceSkin;
        opponentPieceSkin?: PieceSkin;
      }) => {
        setMyColor(color);
        setRoomCode(roomId);
        setPlayerPieceSkins({
          red:
            color === "red"
              ? selfPieceSkin ?? pieceSkin
              : opponentPieceSkin ?? "classic",
          blue:
            color === "blue"
              ? selfPieceSkin ?? pieceSkin
              : opponentPieceSkin ?? "classic",
        });
        setError("");
        setIsMatchmaking(false);
        onGameStart();
      },
    );

    socket.on(
      "opponent_joined",
      ({
        color,
        pieceSkin: opponentPieceSkin,
      }: {
        nickname: string;
        color?: "red" | "blue";
        pieceSkin?: PieceSkin;
      }) => {
      const myCurrentColor = useGameStore.getState().myColor;
      const myCurrentPieceSkin = useGameStore.getState().pieceSkin;
      const opponentColor =
        color ?? (myCurrentColor === "red" ? "blue" : "red");
      if (opponentColor) {
        setPlayerPieceSkins({
          red:
            opponentColor === "red" ? opponentPieceSkin ?? "classic" : myCurrentPieceSkin,
          blue:
            opponentColor === "blue" ? opponentPieceSkin ?? "classic" : myCurrentPieceSkin,
        });
      }
      setError("");
      setIsMatchmaking(false);
      onGameStart();
      },
    );

    socket.on("join_error", ({ message }: { message: string }) => {
      setIsMatchmaking(false);
      setError(message);
    });

    socket.on("matchmaking_waiting", () => {
      setError("");
      setIsMatchmaking(true);
    });

    return socket;
  };

  const buildPlayerPayload = async () => ({
    nickname: getNick(),
    auth: await getSocketAuthPayload(),
    pieceSkin: useGameStore.getState().pieceSkin,
  });

  const handleCreateRoom = async () => {
    setError("");
    setIsMatchmaking(false);
    setMatchType("friend");
    const socket = startSocket();
    socket.emit("create_room", await buildPlayerPayload());
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim()) {
      setError(t.joinError);
      return;
    }

    setError("");
    setIsMatchmaking(false);
    setMatchType("friend");
    const socket = startSocket();
    socket.emit("join_room", {
      code: joinCode.trim().toUpperCase(),
      ...(await buildPlayerPayload()),
    });
  };

  const handleRandom = async () => {
    setError("");
    setMatchType("random");
    const socket = startSocket();
    socket.emit("join_random", await buildPlayerPayload());
  };

  const handleCancelRandom = () => {
    const socket = connectSocket();
    socket.emit("cancel_random");
    setIsMatchmaking(false);
    setMatchType(null);
  };

  const handleAiMatch = async () => {
    setError("");
    setIsMatchmaking(false);
    setMatchType("ai");
    const socket = startSocket();
    const hasSeenAiTutorial =
      window.localStorage.getItem(AI_TUTORIAL_SEEN_KEY) === "1";
    socket.emit("join_ai", {
      ...(await buildPlayerPayload()),
      tutorialPending: !hasSeenAiTutorial,
    });
  };

  const handleLinkGoogle = async () => {
    setUpgradeResult({ kind: "none" });
    setShowUpgradeNotice(false);
    await linkGoogleAccount();
  };

  const handleLogout = async () => {
    setUpgradeResult({ kind: "none" });
    setShowUpgradeNotice(false);
    const guestState = await logoutToGuestMode();
    setAuthState(guestState);
  };

  const handleDonate = async () => {
    const result = await startDonation({
      webUrl: DONATE_URL,
      appUserId: authUserId,
    });

    if (result === "opened_web") return;
    if (result === "purchased") {
      window.alert(t.donateSuccess);
      return;
    }
    if (result === "cancelled") {
      window.alert(t.donateCancelled);
      return;
    }
    if (result === "unavailable") {
      window.alert(t.donateUnavailable);
      return;
    }
    window.alert(t.donateFailed);
  };

  const handleTokenPackPurchase = async (
    packId: TokenPackId,
    tokenAmount: number,
  ) => {
    const result = await startTokenPackPurchase({
      packId,
      accessToken: authAccessToken,
      appUserId: authUserId,
    });

    if (result === "purchased") {
      window.alert(tokenShopSuccessMsg(tokenAmount));
      void syncAccountSummary();
      return;
    }

    if (result === "cancelled") {
      window.alert(tokenShopCancelledMsg);
      return;
    }

    if (result === "unavailable") {
      window.alert(tokenShopUnavailableMsg);
      return;
    }

    window.alert(tokenShopFailedMsg);
  };

  const handleCopyUserId = async () => {
    if (!authUserId) return;

    try {
      await navigator.clipboard.writeText(authUserId);
      window.alert(settingsCopiedMsg);
    } catch (error) {
      console.error("[clipboard] failed to copy user id", error);
      window.alert(settingsCopyFailedMsg);
    }
  };

  const handleSkinChoiceSelect = async (
    choice: (typeof skinChoices)[number],
    isLocked: boolean,
    isOwned: boolean,
  ) => {
    if (isLocked) return;

    if (choice.tokenPrice !== null && choice.tokenPrice !== undefined && !isOwned) {
      const confirmed = window.confirm(skinPurchasePrompt(choice.name));
      if (!confirmed) return;

      const result = await purchaseSkinWithTokens(choice.id);
      if (result === "purchased" || result === "already_owned") {
        await syncAccountSummary();
        setPieceSkin(choice.id);
        window.alert(skinPurchaseSuccessMsg(choice.name));
        return;
      }

      if (result === "insufficient_tokens") {
        window.alert(skinPurchaseInsufficientMsg);
        return;
      }

      window.alert(skinPurchaseFailedMsg);
      return;
    }

    setPieceSkin(choice.id);
  };

  const accountCard = (
    <AccountCard
      myNickname={myNickname}
      setNickname={setNickname}
      isGuestUser={isGuestUser}
      accountWins={accountWins}
      accountLosses={accountLosses}
      upgradeMessage={upgradeMessage}
      onLinkGoogle={() => void handleLinkGoogle()}
      onLogout={() => void handleLogout()}
      t={t}
    />
  );

  return (
    <div className="lobby-screen">
      <h1 className="logo">PathClash</h1>
      {accountCard}

      {view === "create" && (
        <div className="lobby-card">
          <h2 data-step="C">{t.roomCreatedTitle}</h2>
          <p>{t.roomCreatedDesc}</p>
          <div className="room-code">{createdCode}</div>
          <p className="waiting-text">{t.waitingText}</p>
        </div>
      )}

      {view === "join" ? (
        <div className="lobby-card">
          <h2 data-step="3">{t.joinTitle}</h2>
          <input
            className="lobby-input code-input"
            placeholder={t.joinPlaceholder}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          {error && <p className="error-msg">{error}</p>}
          <button
            className="lobby-btn primary"
            onClick={() => void handleJoinRoom()}
          >
            {t.joinBtn}
          </button>
          <button
            className="lobby-btn secondary"
            onClick={() => {
              setView("main");
              setError("");
            }}
          >
            {t.backBtn}
          </button>
        </div>
      ) : (
        <>
          <div className="lobby-card">
            <h2 data-step="2">{t.aiTitle}</h2>
            <p>{t.aiDesc}</p>
            <button className="lobby-btn ai" onClick={() => void handleAiMatch()}>
              {t.aiBtn}
            </button>
          </div>

          <div className="lobby-card">
            <h2 data-step="3">{t.friendTitle}</h2>
            <div className="btn-divider">
              <button
                className="lobby-btn primary"
                onClick={() => void handleCreateRoom()}
              >
                {t.createRoomBtn}
              </button>
              <button
                className="lobby-btn secondary"
                onClick={() => setView("join")}
              >
                {t.enterCodeBtn}
              </button>
            </div>
          </div>

          <div className={`lobby-card ${isMatchmaking ? "is-matchmaking" : ""}`}>
            <div className="lobby-card-title-row">
              <h2 data-step="4">{t.randomTitle}</h2>
              <div className="daily-reward-badge" aria-label="Daily tokens earned">
                <span className="daily-reward-icon" aria-hidden="true">
                  {"\uD83D\uDC8E"}
                </span>
                <span>{accountDailyRewardTokens}</span>
                <span className="daily-reward-separator">/</span>
                <span>120</span>
              </div>
            </div>
            {isMatchmaking ? (
              <>
                <div className="matchmaking-status">
                  <div className="matchmaking-status-head">
                    <span className="matchmaking-dot" />
                    <strong>{t.matchmakingHead}</strong>
                  </div>
                  <div className="spinner" />
                  <p>{t.matchmakingDesc}</p>
                </div>
                <button className="lobby-btn cancel" onClick={handleCancelRandom}>
                  {t.cancelBtn}
                </button>
              </>
            ) : (
              <button className="lobby-btn accent" onClick={() => void handleRandom()}>
                {t.startBtn}
              </button>
            )}
            {error && <p className="error-msg">{error}</p>}
          </div>
        </>
      )}

      {showUpgradeNotice && (
        <UpgradeNoticeDialog
          message={upgradeMessage}
          onClose={() => {
            setShowUpgradeNotice(false);
            setUpgradeResult({ kind: "none" });
          }}
          t={t}
        />
      )}
      {isSkinPickerOpen && (
        <div
          className="upgrade-modal-backdrop"
          onClick={() => setIsSkinPickerOpen(false)}
        >
          <div
            className="upgrade-modal skin-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="skin-modal-head">
              <h3>{skinModalTitle}</h3>
              <div className="skin-token-badge" aria-label="Current tokens">
                <span className="skin-token-badge-main">
                  <span className="skin-token-icon" aria-hidden="true">
                    {"\uD83D\uDC8E"}
                  </span>
                  <span>{accountTokens}</span>
                </span>
                <button
                  className="skin-token-plus"
                  type="button"
                  aria-label={tokenShopTitle}
                  title={tokenShopTitle}
                  onClick={() => setIsTokenShopOpen(true)}
                >
                  +
                </button>
              </div>
            </div>
            <p>{skinModalDesc}</p>
            <div className="skin-option-list">
              {skinChoices.map((choice) => {
                const totalPlays = accountWins + accountLosses;
                const isOwned = ownedSkins.includes(choice.id);
                const lockedByWins =
                  choice.requiredWins !== null &&
                  accountWins < choice.requiredWins;
                const lockedByPlays =
                  choice.requiredPlays !== null &&
                  choice.requiredPlays !== undefined &&
                  totalPlays < choice.requiredPlays;
                const lockedByTokens =
                  choice.tokenPrice !== null &&
                  choice.tokenPrice !== undefined &&
                  !isOwned &&
                  accountTokens < choice.tokenPrice;
                const isLocked = lockedByWins || lockedByPlays || lockedByTokens;
                return (
                  <button
                    key={choice.id}
                    className={`skin-option-card ${
                      pieceSkin === choice.id ? "is-selected" : ""
                    } ${isLocked ? "is-locked" : ""}`}
                    onClick={() => void handleSkinChoiceSelect(choice, isLocked, isOwned)}
                    disabled={false}
                    type="button"
                  >
                    <span
                      className={`skin-preview skin-preview-${choice.id}`}
                      aria-hidden="true"
                    >
                      {isFlagSkin(choice.id) && <FlagSkin id={choice.id} />}
                      {choice.id === "cosmic" && (
                        <StarrySkySkin
                          className="skin-preview-cosmic-canvas"
                          density={0.16}
                        />
                      )}
                      {choice.id === "arc_reactor" && (
                        <span className="skin-preview-arc-scale">
                          <span className="skin-preview-arc_reactor-wrap">
                            <span className="skin-preview-case_container">
                              <span className="skin-preview-e7">
                                <span className="skin-preview-semi_arc_3 skin-preview-e5_1">
                                  <span className="skin-preview-semi_arc_3 skin-preview-e5_2">
                                    <span className="skin-preview-semi_arc_3 skin-preview-e5_3">
                                      <span className="skin-preview-semi_arc_3 skin-preview-e5_4" />
                                    </span>
                                  </span>
                                </span>
                                <span className="skin-preview-core2" />
                              </span>
                              <span className="skin-preview-marks">
                                {Array.from({ length: 60 }, (_, index) => (
                                  <span
                                    key={`arc-preview-${index}`}
                                    className="skin-preview-arc-mark"
                                    style={{
                                      ["--mark-angle" as string]: `${(index + 1) * 6}deg`,
                                    }}
                                  />
                                ))}
                              </span>
                            </span>
                          </span>
                        </span>
                      )}
                      {choice.id === "atomic" && (
                        <AtomicPreview ready={atomicPreviewReady} />
                      )}
                    </span>
                    <span className="skin-option-copy">
                      <strong
                        className={
                          choice.tier ? `skin-name-tier-${choice.tier}` : undefined
                        }
                      >
                        {choice.name}
                      </strong>
                      <span>{choice.desc}</span>
                    </span>
                    {(isLocked || (choice.tokenPrice !== null && choice.tokenPrice !== undefined && !isOwned)) && (
                      <span className="skin-lock-meta" aria-label="Locked skin">
                        <span className="skin-lock-icon" aria-hidden="true">
                          {choice.tokenPrice !== null && choice.tokenPrice !== undefined
                            ? "\uD83D\uDC8E"
                            : "\uD83D\uDD12"}
                        </span>
                        <span>
                          {getSkinRequirementLabel(
                            choice.requiredWins,
                            choice.requiredPlays,
                            choice.tokenPrice,
                          )}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="upgrade-modal-actions">
              <button
                className="lobby-btn primary"
                onClick={() => setIsSkinPickerOpen(false)}
                type="button"
              >
                {skinApplyLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      {isTokenShopOpen && (
        <div
          className="upgrade-modal-backdrop"
          onClick={() => setIsTokenShopOpen(false)}
        >
          <div
            className="upgrade-modal token-shop-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="skin-modal-head token-shop-head">
              <div>
                <h3>{tokenShopTitle}</h3>
                <p className="token-shop-desc">{tokenShopDesc}</p>
              </div>
              <div className="skin-token-badge" aria-label="Current tokens">
                <span className="skin-token-badge-main">
                  <span className="skin-token-icon" aria-hidden="true">
                    {"\uD83D\uDC8E"}
                  </span>
                  <span>{accountTokens}</span>
                </span>
              </div>
            </div>
            <div className="token-pack-grid">
              {tokenPacks.map((pack) => (
                <article key={pack.id} className={`token-pack-card token-pack-${pack.id}`}>
                  <div className="token-pack-topline">
                    <span className="token-pack-name">{pack.name}</span>
                    <span className="token-pack-price">{pack.price}</span>
                  </div>
                  <div className="token-pack-amount">
                    <span className="token-pack-gem" aria-hidden="true">
                      {"\uD83D\uDC8E"}
                    </span>
                    <strong>{pack.tokens}</strong>
                  </div>
                  <p className="token-pack-blurb">{pack.blurb}</p>
                  <p className="token-pack-benefit">{pack.benefit}</p>
                  <button
                    className="lobby-btn primary token-pack-btn"
                    type="button"
                    onClick={() => void handleTokenPackPurchase(pack.id, pack.tokens)}
                  >
                    {tokenShopCta}
                  </button>
                </article>
              ))}
            </div>
            <div className="upgrade-modal-actions">
              <button
                className="lobby-btn secondary"
                onClick={() => setIsTokenShopOpen(false)}
                type="button"
              >
                {skinApplyLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="lobby-control-row">
        <div className="lang-toggle" role="group" aria-label="Language toggle">
          <button
            className={`lang-toggle-btn ${lang === "en" ? "is-active" : ""}`}
            onClick={() => setLang("en")}
            aria-pressed={lang === "en"}
            type="button"
          >
            EN
          </button>
          <button
            className={`lang-toggle-btn ${lang === "kr" ? "is-active" : ""}`}
            onClick={() => setLang("kr")}
            aria-pressed={lang === "kr"}
            type="button"
          >
            KR
          </button>
        </div>
        <div className="audio-toggle" role="group" aria-label="Skin picker">
          <button
            className={`audio-toggle-btn skin-toggle-btn ${
              isSkinPickerOpen ? "is-active" : ""
            }`}
            onClick={() => setIsSkinPickerOpen((open) => !open)}
            aria-pressed={isSkinPickerOpen}
            title={skinButtonLabel}
            type="button"
          >
            {skinButtonLabel}
          </button>
        </div>
      </div>
      <div className="lobby-utility-links">
        <button
          className="lobby-utility-link"
          onClick={() => setIsSettingsOpen(true)}
          type="button"
        >
          {settingsButtonLabel}
        </button>
      </div>
      {isSettingsOpen && (
        <div
          className="upgrade-modal-backdrop"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="upgrade-modal skin-modal settings-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="skin-modal-head">
              <h3>{settingsModalTitle}</h3>
            </div>
            <div className="settings-scroll-body">
              <p>{settingsModalDesc}</p>
              <div className="settings-section">
                <div className="settings-row">
                  <span className="settings-label">{nicknameLabel}</span>
                  <strong className="settings-value">{myNickname || "-"}</strong>
                </div>
                <div className="settings-row">
                  <span className="settings-label">{userIdLabel}</span>
                  <div className="settings-id-group">
                    <strong className="settings-value settings-id-value">
                      {formatDisplayUserId(authUserId)}
                    </strong>
                    <button
                      className="settings-copy-btn"
                      type="button"
                      onClick={() => void handleCopyUserId()}
                    >
                      {settingsCopyLabel}
                    </button>
                  </div>
                </div>
                <div className="settings-row">
                  <span className="settings-label">{accountTypeLabel}</span>
                  <strong className="settings-value">{accountTypeValue}</strong>
                </div>
                <div className="settings-row">
                  <span className="settings-label">{skinLabel}</span>
                  <strong className="settings-value">{currentSkinName}</strong>
                </div>
                <div className="settings-row">
                  <span className="settings-label">{recordLabel}</span>
                  <strong className="settings-value">
                    {lang === "en"
                      ? `${accountWins}W ${accountLosses}L`
                      : `${accountWins}\uC2B9 ${accountLosses}\uD328`}
                  </strong>
                </div>
              </div>
              <div className="upgrade-modal-actions settings-actions">
                <button
                  className="lobby-btn secondary settings-policy-btn"
                  onClick={() => setIsAudioSettingsOpen(true)}
                  type="button"
                >
                  {soundButtonLabel}
                </button>
                <a
                  className="lobby-btn secondary settings-policy-btn"
                  href={termsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {termsButtonLabel}
                </a>
                <a
                  className="lobby-btn secondary settings-policy-btn"
                  href={policyUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.policyBtn}
                </a>
                <button
                  className="lobby-btn secondary settings-policy-btn"
                  onClick={() => void handleDonate()}
                  type="button"
                >
                  {t.donateBtn}
                </button>
              </div>
            </div>
            <div className="upgrade-modal-actions">
              <button
                className="lobby-btn primary"
                onClick={() => setIsSettingsOpen(false)}
                type="button"
              >
                {skinApplyLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      {isAudioSettingsOpen && (
        <div
          className="upgrade-modal-backdrop audio-modal-backdrop"
          onClick={() => setIsAudioSettingsOpen(false)}
        >
          <div
            className="upgrade-modal skin-modal audio-settings-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="skin-modal-head">
              <h3>{audioModalTitle}</h3>
            </div>
            <div className="audio-settings-body">
              <div className="audio-settings-row">
                <div className="audio-settings-card">
                  <span className="audio-settings-label">{musicLabel}</span>
                  <button
                    className={`audio-settings-toggle ${!isMusicMuted ? "is-on" : "is-off"}`}
                    onClick={toggleMusicMute}
                    type="button"
                  >
                    {!isMusicMuted ? onLabel : offLabel}
                  </button>
                </div>
                <div className="audio-settings-card">
                  <span className="audio-settings-label">{sfxLabel}</span>
                  <button
                    className={`audio-settings-toggle ${!isSfxMuted ? "is-on" : "is-off"}`}
                    onClick={toggleSfxMute}
                    type="button"
                  >
                    {!isSfxMuted ? onLabel : offLabel}
                  </button>
                </div>
              </div>
              <div className="audio-slider-block">
                <div className="audio-slider-head">
                  <span>{musicVolumeLabel}</span>
                  <strong>{Math.round(musicVolume * 100)}</strong>
                </div>
                <input
                  className="audio-slider"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(musicVolume * 100)}
                  onChange={(event) =>
                    setMusicVolume(Number(event.target.value) / 100)
                  }
                />
              </div>
              <div className="audio-slider-block">
                <div className="audio-slider-head">
                  <span>{sfxVolumeLabel}</span>
                  <strong>{Math.round(sfxVolume * 100)}</strong>
                </div>
                <input
                  className="audio-slider"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(sfxVolume * 100)}
                  onChange={(event) =>
                    setSfxVolume(Number(event.target.value) / 100)
                  }
                />
              </div>
            </div>
            <div className="upgrade-modal-actions">
              <button
                className="lobby-btn primary"
                onClick={() => setIsAudioSettingsOpen(false)}
                type="button"
              >
                {skinApplyLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UpgradeNoticeDialog({
  message,
  onClose,
  t,
}: {
  message: string;
  onClose: () => void;
  t: Translations;
}) {
  return (
    <div className="upgrade-modal-backdrop">
      <div className="upgrade-modal">
        <h3>{t.switchedTitle}</h3>
        <p>{message}</p>
        <div className="upgrade-modal-actions">
          <button className="lobby-btn primary" onClick={onClose}>
            {t.confirmBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

