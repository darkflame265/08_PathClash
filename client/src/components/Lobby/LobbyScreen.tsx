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
import { connectSocket } from "../../socket/socketClient";
import { useGameStore } from "../../store/gameStore";
import { useLang } from "../../hooks/useLang";
import type { Translations } from "../../i18n/translations";
import "./LobbyScreen.css";

type LobbyView = "main" | "create" | "join";

interface Props {
  onGameStart: () => void;
}

type SetAuthState = ReturnType<typeof useGameStore.getState>["setAuthState"];

function applyProfileToStore(profile: AccountProfile, setAuthState: SetAuthState) {
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

function getUpgradeDisplayMsg(result: UpgradeResolution, t: Translations): string {
  if (result.kind === "upgrade_ok") return t.upgradeOk;
  if (result.kind === "switch_ok") return t.switchOk(result.profile.wins, result.profile.losses);
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
        <h2 data-step={t.accountTitleKey === "guest" ? "G" : "A"}>{t.accountTitleText}</h2>
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
          <div className="account-upgrade-title">{t.upgradeTitle}</div>
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
  } = useGameStore();
  const { lang, setLang, t } = useLang();
  const [view, setView] = useState<LobbyView>("main");
  const [joinCode, setJoinCode] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [error, setError] = useState("");
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [upgradeResult, setUpgradeResult] = useState<UpgradeResolution>({ kind: "none" });
  const [showUpgradeNotice, setShowUpgradeNotice] = useState(false);
  const upgradeMessage = getUpgradeDisplayMsg(upgradeResult, t);

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

  const getNick = () => myNickname.trim() || `Guest${Math.floor(Math.random() * 9999)}`;

  const startSocket = () => {
    const socket = connectSocket();

    socket.off("room_created");
    socket.off("room_joined");
    socket.off("opponent_joined");
    socket.off("join_error");
    socket.off("matchmaking_waiting");

    socket.on("room_created", ({ code, color }: { roomId: string; code: string; color: "red" | "blue" }) => {
      setMyColor(color);
      setRoomCode(code);
      setCreatedCode(code);
      setError("");
      setIsMatchmaking(false);
      setView("create");
    });

    socket.on("room_joined", ({ color, roomId }: { roomId: string; color: "red" | "blue"; opponentNickname: string }) => {
      setMyColor(color);
      setRoomCode(roomId);
      setError("");
      setIsMatchmaking(false);
      onGameStart();
    });

    socket.on("opponent_joined", () => {
      setError("");
      setIsMatchmaking(false);
      onGameStart();
    });

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
  });

  const handleCreateRoom = async () => {
    setError("");
    setIsMatchmaking(false);
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
    const socket = startSocket();
    socket.emit("join_room", {
      code: joinCode.trim().toUpperCase(),
      ...(await buildPlayerPayload()),
    });
  };

  const handleRandom = async () => {
    setError("");
    const socket = startSocket();
    socket.emit("join_random", await buildPlayerPayload());
  };

  const handleCancelRandom = () => {
    const socket = connectSocket();
    socket.emit("cancel_random");
    setIsMatchmaking(false);
  };

  const handleAiMatch = async () => {
    setError("");
    setIsMatchmaking(false);
    const socket = startSocket();
    socket.emit("join_ai", await buildPlayerPayload());
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
          <button className="lobby-btn primary" onClick={() => void handleJoinRoom()}>
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
              <button className="lobby-btn primary" onClick={() => void handleCreateRoom()}>
                {t.createRoomBtn}
              </button>
              <button className="lobby-btn secondary" onClick={() => setView("join")}>
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
          onClose={() => { setShowUpgradeNotice(false); setUpgradeResult({ kind: "none" }); }}
          t={t}
        />
      )}
      <div className="lang-toggle" role="group" aria-label="Language toggle">
        <button
          className={`lang-toggle-btn ${lang === "kr" ? "is-active" : ""}`}
          onClick={() => setLang("kr")}
          aria-pressed={lang === "kr"}
          type="button"
        >
          KR
        </button>
        <button
          className={`lang-toggle-btn ${lang === "en" ? "is-active" : ""}`}
          onClick={() => setLang("en")}
          aria-pressed={lang === "en"}
          type="button"
        >
          EN
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
