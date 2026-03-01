import { useEffect, useState } from "react";
import { getSocketAuthPayload, refreshAccountSummary } from "../../auth/guestAuth";
import { connectSocket } from "../../socket/socketClient";
import { useGameStore } from "../../store/gameStore";
import "./LobbyScreen.css";

type LobbyView = "main" | "create" | "join";

interface Props {
  onGameStart: () => void;
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
  const [view, setView] = useState<LobbyView>("main");
  const [joinCode, setJoinCode] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [error, setError] = useState("");
  const [isMatchmaking, setIsMatchmaking] = useState(false);

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
      setError("코드를 입력해주세요.");
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

  const accountBlurb = isGuestUser
    ? `전적과 닉네임은 이 기기 계정에 연결됩니다. (${accountWins}승 ${accountLosses}패)`
    : "Supabase 미설정 상태입니다.";

  if (view === "create") {
    return (
      <div className="lobby-screen">
        <h1 className="logo">PathClash</h1>
        <div className="lobby-card account-card">
          <h2 data-step="G">게스트 계정</h2>
          <p>{accountBlurb}</p>
          <input
            className="lobby-input"
            placeholder="닉네임 입력 (미입력 시 Guest)"
            value={myNickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={16}
          />
        </div>
        <div className="lobby-card">
          <h2 data-step="C">방 생성 완료</h2>
          <p>친구에게 아래 코드를 공유해주세요.</p>
          <div className="room-code">{createdCode}</div>
          <p className="waiting-text">상대가 입장할 때까지 기다리는 중...</p>
        </div>
      </div>
    );
  }

  if (view === "join") {
    return (
      <div className="lobby-screen">
        <h1 className="logo">PathClash</h1>

        <div className="lobby-card account-card">
          <h2 data-step="G">게스트 계정</h2>
          <p>{accountBlurb}</p>
          <input
            className="lobby-input"
            placeholder="닉네임 입력 (미입력 시 Guest)"
            value={myNickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={16}
          />
        </div>

        <div className="lobby-card">
          <h2 data-step="3">방 참가</h2>
          <input
            className="lobby-input code-input"
            placeholder="방 코드 입력"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          {error && <p className="error-msg">{error}</p>}
          <button className="lobby-btn primary" onClick={() => void handleJoinRoom()}>
            입장
          </button>
          <button
            className="lobby-btn secondary"
            onClick={() => {
              setView("main");
              setError("");
            }}
          >
            뒤로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-screen">
      <h1 className="logo">PathClash</h1>

      <div className="lobby-card account-card">
        <h2 data-step="G">게스트 계정</h2>
        <p>{accountBlurb}</p>
        <input
          className="lobby-input"
          placeholder="닉네임 입력 (미입력 시 Guest)"
          value={myNickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={16}
        />
      </div>

      <div className="lobby-card">
        <h2 data-step="2">AI 대전</h2>
        <p>AI와 연습 대전을 즐겨보세요. 전적은 저장되지 않습니다.</p>
        <button className="lobby-btn ai" onClick={() => void handleAiMatch()}>
          AI와 대전 시작
        </button>
      </div>

      <div className="lobby-card">
        <h2 data-step="3">친구 대전</h2>
        <div className="btn-divider">
          <button className="lobby-btn primary" onClick={() => void handleCreateRoom()}>
            방 만들기
          </button>
          <button className="lobby-btn secondary" onClick={() => setView("join")}>
            코드 입력
          </button>
        </div>
      </div>

      <div className={`lobby-card ${isMatchmaking ? "is-matchmaking" : ""}`}>
        <h2 data-step="4">랜덤 매칭</h2>
        {isMatchmaking ? (
          <>
            <div className="matchmaking-status">
              <div className="matchmaking-status-head">
                <span className="matchmaking-dot" />
                <strong>매칭 중...</strong>
              </div>
              <div className="spinner" />
              <p>상대를 찾고 있습니다. 이 모드만 전적이 반영됩니다.</p>
            </div>
            <button className="lobby-btn cancel" onClick={handleCancelRandom}>
              매칭 취소
            </button>
          </>
        ) : (
          <button className="lobby-btn accent" onClick={() => void handleRandom()}>
            매칭 시작
          </button>
        )}
        {error && <p className="error-msg">{error}</p>}
      </div>
    </div>
  );
}
