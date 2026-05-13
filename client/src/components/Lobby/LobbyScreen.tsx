import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RefObject } from "react";

import { AtomicPreview } from "../../skins/legendary/atomic/Preview";
import { ChronosPreview } from "../../skins/legendary/chronos/Preview";
import { FrostHeartPreview } from "../../skins/legendary/frost_heart/Preview";
import { SunPreview } from "../../skins/legendary/sun/Preview";
import { WizardPreview } from "../../skins/legendary/wizard/Preview";

import { CosmicPreview } from "../../skins/rare/cosmic/Preview";

import { ArcReactorPreview } from "../../skins/rare/arc_reactor/Preview";

import { PlasmaPreview } from "../../skins/common/plasma/Preview";

import { GoldCorePreview } from "../../skins/common/gold_core/Preview";

import { NeonPulsePreview } from "../../skins/common/neon_pulse/Preview";

import { InfernoPreview } from "../../skins/common/inferno/Preview";

import { QuantumPreview } from "../../skins/common/quantum/Preview";

import { ElectricCorePreview } from "../../skins/rare/electric_core/Preview";
import { BerserkerPreview } from "../../skins/rare/berserker/Preview";
import { MoonlightSeedPreview } from "../../skins/rare/moonlight_seed/Preview";

import {
  cancelPendingGoogleUpgradeSwitch,
  changeNicknameWithTokens,
  claimAchievementReward,
  claimAllAchievementRewards,
  confirmPendingGoogleUpgradeSwitch,
  getSocketAuthPayload,
  hasPendingGoogleUpgradeContext,
  linkGoogleAccount,
  logoutToGuestMode,
  purchaseSkinWithTokens,
  refreshAccountSummary,
  syncAbilityPresets,
  syncNickname,
  type PlayerAchievementState,
  resolveUpgradeFlowAfterRedirect,
  type AccountProfile,
  type UpgradeResolution,
} from "../../auth/guestAuth";

import {
  ACHIEVEMENT_CATALOG,
  type AchievementCatalogEntry,
  type AchievementCategory,
} from "../../achievements/achievementCatalog";
import {
  getPatchNotes,
  getPatchNotesVersionLabel,
  PATCH_NOTES_VERSION,
  type PatchNoteSection,
} from "../../data/patchNotes";
import {
  ARENA_RANGES,
  RANKED_UNLOCKED_THRESHOLD,
  getArenaFromRating,
  getArenaLabel,
  getSkinRequiredArena,
  isSkinArenaUnlocked,
} from "../../data/arenaCatalog";

import { startDonation } from "../../payments/donate";
import { LobbyArenaOverlay } from "./arena/LobbyArenaOverlay";
import { ArenaGalleryModal } from "./arena/ArenaGalleryModal";

import {
  startTokenPackPurchase,
  type TokenPackId,
} from "../../payments/tokenShop";

import {
  connectSocket,
  connectSocketReady,
  getSocket,
  SOCKET_CONNECT_FAILED,
} from "../../socket/socketClient";
import { startLocalAbilityTraining } from "../../ability/localTrainingSession";
import { syncServerTime } from "../../socket/timeSync";

import { useGameStore } from "../../store/gameStore";

import { useLang } from "../../hooks/useLang";

import {
  playLobbyClick,
  prepareSfxPreviewAudio,
  previewAbilitySfxSample,
} from "../../utils/soundUtils";
import {
  getConnectedGamepadButtonLayout,
  getGamepadButtonLabel,
  getKeyboardCodeLabel,
  type GamepadButtonLayout,
} from "../../settings/controls";
import {
  ABILITY_SFX_GAIN_IDS,
  ABILITY_SFX_GAIN_LABELS,
} from "../../settings/abilitySfx";

import type { Translations } from "../../i18n/translations";

import type {
  ClientGameState,
  PieceSkin,
  RoundStartPayload,
} from "../../types/game.types";

import { ABILITY_SKILLS, type AbilitySkillId } from "../../types/ability.types";

import { useKeyboardControlsSettings } from "./useKeyboardControlsSettings";
import { useLobbyKeyboardNavigation } from "./useLobbyKeyboardNavigation";

import "./LobbyScreen.css";

import { FriendListPanel } from "./friends/FriendListPanel";
import { FriendAddModal } from "./friends/FriendAddModal";
import { FriendRequestsModal } from "./friends/FriendRequestsModal";
import { FriendContextPopup } from "./friends/FriendContextPopup";
import { FriendProfileModal } from "./friends/FriendProfileModal";
import { FriendChallengeToast } from "./friends/FriendChallengeToast";
import type { FriendEntry } from "./friends/types";

type LobbyView = "main" | "create" | "join";
type ControlsSettingsTab = "keyboard" | "controller";
type ChallengeToastState =
  | { kind: "incoming"; fromUserId: string; fromNickname: string }
  | { kind: "outgoing"; toUserId: string; toNickname: string };
type SkinDetailState = {
  tab: "piece";
  choice: {
    id: PieceSkin;
    name: string;
    desc: string;
    requiredWins: number | null;
    requiredPlays?: number | null;
    tokenPrice?: number | null;
    tier?: "common" | "rare" | "legendary" | null;
  };
} | null;
type VaultOpenResponse =
  | {
      status: "OPENED";
      rewardTokens: number;
      bonusSkin: PieceSkin | null;
      duplicateSkin: PieceSkin | null;
      duplicateCompensationTokens: number;
      tokens: number;
      ownedSkins: PieceSkin[];
      vaultWins: number;
      vaultRequiredWins: number;
      vaultOpenedToday: boolean;
    }
  | {
      status:
        | "AUTH_REQUIRED"
        | "AUTH_INVALID"
        | "NOT_READY"
        | "ALREADY_OPENED"
        | "FAILED";
    };
type LobbyModeKey = "friend" | "coop" | "2v2" | "ability" | "skill_ranked";

function PieceSkinPreviewContent({
  skinId,
  atomicPreviewReady,
}: {
  skinId: PieceSkin;
  atomicPreviewReady: boolean;
}) {
  return (
    <>
      {skinId === "plasma" && <PlasmaPreview />}
      {skinId === "gold_core" && <GoldCorePreview />}
      {skinId === "neon_pulse" && <NeonPulsePreview />}
      {skinId === "cosmic" && <CosmicPreview />}
      {skinId === "inferno" && <InfernoPreview />}
      {skinId === "arc_reactor" && <ArcReactorPreview />}
      {skinId === "electric_core" && <ElectricCorePreview />}
      {skinId === "berserker" && <BerserkerPreview />}
      {skinId === "moonlight_seed" && <MoonlightSeedPreview />}
      {skinId === "quantum" && <QuantumPreview />}
      {skinId === "wizard" && <WizardPreview />}
      {skinId === "atomic" && <AtomicPreview ready={atomicPreviewReady} />}
      {skinId === "chronos" && <ChronosPreview />}
      {skinId === "sun" && <SunPreview />}
      {skinId === "frost_heart" && <FrostHeartPreview />}
    </>
  );
}

function LazyPieceSkinPreview({
  skinId,
  atomicPreviewReady,
  className,
  eager = false,
  scrollRootRef,
}: {
  skinId: PieceSkin;
  atomicPreviewReady: boolean;
  className: string;
  eager?: boolean;
  scrollRootRef: RefObject<HTMLDivElement | null>;
}) {
  const previewRef = useRef<HTMLSpanElement | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(eager);

  useEffect(() => {
    if (eager) {
      setIsNearViewport(true);
      return;
    }

    const preview = previewRef.current;
    if (!preview || typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(entry.isIntersecting);
      },
      {
        root: scrollRootRef.current,
        rootMargin: "240px 0px",
        threshold: 0,
      },
    );

    observer.observe(preview);
    return () => observer.disconnect();
  }, [eager, scrollRootRef]);

  return (
    <span
      ref={previewRef}
      className={`${className} skin-preview-${skinId}${
        isNearViewport ? "" : " is-preview-suspended"
      }`}
      aria-hidden="true"
    >
      {isNearViewport && (
        <PieceSkinPreviewContent
          skinId={skinId}
          atomicPreviewReady={atomicPreviewReady}
        />
      )}
    </span>
  );
}

const DISABLED_LOBBY_MODES = new Set<LobbyModeKey>([
  "2v2",
  "coop",
  "skill_ranked",
]);

interface Props {
  onGameStart: () => void;

  onCoopStart: () => void;

  onTwoVsTwoStart: () => void;

  onAbilityStart: () => void;

  onboardingPromptsEnabled?: boolean;

  tutorialPromptTrigger?: number;
}

type SettingsIconKind =
  | "language"
  | "sound"
  | "controls"
  | "tutorial"
  | "terms"
  | "privacy"
  | "donate";

function SettingsActionIcon({
  kind,
  lang,
}: {
  kind: SettingsIconKind;
  lang: "en" | "kr";
}) {
  if (kind === "language") {
    return (
      <span
        className="settings-action-icon settings-action-lang-icon"
        aria-hidden="true"
      >
        {lang === "en" ? "EN" : "KR"}
      </span>
    );
  }

  const iconPaths = {
    sound: (
      <>
        <path d="M4 9v6h4l5 4V5L8 9H4Z" />
        <path d="M16 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 6a8 8 0 0 1 0 12" />
      </>
    ),
    controls: (
      <>
        <path d="M7.5 9.5h9a4.5 4.5 0 0 1 4.2 6.1l-.5 1.3a2.2 2.2 0 0 1-3.7.7l-1.6-1.8H9.1l-1.6 1.8a2.2 2.2 0 0 1-3.7-.7l-.5-1.3a4.5 4.5 0 0 1 4.2-6.1Z" />
        <path d="M6 13h3" />
        <path d="M7.5 11.5v3" />
        <path d="M16.8 12.3h.01" />
        <path d="M18.6 14.1h.01" />
      </>
    ),
    tutorial: (
      <>
        <path d="M5.5 4.5h8.2a3.8 3.8 0 0 1 3.8 3.8v11.2H9.3a3.8 3.8 0 0 0-3.8-3.8V4.5Z" />
        <path d="M18.5 7.5h.6a2.9 2.9 0 0 1 2.9 2.9v9.1h-4.5" />
        <path d="M8.5 8.5h5.8" />
        <path d="M8.5 11.5h4.2" />
        <path d="M8.5 14.5h2.8" />
      </>
    ),
    terms: (
      <>
        <path d="M6 3.5h9l3 3V20.5H6V3.5Z" />
        <path d="M15 3.5v3h3" />
        <path d="M8.5 10h7" />
        <path d="M8.5 13.5h7" />
        <path d="M8.5 17h4.5" />
      </>
    ),
    privacy: (
      <>
        <path d="M12 3.5 5.5 6.2v5.2c0 4.1 2.6 7.7 6.5 9.1 3.9-1.4 6.5-5 6.5-9.1V6.2L12 3.5Z" />
        <path d="M9.4 12.2 11.2 14l3.4-4" />
      </>
    ),
    donate: (
      <>
        <path d="M12 3.5 20 9l-8 11.5L4 9l8-5.5Z" />
        <path d="M4 9h16" />
        <path d="M8.5 9 12 20.5 15.5 9" />
        <path d="M8.5 9 12 3.5 15.5 9" />
      </>
    ),
  } satisfies Record<Exclude<SettingsIconKind, "language">, unknown>;

  return (
    <span className="settings-action-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        {iconPaths[kind]}
      </svg>
    </span>
  );
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

const AI_TUTORIAL_PROMPT_ANSWERED_KEY = "pathclash.aiTutorialPromptAnswered.v1";
const INITIAL_NICKNAME_COMPLETED_KEY = "pathclash.initialNicknameSetUser.v1";
const LAST_LOBBY_MODE_KEY = "pathclash.lastLobbyMode.v1";

const PATCH_NOTES_READ_KEY = "pathclash.patchNotes.read";

type SetAuthState = ReturnType<typeof useGameStore.getState>["setAuthState"];

type AchievementView = AchievementCatalogEntry & {
  progress: number;

  completed: boolean;

  claimed: boolean;

  completedAt: string | null;

  claimedAt: string | null;
};

const ACHIEVEMENT_CATEGORY_ORDER: AchievementCategory[] = [
  "tutorial",

  "progress",

  "mode_win",

  "collection",

  "settings",

  "ability_special",

  "ability_attack",

  "ability_defense",

  "ability_utility",
];

function getAchievementCategoryLabel(
  category: AchievementCategory,

  lang: "en" | "kr",
) {
  if (lang === "en") {
    switch (category) {
      case "tutorial":
        return "Tutorial";

      case "progress":
        return "Progress";

      case "mode_win":
        return "Mode Wins";

      case "collection":
        return "Collection";

      case "settings":
        return "Settings";

      case "ability_special":
        return "Ability Special";

      case "ability_attack":
        return "Ability Attack";

      case "ability_defense":
        return "Ability Defense";

      case "ability_utility":
        return "Ability Utility";

      default:
        return category;
    }
  }

  switch (category) {
    case "tutorial":
      return "튜토리얼";

    case "progress":
      return "진행";

    case "mode_win":
      return "모드 승리";

    case "collection":
      return "수집";

    case "settings":
      return "설정";

    case "ability_special":
      return "능력대전 특수";

    case "ability_attack":
      return "능력대전 공격";

    case "ability_defense":
      return "능력대전 방어";

    case "ability_utility":
      return "능력대전 유틸";

    default:
      return category;
  }
}

function buildAchievementViews(
  progressRows: PlayerAchievementState[],
): AchievementView[] {
  const progressById = new Map(
    progressRows.map((row) => [row.achievementId, row] as const),
  );

  return ACHIEVEMENT_CATALOG.map((entry) => {
    const progress = progressById.get(entry.id);

    return {
      ...entry,

      progress: progress?.progress ?? 0,

      completed: progress?.completed ?? false,

      claimed: progress?.claimed ?? false,

      completedAt: progress?.completedAt ?? null,

      claimedAt: progress?.claimedAt ?? null,
    };
  }).sort((left, right) => {
    const categoryDelta =
      ACHIEVEMENT_CATEGORY_ORDER.indexOf(left.category) -
      ACHIEVEMENT_CATEGORY_ORDER.indexOf(right.category);

    if (categoryDelta !== 0) return categoryDelta;

    if (left.claimed !== right.claimed) return left.claimed ? 1 : -1;

    if (left.completed !== right.completed) return left.completed ? -1 : 1;

    if (left.goal !== right.goal) return left.goal - right.goal;

    return left.id.localeCompare(right.id);
  });
}

function AchievementModal({
  lang,

  achievements,

  isClaiming,

  onClaim,

  onClaimAll,

  onClose,
}: {
  lang: "en" | "kr";

  achievements: AchievementView[];

  isClaiming: boolean;

  onClaim: (achievementId: string) => void;

  onClaimAll: () => void;

  onClose: () => void;
}) {
  const completedCount = achievements.filter(
    (achievement) => achievement.completed,
  ).length;

  const claimableCount = achievements.filter(
    (achievement) => achievement.completed && !achievement.claimed,
  ).length;

  const grouped = ACHIEVEMENT_CATEGORY_ORDER.map((category) => ({
    category,

    entries: achievements.filter(
      (achievement) => achievement.category === category,
    ),
  })).filter((group) => group.entries.length > 0);

  return (
    <div className="upgrade-modal-backdrop" onClick={onClose}>
      <div
        className="upgrade-modal skin-modal achievements-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="skin-modal-head achievements-head">
          <div>
            <h3>{lang === "en" ? "Achievements" : "업적"}</h3>

            <p className="achievements-desc">
              {lang === "en"
                ? "View achievements and claim rewards."
                : "조건을 달성한 뒤 여기서 다이아몬드 보상을 획득하세요."}
            </p>

            <p className="achievement-collection-summary">
              {lang === "en"
                ? `Found: ${completedCount}/${achievements.length}`
                : `찾음: ${completedCount}/${achievements.length}`}
            </p>
          </div>

          <button
            className="lobby-btn primary achievements-claim-all-btn"
            type="button"
            onClick={onClaimAll}
            disabled={isClaiming || claimableCount === 0}
          >
            {lang === "en"
              ? `Claim All${claimableCount > 0 ? ` (${claimableCount})` : ""}`
              : `모든 보상 획득${claimableCount > 0 ? ` (${claimableCount})` : ""}`}
          </button>
        </div>

        <div className="achievements-scroll-body">
          {grouped.map((group) => (
            <section key={group.category} className="achievements-section">
              <h4 className="achievements-section-title">
                {getAchievementCategoryLabel(group.category, lang)}
              </h4>

              <div className="achievements-list">
                {group.entries.map((achievement) => {
                  const progressText = `${Math.min(
                    achievement.progress,

                    achievement.goal,
                  )}/${achievement.goal}`;

                  const rewardLabel =
                    lang === "en"
                      ? achievement.claimed
                        ? "Claimed"
                        : achievement.completed
                          ? "Claim"
                          : "Locked"
                      : achievement.claimed
                        ? "획득 완료"
                        : achievement.completed
                          ? "획득"
                          : "잠김";

                  return (
                    <article
                      key={achievement.id}
                      className={`achievement-card${
                        achievement.completed ? " is-completed" : ""
                      }${achievement.claimed ? " is-claimed" : ""}`}
                    >
                      <div className="achievement-copy">
                        <strong>
                          {lang === "en"
                            ? achievement.name.en
                            : achievement.name.kr}
                        </strong>

                        <span>
                          {lang === "en"
                            ? achievement.description.en
                            : achievement.description.kr}
                        </span>

                        <span className="achievement-progress">
                          {lang === "en" ? "Progress" : "진행도"}:{" "}
                          {progressText}
                        </span>
                      </div>

                      <button
                        className={`achievement-claim-btn${
                          achievement.claimed ? " is-claimed" : ""
                        }`}
                        type="button"
                        disabled={
                          isClaiming ||
                          achievement.claimed ||
                          !achievement.completed
                        }
                        onClick={() => onClaim(achievement.id)}
                      >
                        <span className="achievement-reward-value">
                          <span
                            className="skin-token-icon achievement-reward-icon"
                            aria-hidden="true"
                          >
                            {"\uD83D\uDC8E"}
                          </span>

                          <span>{achievement.rewardTokens}</span>
                        </span>

                        <span>{rewardLabel}</span>
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="upgrade-modal-actions">
          <button className="lobby-btn primary" onClick={onClose} type="button">
            {lang === "en" ? "Close" : "닫기"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    equippedBoardSkin: profile.equippedBoardSkin,
    equippedAbilitySkills: profile.equippedAbilitySkills,

    ownedSkins: profile.ownedSkins,
    ownedBoardSkins: profile.ownedBoardSkins,

    wins: profile.wins,

    losses: profile.losses,

    tokens: profile.tokens,

    dailyRewardWins: profile.dailyRewardWins,

    dailyRewardTokens: profile.dailyRewardTokens,

    achievements: profile.achievements,

    currentRating: profile.currentRating,
    highestArena: profile.highestArena,
    rankedUnlocked: profile.rankedUnlocked,
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

function renderAbilitySkillIcon(skillId: AbilitySkillId) {
  const skill = ABILITY_SKILLS[skillId];

  if (skillId === "phase_shift") {
    return (
      <span
        className="ability-skill-icon-custom ability-skill-icon-phase-shift"
        aria-hidden="true"
      >
        <span className="ability-skill-icon-phase-back" />

        <span className="ability-skill-icon-phase-front" />
      </span>
    );
  }

  if (skillId === "arc_reactor_field") {
    return (
      <span
        className="ability-skill-icon-custom ability-skill-icon-arc-field"
        aria-hidden="true"
      >
        <span className="ability-skill-icon-arc-core" />

        <span className="ability-skill-icon-arc-ring ability-skill-icon-arc-ring-a" />

        <span className="ability-skill-icon-arc-ring ability-skill-icon-arc-ring-b" />
      </span>
    );
  }

  if (skillId === "void_cloak") {
    return (
      <span
        className="ability-skill-icon-custom ability-skill-icon-void"
        aria-hidden="true"
      >
        <span className="ability-skill-icon-void-eye" />

        <span className="ability-skill-icon-void-pupil" />

        <span className="ability-skill-icon-void-slash" />
      </span>
    );
  }

  if (skillId === "cosmic_bigbang") {
    return (
      <span
        className="ability-skill-icon-custom ability-skill-icon-bigbang"
        aria-hidden="true"
      >
        <span className="ability-skill-icon-bigbang-core" />

        <span className="ability-skill-icon-bigbang-ring ability-skill-icon-bigbang-ring-a" />

        <span className="ability-skill-icon-bigbang-ring ability-skill-icon-bigbang-ring-b" />

        <span className="ability-skill-icon-bigbang-rays" />
      </span>
    );
  }

  if (skillId === "wizard_magic_mine") {
    return (
      <span
        className="ability-skill-icon-custom ability-skill-icon-magic-mine"
        aria-hidden="true"
      >
        <span className="ability-skill-icon-mine-ring ability-skill-icon-mine-ring-outer" />
        <span className="ability-skill-icon-mine-ring ability-skill-icon-mine-ring-inner" />
        <span className="ability-skill-icon-mine-rune" />
        <span className="ability-skill-icon-mine-orb" />
      </span>
    );
  }

  const icon =
    skillId === "electric_blitz"
      ? "⚡︎"
      : skillId === "ice_field"
        ? "❄︎"
        : skill.icon;
  const skillIconClass = `is-${skillId.replaceAll("_", "-")}`;

  return (
    <span
      className={`ability-skill-icon-glyph ${skillIconClass}`}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

function getAbilitySkillCategoryLabel(
  category: "attack" | "defense" | "utility" | "passive",
  lang: "en" | "kr",
) {
  if (lang === "en") {
    switch (category) {
      case "attack":
        return "Attack";
      case "defense":
        return "Defense";
      case "utility":
        return "Utility";
      case "passive":
        return "Passive";
      default:
        return category;
    }
  }

  switch (category) {
    case "attack":
      return "공격";
    case "defense":
      return "방어";
    case "utility":
      return "유틸";
    case "passive":
      return "패시브";
    default:
      return category;
  }
}

function getAbilitySkillCategoryIcon(
  category: "attack" | "defense" | "utility" | "passive",
) {
  switch (category) {
    case "attack":
      return "⚔";
    case "defense":
      return "🛡";
    case "utility":
      return "♥";
    case "passive":
      return "⏱";
    default:
      return "✦";
  }
}

export function LobbyScreen({
  onGameStart,

  onCoopStart,

  onTwoVsTwoStart,

  onAbilityStart,

  onboardingPromptsEnabled = true,

  tutorialPromptTrigger = 0,
}: Props) {
  const {
    myNickname,

    setNickname,

    setMyColor,

    setRoomCode,

    authUserId,

    authAccessToken,

    isGuestUser,

    accountWins,

    accountSummaryLoading,

    accountLosses,

    accountTokens,

    ownedSkins,

    accountDailyRewardTokens,

    accountVaultWins,

    accountVaultRequiredWins,

    accountVaultOpenedToday,

    accountAchievements,

    setAuthState,

    setMatchType,
    setLocalAbilityTraining,

    setTwoVsTwoSlot,

    abilityLoadout,

    activePreset,
    setAbilityLoadoutForPreset,
    switchAbilityPreset,

    currentMatchType,

    setGameState,

    setPlayerPieceSkins,

    isMusicMuted,

    isSfxMuted,

    toggleMusicMute,

    toggleSfxMute,

    musicVolume,

    sfxVolume,

    setMusicVolume,

    setSfxVolume,

    abilitySfxGains,

    setAbilitySfxGain,

    pieceSkin,

    setPieceSkin,

    currentRating,
    highestArena,
    rankedUnlocked,
    setMatchHostArena,
  } = useGameStore();

  const rotationSkills = useGameStore((s) => s.rotationSkills);
  const pendingRemovedRotationSkillsNotice = useGameStore(
    (s) => s.pendingRemovedRotationSkillsNotice,
  );
  const setPendingRemovedRotationSkillsNotice = useGameStore(
    (s) => s.setPendingRemovedRotationSkillsNotice,
  );

  const { lang, setLang, t } = useLang();

  const policyUrl = lang === "en" ? POLICY_URL_EN : POLICY_URL_KR;

  const termsUrl = lang === "en" ? TERMS_URL_EN : TERMS_URL_KR;

  const [view, setView] = useState<LobbyView>("main");
  const [selectedLobbyMode, setSelectedLobbyMode] = useState<LobbyModeKey>(
    () => {
      if (typeof window === "undefined") return "ability";
      const saved = window.localStorage.getItem(LAST_LOBBY_MODE_KEY);
      if (saved === "random" || saved === "classic_ranked" || saved === "ai") {
        return "ability";
      }
      const nextMode =
        saved === "friend" ||
        saved === "coop" ||
        saved === "2v2" ||
        saved === "ability" ||
        saved === "skill_ranked"
          ? saved
          : "ability";
      return DISABLED_LOBBY_MODES.has(nextMode) ? "ability" : nextMode;
    },
  );

  const [joinCode, setJoinCode] = useState("");
  const [createdCode, setCreatedCode] = useState("");

  const [error, setError] = useState("");

  const [isMatchmaking, setIsMatchmaking] = useState(false);

  const [isSkinPickerOpen, setIsSkinPickerOpen] = useState(false);
  const [isTokenShopOpen, setIsTokenShopOpen] = useState(false);
  const [skinDetail, setSkinDetail] = useState<SkinDetailState>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false);
  const [isAudioAdvancedOpen, setIsAudioAdvancedOpen] = useState(false);
  const [isControlsSettingsOpen, setIsControlsSettingsOpen] = useState(false);
  const [controlsSettingsTab, setControlsSettingsTab] =
    useState<ControlsSettingsTab>("keyboard");
  const [gamepadButtonLayout, setGamepadButtonLayout] =
    useState<GamepadButtonLayout>(getConnectedGamepadButtonLayout);
  const {
    capturingControlKey,
    capturingControllerButton,
    controllerControls,
    keyboardControls,
    setCapturingControlKey,
    setCapturingControllerButton,
    updateControllerControls,
    updateKeyboardControls,
  } = useKeyboardControlsSettings();
  const [isNameChangeOpen, setIsNameChangeOpen] = useState(false);

  const [isAbilityLoadoutOpen, setIsAbilityLoadoutOpen] = useState(false);

  useEffect(() => {
    const syncGamepadLayout = () => {
      setGamepadButtonLayout(getConnectedGamepadButtonLayout());
    };

    syncGamepadLayout();
    window.addEventListener("gamepadconnected", syncGamepadLayout);
    window.addEventListener("gamepaddisconnected", syncGamepadLayout);
    return () => {
      window.removeEventListener("gamepadconnected", syncGamepadLayout);
      window.removeEventListener("gamepaddisconnected", syncGamepadLayout);
    };
  }, []);

  const [isModePickerOpen, setIsModePickerOpen] = useState(false);
  const [showArenaGallery, setShowArenaGallery] = useState(false);

  const [showFriendAdd, setShowFriendAdd] = useState(false);
  const [showFriendRequests, setShowFriendRequests] = useState(false);
  const [friendCtx, setFriendCtx] = useState<{
    friend: FriendEntry;
    anchorRect: DOMRect;
  } | null>(null);
  const [friendProfileId, setFriendProfileId] = useState<string | null>(null);
  const [challengeToast, setChallengeToast] =
    useState<ChallengeToastState | null>(null);
  const [friendListRefresh, setFriendListRefresh] = useState(0);

  const [isPatchNotesOpen, setIsPatchNotesOpen] = useState(false);

  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const [achievementNoticeMessage, setAchievementNoticeMessage] = useState<
    string | null
  >(null);
  const [settingsNicknameDraft, setSettingsNicknameDraft] = useState("");
  const [isChangingNickname, setIsChangingNickname] = useState(false);

  const [isAiTutorialPromptOpen, setIsAiTutorialPromptOpen] = useState(false);
  const [isInitialNicknamePromptOpen, setIsInitialNicknamePromptOpen] =
    useState(false);
  const [initialNicknameDraft, setInitialNicknameDraft] = useState("");
  const [isSubmittingInitialNickname, setIsSubmittingInitialNickname] =
    useState(false);
  const [lobbySkinIconSrc, setLobbySkinIconSrc] = useState(
    "/ui/lobby/lobby-icon-skin1.svg",
  );

  const [isClaimingAchievements, setIsClaimingAchievements] = useState(false);

  const [hasUnreadPatchNotes, setHasUnreadPatchNotes] = useState(false);

  const [upgradeResult, setUpgradeResult] = useState<UpgradeResolution>({
    kind: "none",
  });

  const [showUpgradeNotice, setShowUpgradeNotice] = useState(false);
  const [upgradeFlowLoading, setUpgradeFlowLoading] = useState(() =>
    hasPendingGoogleUpgradeContext(),
  );
  const [pendingUpgradeSwitchProfile, setPendingUpgradeSwitchProfile] =
    useState<AccountProfile | null>(null);
  const [isResolvingUpgradeDecision, setIsResolvingUpgradeDecision] =
    useState(false);
  const [skinPurchaseConfirmMessage, setSkinPurchaseConfirmMessage] = useState<
    string | null
  >(null);
  const [skinPurchaseNoticeMessage, setSkinPurchaseNoticeMessage] = useState<
    string | null
  >(null);
  const [skinFloatingMessage, setSkinFloatingMessage] = useState<{
    id: number;
    text: string;
  } | null>(null);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [isVaultHelpOpen, setIsVaultHelpOpen] = useState(false);
  const [isOpeningVault, setIsOpeningVault] = useState(false);
  const [vaultOpenResult, setVaultOpenResult] = useState<Extract<
    VaultOpenResponse,
    { status: "OPENED" }
  > | null>(null);

  const [atomicPreviewReady, setAtomicPreviewReady] = useState(false);

  const dailyResetTimeoutRef = useRef<number | null>(null);
  const prevAuthUserIdRef = useRef<string | null>(authUserId);
  const matchmakingEpochRef = useRef(0);
  const activeNetworkMatchRef = useRef<{
    mode: "friend" | "random" | "ai" | "coop" | "2v2" | "ability";
    epoch: number;
  } | null>(null);

  const lastRewardSyncDayRef = useRef<string>(getUtcDayKey());
  const skinPurchaseConfirmResolverRef = useRef<
    ((confirmed: boolean) => void) | null
  >(null);
  const skinFloatingMessageIdRef = useRef(0);
  const skinOptionGridRef = useRef<HTMLDivElement | null>(null);

  const langRef = useRef(lang);
  langRef.current = lang;
  const showSkinFloatingMessageRef = useRef<(text: string) => void>(
    () => void 0,
  );

  const upgradeMessage = getUpgradeDisplayMsg(upgradeResult, t);

  const skinPurchaseConfirmTitle =
    lang === "en" ? "Confirm Purchase" : "구매 확인";
  const skinPurchaseNoticeTitle = lang === "en" ? "Skin Purchase" : "스킨 구매";
  const skinPurchaseConfirmLabel = lang === "en" ? "Yes" : "예";
  const skinPurchaseCancelLabel = lang === "en" ? "No" : "아니요";
  const achievementNoticeTitle =
    lang === "en" ? "Achievement Reward" : "업적 보상";

  useEffect(() => {
    window.localStorage.setItem(LAST_LOBBY_MODE_KEY, selectedLobbyMode);
  }, [selectedLobbyMode]);

  useEffect(() => {
    return () => {
      skinPurchaseConfirmResolverRef.current?.(false);

      skinPurchaseConfirmResolverRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (pendingRemovedRotationSkillsNotice.length === 0) return;
    const first = ABILITY_SKILLS[pendingRemovedRotationSkillsNotice[0]];
    const firstName =
      langRef.current === "en" ? first?.name.en : first?.name.kr;
    const extra =
      pendingRemovedRotationSkillsNotice.length > 1
        ? langRef.current === "en"
          ? ` and ${pendingRemovedRotationSkillsNotice.length - 1} more`
          : ` 외 ${pendingRemovedRotationSkillsNotice.length - 1}개`
        : "";
    showSkinFloatingMessageRef.current(
      langRef.current === "en"
        ? `Rotation expired: ${firstName ?? "skill"}${extra} unequipped.`
        : `로테이션 만료로 ${firstName ?? "스킬"}${extra} 장착이 해제되었습니다.`,
    );
    setPendingRemovedRotationSkillsNotice([]);
  }, [
    pendingRemovedRotationSkillsNotice,
    setPendingRemovedRotationSkillsNotice,
  ]);

  const playLobbyUiClickFromTarget = useCallback(
    (target: EventTarget | null) => {
      if (!target) return;

      const targetElement = target instanceof Element ? target : null;

      if (!targetElement) return;

      const clickable = targetElement.closest("button, a");

      if (!(clickable instanceof HTMLElement)) return;

      if (clickable.hasAttribute("disabled")) return;

      if (clickable.getAttribute("aria-disabled") === "true") return;

      if (clickable instanceof HTMLAnchorElement && !clickable.href) return;

      if (clickable.closest(".audio-slider-block")) return;

      if (!isSfxMuted) {
        playLobbyClick(sfxVolume);
      }
    },

    [isSfxMuted, sfxVolume],
  );

  const handleLobbyUiPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      playLobbyUiClickFromTarget(event.target);
    },
    [playLobbyUiClickFromTarget],
  );

  const handleLobbyUiClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.detail !== 0) return;
      playLobbyUiClickFromTarget(event.target);
    },
    [playLobbyUiClickFromTarget],
  );

  const handleOpenVictoryVault = useCallback(async () => {
    if (isOpeningVault) return;
    if (!authAccessToken) {
      showSkinFloatingMessageRef.current(
        langRef.current === "en"
          ? "Please sign in before opening the vault."
          : "금고를 열려면 먼저 로그인해야 합니다.",
      );
      return;
    }

    setIsOpeningVault(true);
    try {
      const socket = getSocket();
      const response = await new Promise<VaultOpenResponse>((resolve) => {
        socket.emit(
          "open_victory_vault",
          {
            auth: {
              accessToken: authAccessToken,
              userId: authUserId ?? undefined,
            },
          },
          (ack: VaultOpenResponse) => resolve(ack),
        );
      });

      if (response.status === "OPENED") {
        setVaultOpenResult(response);
        setAuthState({
          ready: true,
          userId: authUserId,
          accessToken: authAccessToken,
          isGuestUser,
          tokens: response.tokens,
          ownedSkins: response.ownedSkins,
          vaultWins: response.vaultWins,
          vaultRequiredWins: response.vaultRequiredWins,
          vaultOpenedToday: response.vaultOpenedToday,
        });
        return;
      }

      const message =
        response.status === "NOT_READY"
          ? langRef.current === "en"
            ? "Win 3 times to open the vault."
            : "3승을 채워야 금고를 열 수 있습니다."
          : response.status === "ALREADY_OPENED"
            ? langRef.current === "en"
              ? "The vault has already been opened today."
              : "오늘은 이미 금고를 열었습니다."
            : langRef.current === "en"
              ? "Unable to open the vault. Please try again."
              : "금고를 열 수 없습니다. 다시 시도해주세요.";
      showSkinFloatingMessageRef.current(message);
    } finally {
      setIsOpeningVault(false);
    }
  }, [authAccessToken, authUserId, isGuestUser, isOpeningVault, setAuthState]);

  const closeTopLobbyModal = useCallback(() => {
    if (capturingControlKey) {
      setCapturingControlKey(null);
      return true;
    }
    if (capturingControllerButton) {
      setCapturingControllerButton(null);
      return true;
    }
    if (isControlsSettingsOpen) {
      setIsControlsSettingsOpen(false);
      return true;
    }
    if (isAudioSettingsOpen) {
      setIsAudioSettingsOpen(false);
      return true;
    }
    if (isNameChangeOpen) {
      setIsNameChangeOpen(false);
      return true;
    }
    if (isPatchNotesOpen) {
      setIsPatchNotesOpen(false);
      return true;
    }
    if (achievementNoticeMessage) {
      setAchievementNoticeMessage(null);
      return true;
    }
    if (isAchievementsOpen) {
      setIsAchievementsOpen(false);
      return true;
    }
    if (isAbilityLoadoutOpen) {
      setIsAbilityLoadoutOpen(false);
      return true;
    }
    if (isTokenShopOpen) {
      setIsTokenShopOpen(false);
      return true;
    }
    if (skinDetail) {
      setSkinDetail(null);
      return true;
    }
    if (isSkinPickerOpen) {
      setIsSkinPickerOpen(false);
      return true;
    }
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      return true;
    }
    return false;
  }, [
    achievementNoticeMessage,
    capturingControlKey,
    capturingControllerButton,
    isAbilityLoadoutOpen,
    isAchievementsOpen,
    isAudioSettingsOpen,
    isControlsSettingsOpen,
    isNameChangeOpen,
    isPatchNotesOpen,
    isSettingsOpen,
    isSkinPickerOpen,
    isTokenShopOpen,
    setCapturingControlKey,
    setCapturingControllerButton,
    skinDetail,
  ]);

  useLobbyKeyboardNavigation({
    actionKey: keyboardControls.gameActionKey,
    controllerActionButton: controllerControls.gameActionButton,
    controllerEnabled: controllerControls.controllerEnabled,
    controllerSelectButton: controllerControls.selectActionButton,
    capturingControlKey: capturingControlKey ?? capturingControllerButton,
    closeTopLobbyModal,
    isControlsSettingsOpen,
    keyboardEnabled: keyboardControls.keyboardEnabled,
    selectKey: keyboardControls.selectActionKey,
  });

  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * 4) + 1;
    setLobbySkinIconSrc(`/ui/lobby/lobby-icon-skin${randomIndex}.svg`);
  }, []);

  const buildExistingAccountSwitchPrompt = (profile: AccountProfile) => {
    const nickname = profile.nickname?.trim() || "Guest";

    if (lang === "en") {
      return [
        "This Google account already has existing PathClash data.",

        "",

        `Nickname: ${nickname}`,

        `Record: ${profile.wins}W ${profile.losses}L`,

        `Diamonds: ${profile.tokens}`,

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

      `다이아몬드: ${profile.tokens}`,

      "",

      "현재 게스트 진행 상황은 이 계정으로 옮겨지지 않습니다.",

      "",

      "기존 Google 계정으로 전환하시겠습니까?",
    ].join("\n");
  };

  const settingsButtonLabel = lang === "en" ? "Settings" : "설정";

  const skinButtonLabel = lang === "en" ? "Skin" : "스킨";

  const soundButtonLabel = lang === "en" ? "Sound" : "소리";
  const controlsButtonLabel = lang === "en" ? "Controls" : "조작";
  const languageButtonLabel =
    lang === "en" ? "Language : English" : "언어 : 한국어";

  const termsButtonLabel = lang === "en" ? "Terms" : "이용약관";

  const coopTitle = lang === "en" ? "Co-op Mode" : "협동전";

  const coopStartLabel = lang === "en" ? "Start Co-op Match" : "매칭 시작";

  const twoVsTwoTitle = "2v2";

  const twoVsTwoStartLabel = lang === "en" ? "Start Match" : "매칭 시작";

  const abilityBattleTitle = lang === "en" ? "Ability Battle" : "능력 대전";
  const skillRankedTitle = lang === "en" ? "Ranked" : "랭크전";

  const abilityBattleStartLabel = lang === "en" ? "Start Match" : "매칭 시작";

  const abilityLoadoutTitle = lang === "en" ? "Equipped Skills" : "장착 스킬";
  const abilityTrainingTitle = lang === "en" ? "Training" : "훈련장";

  const abilityLoadoutCount = lang === "en" ? "equipped" : "장착 중";

  const patchNotesLabel = lang === "en" ? "Patch Notes" : "패치노트";
  const modeSelectorTitle = lang === "en" ? "Select Mode" : "모드 선택";

  const patchNotesTitle = lang === "en" ? "Patch Notes" : "패치노트";

  const aiTutorialPromptTitle =
    lang === "en"
      ? "Do you want to play the tutorial?"
      : "튜토리얼을 진행하시겠습니까?";

  const aiTutorialPromptDesc =
    lang === "en"
      ? "If you choose Yes, you will be moved into an AI match and the tutorial will begin right away."
      : "예를 누르면 AI 대전에 바로 입장하며 튜토리얼이 시작됩니다.";

  const aiTutorialYesLabel = lang === "en" ? "Yes" : "예";

  const aiTutorialNoLabel = lang === "en" ? "No" : "아니요";

  const aiTutorialButtonLabel = lang === "en" ? "Tutorial" : "튜토리얼";

  const upgradeFlowLoadingLabel =
    lang === "en"
      ? "Loading account information. Please wait."
      : "계정 정보를 불러오고 있습니다. 잠시 기다려주세요.";

  // Keep existing Korean literals as plain UTF-8 text. Do not rewrite them

  // based on terminal mojibake output; verify against the actual UI/editor first.

  const patchNotesVersionLabel = getPatchNotesVersionLabel(lang);
  const currentArena = getArenaFromRating(currentRating);
  const lobbyArena = rankedUnlocked ? 10 : currentArena;
  const lobbyArenaImageSrc = `/arena/arena${lobbyArena}.png`;
  const lobbyArenaImageAlt =
    lang === "en" ? `Arena ${lobbyArena}` : `아레나 ${lobbyArena}`;

  const currentArenaRange = ARENA_RANGES.find((r) => r.arena === lobbyArena);
  const arenaProgressPct = rankedUnlocked
    ? 100
    : currentArenaRange
      ? Math.min(
          100,
          Math.max(
            0,
            ((currentRating - currentArenaRange.minRating) /
              (currentArenaRange.maxRating - currentArenaRange.minRating)) *
              100,
          ),
        )
      : 0;
  const arenaProgressMin = rankedUnlocked
    ? String(RANKED_UNLOCKED_THRESHOLD)
    : String(currentArenaRange?.minRating ?? 0);
  const arenaProgressMax = rankedUnlocked
    ? "∞"
    : String(currentArenaRange?.maxRating ?? 0);

  // Patch note convention:

  // - If a mana cost goes down, append "(Buff)" / "(버프)" and style it green.

  // - If a mana cost goes up, append "(Nerf)" / "(너프)" and style it red.

  // - Reuse this structure for future patch note updates.

  const patchNotesBody: PatchNoteSection[] = getPatchNotes(lang);

  const skinModalTitle = lang === "en" ? "Choose Skin" : "스킨 선택";

  const skinModalDesc =
    lang === "en"
      ? "Select the look you want to use for your piece."
      : "플레이어 말에 적용할 외형을 선택하세요.";

  const skinApplyLabel = lang === "en" ? "Close" : "닫기";

  const settingsModalTitle = lang === "en" ? "Profile Settings" : "프로필 설정";

  const settingsModalDesc =
    lang === "en"
      ? "Check your account and settings."
      : "계정 정보와 설정을 확인하세요.";

  const settingsCopyLabel = lang === "en" ? "Copy ID" : "ID 복사";

  const settingsCopiedMsg =
    lang === "en" ? "User ID copied." : "사용자 ID가 복사되었습니다.";

  const settingsCopyFailedMsg =
    lang === "en" ? "Failed to copy ID." : "ID 복사에 실패했습니다.";

  const accountTypeLabel = lang === "en" ? "Account Type" : "계정 유형";

  const nicknameLabel = lang === "en" ? "Nickname" : "닉네임";

  const userIdLabel = lang === "en" ? "User ID" : "사용자 ID";

  const skinLabel = lang === "en" ? "Current Skin" : "현재 스킨";

  const recordLabel = lang === "en" ? "Record" : "전적";

  const initialNicknameTitle =
    lang === "en" ? "Choose Your Nickname" : "닉네임 설정";
  const initialNicknameDesc =
    lang === "en"
      ? "Before you start, please choose the nickname you want to use. Your first nickname change is free."
      : "게임을 시작하기 전에 사용할 닉네임을 정해주세요. 처음 한 번은 무료로 설정할 수 있습니다.";
  const initialNicknamePlaceholder =
    lang === "en" ? "Enter your nickname" : "닉네임을 입력하세요";
  const initialNicknameConfirmLabel = lang === "en" ? "Confirm" : "확인";

  const audioModalTitle = lang === "en" ? "Audio Settings" : "오디오 설정";
  const controlsModalTitle = lang === "en" ? "Controls" : "조작";
  const keyboardTabLabel = lang === "en" ? "Keyboard" : "키보드";
  const controllerTabLabel = lang === "en" ? "Controller" : "컨트롤러";
  const keyboardEnabledLabel =
    lang === "en" ? "Enable keyboard controls" : "키보드 사용 활성화";
  const controllerEnabledLabel =
    lang === "en" ? "Enable controller controls" : "컨트롤러 사용 활성화";
  const keyboardMappingTitle = lang === "en" ? "Ability Battle" : "능력대전";
  const inGameMappingTitle = lang === "en" ? "In-Game" : "인게임";
  const keyboardMappingDesc =
    lang === "en"
      ? "Use arrow keys to draw a path. Press 'select' to use skills targeted skills."
      : "화살표 방향키로 경로를 작성하고, 위치 지정 스킬은 선택 키로 확정합니다.";
  const controllerMappingDesc =
    lang === "en"
      ? "Use the d-pad or left joystick to draw a path. Press 'select' to use skills targeted skills."
      : "방향 패드 또는 왼쪽 조이스틱으로 경로를 작성하고, 위치 지정 스킬은 선택 버튼으로 확정합니다.";
  const gameActionKeyLabel = lang === "en" ? "Exit / Rematch" : "나가기/재시작";
  const selectActionKeyLabel = lang === "en" ? "Select" : "선택";
  const skillSlotLabels =
    lang === "en"
      ? { slot1: "Skill 1", slot2: "Skill 2", slot3: "Skill 3" }
      : { slot1: "스킬 1", slot2: "스킬 2", slot3: "스킬 3" };
  const keyCaptureLabel = lang === "en" ? "Press a key..." : "키 입력 대기...";
  const controllerCaptureLabel =
    lang === "en" ? "Press a button..." : "버튼 입력 대기...";

  const musicLabel = lang === "en" ? "Music" : "음악";

  const sfxLabel = lang === "en" ? "SFX" : "효과음";

  const onLabel = lang === "en" ? "ON" : "켬";

  const offLabel = lang === "en" ? "OFF" : "끔";

  const musicVolumeLabel = lang === "en" ? "Music Volume" : "음악 볼륨";

  const sfxVolumeLabel = lang === "en" ? "SFX Volume" : "효과음 볼륨";
  const audioAdvancedLabel = lang === "en" ? "Advanced" : "고급 설정";
  const abilitySfxGainLabel =
    lang === "en" ? "Ability SFX Gain" : "능력 SFX 개별 볼륨";

  const accountTypeValue = isGuestUser
    ? lang === "en"
      ? "Guest"
      : "게스트"
    : authUserId
      ? "Google"
      : lang === "en"
        ? "Signed Out"
        : "로그아웃됨";
  const accountTypeActionLabel = isGuestUser
    ? lang === "en"
      ? "Link Google"
      : "구글 연동"
    : authUserId
      ? lang === "en"
        ? "Logout"
        : "로그아웃"
      : lang === "en"
        ? "Login"
        : "로그인";

  const tokenShopTitle = lang === "en" ? "Diamond Shop" : "다이아몬드 샵";

  const tokenShopDesc =
    lang === "en"
      ? "Pick a diamond pack. Diamonds are used to unlock skins and boards."
      : "다이아몬드 팩을 선택하세요. 다이아몬드는 스킨과 보드를 잠금 해제하는데 사용됩니다.";

  const tokenShopCta = lang === "en" ? "Buy" : "구매";

  const tokenShopUnavailableMsg =
    lang === "en"
      ? "Diamonds packs are available in the Android app only."
      : "다이아몬드 팩은 안드로이드 앱에서만 구매할 수 있습니다.";

  const tokenShopFailedMsg =
    lang === "en"
      ? "Diamonds purchase failed."
      : "다이아몬드 구매에 실패했습니다.";

  const tokenShopCancelledMsg =
    lang === "en"
      ? "Diamonds purchase was cancelled."
      : "다이아몬드 구매가 취소되었습니다.";

  const tokenShopSuccessMsg = (tokens: number) =>
    lang === "en"
      ? `${tokens} diamonds were added to your account.`
      : `${tokens} 다이아몬드가 계정에 추가되었습니다.`;

  const nicknameChangeCost = 500;
  const changeNameTitle = lang === "en" ? "Change Name" : "이름 변경";
  const changeNameDesc =
    lang === "en"
      ? `Spend ${nicknameChangeCost} diamonds to change your player name.`
      : `${nicknameChangeCost}다이아몬드를 사용해 플레이어 이름을 변경할 수 있습니다.`;
  const changeNamePlaceholder =
    lang === "en" ? "Enter a new name" : "새 이름을 입력하세요";
  const changeNameInvalidMsg =
    lang === "en"
      ? "Please enter a name between 1 and 16 characters."
      : "이름은 1~16자로 입력해주세요.";
  const changeNameNoChangeMsg =
    lang === "en" ? "That name is already in use." : "현재와 같은 이름입니다.";
  const changeNameInsufficientMsg =
    lang === "en" ? "Not enough diamonds." : "다이아몬드가 부족합니다.";
  const changeNameFailedMsg =
    lang === "en" ? "Failed to change name." : "이름 변경에 실패했습니다.";
  const changeNameSuccessMsg =
    lang === "en" ? "Name changed successfully." : "이름이 변경되었습니다.";

  const skinPurchasePrompt = (skinName: string) =>
    lang === "en"
      ? `Purchase ${skinName}?`
      : `${skinName} 스킨을 구매하시겠습니까?`;

  const skinPurchaseSuccessMsg = (skinName: string) =>
    lang === "en"
      ? `${skinName} unlocked.`
      : `${skinName} 스킨이 해금되었습니다.`;

  const skinPurchaseFailedMsg =
    lang === "en" ? "Skin purchase failed." : "스킨 구매에 실패했습니다.";

  const skinPurchaseInsufficientMsg =
    lang === "en" ? "Not enough diamonds." : "다이아몬드가 부족합니다.";
  const skinPurchaseArenaRequiredMsg =
    lang === "en"
      ? "This skin is not unlocked in your arena yet."
      : "아직 현재 아레나에서 해금되지 않은 스킨입니다.";
  const skinPurchaseInvalidSkinMsg =
    lang === "en"
      ? "This skin is not registered in the purchase database yet."
      : "이 스킨이 아직 구매 DB에 등록되지 않았습니다.";
  const skinWinRequirementInsufficientMsg =
    lang === "en" ? "Not enough wins." : "승리 횟수가 부족합니다.";
  const skinPlayRequirementInsufficientMsg =
    lang === "en" ? "Not enough plays." : "플레이 횟수가 부족합니다.";

  const tokenPacks: Array<{
    id: TokenPackId;

    name: string;

    price: string;

    tokens: number;

    blurb: string;
  }> = [
    {
      id: "starter",

      name: "Starter",

      price: "$0.99",

      tokens: 150,

      blurb:
        lang === "en"
          ? "A small boost to start saving toward skins"
          : "스킨 구매를 위한 첫 저축용 구성",
    },

    {
      id: "small",

      name: "Small",

      price: "$2.99",

      tokens: 500,

      blurb:
        lang === "en"
          ? "A light pack for your first skin"
          : "첫 스킨 구매에 맞는 가벼운 구성",
    },

    {
      id: "medium",

      name: "Medium",

      price: "$6.99",

      tokens: 1200,

      blurb:
        lang === "en"
          ? "A solid bundle for expand your collection"
          : "수집 범위를 넓히기 좋은 실속형 구성",
    },

    {
      id: "large",

      name: "Large",

      price: "$14.99",

      tokens: 3000,

      blurb:
        lang === "en"
          ? "A bundle for the higher-tier skins"
          : "상위 스킨 확보에 좋은 구성",
    },

    {
      id: "whale",

      name: "Whale",

      price: "$29.99",

      tokens: 7000,

      blurb:
        lang === "en"
          ? "A premium bundle for legendary skins and boards"
          : "레전더리 스킨과 보드까지 노릴 수 있는 최상위 구성",
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
      | "wizard"
      | "electric_core"
      | "berserker"
      | "moonlight_seed"
      | "quantum"
      | "atomic"
      | "chronos"
      | "sun"
      | "frost_heart";

    name: string;

    desc: string;

    requiredWins: number | null;

    requiredPlays?: number | null;

    tokenPrice?: number | null;

    tier?: "common" | "rare" | "legendary" | null;
  }> = [
    {
      id: "classic",

      name: lang === "en" ? "Classic" : "기본",

      desc: lang === "en" ? "Default red glow." : "기본 붉은 글로우 스타일.",

      requiredWins: null,

      tokenPrice: null,
    },

    {
      id: "ember",

      name: lang === "en" ? "Ember" : "엠버",

      desc: lang === "en" ? "Warm orange flare." : "주황빛이 도는 강한 발광.",

      requiredWins: 10,

      tokenPrice: null,
    },

    {
      id: "nova",

      name: lang === "en" ? "Nova" : "노바",

      desc: lang === "en" ? "Cool cyan core." : "청록 계열의 차가운 코어.",

      requiredWins: 50,

      tokenPrice: null,
    },

    {
      id: "aurora",

      name: lang === "en" ? "Aurora" : "오로라",

      desc:
        lang === "en"
          ? "Vivid green-yellow glow."
          : "연두빛과 황금빛이 섞인 발광.",

      requiredWins: 100,

      tokenPrice: null,
    },

    {
      id: "void",

      name: lang === "en" ? "Void" : "보이드",

      desc: lang === "en" ? "Deep violet core." : "짙은 보랏빛 코어 스타일.",

      requiredWins: 500,

      tokenPrice: null,
    },

    {
      id: "plasma",

      name: lang === "en" ? "Plasma" : "플라즈마",

      desc: lang === "en" ? "Plasma energy core." : "플라즈마 에너지 코어.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 480,

      tier: "common",
    },

    {
      id: "gold_core",

      name: lang === "en" ? "Gold Core" : "골드 코어",

      desc:
        lang === "en"
          ? "Gilded core — a sunburst mandala spins within molten gold."
          : "황금 코어 — 녹아내린 금 속에서 선버스트 만다라가 회전.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 480,

      tier: "common",
    },

    {
      id: "neon_pulse",

      name: lang === "en" ? "Neon Pulse" : "네온 펄스",

      desc: lang === "en" ? "Vibrant neon pulse." : "선명한 네온 펄스.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 480,

      tier: "common",
    },

    {
      id: "inferno",

      name: lang === "en" ? "Inferno" : "인페르노",

      desc: lang === "en" ? "Burning inferno core." : "타오르는 인페르노 코어.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 480,

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

      tokenPrice: 480,

      tier: "common",
    },

    {
      id: "cosmic",

      name: lang === "en" ? "Cosmic" : "코스믹",

      desc:
        lang === "en"
          ? "Rare nebula — twin orbit rings pulse with cosmic energy."
          : "희귀 성운 — 이중 궤도 링이 우주 에너지로 맥동.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 1400,

      tier: "rare",
    },

    {
      id: "arc_reactor",

      name: lang === "en" ? "Hexagon" : "헥사곤",

      desc:
        lang === "en"
          ? "Hexagonal reactor core with layered rotating rings."
          : "육각형 리액터 코어와 다층 회전 링.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 1400,

      tier: "rare",
    },

    {
      id: "electric_core",

      name: lang === "en" ? "Electric Core" : "일렉트릭 코어",

      desc:
        lang === "en"
          ? "Electric core — cyan lightning branches orbit a dark reactor shell."
          : "일렉트릭 코어 — 청록 번개 갈래가 어두운 리액터 코어를 감쌉니다.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 1400,

      tier: "rare",
    },

    {
      id: "berserker",

      name: lang === "en" ? "Berserker" : "버서커",

      desc:
        lang === "en"
          ? "Steel heart — dark iron core pulses with crimson blood energy. Jagged spikes erupt on every heartbeat."
          : "강철 심장 — 검붉은 철핵이 혈기로 맥동하며, 심장박동마다 불규칙한 가시가 폭발합니다.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 1400,

      tier: "rare",
    },

    {
      id: "moonlight_seed",

      name: lang === "en" ? "Moonlight Seed" : "월광씨앗",

      desc:
        lang === "en"
          ? "Rare dreamwood seed — moonlit vines bloom and fireflies drift through the enchanted forest."
          : "희귀 몽환 씨앗 — 달빛 덩굴이 자라고 반딧불이 몽환의 숲을 유영한다.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 1400,

      tier: "rare",
    },

    {
      id: "wizard",

      name: lang === "en" ? "Wizard" : "위저드",

      desc:
        lang === "en"
          ? "Legendary magic circle — hexagram, orbiting diamonds, and plasma arms pulse with arcane energy."
          : "레전더리 마법진 — 헥사그램, 공전 다이아, 플라즈마 암이 신비로운 에너지로 맥동.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 3600,

      tier: "legendary",
    },

    {
      id: "chronos",

      name: lang === "en" ? "Chronos" : "크로노스",

      desc:
        lang === "en"
          ? "Legendary astral clockwork core with orbiting time rings and luminous hands."
          : "레전더리 천체 시계 코어 - 공전하는 시간 링과 빛나는 시곗바늘이 흐릅니다.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 3600,

      tier: "legendary",
    },

    {
      id: "atomic",

      name: lang === "en" ? "Atomic" : "아토믹",

      desc:
        lang === "en" ? "Atomic orbit energy core." : "원자 궤도 에너지 코어.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 3600,

      tier: "legendary",
    },
    {
      id: "sun",

      name: lang === "en" ? "Sun" : "썬",

      desc:
        lang === "en"
          ? "Legendary solar core — a rotating sun burns at the center."
          : "레전더리 태양 코어 - 중심에서 태양이 자전합니다.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 3600,

      tier: "legendary",
    },
    {
      id: "frost_heart",

      name: lang === "en" ? "Frost Heart" : "프로스트 하트",

      desc:
        lang === "en"
          ? "Legendary blizzard vortex core — a snowflake eye with aurora rings and crystal orbits."
          : "레전더리 설풍 소용돌이 코어 - 오로라 링과 결정체 공전 속에 눈송이 눈동자가 빛납니다.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 3600,

      tier: "legendary",
    },
  ];

  const getSkinRequirementLabel = (
    requiredWins: number | null,

    requiredPlays?: number | null,

    tokenPrice?: number | null,
  ) => {
    if (tokenPrice !== null && tokenPrice !== undefined) {
      return (
        <>
          <span className="skin-requirement-icon" aria-hidden="true">
            💎
          </span>
          <span>{tokenPrice}</span>
        </>
      );
    }

    if (requiredPlays !== null && requiredPlays !== undefined) {
      return (
        <>
          <span className="skin-requirement-icon" aria-hidden="true">
            🎮
          </span>
          <span>{requiredPlays}</span>
        </>
      );
    }

    return (
      <>
        <span className="skin-requirement-icon" aria-hidden="true">
          🏆
        </span>
        <span>{requiredWins}</span>
      </>
    );
  };

  const renderPieceSkinPreview = (
    skinId: PieceSkin,
    className = "skin-preview",
  ) => (
    <span className={`${className} skin-preview-${skinId}`} aria-hidden="true">
      <PieceSkinPreviewContent
        skinId={skinId}
        atomicPreviewReady={atomicPreviewReady}
      />
    </span>
  );

  const currentSkinName =
    skinChoices.find((choice) => choice.id === pieceSkin)?.name ?? pieceSkin;

  const vaultRequiredWins = Math.max(1, accountVaultRequiredWins || 3);
  const vaultWins = accountVaultOpenedToday
    ? 0
    : Math.min(vaultRequiredWins, Math.max(0, accountVaultWins));
  const vaultReady = !accountVaultOpenedToday && vaultWins >= vaultRequiredWins;
  const vaultProgressText = `${vaultWins}/${vaultRequiredWins}`;
  const getSkinDisplayName = (skinId: PieceSkin | null) =>
    skinId
      ? (skinChoices.find((choice) => choice.id === skinId)?.name ?? skinId)
      : "";

  const totalPlays = accountWins + accountLosses;

  const unlockedSkinCount = skinChoices.filter((choice) => {
    const unlockedByWins =
      choice.requiredWins !== null && accountWins >= choice.requiredWins;

    const unlockedByPlays =
      choice.requiredPlays !== null &&
      choice.requiredPlays !== undefined &&
      totalPlays >= choice.requiredPlays;

    const unlockedByOwnership = ownedSkins.includes(choice.id);

    if (
      choice.tokenPrice !== null &&
      choice.tokenPrice !== undefined &&
      choice.tokenPrice > 0
    ) {
      return unlockedByOwnership;
    }

    return (
      (!choice.requiredWins && !choice.requiredPlays) ||
      unlockedByWins ||
      unlockedByPlays
    );
  }).length;

  const skinCollectionSummary =
    lang === "en"
      ? `Found: ${unlockedSkinCount}/${skinChoices.length}`
      : `찾음: ${unlockedSkinCount}/${skinChoices.length}`;

  const isPieceSkinUnlocked = (choice: (typeof skinChoices)[number]) => {
    const isOwned = ownedSkins.includes(choice.id);
    if (
      choice.tokenPrice !== null &&
      choice.tokenPrice !== undefined &&
      choice.tokenPrice > 0
    ) {
      return isOwned;
    }
    const unlockedByWins =
      choice.requiredWins !== null && accountWins >= choice.requiredWins;
    const unlockedByPlays =
      choice.requiredPlays !== null &&
      choice.requiredPlays !== undefined &&
      totalPlays >= choice.requiredPlays;
    return (
      (!choice.requiredWins && !choice.requiredPlays) ||
      unlockedByWins ||
      unlockedByPlays
    );
  };

  const achievementViews = useMemo(
    () => buildAchievementViews(accountAchievements),

    [accountAchievements],
  );

  const hasClaimableAchievements = useMemo(
    () =>
      achievementViews.some(
        (achievement) => achievement.completed && !achievement.claimed,
      ),

    [achievementViews],
  );

  const markPatchNotesRead = useCallback(() => {
    localStorage.setItem(PATCH_NOTES_READ_KEY, PATCH_NOTES_VERSION);

    setHasUnreadPatchNotes(false);
  }, []);

  const hasAbilitySkinUnlocked = (skinId: PieceSkin) => {
    if (skinId === "classic") return true;

    if (skinId === "ember") return accountWins >= 10;

    if (skinId === "nova") return accountWins >= 50;

    if (skinId === "aurora") return accountWins >= 100;

    if (skinId === "void") return accountWins >= 500;

    if (skinId === "quantum") return ownedSkins.includes("quantum");

    const skillForSkin = Object.values(ABILITY_SKILLS).find(
      (s) => s.skinId === skinId,
    );
    if (skillForSkin && rotationSkills.includes(skillForSkin.id)) return true;

    return ownedSkins.includes(skinId);
  };

  const skinOrderIndex = new Map(
    skinChoices.map((choice, index) => [choice.id, index] as const),
  );

  const abilitySkillOrderIndex = new Map(
    Object.values(ABILITY_SKILLS).map(
      (skill, index) => [skill.id, index] as const,
    ),
  );

  const availableAbilitySkills = Object.values(ABILITY_SKILLS).sort(
    (left, right) => {
      const leftSkinOrder =
        skinOrderIndex.get(left.skinId) ?? Number.MAX_SAFE_INTEGER;

      const rightSkinOrder =
        skinOrderIndex.get(right.skinId) ?? Number.MAX_SAFE_INTEGER;

      if (leftSkinOrder !== rightSkinOrder) {
        return leftSkinOrder - rightSkinOrder;
      }

      return (
        (abilitySkillOrderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (abilitySkillOrderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      );
    },
  );

  const equippedAbilitySkillDefs = abilityLoadout

    .map((skillId) => ABILITY_SKILLS[skillId])

    .filter(Boolean);

  const syncAccountSummary = useCallback(
    (options?: { force?: boolean }) => {
      return refreshAccountSummary(options).then((profile) => {
        applyProfileToStore(profile, setAuthState);
        lastRewardSyncDayRef.current = getUtcDayKey();
      });
    },
    [setAuthState],
  );

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
    void refreshAccountSummary({ force: true }).then((profile) => {
      applyProfileToStore(profile, setAuthState);
    });
  }, [setAuthState]);

  const handleClaimAchievement = useCallback(
    async (achievementId: string) => {
      if (isClaimingAchievements) return;

      const achievement = achievementViews.find(
        (entry) => entry.id === achievementId,
      );

      setIsClaimingAchievements(true);

      try {
        const profile = await claimAchievementReward(achievementId);

        if (profile) {
          applyProfileToStore(profile, setAuthState);

          setAchievementNoticeMessage(
            lang === "en"
              ? `Claimed ${achievement?.name.en ?? "achievement"} reward and received ${achievement?.rewardTokens ?? 0} diamonds.`
              : `${achievement?.name.kr ?? "업적"} 보상을 획득했고, ${achievement?.rewardTokens ?? 0}다이아몬드를 받았습니다.`,
          );
        } else {
          setAchievementNoticeMessage(
            lang === "en"
              ? "Unable to claim the reward. Please try again."
              : "보상을 획득하지 못했습니다. 다시 시도해주세요.",
          );
        }
      } catch (error) {
        console.error("[achievements] failed to claim reward", error);
        setAchievementNoticeMessage(
          lang === "en"
            ? "Unable to claim the reward. Please try again."
            : "보상을 획득하지 못했습니다. 다시 시도해주세요.",
        );
      } finally {
        setIsClaimingAchievements(false);
      }
    },

    [achievementViews, isClaimingAchievements, lang, setAuthState],
  );

  const handleClaimAllAchievements = useCallback(async () => {
    if (isClaimingAchievements) return;

    const claimableAchievements = achievementViews.filter(
      (achievement) => achievement.completed && !achievement.claimed,
    );

    if (claimableAchievements.length === 0) return;

    const rewardSum = claimableAchievements.reduce(
      (sum, achievement) => sum + achievement.rewardTokens,

      0,
    );

    setIsClaimingAchievements(true);

    try {
      const profile = await claimAllAchievementRewards();

      if (profile) {
        applyProfileToStore(profile, setAuthState);

        setAchievementNoticeMessage(
          lang === "en"
            ? `Claimed ${claimableAchievements.length} rewards and received ${rewardSum} diamonds.`
            : `${claimableAchievements.length}개의 업적 보상을 획득했고, ${rewardSum}다이아몬드를 받았습니다.`,
        );
      } else {
        setAchievementNoticeMessage(
          lang === "en"
            ? "Unable to claim rewards. Please try again."
            : "보상을 획득하지 못했습니다. 다시 시도해주세요.",
        );
      }
    } catch (error) {
      console.error("[achievements] failed to claim all rewards", error);
      setAchievementNoticeMessage(
        lang === "en"
          ? "Unable to claim rewards. Please try again."
          : "보상을 획득하지 못했습니다. 다시 시도해주세요.",
      );
    } finally {
      setIsClaimingAchievements(false);
    }
  }, [achievementViews, isClaimingAchievements, lang, setAuthState]);

  useEffect(() => {
    void syncAccountSummary();
  }, [syncAccountSummary]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    setSettingsNicknameDraft(myNickname);
  }, [isSettingsOpen, myNickname]);

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
    setUpgradeFlowLoading(hasPendingGoogleUpgradeContext());

    void resolveUpgradeFlowAfterRedirect().then((result) => {
      if (active) {
        setUpgradeFlowLoading(false);
      }
      if (!active || result.kind === "none") return;

      if (result.kind === "switch_confirm_required") {
        setPendingUpgradeSwitchProfile(result.profile);

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
  }, [setAuthState]);

  // 모바일(Capacitor) 전용: 페이지 리로드 없이 OAuth가 완료되면 authUserId가 변경됨.
  // null → 유저ID 전환(웹 리다이렉트 초기화)은 위 effect가 처리하므로,
  // 비null 유저ID → 다른 유저ID로의 변경(게스트 → Google 계정)일 때만 finalize 실행.
  useEffect(() => {
    const prevUserId = prevAuthUserIdRef.current;
    prevAuthUserIdRef.current = authUserId;

    if (prevUserId === null || prevUserId === authUserId) return;
    if (!hasPendingGoogleUpgradeContext()) return;

    let active = true;
    void resolveUpgradeFlowAfterRedirect().then((result) => {
      if (!active) return;
      setUpgradeFlowLoading(false);
      if (result.kind === "none") return;

      if (result.kind === "switch_confirm_required") {
        setPendingUpgradeSwitchProfile(result.profile);
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
  }, [authUserId, setAuthState]);

  const handleCancelUpgradeSwitch = async () => {
    setIsResolvingUpgradeDecision(true);

    try {
      const guestState = await cancelPendingGoogleUpgradeSwitch();

      setAuthState(guestState);
      setUpgradeResult({ kind: "none" });
      setPendingUpgradeSwitchProfile(null);
    } finally {
      setIsResolvingUpgradeDecision(false);
    }
  };

  const handleConfirmUpgradeSwitch = async () => {
    setIsResolvingUpgradeDecision(true);

    try {
      const confirmResult = await confirmPendingGoogleUpgradeSwitch();

      if (confirmResult.kind === "switch_ok") {
        applyProfileToStore(confirmResult.profile, setAuthState);
        setUpgradeResult(confirmResult);
        setPendingUpgradeSwitchProfile(null);
        setShowUpgradeNotice(true);
        return;
      }

      setPendingUpgradeSwitchProfile(null);
      setUpgradeResult({ kind: "auth_error" });
    } finally {
      setIsResolvingUpgradeDecision(false);
    }
  };

  useEffect(() => {
    const readVersion = localStorage.getItem(PATCH_NOTES_READ_KEY);

    setHasUnreadPatchNotes(readVersion !== PATCH_NOTES_VERSION);
  }, []);

  useEffect(() => {
    if (!onboardingPromptsEnabled) {
      setIsInitialNicknamePromptOpen(false);
      return;
    }

    setIsAiTutorialPromptOpen(false);
  }, [onboardingPromptsEnabled]);

  useEffect(() => {
    if (!onboardingPromptsEnabled) return;
    if (!authUserId || currentMatchType) return;
    if (accountSummaryLoading || upgradeFlowLoading) return;

    const completedForUser = window.localStorage.getItem(
      INITIAL_NICKNAME_COMPLETED_KEY,
    );
    const normalizedNickname = (myNickname || "").trim();
    const hasRealNickname =
      normalizedNickname.length > 0 && normalizedNickname !== "Guest";

    if (hasRealNickname) {
      window.localStorage.setItem(INITIAL_NICKNAME_COMPLETED_KEY, authUserId);
      if (isInitialNicknamePromptOpen) {
        setIsInitialNicknamePromptOpen(false);
      }
      return;
    }

    if (completedForUser === authUserId) {
      return;
    }

    setInitialNicknameDraft("");
    setIsInitialNicknamePromptOpen(true);
  }, [
    accountSummaryLoading,
    authUserId,
    currentMatchType,
    isInitialNicknamePromptOpen,
    myNickname,
    onboardingPromptsEnabled,
    upgradeFlowLoading,
  ]);

  useEffect(() => {
    if (!onboardingPromptsEnabled) return;
    if (!authUserId || currentMatchType) return;
    if (accountSummaryLoading || upgradeFlowLoading) return;
    if (isInitialNicknamePromptOpen) {
      setIsAiTutorialPromptOpen(false);
      return;
    }

    const completedForUser = window.localStorage.getItem(
      INITIAL_NICKNAME_COMPLETED_KEY,
    );
    const normalizedNickname = (myNickname || "").trim();
    const hasRealNickname =
      normalizedNickname.length > 0 && normalizedNickname !== "Guest";
    if (!hasRealNickname && completedForUser !== authUserId) {
      return;
    }

    const hasSeenAiTutorial =
      window.localStorage.getItem(AI_TUTORIAL_SEEN_KEY) === "1";

    const hasAnsweredAiTutorialPrompt =
      window.localStorage.getItem(AI_TUTORIAL_PROMPT_ANSWERED_KEY) === "1";

    if (!hasSeenAiTutorial && !hasAnsweredAiTutorialPrompt) {
      setIsAiTutorialPromptOpen(true);
    }
  }, [
    authUserId,
    accountSummaryLoading,
    currentMatchType,
    isInitialNicknamePromptOpen,
    myNickname,
    onboardingPromptsEnabled,
    tutorialPromptTrigger,
    upgradeFlowLoading,
  ]);

  useEffect(() => {
    const shouldLockScroll =
      isSkinPickerOpen ||
      isTokenShopOpen ||
      isSettingsOpen ||
      isAudioSettingsOpen ||
      isAbilityLoadoutOpen ||
      isPatchNotesOpen ||
      isInitialNicknamePromptOpen ||
      isAiTutorialPromptOpen;

    if (!shouldLockScroll) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;

    const previousBodyOverscrollBehavior =
      document.body.style.overscrollBehavior;

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

    isInitialNicknamePromptOpen,

    isAiTutorialPromptOpen,

    isAbilityLoadoutOpen,

    isPatchNotesOpen,

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

  const beginNetworkMatch = (
    mode: "friend" | "random" | "ai" | "coop" | "2v2" | "ability",
  ) => {
    const epoch = matchmakingEpochRef.current + 1;
    matchmakingEpochRef.current = epoch;
    activeNetworkMatchRef.current = { mode, epoch };
    return epoch;
  };

  const cancelNetworkMatch = (
    mode?: "friend" | "random" | "ai" | "coop" | "2v2" | "ability",
  ) => {
    if (!mode || activeNetworkMatchRef.current?.mode === mode) {
      activeNetworkMatchRef.current = null;
    }
    matchmakingEpochRef.current += 1;
  };

  const isNetworkMatchActive = (
    mode: "friend" | "random" | "ai" | "coop" | "2v2" | "ability",
    epoch?: number,
  ) => {
    const active = activeNetworkMatchRef.current;
    if (!active || active.mode !== mode) return false;
    if (epoch !== undefined && active.epoch !== epoch) return false;
    if (mode === "ability" && useGameStore.getState().isLocalAbilityTraining) {
      return false;
    }
    return useGameStore.getState().currentMatchType === mode;
  };

  const isAnyNetworkMatchActive = (
    modes: Array<"friend" | "random" | "ai" | "coop" | "2v2" | "ability">,
    epoch?: number,
  ) => modes.some((mode) => isNetworkMatchActive(mode, epoch));

  const startSocket = () => {
    const socket = connectSocket();

    socket.off("room_created");
    socket.off("room_joined");
    socket.off("opponent_joined");
    socket.off("join_error");
    socket.off("matchmaking_waiting");
    socket.off("coop_room_joined");
    socket.off("coop_matchmaking_waiting");
    socket.off("twovtwo_room_joined");
    socket.off("twovtwo_matchmaking_waiting");
    socket.off("ability_room_joined");
    socket.off("ability_room_created");
    socket.off("ability_opponent_joined");
    socket.off("ability_matchmaking_waiting");
    socket.off("game_start");
    socket.off("round_start");
    socket.off("opponent_submitted");
    socket.off("paths_reveal");
    socket.off("game_over");
    socket.off("opponent_disconnected");
    socket.off("rematch_requested");
    socket.off("rematch_start");
    socket.off("chat_receive");
    socket.off("player_skin_updated");
    socket.off("room_closed");
    socket.off("session_replaced");

    socket.on("game_start", (gs: ClientGameState) => {
      const activeMatch = activeNetworkMatchRef.current;
      if (!activeMatch) return;
      if (useGameStore.getState().isLocalAbilityTraining) return;
      setGameState(gs);
      cancelNetworkMatch(activeMatch.mode);
      setIsMatchmaking(false);

      onGameStart();
    });

    const emitGameClientReady = () => {
      void (async () => {
        await syncServerTime(socket);
        socket.emit("game_client_ready");
      })();
    };

    socket.on("round_start", (payload: RoundStartPayload) => {
      void syncServerTime(socket);
      useGameStore.getState().setRoundInfo(payload);
    });

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
        if (!isAnyNetworkMatchActive(["friend", "random", "ai"])) return;
        setMyColor(color);

        setRoomCode(code);

        setPlayerPieceSkins({
          red: color === "red" ? (selfPieceSkin ?? pieceSkin) : "classic",

          blue: color === "blue" ? (selfPieceSkin ?? pieceSkin) : "classic",
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
        if (!isAnyNetworkMatchActive(["friend", "random", "ai"])) return;
        setMyColor(color);

        setRoomCode(roomId);

        setPlayerPieceSkins({
          red:
            color === "red"
              ? (selfPieceSkin ?? pieceSkin)
              : (opponentPieceSkin ?? "classic"),

          blue:
            color === "blue"
              ? (selfPieceSkin ?? pieceSkin)
              : (opponentPieceSkin ?? "classic"),
        });

        setError("");

        setIsMatchmaking(false);

        emitGameClientReady();
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
        if (!isAnyNetworkMatchActive(["friend", "random", "ai"])) return;
        const myCurrentColor = useGameStore.getState().myColor;

        const myCurrentPieceSkin = useGameStore.getState().pieceSkin;

        const opponentColor =
          color ?? (myCurrentColor === "red" ? "blue" : "red");

        if (opponentColor) {
          setPlayerPieceSkins({
            red:
              opponentColor === "red"
                ? (opponentPieceSkin ?? "classic")
                : myCurrentPieceSkin,

            blue:
              opponentColor === "blue"
                ? (opponentPieceSkin ?? "classic")
                : myCurrentPieceSkin,
          });
        }

        setError("");

        setIsMatchmaking(false);

        emitGameClientReady();
      },
    );

    socket.on("join_error", ({ message }: { message: string }) => {
      cancelNetworkMatch();
      setIsMatchmaking(false);

      setError(message);
    });

    socket.on("matchmaking_waiting", () => {
      if (!isNetworkMatchActive("random")) return;
      setError("");

      setIsMatchmaking(true);
    });

    socket.on(
      "coop_room_joined",

      ({
        color,

        roomId,

        selfPieceSkin,

        teammatePieceSkin,
      }: {
        roomId: string;

        color: "red" | "blue";

        teammateNickname: string;

        selfPieceSkin?: PieceSkin;

        teammatePieceSkin?: PieceSkin;
      }) => {
        if (!isNetworkMatchActive("coop")) return;
        setMyColor(color);

        setRoomCode(roomId);

        setPlayerPieceSkins({
          red:
            color === "red"
              ? (selfPieceSkin ?? pieceSkin)
              : (teammatePieceSkin ?? "classic"),

          blue:
            color === "blue"
              ? (selfPieceSkin ?? pieceSkin)
              : (teammatePieceSkin ?? "classic"),
        });

        setError("");

        setIsMatchmaking(false);

        onCoopStart();
      },
    );

    socket.on("coop_matchmaking_waiting", () => {
      if (!isNetworkMatchActive("coop")) return;
      setError("");

      setIsMatchmaking(true);
    });

    socket.on(
      "twovtwo_room_joined",

      ({
        roomId,

        slot,

        team,
      }: {
        roomId: string;

        slot: "red_top" | "red_bottom" | "blue_top" | "blue_bottom";

        team: "red" | "blue";
      }) => {
        if (!isNetworkMatchActive("2v2")) return;
        setMyColor(team);

        setTwoVsTwoSlot(slot);

        setRoomCode(roomId);

        setError("");

        setIsMatchmaking(false);

        onTwoVsTwoStart();
      },
    );

    socket.on("twovtwo_matchmaking_waiting", () => {
      if (!isNetworkMatchActive("2v2")) return;
      setError("");

      setIsMatchmaking(true);
    });

    socket.on(
      "ability_room_created",

      ({
        code,

        color,
      }: {
        roomId: string;

        code: string;

        color: "red" | "blue";
      }) => {
        if (!isNetworkMatchActive("friend")) return;
        setMyColor(color);

        setRoomCode(code);

        setCreatedCode(code);

        setError("");

        setIsMatchmaking(false);

        setView("create");
      },
    );

    socket.on(
      "ability_opponent_joined",

      ({
        color,
      }: {
        nickname: string;

        color?: "red" | "blue";
      }) => {
        if (!isNetworkMatchActive("friend")) return;
        if (color) {
          setMyColor(color === "red" ? "blue" : "red");
        }

        setError("");

        setIsMatchmaking(false);

        onAbilityStart();
      },
    );

    socket.on(
      "ability_room_joined",

      ({
        roomId,

        color,

        hostArena,
      }: {
        roomId: string;

        color: "red" | "blue";

        opponentNickname: string;

        hostArena?: number;
      }) => {
        if (!isAnyNetworkMatchActive(["friend", "ability"])) return;
        setMyColor(color);

        setRoomCode(roomId);

        if (hostArena !== undefined) {
          setMatchHostArena(hostArena);
        }

        setError("");

        setIsMatchmaking(false);

        onAbilityStart();
      },
    );

    socket.on("ability_matchmaking_waiting", () => {
      if (!isNetworkMatchActive("ability")) return;
      setError("");

      setIsMatchmaking(true);
    });

    return socket;
  };

  const showSocketConnectError = () => {
    setIsMatchmaking(false);
    setMatchType(null);
    setError(
      lang === "en"
        ? "Unable to connect to the game server. Please try again shortly."
        : "게임 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
    );
  };

  const prepareMatchmakingSocket = async () => {
    try {
      await connectSocketReady();
      return startSocket();
    } catch {
      showSocketConnectError();
      return null;
    }
  };

  useEffect(() => {
    const socket = connectSocket();
    const handleChallengeReceived = ({
      fromUserId,
      fromNickname,
    }: {
      fromUserId: string;
      fromNickname: string;
    }) => {
      setChallengeToast({ kind: "incoming", fromUserId, fromNickname });
    };
    const handleChallengeAccepted = ({
      roomId,
      color,
    }: {
      roomId: string;
      color: "red" | "blue";
      opponentNickname: string;
    }) => {
      beginNetworkMatch("friend");
      setChallengeToast(null);
      setMyColor(color);
      setRoomCode(roomId);
      setError("");
      setIsMatchmaking(false);
      setMatchType("friend");
      onAbilityStart();
    };
    const handleChallengeDeclined = () => {
      setChallengeToast(null);
      cancelNetworkMatch("friend");
      setMatchType(null);
      setIsMatchmaking(false);
      showSkinFloatingMessageRef.current(
        langRef.current === "en"
          ? "Friend declined the challenge."
          : "상대방이 친선전 요청을 거절했습니다.",
      );
    };
    const handleChallengeCanceled = ({
      fromUserId,
    }: {
      fromUserId: string;
    }) => {
      setChallengeToast((current) =>
        current?.kind === "incoming" && current.fromUserId === fromUserId
          ? null
          : current,
      );
    };

    socket.on("friend_challenge_received", handleChallengeReceived);
    socket.on("friend_challenge_accepted", handleChallengeAccepted);
    socket.on("friend_challenge_declined", handleChallengeDeclined);
    socket.on("friend_challenge_canceled", handleChallengeCanceled);

    return () => {
      socket.off("friend_challenge_received", handleChallengeReceived);
      socket.off("friend_challenge_accepted", handleChallengeAccepted);
      socket.off("friend_challenge_declined", handleChallengeDeclined);
      socket.off("friend_challenge_canceled", handleChallengeCanceled);
    };
  }, [onAbilityStart, setMatchType, setMyColor, setRoomCode]);

  const showAccountLoadError = (error?: unknown) => {
    if (error instanceof Error && error.message === SOCKET_CONNECT_FAILED) {
      showSocketConnectError();
      return;
    }

    setIsMatchmaking(false);
    setMatchType(null);
    setError(
      lang === "en"
        ? "Unable to load account data. Please try again."
        : "계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
    );
  };

  const ensureMatchmakingProfile = useCallback(
    async (options?: { syncAbilitySkills?: boolean }) => {
      if (options?.syncAbilitySkills) {
        const s = useGameStore.getState();
        await syncAbilityPresets(s.abilitySkillPresets, s.activePreset);
      }
      const profile = await refreshAccountSummary({ force: true });
      applyProfileToStore(profile, setAuthState);
      return profile;
    },
    [setAuthState],
  );

  const buildPlayerPayloadFromProfile = async (profile?: AccountProfile) => ({
    nickname: profile?.nickname ?? getNick(),

    auth: await getSocketAuthPayload(),

    pieceSkin: profile?.equippedSkin ?? useGameStore.getState().pieceSkin,
    boardSkin: profile?.equippedBoardSkin ?? useGameStore.getState().boardSkin,
  });

  const buildAbilityPlayerPayloadFromProfile = async (
    profile?: AccountProfile,
  ) => ({
    ...(await buildPlayerPayloadFromProfile(profile)),
    equippedSkills:
      profile?.equippedAbilitySkills ?? useGameStore.getState().abilityLoadout,
  });

  const handleChallengeAccept = async () => {
    if (!challengeToast || challengeToast.kind !== "incoming") return;
    const { fromUserId } = challengeToast;
    const socket = await prepareMatchmakingSocket();
    if (!socket) return;
    const auth = await getSocketAuthPayload();
    await ensureMatchmakingProfile({ syncAbilitySkills: true });
    beginNetworkMatch("friend");
    setMatchType("friend");
    setIsMatchmaking(true);
    const store = useGameStore.getState();
    const res = await new Promise<{ status: string }>((resolve) =>
      socket.emit(
        "friend_challenge_response",
        {
          auth,
          fromUserId,
          accept: true,
          pieceSkin: store.pieceSkin,
          boardSkin: store.boardSkin,
          equippedSkills: store.abilityLoadout,
        },
        resolve,
      ),
    );
    if (res.status !== "ok") {
      cancelNetworkMatch("friend");
      setMatchType(null);
      setIsMatchmaking(false);
      showSkinFloatingMessage(
        lang === "kr"
          ? "친선전 요청을 처리하지 못했습니다."
          : "Unable to accept the challenge.",
      );
    }
    setChallengeToast(null);
  };

  const handleChallengeDecline = () => {
    if (!challengeToast || challengeToast.kind !== "incoming") return;
    const { fromUserId } = challengeToast;
    setChallengeToast(null);
    const socket = connectSocket();
    void (async () => {
      const auth = await getSocketAuthPayload();
      socket.emit("friend_challenge_response", {
        auth,
        fromUserId,
        accept: false,
      });
    })();
  };

  const handleChallengeCancel = () => {
    if (!challengeToast || challengeToast.kind !== "outgoing") return;
    const { toUserId } = challengeToast;
    setChallengeToast(null);
    cancelNetworkMatch("friend");
    setMatchType(null);
    setIsMatchmaking(false);
    const socket = connectSocket();
    void (async () => {
      const auth = await getSocketAuthPayload();
      socket.emit("friend_challenge_cancel", { auth, friendId: toUserId });
    })();
  };

  useEffect(() => {
    if (!challengeToast || challengeToast.kind !== "outgoing") return;
    const { toUserId } = challengeToast;
    const socket = connectSocket();
    void (async () => {
      const auth = await getSocketAuthPayload();
      const store = useGameStore.getState();
      socket.emit("friend_challenge_update", {
        auth,
        friendId: toUserId,
        pieceSkin: store.pieceSkin,
        boardSkin: store.boardSkin,
        equippedSkills: store.abilityLoadout,
      });
    })();
  }, [abilityLoadout, challengeToast, pieceSkin]);

  const handleFriendRemove = async (friendId: string) => {
    const socket = connectSocket();
    const auth = await getSocketAuthPayload();
    await new Promise<void>((resolve) =>
      socket.emit("friend_remove", { auth, friendId }, () => resolve()),
    );
    setFriendCtx(null);
    setFriendListRefresh((n) => n + 1);
  };

  const handleFriendChallenge = async (friend: FriendEntry) => {
    setFriendCtx(null);
    const socket = await prepareMatchmakingSocket();
    if (!socket) return;
    const auth = await getSocketAuthPayload();
    await ensureMatchmakingProfile({ syncAbilitySkills: true });
    beginNetworkMatch("friend");
    setMatchType("friend");
    setIsMatchmaking(true);
    const store = useGameStore.getState();
    const res = await new Promise<{ status: string }>((resolve) =>
      socket.emit(
        "friend_challenge",
        {
          auth,
          friendId: friend.userId,
          pieceSkin: store.pieceSkin,
          boardSkin: store.boardSkin,
          equippedSkills: store.abilityLoadout,
        },
        resolve,
      ),
    );
    if (res.status === "ok") {
      setChallengeToast({
        kind: "outgoing",
        toUserId: friend.userId,
        toNickname: friend.nickname,
      });
    } else if (res.status === "offline") {
      cancelNetworkMatch("friend");
      setMatchType(null);
      setIsMatchmaking(false);
      showSkinFloatingMessage(
        lang === "kr" ? "상대방이 오프라인입니다." : "Friend is offline.",
      );
    } else if (res.status === "in_game") {
      cancelNetworkMatch("friend");
      setMatchType(null);
      setIsMatchmaking(false);
      showSkinFloatingMessage(
        lang === "kr" ? "상대방이 게임 중입니다." : "Friend is in a game.",
      );
    } else if (res.status !== "ok") {
      cancelNetworkMatch("friend");
      setMatchType(null);
      setIsMatchmaking(false);
      showSkinFloatingMessage(
        lang === "kr"
          ? "친선전 요청을 보내지 못했습니다."
          : "Unable to send the challenge.",
      );
    }
  };

  const handleCreateAbilityRoom = async () => {
    setError("");
    const epoch = beginNetworkMatch("friend");
    setIsMatchmaking(true);

    setMatchType("friend");

    try {
      const profile = await ensureMatchmakingProfile({
        syncAbilitySkills: true,
      });
      const socket = await prepareMatchmakingSocket();
      const payload = await buildAbilityPlayerPayloadFromProfile(profile);
      if (!socket || !isNetworkMatchActive("friend", epoch)) return;
      socket.emit("create_ability_room", payload);
    } catch (error) {
      if (isNetworkMatchActive("friend", epoch)) showAccountLoadError(error);
    }
  };

  const handleJoinAbilityRoom = async () => {
    const normalizedJoinCode = joinCode.replace(/\s+/g, "").toUpperCase();

    if (!normalizedJoinCode) {
      setError(t.joinError);

      return;
    }

    setError("");
    const epoch = beginNetworkMatch("friend");
    setIsMatchmaking(true);

    setMatchType("friend");

    try {
      const profile = await ensureMatchmakingProfile({
        syncAbilitySkills: true,
      });
      const socket = await prepareMatchmakingSocket();
      const payload = await buildAbilityPlayerPayloadFromProfile(profile);
      if (!socket || !isNetworkMatchActive("friend", epoch)) return;
      socket.emit("join_ability_room", {
        code: normalizedJoinCode,
        ...payload,
      });
    } catch (error) {
      if (isNetworkMatchActive("friend", epoch)) showAccountLoadError(error);
    }
  };

  const handleChangeNickname = useCallback(async () => {
    if (isChangingNickname) return;

    const trimmed = settingsNicknameDraft.trim();
    if (trimmed.length < 1 || trimmed.length > 16) {
      window.alert(changeNameInvalidMsg);
      return;
    }

    setIsChangingNickname(true);
    try {
      const result = await changeNicknameWithTokens(trimmed);

      if (result === "updated") {
        await syncAccountSummary();
        setNickname(trimmed);
        setSettingsNicknameDraft(trimmed);
        setIsNameChangeOpen(false);
        window.alert(changeNameSuccessMsg);
        return;
      }

      if (result === "no_change") {
        window.alert(changeNameNoChangeMsg);
        return;
      }

      if (result === "invalid_nickname") {
        window.alert(changeNameInvalidMsg);
        return;
      }

      if (result === "insufficient_tokens") {
        window.alert(changeNameInsufficientMsg);
        return;
      }

      window.alert(changeNameFailedMsg);
    } finally {
      setIsChangingNickname(false);
    }
  }, [
    changeNameFailedMsg,
    changeNameInsufficientMsg,
    changeNameInvalidMsg,
    changeNameNoChangeMsg,
    changeNameSuccessMsg,
    isChangingNickname,
    setNickname,
    settingsNicknameDraft,
    syncAccountSummary,
  ]);

  const handleInitialNicknameConfirm = useCallback(async () => {
    if (isSubmittingInitialNickname) return;

    const trimmed = initialNicknameDraft.trim();
    if (trimmed.length < 1 || trimmed.length > 16) {
      window.alert(changeNameInvalidMsg);
      return;
    }

    setIsSubmittingInitialNickname(true);
    try {
      await syncNickname(trimmed);
      await syncAccountSummary();
      setNickname(trimmed);
      window.localStorage.setItem(
        INITIAL_NICKNAME_COMPLETED_KEY,
        authUserId ?? "",
      );
      setIsInitialNicknamePromptOpen(false);
      setInitialNicknameDraft(trimmed);
    } finally {
      setIsSubmittingInitialNickname(false);
    }
  }, [
    authUserId,
    changeNameInvalidMsg,
    initialNicknameDraft,
    isSubmittingInitialNickname,
    setNickname,
    syncAccountSummary,
  ]);

  const handleCancelCoop = () => {
    cancelNetworkMatch("coop");
    const socket = getSocket();

    if (socket.connected) socket.emit("cancel_coop");

    setIsMatchmaking(false);

    setMatchType(null);
  };

  const handleCancelTwoVsTwo = () => {
    cancelNetworkMatch("2v2");
    const socket = getSocket();

    if (socket.connected) socket.emit("cancel_2v2");

    setIsMatchmaking(false);

    setMatchType(null);
  };

  const handleAiMatchWithTutorial = async (tutorialPending: boolean) => {
    const epoch = beginNetworkMatch("ai");
    setError("");

    setIsMatchmaking(true);

    setMatchType("ai");

    try {
      const profile = await ensureMatchmakingProfile();
      const socket = await prepareMatchmakingSocket();
      const payload = await buildPlayerPayloadFromProfile(profile);
      if (!socket || !isNetworkMatchActive("ai", epoch)) return;
      socket.emit("join_ai", {
        ...payload,
        tutorialPending,
      });
    } catch (error) {
      if (isNetworkMatchActive("ai", epoch)) showAccountLoadError(error);
    }
  };

  const startTutorialReplay = async (options?: { closePrompt?: boolean }) => {
    window.localStorage.setItem(AI_TUTORIAL_PROMPT_ANSWERED_KEY, "1");

    window.localStorage.removeItem(AI_TUTORIAL_SEEN_KEY);

    setError("");

    setIsMatchmaking(false);

    if (options?.closePrompt) {
      setIsAiTutorialPromptOpen(false);
    }

    await handleAiMatchWithTutorial(true);
  };

  const handleReplayAiTutorial = async () => {
    await startTutorialReplay();
  };

  const handleAcceptAiTutorial = async () => {
    await startTutorialReplay({ closePrompt: true });
  };

  const handleDeclineAiTutorial = () => {
    window.localStorage.setItem(AI_TUTORIAL_PROMPT_ANSWERED_KEY, "1");

    window.localStorage.setItem(AI_TUTORIAL_SEEN_KEY, "1");

    setIsAiTutorialPromptOpen(false);
  };

  const handleCoopMatch = async () => {
    const epoch = beginNetworkMatch("coop");
    setError("");
    setIsMatchmaking(true);

    setMatchType("coop");

    try {
      const profile = await ensureMatchmakingProfile();
      const socket = await prepareMatchmakingSocket();
      const payload = await buildPlayerPayloadFromProfile(profile);
      if (!socket || !isNetworkMatchActive("coop", epoch)) return;
      socket.emit("join_coop", payload);
    } catch (error) {
      if (isNetworkMatchActive("coop", epoch)) showAccountLoadError(error);
    }
  };

  const handleTwoVsTwoMatch = async () => {
    const epoch = beginNetworkMatch("2v2");
    setError("");
    setIsMatchmaking(true);

    setMatchType("2v2");

    try {
      const profile = await ensureMatchmakingProfile();
      const socket = await prepareMatchmakingSocket();
      const payload = await buildPlayerPayloadFromProfile(profile);
      if (!socket || !isNetworkMatchActive("2v2", epoch)) return;
      socket.emit("join_2v2", payload);
    } catch (error) {
      if (isNetworkMatchActive("2v2", epoch)) showAccountLoadError(error);
    }
  };

  const handleAbilityMatch = async () => {
    const epoch = beginNetworkMatch("ability");
    setError("");

    setLocalAbilityTraining(false);
    setMatchType("ability");

    setIsMatchmaking(true);

    try {
      const profile = await ensureMatchmakingProfile({
        syncAbilitySkills: true,
      });
      const socket = await prepareMatchmakingSocket();
      const payload = await buildAbilityPlayerPayloadFromProfile(profile);
      if (!socket || !isNetworkMatchActive("ability", epoch)) return;
      socket.emit("join_ability", payload);
    } catch (error) {
      if (isNetworkMatchActive("ability", epoch)) showAccountLoadError(error);
    }
  };

  const handleAbilityTraining = async () => {
    cancelNetworkMatch();
    const socket = getSocket();
    if (socket.connected) socket.emit("cancel_ability");

    setError("");
    setLocalAbilityTraining(true);
    setMatchType("ability");

    try {
      const store = useGameStore.getState();
      startLocalAbilityTraining({
        nickname:
          store.myNickname.trim() || `Guest${Math.floor(Math.random() * 9999)}`,
        pieceSkin: store.pieceSkin,
        boardSkin: store.boardSkin,
      });
      setIsMatchmaking(false);
      onAbilityStart();
    } catch (error) {
      setLocalAbilityTraining(false);
      showAccountLoadError(error);
    }
  };

  const handleCancelAbility = () => {
    cancelNetworkMatch("ability");
    setLocalAbilityTraining(false);
    const socket = getSocket();

    if (socket.connected) socket.emit("cancel_ability");

    setIsMatchmaking(false);

    setMatchType(null);
  };

  const handleToggleAbilitySkill = (skillId: AbilitySkillId) => {
    const isEquipped = abilityLoadout.includes(skillId);

    if (isEquipped) {
      setAbilityLoadoutForPreset(
        abilityLoadout.filter((value) => value !== skillId),
      );

      return;
    }

    if (abilityLoadout.length >= 3) {
      showSkinFloatingMessage(
        lang === "en"
          ? "You can equip up to 3 skills."
          : "스킬은 최대 3개까지 장착할 수 있습니다.",
      );

      return;
    }

    setAbilityLoadoutForPreset([...abilityLoadout, skillId]);
  };

  const handleUnequipAbilitySkill = (skillId: AbilitySkillId) => {
    if (!abilityLoadout.includes(skillId)) return;

    setAbilityLoadoutForPreset(
      abilityLoadout.filter((value) => value !== skillId),
    );
  };

  const handleSwitchPreset = (presetIndex: number) => {
    switchAbilityPreset(presetIndex);
  };

  const handlePreviewAbilitySfx = useCallback(
    (gainId: (typeof ABILITY_SFX_GAIN_IDS)[number]) => {
      prepareSfxPreviewAudio();
      if (isSfxMuted) return;
      previewAbilitySfxSample(gainId, sfxVolume);
    },
    [isSfxMuted, sfxVolume],
  );

  const handleLinkGoogle = async () => {
    setUpgradeResult({ kind: "none" });

    setShowUpgradeNotice(false);
    setUpgradeFlowLoading(true);

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

  const askSkinPurchaseConfirmation = (message: string) =>
    new Promise<boolean>((resolve) => {
      skinPurchaseConfirmResolverRef.current?.(false);

      skinPurchaseConfirmResolverRef.current = resolve;

      setSkinPurchaseConfirmMessage(message);
    });

  const resolveSkinPurchaseConfirmation = (confirmed: boolean) => {
    skinPurchaseConfirmResolverRef.current?.(confirmed);

    skinPurchaseConfirmResolverRef.current = null;

    setSkinPurchaseConfirmMessage(null);
  };

  const showSkinFloatingMessage = (text: string) => {
    skinFloatingMessageIdRef.current += 1;

    setSkinFloatingMessage({
      id: skinFloatingMessageIdRef.current,
      text,
    });
  };
  showSkinFloatingMessageRef.current = showSkinFloatingMessage;

  const handleSkinChoiceSelect = async (
    choice: (typeof skinChoices)[number],

    isLocked: boolean,

    isOwned: boolean,
  ) => {
    if (isLocked) return false;

    if (
      choice.tokenPrice !== null &&
      choice.tokenPrice !== undefined &&
      !isOwned
    ) {
      const confirmed = await askSkinPurchaseConfirmation(
        skinPurchasePrompt(choice.name),
      );

      if (!confirmed) return false;

      const result = await purchaseSkinWithTokens(choice.id);

      if (result === "purchased" || result === "already_owned") {
        await syncAccountSummary({ force: true });

        setPieceSkin(choice.id);

        setSkinPurchaseNoticeMessage(skinPurchaseSuccessMsg(choice.name));

        return true;
      }

      if (result === "insufficient_tokens") {
        showSkinFloatingMessage(skinPurchaseInsufficientMsg);

        return false;
      }

      if (result === "arena_required") {
        showSkinFloatingMessage(skinPurchaseArenaRequiredMsg);

        return false;
      }

      if (result === "invalid_skin") {
        setSkinPurchaseNoticeMessage(skinPurchaseInvalidSkinMsg);

        return false;
      }

      setSkinPurchaseNoticeMessage(skinPurchaseFailedMsg);

      return false;
    }

    setPieceSkin(choice.id);
    return true;
  };

  const handleSkinDetailAction = async () => {
    if (!skinDetail) return;

    const choice = skinDetail.choice;
    const isOwned = ownedSkins.includes(choice.id);
    const isTokenSkin =
      choice.tokenPrice !== null && choice.tokenPrice !== undefined;
    const lockedByArena =
      choice.id !== "classic" &&
      isTokenSkin &&
      !isOwned &&
      !isSkinArenaUnlocked(choice.id, highestArena);
    const lockedByWins =
      choice.requiredWins !== null && accountWins < choice.requiredWins;
    const lockedByPlays =
      choice.requiredPlays !== null &&
      choice.requiredPlays !== undefined &&
      totalPlays < choice.requiredPlays;
    const lockedByTokens =
      choice.tokenPrice !== null &&
      choice.tokenPrice !== undefined &&
      !isOwned &&
      accountTokens < choice.tokenPrice;
    if (lockedByArena) {
      showSkinFloatingMessage(
        lang === "en"
          ? `Arena ${getSkinRequiredArena(choice.id)} required`
          : `아레나 ${getSkinRequiredArena(choice.id)} 필요`,
      );
      return;
    }
    if (lockedByWins) {
      showSkinFloatingMessage(skinWinRequirementInsufficientMsg);
      return;
    }
    if (lockedByPlays) {
      showSkinFloatingMessage(skinPlayRequirementInsufficientMsg);
      return;
    }
    if (lockedByTokens) {
      showSkinFloatingMessage(skinPurchaseInsufficientMsg);
      return;
    }
    const applied = await handleSkinChoiceSelect(choice, false, isOwned);
    if (applied) {
      setSkinDetail(null);
    }
  };

  const lobbyModeOptions: Array<{
    key: LobbyModeKey;
    icon: string;
    label: string;
  }> = [
    { key: "friend", icon: "🤝", label: t.friendTitle },
    { key: "ability", icon: "✨", label: abilityBattleTitle },
    { key: "skill_ranked", icon: "⚔️", label: skillRankedTitle },
    { key: "2v2", icon: "👥", label: twoVsTwoTitle },
    { key: "coop", icon: "🛡️", label: coopTitle },
  ];

  const handleSelectLobbyMode = (mode: LobbyModeKey) => {
    if (DISABLED_LOBBY_MODES.has(mode)) return;
    setSelectedLobbyMode(mode);
    setIsModePickerOpen(false);

    if (mode !== "friend" && view !== "main") {
      setView("main");
      setError("");
    }
  };

  const handleToggleLanguage = () => {
    setLang(lang === "en" ? "kr" : "en");
  };

  const selectedLobbyModeOption =
    lobbyModeOptions.find((option) => option.key === selectedLobbyMode) ??
    lobbyModeOptions[0];
  const showLobbyArenaContent = selectedLobbyMode === "ability";
  const showFriendListPanel = selectedLobbyMode === "friend";
  const isAbilityMatchmakingActive =
    isMatchmaking && currentMatchType === "ability";

  const renderModePickerAction = () => (
    <button
      type="button"
      className={`lobby-bottom-action lobby-mode-action${
        isAbilityMatchmakingActive ? " is-matchmaking-disabled" : ""
      }`}
      data-keyboard-nav-layer="mode-title"
      onClick={() => setIsModePickerOpen(true)}
      disabled={isAbilityMatchmakingActive}
      aria-disabled={isAbilityMatchmakingActive}
    >
      <span className="lobby-bottom-action-icon-wrap" aria-hidden="true">
        <span className="lobby-mode-action-icon">
          {selectedLobbyModeOption.icon}
        </span>
      </span>
      <span className="lobby-bottom-action-label">
        {selectedLobbyModeOption.label}
      </span>
    </button>
  );

  const renderModeSideActions = () => {
    if (selectedLobbyMode === "ability") {
      return (
        <div className="mode-action-side mode-action-side--double">
          <button
            className={`lobby-mini-btn${
              isAbilityMatchmakingActive ? " is-matchmaking-disabled" : ""
            }`}
            data-keyboard-nav-layer="mini"
            type="button"
            onClick={() => void handleAbilityTraining()}
            disabled={isAbilityMatchmakingActive}
            aria-disabled={isAbilityMatchmakingActive}
          >
            {abilityTrainingTitle}
          </button>
          <button
            className={`lobby-mini-btn${
              isAbilityMatchmakingActive ? " is-matchmaking-disabled" : ""
            }`}
            data-keyboard-nav-layer="mini"
            type="button"
            onClick={() => setIsAbilityLoadoutOpen(true)}
            disabled={isAbilityMatchmakingActive}
            aria-disabled={isAbilityMatchmakingActive}
          >
            {abilityLoadoutTitle}
          </button>
        </div>
      );
    }

    if (selectedLobbyMode === "friend") {
      return (
        <div className="mode-action-side mode-action-side--double">
          <button
            className="lobby-mini-btn"
            data-keyboard-nav-layer="mini"
            type="button"
            onClick={() => {
              setView("join");
              setError("");
            }}
          >
            {t.enterCodeBtn}
          </button>
          <button
            className="lobby-mini-btn"
            data-keyboard-nav-layer="mini"
            type="button"
            onClick={() => setIsAbilityLoadoutOpen(true)}
          >
            {abilityLoadoutTitle}
          </button>
        </div>
      );
    }

    return <div className="mode-action-side" aria-hidden="true" />;
  };

  const renderAbilityLoadoutBar = () => {
    const showLoadout =
      selectedLobbyMode === "ability" || selectedLobbyMode === "friend";

    return (
      <div
        className={`ability-loadout-chip-row mode-loadout-row${showLoadout ? "" : " is-empty"}${
          showLoadout && isAbilityMatchmakingActive
            ? " is-matchmaking-disabled"
            : ""
        }`}
        aria-hidden={!showLoadout}
      >
        {showLoadout &&
          equippedAbilitySkillDefs.map((skill) => (
            <span key={skill.id} className="ability-loadout-chip">
              {renderAbilitySkillIcon(skill.id)}
              <span>{lang === "en" ? skill.name.en : skill.name.kr}</span>
            </span>
          ))}
      </div>
    );
  };

  const renderDailyRewardBadge = () => (
    <span className="daily-reward-badge mode-start-reward">
      <span className="daily-reward-icon" aria-hidden="true">
        {"💎"}
      </span>
      <span>{accountDailyRewardTokens}</span>
      <span className="daily-reward-separator">/</span>
      <span>120</span>
    </span>
  );

  const renderRewardStartLabel = (label: string) => (
    <span className="mode-start-label-stack">
      <span>{label}</span>
      {renderDailyRewardBadge()}
    </span>
  );

  const renderModeControlBar = (
    primaryClassName: string,
    primaryLabel: React.ReactNode,
    onPrimaryClick?: () => void,
    options?: { disabled?: boolean },
  ) => (
    <>
      {renderAbilityLoadoutBar()}
      <div className="mode-control-bar">
        {renderModePickerAction()}
        <button
          className={`lobby-btn mode-start-btn ${primaryClassName}`}
          data-keyboard-nav-layer="primary"
          type="button"
          onClick={onPrimaryClick}
          disabled={options?.disabled}
        >
          {primaryLabel}
        </button>
        {renderModeSideActions()}
      </div>
    </>
  );

  const renderMatchmakingControlBar = (
    onCancel: () => void,
    cancelLabel: string,
  ) =>
    renderModeControlBar(
      "cancel mode-cancel-start-btn",
      <>
        <span>{cancelLabel}</span>
        <span className="mode-cancel-spinner" aria-hidden="true" />
      </>,
      onCancel,
    );

  const renderSelectedModeContent = () => {
    if (selectedLobbyMode === "friend" && view === "create") {
      return (
        <>
          <h2 data-step="3">{t.roomCreatedTitle}</h2>
          <p>{t.roomCreatedDesc}</p>
          <div className="room-code">{createdCode}</div>
          <p className="waiting-text">{t.waitingText}</p>
        </>
      );
    }

    if (selectedLobbyMode === "friend" && view === "join") {
      return (
        <>
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
            onClick={() => void handleJoinAbilityRoom()}
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
        </>
      );
    }

    switch (selectedLobbyMode) {
      case "friend":
        return (
          <>
            {renderModeControlBar(
              "primary",
              t.createRoomBtn,
              () => void handleCreateAbilityRoom(),
            )}
          </>
        );
      case "coop":
        return (
          <>
            {isMatchmaking && currentMatchType === "coop"
              ? renderMatchmakingControlBar(handleCancelCoop, t.cancelBtn)
              : renderModeControlBar(
                  "accent",
                  coopStartLabel,
                  () => void handleCoopMatch(),
                )}
          </>
        );
      case "2v2":
        return (
          <>
            {isMatchmaking && currentMatchType === "2v2"
              ? renderMatchmakingControlBar(handleCancelTwoVsTwo, t.cancelBtn)
              : renderModeControlBar(
                  "accent",
                  twoVsTwoStartLabel,
                  () => void handleTwoVsTwoMatch(),
                )}
          </>
        );
      case "ability":
        return (
          <>
            {isMatchmaking && currentMatchType === "ability"
              ? renderMatchmakingControlBar(handleCancelAbility, t.cancelBtn)
              : renderModeControlBar(
                  "accent",
                  renderRewardStartLabel(abilityBattleStartLabel),
                  () => void handleAbilityMatch(),
                )}
          </>
        );
      case "skill_ranked":
        return (
          <>
            {renderModeControlBar(
              "accent",
              abilityBattleStartLabel,
              undefined,
              {
                disabled: true,
              },
            )}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className="lobby-screen"
      onPointerDownCapture={handleLobbyUiPointerDownCapture}
      onClickCapture={handleLobbyUiClickCapture}
    >
      {challengeToast && (
        <div
          className={`friend-challenge-toast-wrap${
            challengeToast.kind === "outgoing" ? " is-outgoing" : ""
          }`}
        >
          {challengeToast.kind === "incoming" ? (
            <FriendChallengeToast
              kind="incoming"
              nickname={challengeToast.fromNickname}
              lang={lang}
              onAccept={() => void handleChallengeAccept()}
              onDecline={handleChallengeDecline}
            />
          ) : (
            <FriendChallengeToast
              kind="outgoing"
              nickname={challengeToast.toNickname}
              lang={lang}
              onCancel={handleChallengeCancel}
            />
          )}
        </div>
      )}
      <div className="lobby-user-header">
        <div className="lobby-user-info">
          <span className="lobby-user-name">{myNickname || "-"}</span>
          {showLobbyArenaContent && (
            <div className="lobby-user-score">
              <span className="lobby-user-score-icon" aria-hidden="true">
                ⭐
              </span>
              <span className="lobby-user-score-value">{currentRating}</span>
            </div>
          )}
        </div>
        <div className="lobby-vault-wrap">
          <button
            className={`lobby-vault-button${vaultReady ? " is-ready" : ""}`}
            type="button"
            aria-label={lang === "en" ? "Victory vault" : "승리 금고"}
            onClick={() => {
              setVaultOpenResult(null);
              setIsVaultHelpOpen(false);
              setIsVaultOpen(true);
            }}
          >
            <img
              className="lobby-vault-icon"
              src="/safe/safe_icon.svg"
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </button>
          <span className="lobby-vault-progress" aria-hidden="true">
            {Array.from({ length: vaultRequiredWins }).map((_, index) => (
              <span
                key={index}
                className={index < vaultWins ? "is-filled" : ""}
              />
            ))}
          </span>
        </div>
      </div>

      {showLobbyArenaContent && (
        <div className="lobby-arena-center">
          <figure
            className="lobby-arena-showcase"
            aria-label={lobbyArenaImageAlt}
            onPointerDown={() => {
              if (!isSfxMuted) playLobbyClick(sfxVolume);
            }}
            onClick={(event) => {
              if (event.detail === 0 && !isSfxMuted) {
                playLobbyClick(sfxVolume);
              }
              setShowArenaGallery(true);
            }}
          >
            <img
              src={lobbyArenaImageSrc}
              alt={lobbyArenaImageAlt}
              onError={(event) => {
                if (event.currentTarget.src.endsWith("/arena/arena6.png"))
                  return;
                event.currentTarget.src = "/arena/arena6.png";
              }}
            />
            <LobbyArenaOverlay arena={lobbyArena} />
            <div className="arena-progress-bar-wrap" aria-hidden="true">
              <div className="arena-name-in-bar">
                {getArenaLabel(lobbyArena, rankedUnlocked)}
              </div>
              <div className="arena-progress-labels">
                <span>{arenaProgressMin}</span>
                <span>{arenaProgressMax}</span>
              </div>
              <div className="arena-progress-track">
                <div
                  className="arena-progress-fill"
                  style={{ width: `${arenaProgressPct}%` }}
                />
              </div>
            </div>
          </figure>
        </div>
      )}

      {showFriendListPanel && (
        <div className="lobby-arena-center">
          <FriendListPanel
            lang={lang}
            onAddFriend={() => setShowFriendAdd(true)}
            onViewRequests={() => setShowFriendRequests(true)}
            onFriendClick={(friend, anchorRect) =>
              setFriendCtx({ friend, anchorRect })
            }
            refreshTrigger={friendListRefresh}
          />
        </div>
      )}

      <div
        className={`lobby-card mode-content-card${accountSummaryLoading ? " is-db-loading" : ""}`}
      >
        {renderSelectedModeContent()}
      </div>

      {showArenaGallery && (
        <ArenaGalleryModal
          highestArena={highestArena}
          currentArena={lobbyArena}
          currentRating={currentRating}
          onClose={() => setShowArenaGallery(false)}
        />
      )}

      {isVaultOpen && (
        <div
          className="upgrade-modal-backdrop"
          onClick={() => {
            setIsVaultOpen(false);
            setIsVaultHelpOpen(false);
          }}
        >
          <div
            className="upgrade-modal skin-modal victory-vault-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="skin-modal-head">
              <h3>{lang === "en" ? "Victory Vault" : "승리 금고"}</h3>
              <div className="victory-vault-head-actions">
                <button
                  className={`victory-vault-help-btn${isVaultHelpOpen ? " is-active" : ""}`}
                  type="button"
                  aria-label={lang === "en" ? "Vault help" : "금고 도움말"}
                  aria-expanded={isVaultHelpOpen}
                  onClick={() => setIsVaultHelpOpen((open) => !open)}
                >
                  ?
                </button>
                <span className="victory-vault-status">
                  {vaultProgressText}
                </span>
              </div>
            </div>

            <div
              className={`victory-vault-visual${
                isVaultHelpOpen ? " is-help" : ""
              }`}
            >
              {isVaultHelpOpen ? (
                <div className="victory-vault-help-popover">
                  <p>
                    <span>
                      {lang === "en"
                        ? "Win matches to fill the vault gauge."
                        : "승리할 때마다 금고 게이지가 충전됩니다."}
                    </span>
                    <span>
                      {lang === "en"
                        ? "At 3 wins, you can open it once per UTC day."
                        : "3승 달성 시 UTC 기준 하루 1회 금고를 열 수 있습니다."}
                    </span>
                  </p>
                  <div className="victory-vault-help-section">
                    <strong>
                      {lang === "en"
                        ? "Diamond Rewards"
                        : "다이아몬드 보상 확률"}
                    </strong>
                    <ul>
                      {[
                        ["50%", 50],
                        ["30%", 100],
                        ["16%", 300],
                        ["3%", 800],
                        ["0.9%", 3000],
                        ["0.1%", 10000],
                      ].map(([chance, diamonds]) => (
                        <li key={`${chance}-${diamonds}`}>
                          <span>{chance} → </span>
                          <span className="victory-vault-help-reward">
                            <span>{Number(diamonds).toLocaleString()}</span>
                            <span className="skin-token-icon" aria-hidden="true">
                              {"💎"}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="victory-vault-help-section">
                    <strong>
                      {lang === "en" ? "Bonus Skin" : "보너스 스킨"}
                    </strong>
                    <p>
                      <span>
                        {lang === "en"
                          ? "Opening has a 1% chance to grant a bonus skin."
                          : "금고 오픈 시 1% 확률로 보너스 스킨이 등장합니다."}
                      </span>
                      <span>
                        {lang === "en"
                          ? "Duplicate skins become diamonds worth 50% of that skin's price."
                          : "이미 보유한 스킨은 가격의 50%만큼 다이아몬드로 전환됩니다."}
                      </span>
                    </p>
                    <strong>
                      {lang === "en"
                        ? "Skin Tier Rates"
                        : "스킨 등장 시 등급 확률"}
                    </strong>
                    <ul>
                      <li>
                        <span className="skin-name-tier-common">
                          {lang === "en" ? "Common skin" : "일반 스킨"}
                        </span>{" "}
                        60%
                      </li>
                      <li>
                        <span className="skin-name-tier-rare">
                          {lang === "en" ? "Rare skin" : "희귀 스킨"}
                        </span>{" "}
                        30%
                      </li>
                      <li>
                        <span className="skin-name-tier-legendary">
                          {lang === "en" ? "Legendary skin" : "전설 스킨"}
                        </span>{" "}
                        10%
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                <img
                  src="/safe/safe_image.png"
                  alt=""
                  className={`victory-vault-safe${vaultReady ? " is-ready" : ""}`}
                  aria-hidden="true"
                  draggable={false}
                />
              )}
            </div>

            <div className="victory-vault-gauge" aria-label={vaultProgressText}>
              {Array.from({ length: vaultRequiredWins }).map((_, index) => (
                <span
                  key={index}
                  className={index < vaultWins ? "is-filled" : ""}
                />
              ))}
            </div>

            {vaultOpenResult && (
              <div className="victory-vault-result">
                <div>
                  <span className="skin-token-icon" aria-hidden="true">
                    {"💎"}
                  </span>
                  <strong>
                    +
                    {vaultOpenResult.rewardTokens +
                      vaultOpenResult.duplicateCompensationTokens}
                  </strong>
                </div>
                {vaultOpenResult.bonusSkin && (
                  <p>
                    {lang === "en"
                      ? `Skin unlocked: ${getSkinDisplayName(vaultOpenResult.bonusSkin)}`
                      : `스킨 획득: ${getSkinDisplayName(vaultOpenResult.bonusSkin)}`}
                  </p>
                )}
                {vaultOpenResult.duplicateSkin && (
                  <p>
                    {lang === "en"
                      ? `Duplicate ${getSkinDisplayName(vaultOpenResult.duplicateSkin)} converted to ${vaultOpenResult.duplicateCompensationTokens} diamonds.`
                      : `중복 ${getSkinDisplayName(vaultOpenResult.duplicateSkin)} 스킨이 ${vaultOpenResult.duplicateCompensationTokens}다이아몬드로 전환되었습니다.`}
                  </p>
                )}
              </div>
            )}

            <div className="victory-vault-actions">
              <button
                className="lobby-btn primary victory-vault-open-btn"
                type="button"
                disabled={!vaultReady || isOpeningVault}
                onClick={() => void handleOpenVictoryVault()}
              >
                {isOpeningVault
                  ? lang === "en"
                    ? "Opening..."
                    : "여는 중..."
                  : lang === "en"
                    ? "Open"
                    : "열기"}
              </button>
              <button
                className="lobby-btn secondary victory-vault-close-btn"
                type="button"
                onClick={() => {
                  setIsVaultOpen(false);
                  setIsVaultHelpOpen(false);
                }}
              >
                {lang === "en" ? "Close" : "닫기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFriendAdd && (
        <FriendAddModal lang={lang} onClose={() => setShowFriendAdd(false)} />
      )}

      {showFriendRequests && (
        <FriendRequestsModal
          lang={lang}
          onClose={() => setShowFriendRequests(false)}
          onAccepted={() => {
            setFriendListRefresh((n) => n + 1);
          }}
        />
      )}

      {friendCtx && (
        <FriendContextPopup
          friend={friendCtx.friend}
          anchorRect={friendCtx.anchorRect}
          lang={lang}
          onViewProfile={() => {
            setFriendProfileId(friendCtx.friend.userId);
            setFriendCtx(null);
          }}
          onChallenge={() => void handleFriendChallenge(friendCtx.friend)}
          onRemove={() => void handleFriendRemove(friendCtx.friend.userId)}
          onClose={() => setFriendCtx(null)}
        />
      )}

      {friendProfileId && (
        <FriendProfileModal
          friendId={friendProfileId}
          lang={lang}
          onClose={() => setFriendProfileId(null)}
        />
      )}

      {isModePickerOpen && (
        <div
          className="mode-picker-overlay"
          onClick={() => setIsModePickerOpen(false)}
        >
          <div
            className="mode-picker-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mode-picker-head">
              <span>{modeSelectorTitle}</span>
              <button
                type="button"
                className="mode-picker-close"
                onClick={() => setIsModePickerOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mode-selector-grid">
              {lobbyModeOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`mode-selector-btn ${selectedLobbyMode === option.key ? "is-active" : ""} ${DISABLED_LOBBY_MODES.has(option.key) ? "is-disabled" : ""}`}
                  data-keyboard-nav-layer="mode"
                  onClick={() => handleSelectLobbyMode(option.key)}
                  disabled={DISABLED_LOBBY_MODES.has(option.key)}
                >
                  <span className="mode-selector-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span className="mode-selector-label">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {upgradeFlowLoading &&
        !pendingUpgradeSwitchProfile &&
        !showUpgradeNotice && (
          <div
            className="upgrade-flow-overlay"
            role="status"
            aria-live="polite"
          >
            <div className="upgrade-flow-panel">
              <div className="spinner upgrade-flow-spinner" />
              <p>{upgradeFlowLoadingLabel}</p>
            </div>
          </div>
        )}

      {pendingUpgradeSwitchProfile && (
        <UpgradeSwitchConfirmDialog
          message={buildExistingAccountSwitchPrompt(
            pendingUpgradeSwitchProfile,
          )}
          isSubmitting={isResolvingUpgradeDecision}
          onConfirm={() => void handleConfirmUpgradeSwitch()}
          onCancel={() => void handleCancelUpgradeSwitch()}
          t={t}
          lang={lang}
        />
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
            className="upgrade-modal skin-modal skin-picker-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="skin-modal-head">
              <h3>{skinModalTitle}</h3>

              <div className="skin-token-badge" aria-label="Current tokens">
                <span className="skin-token-badge-main">
                  <span className="skin-token-icon" aria-hidden="true">
                    {"💎"}
                  </span>

                  <span>{accountTokens}</span>
                </span>

                <button
                  className="skin-token-plus"
                  data-keyboard-modal-layer="token"
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

            <p className="skin-collection-summary">{skinCollectionSummary}</p>

            <div className="skin-option-grid" ref={skinOptionGridRef}>
              {skinChoices.map((choice, index) => {
                const isOwned = ownedSkins.includes(choice.id);
                const isUnlocked = isPieceSkinUnlocked(choice);
                const isTokenSkin =
                  choice.tokenPrice !== null &&
                  choice.tokenPrice !== undefined &&
                  choice.tokenPrice > 0;
                const isArenaLocked =
                  choice.id !== "classic" &&
                  isTokenSkin &&
                  !isOwned &&
                  !isSkinArenaUnlocked(choice.id, highestArena);
                const isVisualUnlocked =
                  choice.id === "classic" ||
                  (isTokenSkin ? isOwned : isUnlocked);

                return (
                  <button
                    key={choice.id}
                    className={`skin-option-card skin-picker-card ${
                      pieceSkin === choice.id ? "is-selected" : ""
                    } ${!isVisualUnlocked ? "is-locked" : ""} ${isArenaLocked ? "is-arena-locked" : ""}`}
                    data-keyboard-modal-layer={`skin-row-${Math.floor(index / 4)}`}
                    onClick={() => setSkinDetail({ tab: "piece", choice })}
                    disabled={false}
                    type="button"
                  >
                    <LazyPieceSkinPreview
                      skinId={choice.id}
                      atomicPreviewReady={atomicPreviewReady}
                      className="skin-preview skin-picker-preview"
                      eager={index < 8 || pieceSkin === choice.id}
                      scrollRootRef={skinOptionGridRef}
                    />

                    <span className="skin-option-copy skin-picker-copy">
                      <strong
                        className={
                          choice.tier
                            ? `skin-name-tier-${choice.tier}`
                            : undefined
                        }
                      >
                        {choice.name}
                      </strong>
                      {isArenaLocked ? (
                        <span className="skin-unlock-meta skin-picker-unlock-meta skin-arena-req">
                          🔒{" "}
                          {lang === "en"
                            ? `Arena ${getSkinRequiredArena(choice.id)}`
                            : `아레나 ${getSkinRequiredArena(choice.id)} 필요`}
                        </span>
                      ) : !isUnlocked ? (
                        <span className="skin-unlock-meta skin-picker-unlock-meta">
                          {getSkinRequirementLabel(
                            choice.requiredWins,
                            choice.requiredPlays,
                            choice.tokenPrice,
                          )}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="upgrade-modal-actions">
              <button
                className="lobby-btn primary"
                data-keyboard-modal-layer="close"
                onClick={() => setIsSkinPickerOpen(false)}
                type="button"
              >
                {skinApplyLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {skinDetail && (
        <div
          className="upgrade-modal-backdrop"
          onClick={() => setSkinDetail(null)}
        >
          <div
            className="upgrade-modal skin-modal skin-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="skin-detail-preview-stage">
              {renderPieceSkinPreview(
                skinDetail.choice.id,
                "skin-preview skin-detail-preview",
              )}
            </div>

            <div className="skin-detail-body">
              <h3 className="skin-detail-title">{skinDetail.choice.name}</h3>

              {(() => {
                const linkedSkill =
                  Object.values(ABILITY_SKILLS).find(
                    (skill) => skill.skinId === skinDetail.choice.id,
                  ) ?? null;
                return (
                  <div className="skin-detail-skill">
                    {linkedSkill ? (
                      <>
                        <div className="skin-detail-skill-head">
                          <span
                            className={`skin-preview skin-detail-skill-icon ability-skill-preview-${linkedSkill.id.replaceAll("_", "-")}`}
                          >
                            {renderAbilitySkillIcon(linkedSkill.id)}
                          </span>

                          <div className="skin-detail-skill-title-wrap">
                            <strong className="skin-detail-skill-name">
                              {lang === "en"
                                ? linkedSkill.name.en
                                : linkedSkill.name.kr}
                            </strong>

                            <div className="skin-detail-skill-meta">
                              <span
                                className={`skin-detail-skill-pill is-${linkedSkill.category}`}
                              >
                                {getAbilitySkillCategoryLabel(
                                  linkedSkill.category,
                                  lang,
                                )}
                              </span>

                              <span className="skin-detail-skill-pill is-mana">
                                <span aria-hidden="true">✦</span>
                                <span>
                                  {linkedSkill.category === "passive"
                                    ? lang === "en"
                                      ? "Auto"
                                      : "자동"
                                    : lang === "en"
                                      ? `${linkedSkill.manaCost} Mana`
                                      : `마나 ${linkedSkill.manaCost}`}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <strong className="skin-detail-skill-name">
                        {lang === "en" ? "No linked skill" : "연결 스킬 없음"}
                      </strong>
                    )}
                    <p className="skin-detail-skill-desc">
                      {linkedSkill
                        ? lang === "en"
                          ? linkedSkill.loadoutDescription.en
                          : linkedSkill.loadoutDescription.kr
                        : lang === "en"
                          ? "This skin does not have a linked Ability Battle skill."
                          : "이 스킨에는 연결된 능력대전 스킬이 없습니다."}
                    </p>
                  </div>
                );
              })()}

              <div className="skin-detail-actions">
                {(() => {
                  const choice = skinDetail.choice;
                  const isOwned = ownedSkins.includes(choice.id);
                  const isTokenSkin =
                    choice.tokenPrice !== null &&
                    choice.tokenPrice !== undefined;
                  const isArenaLocked =
                    choice.id !== "classic" &&
                    isTokenSkin &&
                    !isOwned &&
                    !isSkinArenaUnlocked(choice.id, highestArena);
                  if (isArenaLocked) {
                    return (
                      <div className="skin-arena-requirement">
                        <span className="skin-arena-req-icon">🔒</span>
                        <span>
                          {lang === "en"
                            ? `Requires Arena ${getSkinRequiredArena(choice.id)}`
                            : `아레나 ${getSkinRequiredArena(choice.id)} 필요`}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
                <button
                  className="lobby-btn secondary skin-detail-action-btn"
                  data-keyboard-modal-layer="skin-detail-action"
                  type="button"
                  onClick={() => void handleSkinDetailAction()}
                  disabled={(() => {
                    const choice = skinDetail.choice;
                    const isOwned = ownedSkins.includes(choice.id);
                    const isTokenSkin =
                      choice.tokenPrice !== null &&
                      choice.tokenPrice !== undefined;
                    return (
                      choice.id !== "classic" &&
                      isTokenSkin &&
                      !isOwned &&
                      !isSkinArenaUnlocked(choice.id, highestArena)
                    );
                  })()}
                >
                  {(() => {
                    const choice = skinDetail.choice;
                    const isOwned = ownedSkins.includes(choice.id);
                    const isEquipped = pieceSkin === choice.id;
                    if (
                      choice.tokenPrice !== null &&
                      choice.tokenPrice !== undefined &&
                      !isOwned
                    ) {
                      return lang === "en" ? "Buy" : "구매";
                    }
                    return isEquipped
                      ? lang === "en"
                        ? "Equipped"
                        : "사용 중"
                      : lang === "en"
                        ? "Use"
                        : "사용";
                  })()}
                </button>
              </div>
            </div>

            <div className="upgrade-modal-actions">
              <button
                className="lobby-btn primary"
                data-keyboard-modal-layer="close"
                onClick={() => setSkinDetail(null)}
                type="button"
              >
                {skinApplyLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {skinPurchaseConfirmMessage && (
        <UpgradeSwitchConfirmDialog
          title={skinPurchaseConfirmTitle}
          message={skinPurchaseConfirmMessage}
          isSubmitting={false}
          onConfirm={() => resolveSkinPurchaseConfirmation(true)}
          onCancel={() => resolveSkinPurchaseConfirmation(false)}
          confirmLabel={skinPurchaseConfirmLabel}
          cancelLabel={skinPurchaseCancelLabel}
          t={t}
          lang={lang}
        />
      )}

      {skinPurchaseNoticeMessage && (
        <UpgradeNoticeDialog
          title={skinPurchaseNoticeTitle}
          message={skinPurchaseNoticeMessage}
          onClose={() => setSkinPurchaseNoticeMessage(null)}
          t={t}
        />
      )}

      {skinFloatingMessage && (
        <div
          key={skinFloatingMessage.id}
          className="skin-floating-message"
          role="status"
          aria-live="polite"
          onAnimationEnd={() => setSkinFloatingMessage(null)}
        >
          {skinFloatingMessage.text}
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
                    {"💎"}
                  </span>

                  <span>{accountTokens}</span>
                </span>
              </div>
            </div>

            <div className="token-pack-grid">
              {tokenPacks.map((pack) => (
                <article
                  key={pack.id}
                  className={`token-pack-card token-pack-${pack.id}`}
                >
                  <div className="token-pack-topline">
                    <span className="token-pack-name">{pack.name}</span>

                    <span className="token-pack-price">{pack.price}</span>
                  </div>

                  <div className="token-pack-amount">
                    <span className="token-pack-gem" aria-hidden="true">
                      {"💎"}
                    </span>

                    <strong>{pack.tokens}</strong>
                  </div>

                  <p className="token-pack-blurb">{pack.blurb}</p>

                  <button
                    className="lobby-btn primary token-pack-btn"
                    type="button"
                    onClick={() =>
                      void handleTokenPackPurchase(pack.id, pack.tokens)
                    }
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

      {isAbilityLoadoutOpen && (
        <div
          className="upgrade-modal-backdrop"
          onClick={() => setIsAbilityLoadoutOpen(false)}
        >
          <div
            className="upgrade-modal skin-modal ability-loadout-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ability-preset-bar">
              {[1, 2, 3, 4, 5].map((index) => (
                <button
                  key={index}
                  type="button"
                  className={`ability-preset-btn${activePreset === index ? " is-active" : ""}`}
                  onClick={() => handleSwitchPreset(index)}
                >
                  {index}
                </button>
              ))}
              <div
                className="skin-token-badge ability-preset-count"
                aria-label="Ability loadout count"
              >
                <span className="skin-token-badge-main">
                  <span>{equippedAbilitySkillDefs.length} / 3</span>
                  <span>{abilityLoadoutCount}</span>
                </span>
              </div>
            </div>

            <div
              key={`ability-preset-selected-${activePreset}`}
              className="ability-loadout-chip-row ability-loadout-modal-selected"
            >
              {equippedAbilitySkillDefs.map((skill) => (
                <button
                  key={skill.id}
                  className="ability-loadout-chip ability-loadout-chip-btn"
                  type="button"
                  onClick={() => handleUnequipAbilitySkill(skill.id)}
                  aria-label={
                    lang === "en"
                      ? `Unequip ${skill.name.en}`
                      : `${skill.name.kr} 장착 해제`
                  }
                >
                  {renderAbilitySkillIcon(skill.id)}
                  <span>{lang === "en" ? skill.name.en : skill.name.kr}</span>
                </button>
              ))}
            </div>

            <div className="skin-option-list">
              {availableAbilitySkills.map((skill, index) => {
                const equipped = abilityLoadout.includes(skill.id);

                const unlocked = hasAbilitySkinUnlocked(skill.skinId);

                const requiredSkinChoice = skinChoices.find(
                  (choice) => choice.id === skill.skinId,
                );

                const requiredSkinName =
                  requiredSkinChoice?.name ?? skill.skinId;

                const requiredSkinTierClass = requiredSkinChoice?.tier
                  ? `skin-name-tier-${requiredSkinChoice.tier}`
                  : undefined;

                return (
                  <button
                    key={skill.id}
                    className={`skin-option-card ${equipped ? "is-selected" : ""} ${!unlocked ? "is-locked" : ""}`}
                    data-keyboard-modal-layer={`ability-skill-row-${index}`}
                    type="button"
                    onClick={() => {
                      if (!unlocked) return;

                      handleToggleAbilitySkill(skill.id);
                    }}
                    disabled={!unlocked}
                  >
                    <span
                      className={`skin-preview ability-skill-preview ability-skill-preview-${skill.id.replaceAll("_", "-")}`}
                    >
                      {renderAbilitySkillIcon(skill.id)}
                    </span>

                    <span className="skin-option-copy">
                      <strong>
                        {lang === "en" ? skill.name.en : skill.name.kr}
                        {rotationSkills.includes(skill.id) && (
                          <span className="ability-rotation-badge">
                            {lang === "en" ? "Rotation" : "로테이션"}
                          </span>
                        )}
                      </strong>

                      <span>
                        {lang === "en"
                          ? skill.loadoutDescription.en
                          : skill.loadoutDescription.kr}

                        <br />

                        {lang === "en" ? "Required skin: " : "필요 스킨: "}

                        <span
                          className={`ability-required-skin-name${requiredSkinTierClass ? ` ${requiredSkinTierClass}` : ""}`}
                        >
                          {requiredSkinName}
                        </span>
                      </span>
                    </span>

                    <span className="skin-lock-meta ability-skill-meta">
                      {unlocked ? (
                        <>
                          {skill.category !== "passive" && (
                            <span className="ability-skill-info-pill ability-skill-mana-pill">
                              <span
                                className="ability-skill-info-icon"
                                aria-hidden="true"
                              >
                                {"💧"}
                              </span>

                              <span>
                                {lang === "en"
                                  ? `Mana ${skill.manaCost}`
                                  : `마나 ${skill.manaCost}`}
                              </span>
                            </span>
                          )}

                          <span
                            className={`ability-skill-info-pill ability-skill-category-pill is-${skill.category}`}
                          >
                            <span
                              className="ability-skill-info-icon"
                              aria-hidden="true"
                            >
                              {getAbilitySkillCategoryIcon(skill.category)}
                            </span>

                            <span>
                              {skill.category === "passive"
                                ? lang === "en"
                                  ? "Auto"
                                  : "자동"
                                : getAbilitySkillCategoryLabel(
                                    skill.category,
                                    lang,
                                  )}
                            </span>
                          </span>
                        </>
                      ) : (
                        <span className="ability-skill-info-pill ability-skill-locked-pill">
                          <span
                            className="ability-skill-info-icon"
                            aria-hidden="true"
                          >
                            {"🔒"}
                          </span>

                          <span>{lang === "en" ? "Locked" : "잠김"}</span>
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="upgrade-modal-actions">
              <button
                className="lobby-btn primary"
                data-keyboard-modal-layer="close"
                onClick={() => setIsAbilityLoadoutOpen(false)}
                type="button"
              >
                {skinApplyLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="lobby-bottom-panel">
        <div className="lobby-bottom-actions">
          <button
            className={`lobby-bottom-action ${isSkinPickerOpen ? "is-active" : ""}${
              isAbilityMatchmakingActive ? " is-matchmaking-disabled" : ""
            }`}
            data-keyboard-nav-layer="bottom"
            onClick={() => setIsSkinPickerOpen(true)}
            aria-pressed={isSkinPickerOpen}
            aria-disabled={isAbilityMatchmakingActive}
            disabled={isAbilityMatchmakingActive}
            type="button"
          >
            <span className="lobby-bottom-action-icon-wrap" aria-hidden="true">
              <img
                className="lobby-bottom-action-icon"
                src={lobbySkinIconSrc}
                alt=""
              />
            </span>

            <span className="lobby-bottom-action-label">{skinButtonLabel}</span>
          </button>

          <button
            className={`lobby-bottom-action lobby-patch-notes-link${
              isAbilityMatchmakingActive ? " is-matchmaking-disabled" : ""
            }`}
            data-keyboard-nav-layer="bottom"
            onClick={() => {
              setIsPatchNotesOpen(true);

              markPatchNotesRead();
            }}
            aria-disabled={isAbilityMatchmakingActive}
            disabled={isAbilityMatchmakingActive}
            type="button"
          >
            <span className="lobby-bottom-action-icon-wrap" aria-hidden="true">
              <img
                className="lobby-bottom-action-icon"
                src="/ui/lobby/lobby-icon-notes.svg"
                alt=""
              />
            </span>

            <span className="lobby-bottom-action-label">{patchNotesLabel}</span>

            {hasUnreadPatchNotes && (
              <span className="lobby-new-badge">NEW</span>
            )}
          </button>

          <button
            className={`lobby-bottom-action${
              isAbilityMatchmakingActive ? " is-matchmaking-disabled" : ""
            }`}
            data-keyboard-nav-layer="bottom"
            onClick={() => setIsAchievementsOpen(true)}
            aria-disabled={isAbilityMatchmakingActive}
            disabled={isAbilityMatchmakingActive}
            type="button"
          >
            <span className="lobby-bottom-action-icon-wrap" aria-hidden="true">
              <img
                className="lobby-bottom-action-icon"
                src="/ui/lobby/lobby-icon-achievements.svg"
                alt=""
              />
            </span>

            <span className="lobby-bottom-action-label">
              {lang === "en" ? "Achievements" : "업적"}
            </span>

            {hasClaimableAchievements && (
              <span className="lobby-new-badge">NEW</span>
            )}
          </button>

          <button
            className={`lobby-bottom-action${
              isAbilityMatchmakingActive ? " is-matchmaking-disabled" : ""
            }`}
            data-keyboard-nav-layer="bottom"
            onClick={handleOpenSettings}
            aria-disabled={isAbilityMatchmakingActive}
            disabled={isAbilityMatchmakingActive}
            type="button"
          >
            <span className="lobby-bottom-action-icon-wrap" aria-hidden="true">
              <img
                className="lobby-bottom-action-icon"
                src="/ui/lobby/lobby-icon-settings.svg"
                alt=""
              />
            </span>

            <span className="lobby-bottom-action-label">
              {settingsButtonLabel}
            </span>
          </button>
        </div>
      </div>

      <div className="lobby-utility-links legacy-hidden">
        <button
          className="lobby-utility-link lobby-patch-notes-link"
          onClick={() => {
            setIsPatchNotesOpen(true);

            markPatchNotesRead();
          }}
          type="button"
        >
          <span>{patchNotesLabel}</span>

          {hasUnreadPatchNotes && <span className="lobby-new-badge">NEW</span>}
        </button>

        <button
          className="lobby-utility-link"
          onClick={() => setIsAchievementsOpen(true)}
          type="button"
        >
          {lang === "en" ? "Achievements" : "업적"}

          {hasClaimableAchievements && (
            <span className="lobby-new-badge">NEW</span>
          )}
        </button>

        <button
          className="lobby-utility-link"
          onClick={() => setIsSettingsOpen(true)}
          type="button"
        >
          {settingsButtonLabel}
        </button>
      </div>

      {isAchievementsOpen && (
        <AchievementModal
          lang={lang}
          achievements={achievementViews}
          isClaiming={isClaimingAchievements}
          onClaim={handleClaimAchievement}
          onClaimAll={handleClaimAllAchievements}
          onClose={() => setIsAchievementsOpen(false)}
        />
      )}

      {achievementNoticeMessage && (
        <UpgradeNoticeDialog
          title={achievementNoticeTitle}
          message={achievementNoticeMessage}
          onClose={() => setAchievementNoticeMessage(null)}
          t={t}
        />
      )}

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
                  <div className="settings-inline-action">
                    <strong className="settings-value">
                      {myNickname || "-"}
                    </strong>
                    <button
                      className="settings-copy-btn"
                      type="button"
                      onClick={() => setIsNameChangeOpen(true)}
                    >
                      {lang === "en" ? "Change" : "변경"}
                    </button>
                  </div>
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
                  <div className="settings-inline-action">
                    <strong className="settings-value">
                      {accountTypeValue}
                    </strong>
                    <button
                      className="settings-copy-btn"
                      type="button"
                      onClick={() =>
                        void (isGuestUser || !authUserId
                          ? handleLinkGoogle()
                          : handleLogout())
                      }
                    >
                      {accountTypeActionLabel}
                    </button>
                  </div>
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
                      : `${accountWins}승 ${accountLosses}패`}
                  </strong>
                </div>
              </div>

              <div className="upgrade-modal-actions settings-actions">
                <button
                  className="lobby-btn secondary settings-policy-btn"
                  onClick={() => {
                    prepareSfxPreviewAudio();
                    setIsAudioSettingsOpen(true);
                  }}
                  type="button"
                >
                  <SettingsActionIcon kind="sound" lang={lang} />
                  <span>{soundButtonLabel}</span>
                </button>

                <button
                  className="lobby-btn secondary settings-policy-btn"
                  onClick={() => {
                    setControlsSettingsTab("keyboard");
                    setIsControlsSettingsOpen(true);
                  }}
                  type="button"
                >
                  <SettingsActionIcon kind="controls" lang={lang} />
                  <span>{controlsButtonLabel}</span>
                </button>

                <button
                  className="lobby-btn secondary settings-policy-btn"
                  onClick={() => {
                    setIsSettingsOpen(false);
                    void handleReplayAiTutorial();
                  }}
                  type="button"
                >
                  <SettingsActionIcon kind="tutorial" lang={lang} />
                  <span>{t.aiTutorialBtn ?? aiTutorialButtonLabel}</span>
                </button>

                <button
                  className="lobby-btn secondary settings-policy-btn"
                  onClick={handleToggleLanguage}
                  type="button"
                >
                  <SettingsActionIcon kind="language" lang={lang} />
                  <span>{languageButtonLabel}</span>
                </button>

                <a
                  className="lobby-btn secondary settings-policy-btn"
                  href={termsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <SettingsActionIcon kind="terms" lang={lang} />
                  <span>{termsButtonLabel}</span>
                </a>

                <a
                  className="lobby-btn secondary settings-policy-btn"
                  href={policyUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <SettingsActionIcon kind="privacy" lang={lang} />
                  <span>{t.policyBtn}</span>
                </a>

                <button
                  className="lobby-btn secondary settings-policy-btn"
                  onClick={() => void handleDonate()}
                  type="button"
                >
                  <SettingsActionIcon kind="donate" lang={lang} />
                  <span>{t.donateBtn}</span>
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

      {isNameChangeOpen && (
        <div
          className="upgrade-modal-backdrop"
          onClick={() => setIsNameChangeOpen(false)}
        >
          <div
            className="upgrade-modal skin-modal settings-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="skin-modal-head">
              <h3>{changeNameTitle}</h3>
            </div>

            <div className="settings-scroll-body">
              <p>{changeNameDesc}</p>

              <div className="settings-name-change">
                <input
                  className="lobby-input settings-name-input"
                  type="text"
                  maxLength={16}
                  value={settingsNicknameDraft}
                  placeholder={changeNamePlaceholder}
                  onChange={(e) => setSettingsNicknameDraft(e.target.value)}
                />

                <button
                  className="lobby-btn primary settings-name-btn"
                  onClick={() => void handleChangeNickname()}
                  type="button"
                  disabled={isChangingNickname}
                >
                  <span>{lang === "en" ? "Change" : "변경"}</span>
                  <span className="settings-name-btn-cost">
                    <span className="skin-token-icon" aria-hidden="true">
                      {"💎"}
                    </span>
                    <strong>{nicknameChangeCost}</strong>
                  </span>
                </button>
              </div>
            </div>

            <div className="upgrade-modal-actions">
              <button
                className="lobby-btn secondary"
                onClick={() => setIsNameChangeOpen(false)}
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
                    data-keyboard-modal-layer="audio-toggles"
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
                    data-keyboard-modal-layer="audio-toggles"
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
                  data-keyboard-modal-layer="audio-music-volume"
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
                  data-keyboard-modal-layer="audio-sfx-volume"
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

              <div className="audio-advanced-section">
                <button
                  className={`audio-advanced-toggle ${isAudioAdvancedOpen ? "is-open" : ""}`}
                  data-keyboard-modal-layer="audio-advanced-toggle"
                  onClick={() => {
                    prepareSfxPreviewAudio();
                    setIsAudioAdvancedOpen((open) => !open);
                  }}
                  type="button"
                >
                  <span>{audioAdvancedLabel}</span>
                  <strong>{isAudioAdvancedOpen ? "-" : "+"}</strong>
                </button>

                {isAudioAdvancedOpen && (
                  <div className="audio-advanced-panel">
                    <div className="audio-advanced-title">
                      {abilitySfxGainLabel}
                    </div>

                    <div className="audio-ability-gain-list">
                      {ABILITY_SFX_GAIN_IDS.map((gainId) => (
                        <div className="audio-ability-gain-row" key={gainId}>
                          <div className="audio-slider-head">
                            <span className="audio-slider-name">
                              {ABILITY_SFX_GAIN_LABELS[gainId][lang]}
                            </span>

                            <button
                              className="audio-preview-btn"
                              data-keyboard-modal-layer={`audio-ability-preview-${gainId}`}
                              type="button"
                              aria-label={
                                lang === "en"
                                  ? `Preview ${ABILITY_SFX_GAIN_LABELS[gainId][lang]}`
                                  : `${ABILITY_SFX_GAIN_LABELS[gainId][lang]} 미리듣기`
                              }
                              title={
                                lang === "en"
                                  ? `Preview ${ABILITY_SFX_GAIN_LABELS[gainId][lang]}`
                                  : `${ABILITY_SFX_GAIN_LABELS[gainId][lang]} 미리듣기`
                              }
                              onClick={() => handlePreviewAbilitySfx(gainId)}
                            >
                              ▶
                            </button>

                            <strong>
                              {Math.round(abilitySfxGains[gainId] * 100)}
                            </strong>
                          </div>

                          <input
                            className="audio-slider"
                            data-keyboard-modal-layer={`audio-ability-gain-${gainId}`}
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={Math.round(abilitySfxGains[gainId] * 100)}
                            onChange={(event) =>
                              setAbilitySfxGain(
                                gainId,
                                Number(event.target.value) / 100,
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="upgrade-modal-actions">
              <button
                className="lobby-btn primary"
                data-keyboard-modal-layer="close"
                onClick={() => setIsAudioSettingsOpen(false)}
                type="button"
              >
                {skinApplyLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {isControlsSettingsOpen && (
        <div
          className="upgrade-modal-backdrop audio-modal-backdrop"
          onClick={() => {
            setCapturingControlKey(null);
            setIsControlsSettingsOpen(false);
          }}
        >
          <div
            className="upgrade-modal skin-modal controls-settings-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="skin-modal-head">
              <h3>{controlsModalTitle}</h3>
            </div>

            <div className="controls-settings-tabs" role="tablist">
              <button
                className={`controls-settings-tab ${controlsSettingsTab === "keyboard" ? "is-active" : ""}`}
                data-keyboard-modal-layer="controls-tabs"
                type="button"
                role="tab"
                aria-selected={controlsSettingsTab === "keyboard"}
                onClick={() => setControlsSettingsTab("keyboard")}
              >
                {keyboardTabLabel}
              </button>
              <button
                className={`controls-settings-tab ${controlsSettingsTab === "controller" ? "is-active" : ""}`}
                data-keyboard-modal-layer="controls-tabs"
                type="button"
                role="tab"
                aria-selected={controlsSettingsTab === "controller"}
                onClick={() => setControlsSettingsTab("controller")}
              >
                {controllerTabLabel}
              </button>
            </div>

            {controlsSettingsTab === "keyboard" ? (
              <div className="controls-settings-body">
                <label
                  className="controls-checkbox-row"
                  data-keyboard-modal-layer="controls-enabled"
                >
                  <input
                    type="checkbox"
                    checked={keyboardControls.keyboardEnabled}
                    onChange={(event) =>
                      updateKeyboardControls((current) => ({
                        ...current,
                        keyboardEnabled: event.target.checked,
                      }))
                    }
                  />
                  <span>{keyboardEnabledLabel}</span>
                </label>

                <p className="controls-restart-notice">
                  {lang === "en"
                    ? "For best results, restart the game after making changes."
                    : "원활한 적용을 위해, 변경 후 게임을 재시작하는 것을 추천합니다."}
                </p>

                {keyboardControls.keyboardEnabled && (
                  <div className="controls-keymap-panel">
                    <div className="controls-keymap-head">
                      <strong>{keyboardMappingTitle}</strong>
                      <span>{keyboardMappingDesc}</span>
                    </div>

                    {(["slot1", "slot2", "slot3"] as const).map((slot) => (
                      <div className="controls-keymap-row" key={slot}>
                        <span>{skillSlotLabels[slot]}</span>
                        <button
                          className={`controls-keymap-button ${capturingControlKey === slot ? "is-capturing" : ""}`}
                          data-keyboard-modal-layer={`controls-${slot}`}
                          type="button"
                          onClick={() => setCapturingControlKey(slot)}
                        >
                          {capturingControlKey === slot
                            ? keyCaptureLabel
                            : getKeyboardCodeLabel(
                                keyboardControls.abilitySkillKeys[slot],
                              )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {keyboardControls.keyboardEnabled && (
                  <div className="controls-keymap-panel">
                    <div className="controls-keymap-head">
                      <strong>{inGameMappingTitle}</strong>
                    </div>

                    <div className="controls-keymap-row">
                      <span>{gameActionKeyLabel}</span>
                      <button
                        className={`controls-keymap-button ${capturingControlKey === "gameAction" ? "is-capturing" : ""}`}
                        data-keyboard-modal-layer="controls-game-action"
                        type="button"
                        onClick={() => setCapturingControlKey("gameAction")}
                      >
                        {capturingControlKey === "gameAction"
                          ? keyCaptureLabel
                          : getKeyboardCodeLabel(
                              keyboardControls.gameActionKey,
                            )}
                      </button>
                    </div>

                    <div className="controls-keymap-row">
                      <span>{selectActionKeyLabel}</span>
                      <button
                        className={`controls-keymap-button ${capturingControlKey === "selectAction" ? "is-capturing" : ""}`}
                        data-keyboard-modal-layer="controls-select-action"
                        type="button"
                        onClick={() => setCapturingControlKey("selectAction")}
                      >
                        {capturingControlKey === "selectAction"
                          ? keyCaptureLabel
                          : getKeyboardCodeLabel(
                              keyboardControls.selectActionKey,
                            )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="controls-settings-body">
                <label
                  className="controls-checkbox-row"
                  data-keyboard-modal-layer="controls-enabled"
                >
                  <input
                    type="checkbox"
                    checked={controllerControls.controllerEnabled}
                    onChange={(event) =>
                      updateControllerControls((current) => ({
                        ...current,
                        controllerEnabled: event.target.checked,
                      }))
                    }
                  />
                  <span>{controllerEnabledLabel}</span>
                </label>

                <p className="controls-restart-notice">
                  {lang === "en"
                    ? "For best results, restart the game after making changes."
                    : "원활한 적용을 위해, 변경 후 게임을 재시작하는 것을 추천합니다."}
                </p>

                {controllerControls.controllerEnabled && (
                  <div className="controls-keymap-panel">
                    <div className="controls-keymap-head">
                      <strong>{keyboardMappingTitle}</strong>
                      <span>{controllerMappingDesc}</span>
                    </div>

                    {(["slot1", "slot2", "slot3"] as const).map((slot) => (
                      <div className="controls-keymap-row" key={slot}>
                        <span>{skillSlotLabels[slot]}</span>
                        <button
                          className={`controls-keymap-button ${capturingControllerButton === slot ? "is-capturing" : ""}`}
                          data-keyboard-modal-layer={`controls-${slot}`}
                          type="button"
                          onClick={() => setCapturingControllerButton(slot)}
                        >
                          {capturingControllerButton === slot
                            ? controllerCaptureLabel
                            : getGamepadButtonLabel(
                                controllerControls.abilitySkillButtons[slot],
                                gamepadButtonLayout,
                              )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {controllerControls.controllerEnabled && (
                  <div className="controls-keymap-panel">
                    <div className="controls-keymap-head">
                      <strong>{inGameMappingTitle}</strong>
                    </div>

                    <div className="controls-keymap-row">
                      <span>{gameActionKeyLabel}</span>
                      <button
                        className={`controls-keymap-button ${capturingControllerButton === "gameAction" ? "is-capturing" : ""}`}
                        data-keyboard-modal-layer="controls-game-action"
                        type="button"
                        onClick={() =>
                          setCapturingControllerButton("gameAction")
                        }
                      >
                        {capturingControllerButton === "gameAction"
                          ? controllerCaptureLabel
                          : getGamepadButtonLabel(
                              controllerControls.gameActionButton,
                              gamepadButtonLayout,
                            )}
                      </button>
                    </div>

                    <div className="controls-keymap-row">
                      <span>{selectActionKeyLabel}</span>
                      <button
                        className={`controls-keymap-button ${capturingControllerButton === "selectAction" ? "is-capturing" : ""}`}
                        data-keyboard-modal-layer="controls-select-action"
                        type="button"
                        onClick={() =>
                          setCapturingControllerButton("selectAction")
                        }
                      >
                        {capturingControllerButton === "selectAction"
                          ? controllerCaptureLabel
                          : getGamepadButtonLabel(
                              controllerControls.selectActionButton,
                              gamepadButtonLayout,
                            )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="upgrade-modal-actions">
              <button
                className="lobby-btn primary"
                data-keyboard-modal-layer="close"
                onClick={() => {
                  setCapturingControlKey(null);
                  setCapturingControllerButton(null);
                  setIsControlsSettingsOpen(false);
                }}
                type="button"
              >
                {skinApplyLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {isPatchNotesOpen && (
        <div
          className="upgrade-modal-backdrop"
          onClick={() => setIsPatchNotesOpen(false)}
        >
          <div
            className="upgrade-modal skin-modal patch-notes-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="skin-modal-head">
              <h3>{patchNotesTitle}</h3>

              <div
                className="skin-token-badge"
                aria-label="Patch notes version"
              >
                <span className="skin-token-badge-main">
                  <span>{patchNotesVersionLabel}</span>
                </span>
              </div>
            </div>

            <div className="patch-notes-scroll-body">
              <div className="patch-notes-entry">
                {patchNotesBody.map((section, sectionIndex) => (
                  <section key={sectionIndex} className="patch-notes-section">
                    <h4 className="patch-notes-section-title">
                      {section.heading}
                    </h4>

                    <div className="patch-notes-section-lines">
                      {section.lines.map((line, lineIndex) => (
                        <p key={lineIndex} className="patch-notes-line">
                          <span>{line.text}</span>

                          {line.change && line.label ? (
                            <>
                              {" "}
                              <span
                                className={`patch-notes-change patch-notes-change-${line.change}`}
                              >
                                {line.label}
                              </span>
                            </>
                          ) : null}
                        </p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <div className="upgrade-modal-actions">
              <button
                className="lobby-btn primary"
                onClick={() => setIsPatchNotesOpen(false)}
                type="button"
              >
                {skinApplyLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAiTutorialPromptOpen && (
        <div className="upgrade-modal-backdrop ai-tutorial-prompt-backdrop">
          <div className="upgrade-modal ai-tutorial-prompt-modal">
            <h3>{aiTutorialPromptTitle}</h3>

            <p>{aiTutorialPromptDesc}</p>

            <div className="upgrade-modal-actions ai-tutorial-prompt-actions">
              <button
                className="lobby-btn secondary"
                onClick={handleDeclineAiTutorial}
                type="button"
              >
                {aiTutorialNoLabel}
              </button>

              <button
                className="lobby-btn primary"
                onClick={() => void handleAcceptAiTutorial()}
                type="button"
              >
                {aiTutorialYesLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {isInitialNicknamePromptOpen && (
        <div className="upgrade-modal-backdrop ai-tutorial-prompt-backdrop">
          <div className="upgrade-modal ai-tutorial-prompt-modal">
            <h3>{initialNicknameTitle}</h3>

            <p>{initialNicknameDesc}</p>

            <div className="settings-name-change initial-nickname-prompt-body">
              <input
                className="lobby-input settings-name-input"
                type="text"
                maxLength={16}
                value={initialNicknameDraft}
                placeholder={initialNicknamePlaceholder}
                onChange={(e) => setInitialNicknameDraft(e.target.value)}
              />

              <button
                className="lobby-btn primary settings-name-btn"
                onClick={() => void handleInitialNicknameConfirm()}
                type="button"
                disabled={isSubmittingInitialNickname}
              >
                <span>{initialNicknameConfirmLabel}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UpgradeNoticeDialog({
  title,

  message,

  onClose,

  t,
}: {
  title?: string;

  message: string;

  onClose: () => void;

  t: Translations;
}) {
  return (
    <div className="upgrade-modal-backdrop">
      <div className="upgrade-modal">
        <h3>{title ?? t.switchedTitle}</h3>

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

function UpgradeSwitchConfirmDialog({
  title,
  message,
  isSubmitting,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  t,
  lang,
}: {
  title?: string;
  message: string;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  t: Translations;
  lang: "en" | "kr";
}) {
  return (
    <div className="upgrade-modal-backdrop">
      <div className="upgrade-modal">
        <h3>{title ?? t.switchedTitle}</h3>

        <p className="upgrade-switch-message">{message}</p>

        <div className="upgrade-modal-actions upgrade-modal-actions-row">
          <button
            className="lobby-btn primary"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {confirmLabel ?? t.confirmBtn}
          </button>
          <button
            className="lobby-btn secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {cancelLabel ?? (lang === "en" ? "Cancel" : "취소")}
          </button>
        </div>
      </div>
    </div>
  );
}
