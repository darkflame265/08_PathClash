import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FlagSkin, isFlagSkin } from "../shared/FlagSkin";

import { AtomicPreview } from "../../skins/legendary/atomic/Preview";

import { CosmicPreview } from "../../skins/rare/cosmic/Preview";

import { ArcReactorPreview } from "../../skins/rare/arc_reactor/Preview";

import { PlasmaPreview } from "../../skins/common/plasma/Preview";

import { GoldCorePreview } from "../../skins/common/gold_core/Preview";

import { NeonPulsePreview } from "../../skins/common/neon_pulse/Preview";

import { InfernoPreview } from "../../skins/common/inferno/Preview";

import { QuantumPreview } from "../../skins/common/quantum/Preview";

import { ElectricCorePreview } from "../../skins/rare/electric_core/Preview";

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

import { startDonation } from "../../payments/donate";

import {
  startTokenPackPurchase,
  type TokenPackId,
} from "../../payments/tokenShop";

import { connectSocket, disconnectSocket } from "../../socket/socketClient";

import { useGameStore } from "../../store/gameStore";

import { useLang } from "../../hooks/useLang";

import { playLobbyClick } from "../../utils/soundUtils";

import type { Translations } from "../../i18n/translations";

import type {
  BoardSkin,
  ClientGameState,
  PieceSkin,
  RoundStartPayload,
} from "../../types/game.types";

import { ABILITY_SKILLS, type AbilitySkillId } from "../../types/ability.types";

import "./LobbyScreen.css";

type LobbyView = "main" | "create" | "join";
type SkinPickerTab = "piece" | "board";

interface Props {
  onGameStart: () => void;

  onCoopStart: () => void;

  onTwoVsTwoStart: () => void;

  onAbilityStart: () => void;

  tutorialPromptTrigger?: number;
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
                ? "Complete goals, then claim your token rewards here."
                : "조건을 달성한 뒤 여기서 토큰 보상을 획득하세요."}
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

    ownedSkins: profile.ownedSkins,

    wins: profile.wins,

    losses: profile.losses,

    tokens: profile.tokens,

    dailyRewardWins: profile.dailyRewardWins,

    dailyRewardTokens: profile.dailyRewardTokens,

    achievements: profile.achievements,
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

  const icon = skillId === "electric_blitz" ? "⚡︎" : skill.icon;

  return (
    <span
      className={`ability-skill-icon-glyph${skillId === "electric_blitz" ? " is-electric-blitz" : ""}${skillId === "aurora_heal" ? " is-aurora-heal" : ""}${skillId === "gold_overdrive" ? " is-gold-overdrive" : ""}`}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

export function LobbyScreen({
  onGameStart,

  onCoopStart,

  onTwoVsTwoStart,

  onAbilityStart,

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

    accountAchievements,

    setAuthState,

    setMatchType,

    setTwoVsTwoSlot,

    abilityLoadout,

    setAbilityLoadout,

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

    pieceSkin,
    boardSkin,

    setPieceSkin,
    setBoardSkin,
  } = useGameStore();

  const { lang, setLang, t } = useLang();

  const policyUrl = lang === "en" ? POLICY_URL_EN : POLICY_URL_KR;

  const termsUrl = lang === "en" ? TERMS_URL_EN : TERMS_URL_KR;

  const [view, setView] = useState<LobbyView>("main");

  const [joinCode, setJoinCode] = useState("");

  const [createdCode, setCreatedCode] = useState("");

  const [error, setError] = useState("");

  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [isAiTutorialQueueing, setIsAiTutorialQueueing] = useState(false);

  const [isSkinPickerOpen, setIsSkinPickerOpen] = useState(false);
  const [skinPickerTab, setSkinPickerTab] = useState<SkinPickerTab>("piece");

  const [isTokenShopOpen, setIsTokenShopOpen] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false);
  const [isNameChangeOpen, setIsNameChangeOpen] = useState(false);

  const [isAbilityLoadoutOpen, setIsAbilityLoadoutOpen] = useState(false);

  const [isDailyRewardInfoOpen, setIsDailyRewardInfoOpen] = useState(false);

  const [isPatchNotesOpen, setIsPatchNotesOpen] = useState(false);

  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
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

  const [atomicPreviewReady, setAtomicPreviewReady] = useState(false);

  const dailyResetTimeoutRef = useRef<number | null>(null);

  const lastRewardSyncDayRef = useRef<string>(getUtcDayKey());

  const upgradeMessage = getUpgradeDisplayMsg(upgradeResult, t);

  const handleLobbyUiClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;

      if (!target) return;

      const clickable = target.closest("button, a");

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

  const settingsButtonLabel = lang === "en" ? "Settings" : "설정";

  const skinButtonLabel = lang === "en" ? "Skin" : "스킨";

  const soundButtonLabel = lang === "en" ? "Sound" : "소리";

  const termsButtonLabel = lang === "en" ? "Terms" : "이용약관";

  const coopTitle = lang === "en" ? "Co-op Mode" : "협동전";

  const coopDesc =
    lang === "en"
      ? "Destroy the portals and secure the area before enemies emerge from them."
      : "포탈에서 적들이 나오기 전에, 포탈을 부수고 안전을 확보하세요.";

  const coopStartLabel = lang === "en" ? "Start Co-op Match" : "매칭 시작";

  const twoVsTwoTitle = "2v2";

  const twoVsTwoDesc =
    lang === "en"
      ? "A 2v2 team battle mode where teammates can share paths during planning."
      : "같은 팀끼리 경로를 공유하며 싸우는 2v2 팀 대전 모드입니다.";

  const twoVsTwoStartLabel = lang === "en" ? "Start Match" : "매칭 시작";

  const abilityBattleTitle = lang === "en" ? "Ability Battle" : "능력 대전";

  const abilityBattleDesc =
    lang === "en"
      ? "A duel mode where movement and skill timing are planned together."
      : "이동 경로와 스킬 발동 시점을 함께 설계하는 1대1 스킬 대전 모드입니다.";

  const abilityBattleStartLabel = lang === "en" ? "Start Match" : "매칭 시작";

  const abilityLoadoutTitle = lang === "en" ? "Equipped Skills" : "장착 스킬";

  const abilityLoadoutDesc =
    lang === "en"
      ? "Select up to 3 skills you want to bring into Ability Battle."
      : "능력 대전에 가져갈 스킬을 최대 3개까지 선택하세요.";

  const abilityLoadoutCount = lang === "en" ? "equipped" : "장착 중";

  const patchNotesLabel = lang === "en" ? "Patch Notes" : "패치노트";

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

  const aiMatchmakingDesc =
    lang === "en"
      ? "Joining an AI match. Please wait a moment."
      : "AI매칭에 진입중입니다. 잠시 기다려주세요.";

  const aiTutorialMatchmakingDesc =
    lang === "en"
      ? "Entering the tutorial. Please wait a moment."
      : "튜토리얼에 입장중입니다. 잠시 기다려주세요.";

  const aiTutorialButtonLabel = lang === "en" ? "Tutorial" : "튜토리얼";

  const aiMatchmakingHead = lang === "en" ? t.matchmakingHead : "매칭 중...";

  const aiCancelLabel = lang === "en" ? t.cancelBtn : "매칭 취소";

  // Keep existing Korean literals as plain UTF-8 text. Do not rewrite them

  // based on terminal mojibake output; verify against the actual UI/editor first.

  const patchNotesVersionLabel = getPatchNotesVersionLabel(lang);

  // Patch note convention:

  // - If a mana cost goes down, append "(Buff)" / "(버프)" and style it green.

  // - If a mana cost goes up, append "(Nerf)" / "(너프)" and style it red.

  // - Reuse this structure for future patch note updates.

  const patchNotesBody: PatchNoteSection[] = getPatchNotes(lang);

  const dailyRewardGuideTitle =
    lang === "en" ? "📌 Daily Reward Info" : "📌 일일 보상 안내";

  const dailyRewardGuideMax =
    lang === "en"
      ? "You can earn up to 120 tokens per day."
      : "하루 최대 120 토큰까지 획득할 수 있습니다.";

  const dailyRewardGuideDuel =
    lang === "en"
      ? "Duel / Ability Battle / 2v2 Victory: +6 tokens"
      : "대결전 / 능력대전 / 2v2 대전 승리: +6 토큰";

  const dailyRewardGuideCoop =
    lang === "en" ? "Co-op Victory: +12 tokens" : "협동전 승리: +12 토큰";

  const dailyRewardGuideAi =
    lang === "en" ? "AI Match: no tokens" : "AI 대전: 토큰 없음";

  const dailyRewardGuideReset =
    lang === "en"
      ? "Daily rewards reset every day at UTC 00:00."
      : "일일 보상은 매일 UTC 00:00에 초기화됩니다.";

  const skinModalTitle = lang === "en" ? "Choose Skin" : "스킨 선택";

  const skinModalDesc =
    lang === "en"
      ? skinPickerTab === "piece"
        ? "Select the look you want to use for your piece."
        : "Select the look you want to use for the board."
      : skinPickerTab === "piece"
        ? "플레이어 말에 적용할 외형을 선택하세요."
        : "보드에 적용할 외형을 선택하세요.";

  const skinApplyLabel = lang === "en" ? "Close" : "닫기";
  const pieceSkinTabLabel = lang === "en" ? "Piece Skin" : "말 스킨";
  const boardSkinTabLabel = lang === "en" ? "Board Skin" : "보드 스킨";

  const settingsModalTitle = lang === "en" ? "Profile Settings" : "프로필 설정";

  const settingsModalDesc =
    lang === "en"
      ? "Review your account information and support details."
      : "계정 정보와 문의 용 세부 정보를 확인하세요.";

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
  const initialNicknameConfirmLabel =
    lang === "en" ? "Confirm" : "확인";

  const audioModalTitle = lang === "en" ? "Audio Settings" : "오디오 설정";

  const musicLabel = lang === "en" ? "Music" : "음악";

  const sfxLabel = lang === "en" ? "SFX" : "효과음";

  const onLabel = lang === "en" ? "ON" : "켬";

  const offLabel = lang === "en" ? "OFF" : "끔";

  const musicVolumeLabel = lang === "en" ? "Music Volume" : "음악 볼륨";

  const sfxVolumeLabel = lang === "en" ? "SFX Volume" : "효과음 볼륨";

  const accountTypeValue = isGuestUser
    ? lang === "en"
      ? "Guest"
      : "게스트"
    : "Google";
  const accountTypeActionLabel = isGuestUser
    ? lang === "en"
      ? "Link Google"
      : "구글 연동"
    : lang === "en"
      ? "Logout"
      : "로그아웃";

  const tokenShopTitle = lang === "en" ? "Token Shop" : "토큰 샵";

  const tokenShopDesc =
    lang === "en"
      ? "Choose a token pack that matches how you want to unlock skins."
      : "스킨 해금 속도에 맞는 토큰 팩을 선택하세요.";

  const tokenShopCta = lang === "en" ? "Buy" : "구매";

  const tokenShopUnavailableMsg =
    lang === "en"
      ? "Token packs are available in the Android app only."
      : "토큰 팩은 안드로이드 앱에서만 구매할 수 있습니다.";

  const tokenShopFailedMsg =
    lang === "en" ? "Token purchase failed." : "토큰 구매에 실패했습니다.";

  const tokenShopCancelledMsg =
    lang === "en"
      ? "Token purchase was cancelled."
      : "토큰 구매가 취소되었습니다.";

  const tokenShopSuccessMsg = (tokens: number) =>
    lang === "en"
      ? `${tokens} tokens were added to your account.`
      : `${tokens}토큰이 계정에 추가되었습니다.`;

  const nicknameChangeCost = 500;
  const changeNameTitle = lang === "en" ? "Change Name" : "이름 변경";
  const changeNameDesc =
    lang === "en"
      ? `Spend ${nicknameChangeCost} tokens to change your player name.`
      : `${nicknameChangeCost}토큰을 사용해 플레이어 이름을 변경할 수 있습니다.`;
  const changeNamePlaceholder =
    lang === "en" ? "Enter a new name" : "새 이름을 입력하세요";
  const changeNameInvalidMsg =
    lang === "en"
      ? "Please enter a name between 1 and 16 characters."
      : "이름은 1~16자로 입력해주세요.";
  const changeNameNoChangeMsg =
    lang === "en" ? "That name is already in use." : "현재와 같은 이름입니다.";
  const changeNameInsufficientMsg =
    lang === "en" ? "Not enough tokens." : "토큰이 부족합니다.";
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
    lang === "en" ? "Not enough tokens." : "토큰이 부족합니다.";

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
          : "하루 플레이보다 조금 더",

      benefit:
        lang === "en" ? "Can buy 1 Common skin" : "Common 스킨 1개 구매 가능",
    },

    {
      id: "small",

      name: "Small",

      price: "$2.99",

      tokens: 500,

      blurb:
        lang === "en"
          ? "A clean step into premium skins"
          : "프리미엄 스킨으로 가는 가벼운 시작",

      benefit:
        lang === "en" ? "Can buy 1 Rare skin" : "Rare 스킨 1개 구매 가능",
    },

    {
      id: "medium",

      name: "Medium",

      price: "$6.99",

      tokens: 1200,

      blurb:
        lang === "en"
          ? "Efficient value for a serious upgrade"
          : "본격적인 업그레이드를 위한 효율적 구성",

      benefit:
        lang === "en"
          ? "1 Legendary skin + leftover"
          : "Legendary 1개 + 여유 토큰",
    },

    {
      id: "large",

      name: "Large",

      price: "$14.99",

      tokens: 3000,

      blurb:
        lang === "en"
          ? "Built for collecting multiple premium skins"
          : "여러 프리미엄 스킨 수집에 맞춘 구성",

      benefit:
        lang === "en"
          ? "Several Rares or 3 Legendaries"
          : "Rare 여러 개 또는 Legendary 3개",
    },

    {
      id: "whale",

      name: "Whale",

      price: "$29.99",

      tokens: 7000,

      blurb:
        lang === "en"
          ? "For nearly the full collection"
          : "거의 전체 콜렉션을 위한 구성",

      benefit:
        lang === "en"
          ? "Can buy almost every skin"
          : "거의 모든 스킨 구매 가능",
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
      | "electric_core"
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

      tokenPrice: 120,

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

      tokenPrice: 120,

      tier: "common",
    },

    {
      id: "neon_pulse",

      name: lang === "en" ? "Neon Pulse" : "네온 펄스",

      desc: lang === "en" ? "Vibrant neon pulse." : "선명한 네온 펄스.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 120,

      tier: "common",
    },

    {
      id: "inferno",

      name: lang === "en" ? "Inferno" : "인페르노",

      desc: lang === "en" ? "Burning inferno core." : "타오르는 인페르노 코어.",

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

      name: lang === "en" ? "Cosmic" : "코스믹",

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

      name: lang === "en" ? "Arc Reactor" : "아크 리액터",

      desc: lang === "en" ? "High-energy reactor core." : "고출력 리액터 코어.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 350,

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

      tokenPrice: 350,

      tier: "rare",
    },

    {
      id: "atomic",

      name: lang === "en" ? "Atomic" : "아토믹",

      desc:
        lang === "en" ? "Atomic orbit energy core." : "원자 궤도 에너지 코어.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 900,

      tier: "legendary",
    },

    {
      id: "flag_kr",

      name: lang === "en" ? "Korea" : "한국",

      desc: lang === "en" ? "The Korean flag." : "대한민국 국기.",

      requiredWins: null,

      requiredPlays: 100,

      tokenPrice: null,

      tier: null,
    },

    {
      id: "flag_jp",

      name: lang === "en" ? "Japan" : "일본",

      desc: lang === "en" ? "The Japanese flag." : "일본 국기.",

      requiredWins: null,

      requiredPlays: 100,

      tokenPrice: null,

      tier: null,
    },

    {
      id: "flag_cn",

      name: lang === "en" ? "China" : "중국",

      desc: lang === "en" ? "The Chinese flag." : "중국 국기.",

      requiredWins: null,

      requiredPlays: 100,

      tokenPrice: null,

      tier: null,
    },

    {
      id: "flag_us",

      name: lang === "en" ? "USA" : "미국",

      desc: lang === "en" ? "The American flag." : "미국 국기.",

      requiredWins: null,

      requiredPlays: 100,

      tokenPrice: null,

      tier: null,
    },

    {
      id: "flag_uk",

      name: lang === "en" ? "UK" : "영국",

      desc: lang === "en" ? "The British flag." : "영국 국기.",

      requiredWins: null,

      requiredPlays: 100,

      tokenPrice: null,

      tier: null,
    },
  ];

  const boardSkinChoices: Array<{
    id: BoardSkin;
    name: string;
    desc: string;
  }> = [
    {
      id: "classic",
      name: lang === "en" ? "Classic Board" : "클래식 보드",
      desc:
        lang === "en"
          ? "The default dark gray board used in PathClash."
          : "현재 PathClash에서 사용하는 기본 짙은 회색 보드입니다.",
    },
    {
      id: "blue_gray",
      name: lang === "en" ? "Blue Gray Board" : "블루 그레이 보드",
      desc:
        lang === "en"
          ? "A cool blue-gray board with the same classic layout."
          : "기본 보드와 같은 구성에 푸른 회색 분위기를 더한 보드입니다.",
    },
    {
      id: "pharaoh",
      name: lang === "en" ? "Pharaoh Board" : "파라오 보드",
      desc:
        lang === "en"
          ? "An ornate sandstone board inspired by ancient Egyptian patterns."
          : "고대 이집트 문양과 사암 분위기를 담은 화려한 보드입니다.",
    },
    {
      id: "magic",
      name: lang === "en" ? "Magic Board" : "매직 보드",
      desc:
        lang === "en"
          ? "A glowing arcane board filled with violet sigils and magical energy."
          : "보랏빛 문양과 마력이 흐르는 신비로운 분위기의 보드입니다.",
    },
  ];

  const renderBoardSkinPreview = (skinId: BoardSkin) => {
    if (skinId === "magic") {
      return (
        <span
          className="skin-preview board-skin-preview board-skin-preview-magic-grid"
          aria-hidden="true"
        >
          {Array.from({ length: 25 }, (_, index) => {
            const row = Math.floor(index / 5);
            const col = index % 5;
            return (
              <span
                key={`${row}-${col}`}
                className="board-skin-preview-magic-cell"
                style={{
                  backgroundImage: `url("/board/magic-cells/magic-cell-${row}-${col}.svg")`,
                }}
              />
            );
          })}
        </span>
      );
    }

    if (skinId === "pharaoh") {
      return (
        <span
          className="skin-preview board-skin-preview board-skin-preview-magic-grid"
          aria-hidden="true"
        >
          {Array.from({ length: 25 }, (_, index) => {
            const row = Math.floor(index / 5);
            const col = index % 5;
            return (
              <span
                key={`${row}-${col}`}
                className="board-skin-preview-magic-cell"
                style={{
                  backgroundImage: `url("/board/pharaoh-cells/pharaoh-cell-${row}-${col}.svg")`,
                }}
              />
            );
          })}
        </span>
      );
    }

    return (
      <span
        className={`skin-preview board-skin-preview board-skin-preview-${skinId}`}
        aria-hidden="true"
      />
    );
  };

  const getSkinRequirementLabel = (
    requiredWins: number | null,

    requiredPlays?: number | null,

    tokenPrice?: number | null,
  ) => {
    if (tokenPrice !== null && tokenPrice !== undefined) {
      return lang === "en" ? `Tokens ${tokenPrice}` : `토큰 ${tokenPrice}`;
    }

    if (requiredPlays !== null && requiredPlays !== undefined) {
      return lang === "en"
        ? `Plays ${requiredPlays}`
        : `플레이 ${requiredPlays}`;
    }

    return lang === "en" ? `Wins ${requiredWins}` : `승리 ${requiredWins}`;
  };

  const currentSkinName =
    skinChoices.find((choice) => choice.id === pieceSkin)?.name ?? pieceSkin;

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
  const boardSkinCollectionSummary =
    lang === "en"
      ? `Found: ${boardSkinChoices.length}/${boardSkinChoices.length}`
      : `찾음: ${boardSkinChoices.length}/${boardSkinChoices.length}`;

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

  const syncAccountSummary = useCallback(() => {
    return refreshAccountSummary().then(
      ({
        nickname,

        equippedSkin,

        equippedBoardSkin,

        ownedSkins,

        wins,

        losses,

        tokens,

        dailyRewardWins,

        dailyRewardTokens,

        achievements,
      }) => {
        setAuthState({
          ready: true,

          userId: authUserId,

          accessToken: useGameStore.getState().authAccessToken,

          isGuestUser,

          nickname,

          equippedSkin,

          equippedBoardSkin,

          ownedSkins,

          wins,

          losses,

          tokens,

          dailyRewardWins,

          dailyRewardTokens,

          achievements,
        });

        lastRewardSyncDayRef.current = getUtcDayKey();
      },
    );
  }, [authUserId, isGuestUser, setAuthState]);

  const handleClaimAchievement = useCallback(
    async (achievementId: string) => {
      if (isClaimingAchievements) return;

      setIsClaimingAchievements(true);

      try {
        const profile = await claimAchievementReward(achievementId);

        if (profile) {
          applyProfileToStore(profile, setAuthState);
        }
      } finally {
        setIsClaimingAchievements(false);
      }
    },

    [isClaimingAchievements, setAuthState],
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

        window.alert(
          lang === "en"
            ? `Claimed ${claimableAchievements.length} achievement rewards and received ${rewardSum} tokens.`
            : `${claimableAchievements.length}개의 업적 보상을 획득했고, ${rewardSum}토큰을 받았습니다.`,
        );
      }
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
    const readVersion = localStorage.getItem(PATCH_NOTES_READ_KEY);

    setHasUnreadPatchNotes(readVersion !== PATCH_NOTES_VERSION);
  }, []);

  useEffect(() => {
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
    upgradeFlowLoading,
  ]);

  useEffect(() => {
    if (currentMatchType) return;
    if (isInitialNicknamePromptOpen) return;

    const hasSeenAiTutorial =
      window.localStorage.getItem(AI_TUTORIAL_SEEN_KEY) === "1";

    const hasAnsweredAiTutorialPrompt =
      window.localStorage.getItem(AI_TUTORIAL_PROMPT_ANSWERED_KEY) === "1";

    if (!hasSeenAiTutorial && !hasAnsweredAiTutorialPrompt) {
      setIsAiTutorialPromptOpen(true);
    }
  }, [currentMatchType, isInitialNicknamePromptOpen, tutorialPromptTrigger]);

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

    socket.off("ability_matchmaking_waiting");

    socket.off("game_start");

    socket.off("round_start");

    socket.on("game_start", (gs: ClientGameState) => {
      setGameState(gs);

      onGameStart();
    });

    socket.on("round_start", (payload: RoundStartPayload) => {
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

        socket.emit("game_client_ready");
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
        setMyColor(team);

        setTwoVsTwoSlot(slot);

        setRoomCode(roomId);

        setError("");

        setIsMatchmaking(false);

        onTwoVsTwoStart();
      },
    );

    socket.on("twovtwo_matchmaking_waiting", () => {
      setError("");

      setIsMatchmaking(true);
    });

    socket.on(
      "ability_room_joined",

      ({
        roomId,

        color,
      }: {
        roomId: string;

        color: "red" | "blue";

        opponentNickname: string;
      }) => {
        setMyColor(color);

        setRoomCode(roomId);

        setError("");

        setIsMatchmaking(false);

        onAbilityStart();
      },
    );

    socket.on("ability_matchmaking_waiting", () => {
      setError("");

      setIsMatchmaking(true);
    });

    return socket;
  };

  const buildPlayerPayload = async () => ({
    nickname: getNick(),

    auth: await getSocketAuthPayload(),

    pieceSkin: useGameStore.getState().pieceSkin,
    boardSkin: useGameStore.getState().boardSkin,
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
    const socket = connectSocket();

    socket.emit("cancel_coop");

    setIsMatchmaking(false);

    setMatchType(null);
  };

  const handleCancelTwoVsTwo = () => {
    const socket = connectSocket();

    socket.emit("cancel_2v2");

    setIsMatchmaking(false);

    setMatchType(null);
  };

  const handleAiMatchWithTutorial = async (tutorialPending: boolean) => {
    setError("");

    setIsAiTutorialQueueing(tutorialPending);
    setIsMatchmaking(true);

    setMatchType("ai");

    const socket = startSocket();

    socket.emit("join_ai", {
      ...(await buildPlayerPayload()),

      tutorialPending,
    });
  };

  const handleCancelAi = () => {
    disconnectSocket();

    useGameStore.getState().resetGame();

    setIsAiTutorialQueueing(false);
    setIsMatchmaking(false);

    setMatchType(null);

    setError("");
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

  const handleAiMatch = async () => {
    setIsAiTutorialQueueing(false);
    await handleAiMatchWithTutorial(false);
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
    setError("");

    setMatchType("coop");

    const socket = startSocket();

    socket.emit("join_coop", await buildPlayerPayload());
  };

  const handleTwoVsTwoMatch = async () => {
    setError("");

    setMatchType("2v2");

    const socket = startSocket();

    socket.emit("join_2v2", await buildPlayerPayload());
  };

  const handleAbilityMatch = async () => {
    setError("");

    setMatchType("ability");

    setIsMatchmaking(true);

    const socket = startSocket();

    socket.emit("join_ability", {
      ...(await buildPlayerPayload()),

      equippedSkills: abilityLoadout,
    });
  };

  const handleCancelAbility = () => {
    const socket = connectSocket();

    socket.emit("cancel_ability");

    setIsMatchmaking(false);

    setMatchType(null);
  };

  const handleToggleAbilitySkill = (skillId: AbilitySkillId) => {
    const isEquipped = abilityLoadout.includes(skillId);

    if (isEquipped) {
      setAbilityLoadout(abilityLoadout.filter((value) => value !== skillId));

      return;
    }

    if (abilityLoadout.length >= 3) {
      window.alert(
        lang === "en"
          ? "You can equip up to 3 skills."
          : "스킬은 최대 3개까지 장착할 수 있습니다.",
      );

      return;
    }

    setAbilityLoadout([...abilityLoadout, skillId]);
  };

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

  const handleSkinChoiceSelect = async (
    choice: (typeof skinChoices)[number],

    isLocked: boolean,

    isOwned: boolean,
  ) => {
    if (isLocked) return;

    if (
      choice.tokenPrice !== null &&
      choice.tokenPrice !== undefined &&
      !isOwned
    ) {
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

  const handleBoardSkinSelect = (nextBoardSkin: BoardSkin) => {
    setBoardSkin(nextBoardSkin);
  };

  return (
    <div className="lobby-screen" onClickCapture={handleLobbyUiClickCapture}>
      <h1 className="logo">PathClash</h1>

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
          <div
            className={`lobby-card ${isMatchmaking && currentMatchType === "ai" ? "is-matchmaking" : ""}`}
          >
            <div className="lobby-card-title-row">
              <h2 data-step="2">{t.aiTitle}</h2>

              <button
                type="button"
                className="lobby-mini-btn tutorial"
                onClick={() => void handleReplayAiTutorial()}
              >
                {t.aiTutorialBtn ?? aiTutorialButtonLabel}
              </button>
            </div>

            {isMatchmaking && currentMatchType === "ai" ? (
              <>
                <div className="matchmaking-status">
                  <div className="matchmaking-status-head">
                    <span className="matchmaking-dot" />

                    <strong>{aiMatchmakingHead}</strong>
                  </div>

                  <div className="spinner" />

                  <p>
                    {isAiTutorialQueueing
                      ? aiTutorialMatchmakingDesc
                      : aiMatchmakingDesc}
                  </p>
                </div>

                <button className="lobby-btn cancel" onClick={handleCancelAi}>
                  {aiCancelLabel}
                </button>
              </>
            ) : (
              <>
                <p>{t.aiDesc}</p>

                <button
                  className="lobby-btn ai"
                  onClick={() => void handleAiMatch()}
                >
                  {t.aiBtn}
                </button>
              </>
            )}
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

          <div
            className={`lobby-card ${isMatchmaking && currentMatchType === "random" ? "is-matchmaking" : ""}`}
          >
            <div className="lobby-card-title-row">
              <h2 data-step="4">{t.randomTitle}</h2>

              <div className="daily-reward-wrap">
                <button
                  className="daily-reward-badge daily-reward-badge-btn"
                  aria-label="Daily tokens earned"
                  type="button"
                  onClick={() => setIsDailyRewardInfoOpen((prev) => !prev)}
                >
                  <span className="daily-reward-icon" aria-hidden="true">
                    {"💎"}
                  </span>

                  <span>{accountDailyRewardTokens}</span>

                  <span className="daily-reward-separator">/</span>

                  <span>120</span>
                </button>

                {isDailyRewardInfoOpen && (
                  <div
                    className="daily-reward-popover"
                    role="dialog"
                    aria-label={dailyRewardGuideTitle}
                  >
                    <strong>{dailyRewardGuideTitle}</strong>

                    <p>{dailyRewardGuideMax}</p>

                    <p>{dailyRewardGuideDuel}</p>

                    <p>{dailyRewardGuideCoop}</p>

                    <p>{dailyRewardGuideAi}</p>

                    <p>{dailyRewardGuideReset}</p>
                  </div>
                )}
              </div>
            </div>

            {isMatchmaking && currentMatchType === "random" ? (
              <>
                <div className="matchmaking-status">
                  <div className="matchmaking-status-head">
                    <span className="matchmaking-dot" />

                    <strong>{t.matchmakingHead}</strong>
                  </div>

                  <div className="spinner" />

                  <p>{t.matchmakingDesc}</p>
                </div>

                <button
                  className="lobby-btn cancel"
                  onClick={handleCancelRandom}
                >
                  {t.cancelBtn}
                </button>
              </>
            ) : (
              <button
                className="lobby-btn accent"
                onClick={() => void handleRandom()}
              >
                {t.startBtn}
              </button>
            )}

            {error && <p className="error-msg">{error}</p>}
          </div>

          <div
            className={`lobby-card ${isMatchmaking && currentMatchType === "coop" ? "is-matchmaking" : ""}`}
          >
            <h2 data-step="5">{coopTitle}</h2>

            <p>{coopDesc}</p>

            {isMatchmaking && currentMatchType === "coop" ? (
              <>
                <div className="matchmaking-status">
                  <div className="matchmaking-status-head">
                    <span className="matchmaking-dot" />

                    <strong>{t.matchmakingHead}</strong>
                  </div>

                  <div className="spinner" />

                  <p>{t.matchmakingDesc}</p>
                </div>

                <button className="lobby-btn cancel" onClick={handleCancelCoop}>
                  {t.cancelBtn}
                </button>
              </>
            ) : (
              <button
                className="lobby-btn accent"
                onClick={() => void handleCoopMatch()}
              >
                {coopStartLabel}
              </button>
            )}
          </div>

          <div
            className={`lobby-card ${isMatchmaking && currentMatchType === "2v2" ? "is-matchmaking" : ""}`}
          >
            <h2 data-step="6">{twoVsTwoTitle}</h2>

            <p>{twoVsTwoDesc}</p>

            {isMatchmaking && currentMatchType === "2v2" ? (
              <>
                <div className="matchmaking-status">
                  <div className="matchmaking-status-head">
                    <span className="matchmaking-dot" />

                    <strong>{t.matchmakingHead}</strong>
                  </div>

                  <div className="spinner" />

                  <p>{t.matchmakingDesc}</p>
                </div>

                <button
                  className="lobby-btn cancel"
                  onClick={handleCancelTwoVsTwo}
                >
                  {t.cancelBtn}
                </button>
              </>
            ) : (
              <button
                className="lobby-btn accent"
                onClick={() => void handleTwoVsTwoMatch()}
              >
                {twoVsTwoStartLabel}
              </button>
            )}
          </div>

          <div
            className={`lobby-card ${isMatchmaking && currentMatchType === "ability" ? "is-matchmaking" : ""}`}
          >
            <div className="lobby-card-head-row">
              <h2 data-step="7">{abilityBattleTitle}</h2>

              <button
                className="lobby-btn secondary lobby-head-btn"
                type="button"
                onClick={() => setIsAbilityLoadoutOpen(true)}
              >
                {abilityLoadoutTitle}
              </button>
            </div>

            <p>{abilityBattleDesc}</p>

            <div className="ability-loadout-chip-row">
              {equippedAbilitySkillDefs.map((skill) => (
                <span key={skill.id} className="ability-loadout-chip">
                  {renderAbilitySkillIcon(skill.id)}

                  <span>{lang === "en" ? skill.name.en : skill.name.kr}</span>
                </span>
              ))}
            </div>

            {isMatchmaking && currentMatchType === "ability" ? (
              <>
                <div className="matchmaking-status">
                  <div className="matchmaking-status-head">
                    <span className="matchmaking-dot" />

                    <strong>{t.matchmakingHead}</strong>
                  </div>

                  <div className="spinner" />

                  <p>{t.matchmakingDesc}</p>
                </div>

                <button
                  className="lobby-btn cancel"
                  onClick={handleCancelAbility}
                >
                  {t.cancelBtn}
                </button>
              </>
            ) : (
              <button
                className="lobby-btn accent"
                onClick={() => void handleAbilityMatch()}
              >
                {abilityBattleStartLabel}
              </button>
            )}
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
                    {"💎"}
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

            <div className="skin-picker-tabs" role="tablist" aria-label={skinModalTitle}>
              <button
                className={`skin-picker-tab ${skinPickerTab === "piece" ? "is-active" : ""}`}
                onClick={() => setSkinPickerTab("piece")}
                type="button"
                role="tab"
                aria-selected={skinPickerTab === "piece"}
              >
                {pieceSkinTabLabel}
              </button>
              <button
                className={`skin-picker-tab ${skinPickerTab === "board" ? "is-active" : ""}`}
                onClick={() => setSkinPickerTab("board")}
                type="button"
                role="tab"
                aria-selected={skinPickerTab === "board"}
              >
                {boardSkinTabLabel}
              </button>
            </div>

            <p className="skin-collection-summary">
              {skinPickerTab === "piece"
                ? skinCollectionSummary
                : boardSkinCollectionSummary}
            </p>

            {skinPickerTab === "piece" ? (
              <div className="skin-option-list">
                {skinChoices.map((choice) => {
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

                  const isLocked =
                    lockedByWins || lockedByPlays || lockedByTokens;

                  return (
                    <button
                      key={choice.id}
                      className={`skin-option-card ${
                        pieceSkin === choice.id ? "is-selected" : ""
                      } ${isLocked ? "is-locked" : ""}`}
                      onClick={() =>
                        void handleSkinChoiceSelect(choice, isLocked, isOwned)
                      }
                      disabled={false}
                      type="button"
                    >
                      <span
                        className={`skin-preview skin-preview-${choice.id}`}
                        aria-hidden="true"
                      >
                        {isFlagSkin(choice.id) && <FlagSkin id={choice.id} />}
                        {choice.id === "plasma" && <PlasmaPreview />}
                        {choice.id === "gold_core" && <GoldCorePreview />}
                        {choice.id === "neon_pulse" && <NeonPulsePreview />}
                        {choice.id === "cosmic" && <CosmicPreview />}
                        {choice.id === "inferno" && <InfernoPreview />}
                        {choice.id === "arc_reactor" && <ArcReactorPreview />}
                        {choice.id === "electric_core" && <ElectricCorePreview />}
                        {choice.id === "quantum" && <QuantumPreview />}
                        {choice.id === "atomic" && (
                          <AtomicPreview ready={atomicPreviewReady} />
                        )}
                      </span>

                      <span className="skin-option-copy">
                        <strong
                          className={
                            choice.tier
                              ? `skin-name-tier-${choice.tier}`
                              : undefined
                          }
                        >
                          {choice.name}
                        </strong>

                        <span>{choice.desc}</span>
                      </span>

                      {(isLocked ||
                        (choice.tokenPrice !== null &&
                          choice.tokenPrice !== undefined &&
                          !isOwned)) && (
                        <span className="skin-lock-meta" aria-label="Locked skin">
                          <span className="skin-lock-icon" aria-hidden="true">
                            {choice.tokenPrice !== null &&
                            choice.tokenPrice !== undefined
                              ? "💎"
                              : "🔒"}
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
            ) : (
              <div className="skin-option-list">
                {boardSkinChoices.map((choice) => (
                  <button
                    key={choice.id}
                    className={`skin-option-card ${boardSkin === choice.id ? "is-selected" : ""}`}
                    onClick={() => handleBoardSkinSelect(choice.id)}
                    type="button"
                  >
                    {renderBoardSkinPreview(choice.id)}

                    <span className="skin-option-copy">
                      <strong>{choice.name}</strong>
                      <span>{choice.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

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

                  <p className="token-pack-benefit">{pack.benefit}</p>

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
            className="upgrade-modal skin-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="skin-modal-head">
              <h3>{abilityLoadoutTitle}</h3>

              <div
                className="skin-token-badge"
                aria-label="Ability loadout count"
              >
                <span className="skin-token-badge-main">
                  <span>{equippedAbilitySkillDefs.length} / 3</span>

                  <span>{abilityLoadoutCount}</span>
                </span>
              </div>
            </div>

            <p>{abilityLoadoutDesc}</p>

            <div className="skin-option-list">
              {availableAbilitySkills.map((skill) => {
                const equipped = abilityLoadout.includes(skill.id);

                const unlocked = hasAbilitySkinUnlocked(skill.skinId);

                const skillSummary =
                  lang === "en"
                    ? {
                        tags: skill.loadoutTags.en,

                        desc: skill.loadoutDescription.en,
                      }
                    : {
                        tags: skill.loadoutTags.kr,

                        desc: skill.loadoutDescription.kr,
                      };

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
                    type="button"
                    onClick={() => {
                      if (!unlocked) return;

                      handleToggleAbilitySkill(skill.id);
                    }}
                    disabled={!unlocked}
                  >
                    <span className="skin-preview ability-skill-preview">
                      {renderAbilitySkillIcon(skill.id)}
                    </span>

                    <span className="skin-option-copy">
                      <strong>
                        {lang === "en" ? skill.name.en : skill.name.kr}
                      </strong>

                      <span>
                        {skillSummary.tags}

                        <br />

                        {skillSummary.desc}

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
                      <span className="skin-lock-icon" aria-hidden="true">
                        {unlocked ? "✨" : "🔒"}
                      </span>

                      <span>
                        {unlocked
                          ? lang === "en"
                            ? `${skill.manaCost} mana · ${skill.category}`
                            : `마나 ${skill.manaCost} · ${skill.category === "attack" ? "공격" : skill.category === "defense" ? "방어" : "유틸"}`
                          : lang === "en"
                            ? "Locked"
                            : "잠김"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="upgrade-modal-actions">
              <button
                className="lobby-btn primary"
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
            className={`lobby-bottom-action ${isSkinPickerOpen ? "is-active" : ""}`}
            onClick={() => setIsSkinPickerOpen((open) => !open)}
            aria-pressed={isSkinPickerOpen}
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
            className="lobby-bottom-action lobby-patch-notes-link"
            onClick={() => {
              setIsPatchNotesOpen(true);

              markPatchNotesRead();
            }}
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
            className="lobby-bottom-action"
            onClick={() => setIsAchievementsOpen(true)}
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
            className="lobby-bottom-action"
            onClick={() => setIsSettingsOpen(true)}
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

        <div
          className="lang-toggle lobby-bottom-lang-toggle"
          role="group"
          aria-label="Language toggle"
        >
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
                    <strong className="settings-value">{accountTypeValue}</strong>
                    <button
                      className="settings-copy-btn"
                      type="button"
                      onClick={() =>
                        void (isGuestUser ? handleLinkGoogle() : handleLogout())
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
