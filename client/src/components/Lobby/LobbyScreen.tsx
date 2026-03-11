import { useEffect, useState } from "react";
import {
  getSocketAuthPayload,
  linkGoogleAccount,
  logoutToGuestMode,
  refreshAccountSummary,
  resolveUpgradeFlowAfterRedirect,
  type AccountProfile,
  type UpgradeResolution,
} from "../../auth/guestAuth";
import { startDonation } from "../../payments/donate";
import { connectSocket } from "../../socket/socketClient";
import { useGameStore } from "../../store/gameStore";
import { useLang } from "../../hooks/useLang";
import type { Translations } from "../../i18n/translations";
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
const DONATE_URL =
  import.meta.env.VITE_DONATE_URL?.trim() || "https://pathclash.com";
const AI_TUTORIAL_SEEN_KEY = "pathclash.aiTutorialSeen.v1";

type SetAuthState = ReturnType<typeof useGameStore.getState>["setAuthState"];

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
    wins: profile.wins,
    losses: profile.losses,
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
    isGuestUser,
    accountWins,
    accountLosses,
    setAuthState,
    setMatchType,
    setPlayerPieceSkins,
    isMusicMuted,
    isSfxMuted,
    toggleAllAudio,
    pieceSkin,
    setPieceSkin,
  } = useGameStore();
  const { lang, setLang, t } = useLang();
  const policyUrl = lang === "en" ? POLICY_URL_EN : POLICY_URL_KR;
  const [view, setView] = useState<LobbyView>("main");
  const [joinCode, setJoinCode] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [error, setError] = useState("");
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [isSkinPickerOpen, setIsSkinPickerOpen] = useState(false);
  const [upgradeResult, setUpgradeResult] = useState<UpgradeResolution>({
    kind: "none",
  });
  const [showUpgradeNotice, setShowUpgradeNotice] = useState(false);
  const upgradeMessage = getUpgradeDisplayMsg(upgradeResult, t);
  const isAudioMuted = isMusicMuted && isSfxMuted;
  const skinButtonLabel = lang === "en" ? "Skin" : "스킨";
  const skinModalTitle =
    lang === "en" ? "Choose Piece Skin" : "말 스킨 선택";
  const skinModalDesc =
    lang === "en"
      ? "Select the look you want to use for your piece."
      : "플레이어 말에 적용할 외형을 선택하세요.";
  const skinApplyLabel = lang === "en" ? "Close" : "닫기";
  const skinChoices: Array<{
    id:
      | "classic"
      | "ember"
      | "nova"
      | "aurora"
      | "void"
      | "flag_kr"
      | "flag_jp"
      | "flag_cn"
      | "flag_us"
      | "flag_uk";
    name: string;
    desc: string;
    requiredWins: number | null;
  }> = [
    {
      id: "classic",
      name: lang === "en" ? "Classic" : "\uAE30\uBCF8",
      desc:
        lang === "en"
          ? "Default red glow."
          : "\uAE30\uBCF8 \uBD89\uC740 \uAE00\uB85C\uC6B0 \uC2A4\uD0C0\uC77C.",
      requiredWins: null,
    },
    {
      id: "ember",
      name: lang === "en" ? "Ember" : "\uC5E0\uBC84",
      desc:
        lang === "en"
          ? "Warm orange flare."
          : "\uC8FC\uD669\uBE5B\uC774 \uB3C4\uB294 \uAC15\uD55C \uBC1C\uAD11.",
      requiredWins: 10,
    },
    {
      id: "nova",
      name: lang === "en" ? "Nova" : "\uB178\uBC14",
      desc:
        lang === "en"
          ? "Cool cyan core."
          : "\uCCAD\uB85D \uACC4\uC5F4\uC758 \uCC28\uAC00\uC6B4 \uCF54\uC5B4.",
      requiredWins: 50,
    },
    {
      id: "aurora",
      name: lang === "en" ? "Aurora" : "\uC624\uB85C\uB77C",
      desc:
        lang === "en"
          ? "Vivid green-yellow glow."
          : "\uC5F0\uB450\uBE5B\uACFC \uD669\uAE08\uBE5B\uC774 \uC11E\uC778 \uBC1C\uAD11.",
      requiredWins: 100,
    },
    {
      id: "void",
      name: lang === "en" ? "Void" : "\uBCF4\uC774\uB4DC",
      desc:
        lang === "en"
          ? "Deep violet core."
          : "\uC9D9\uC740 \uBCF4\uB78F\uBE5B \uCF54\uC5B4 \uC2A4\uD0C0\uC77C.",
      requiredWins: 500,
    },
    {
      id: "flag_kr",
      name: lang === "en" ? "Korea" : "\uD55C\uAD6D",
      desc:
        lang === "en"
          ? "Korean flag motif."
          : "\uB300\uD55C\uBBFC\uAD6D \uAD6D\uAE30 \uBAA8\uD2F0\uBE0C.",
      requiredWins: null,
    },
    {
      id: "flag_jp",
      name: lang === "en" ? "Japan" : "\uC77C\uBCF8",
      desc:
        lang === "en"
          ? "Japanese flag motif."
          : "\uC77C\uBCF8 \uAD6D\uAE30 \uBAA8\uD2F0\uBE0C.",
      requiredWins: null,
    },
    {
      id: "flag_cn",
      name: lang === "en" ? "China" : "\uC911\uAD6D",
      desc:
        lang === "en"
          ? "Chinese flag motif."
          : "\uC911\uAD6D \uAD6D\uAE30 \uBAA8\uD2F0\uBE0C.",
      requiredWins: null,
    },
    {
      id: "flag_us",
      name: lang === "en" ? "USA" : "\uBBF8\uAD6D",
      desc:
        lang === "en"
          ? "American flag motif."
          : "\uBBF8\uAD6D \uAD6D\uAE30 \uBAA8\uD2F0\uBE0C.",
      requiredWins: null,
    },
    {
      id: "flag_uk",
      name: lang === "en" ? "UK" : "\uC601\uAD6D",
      desc:
        lang === "en"
          ? "British flag motif."
          : "\uC601\uAD6D \uAD6D\uAE30 \uBAA8\uD2F0\uBE0C.",
      requiredWins: null,
    },
  ];
  const getSkinRequirementLabel = (requiredWins: number) =>
    lang === "en" ? `Wins ${requiredWins}` : `승리 ${requiredWins}`;

  useEffect(() => {
    void refreshAccountSummary().then(({ nickname, wins, losses }) => {
      setAuthState({
        ready: true,
        userId: authUserId,
        accessToken: useGameStore.getState().authAccessToken,
        isGuestUser,
        nickname,
        wins,
        losses,
      });
    });
  }, [authUserId, isGuestUser, setAuthState]);

  useEffect(() => {
    let active = true;

    void resolveUpgradeFlowAfterRedirect().then((result) => {
      if (!active || result.kind === "none") return;

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
        pieceSkin?: "classic" | "ember" | "nova";
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
        selfPieceSkin?: "classic" | "ember" | "nova";
        opponentPieceSkin?: "classic" | "ember" | "nova";
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
        pieceSkin?: "classic" | "ember" | "nova";
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
            <h2 data-step="4">{t.randomTitle}</h2>
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
            <h3>{skinModalTitle}</h3>
            <p>{skinModalDesc}</p>
            <div className="skin-option-list">
              {skinChoices.map((choice) => {
                const isLocked =
                  choice.requiredWins !== null && accountWins < choice.requiredWins;
                return (
                  <button
                    key={choice.id}
                    className={`skin-option-card ${
                      pieceSkin === choice.id ? "is-selected" : ""
                    } ${isLocked ? "is-locked" : ""}`}
                    onClick={() => {
                      if (!isLocked) setPieceSkin(choice.id);
                    }}
                    disabled={isLocked}
                    type="button"
                  >
                    <span
                      className={`skin-preview skin-preview-${choice.id}`}
                      aria-hidden="true"
                    />
                    <span className="skin-option-copy">
                      <strong>{choice.name}</strong>
                      <span>{choice.desc}</span>
                    </span>
                    {isLocked && (
                      <span className="skin-lock-meta" aria-label="Locked skin">
                        <span className="skin-lock-icon" aria-hidden="true">
                          🔒
                        </span>
                        <span>{getSkinRequirementLabel(choice.requiredWins!)}</span>
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
        <div className="audio-toggle" role="group" aria-label="Audio toggle">
          <button
            className={`audio-toggle-btn ${!isAudioMuted ? "is-active" : ""}`}
            onClick={toggleAllAudio}
            aria-pressed={!isAudioMuted}
            title={isAudioMuted ? "Audio Off" : "Audio On"}
            type="button"
          >
            {isAudioMuted ? "🔇" : "🔊"}
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
        <a
          className="lobby-utility-link"
          href={policyUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t.policyBtn}
        </a>
        <button
          className="lobby-utility-link"
          onClick={() => void handleDonate()}
          type="button"
        >
          {t.donateBtn}
        </button>
      </div>
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
