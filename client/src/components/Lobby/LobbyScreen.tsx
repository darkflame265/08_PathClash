import { useState } from 'react';
import { connectSocket } from '../../socket/socketClient';
import { useGameStore } from '../../store/gameStore';
import './LobbyScreen.css';

type LobbyView = 'main' | 'create' | 'join' | 'matchmaking';

interface Props {
  onGameStart: () => void;
}

export function LobbyScreen({ onGameStart }: Props) {
  const { myNickname, setNickname, setMyColor, setRoomCode } = useGameStore();
  const [view, setView] = useState<LobbyView>('main');
  const [joinCode, setJoinCode] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const [error, setError] = useState('');

  const getNick = () => myNickname.trim() || `Guest${Math.floor(Math.random() * 9999)}`;

  const startSocket = () => {
    const socket = connectSocket();

    socket.on('room_created', ({ code, color }: { roomId: string; code: string; color: 'red' | 'blue' }) => {
      setMyColor(color);
      setRoomCode(code);
      setCreatedCode(code);
      setView('create');
    });

    socket.on('room_joined', ({ color, roomId }: { roomId: string; color: 'red' | 'blue'; opponentNickname: string }) => {
      setMyColor(color);
      setRoomCode(roomId);
      onGameStart();
    });

    socket.on('opponent_joined', () => {
      onGameStart();
    });

    socket.on('join_error', ({ message }: { message: string }) => {
      setError(message);
    });

    socket.on('matchmaking_waiting', () => {
      setView('matchmaking');
    });

    return socket;
  };

  const handleCreateRoom = () => {
    const socket = startSocket();
    socket.emit('create_room', { nickname: getNick() });
  };

  const handleJoinRoom = () => {
    if (!joinCode.trim()) { setError('코드를 입력하세요.'); return; }
    setError('');
    const socket = startSocket();
    socket.emit('join_room', { code: joinCode.trim().toUpperCase(), nickname: getNick() });
  };

  const handleRandom = () => {
    const socket = startSocket();
    socket.emit('join_random', { nickname: getNick() });
  };

  if (view === 'create') {
    return (
      <div className="lobby-screen">
        <h1 className="logo">PathClash</h1>
        <div className="lobby-card">
          <h2>방 생성 완료</h2>
          <p>친구에게 코드를 알려주세요:</p>
          <div className="room-code">{createdCode}</div>
          <p className="waiting-text">상대방 입장 대기 중...</p>
        </div>
      </div>
    );
  }

  if (view === 'matchmaking') {
    return (
      <div className="lobby-screen">
        <h1 className="logo">PathClash</h1>
        <div className="lobby-card">
          <h2>매칭 중...</h2>
          <div className="spinner" />
          <p>상대방을 찾고 있습니다</p>
        </div>
      </div>
    );
  }

  if (view === 'join') {
    return (
      <div className="lobby-screen">
        <h1 className="logo">PathClash</h1>
        <div className="lobby-card">
          <h2>방 참가</h2>
          <input
            className="lobby-input"
            placeholder="닉네임 (선택)"
            value={myNickname}
            onChange={e => setNickname(e.target.value)}
            maxLength={16}
          />
          <input
            className="lobby-input code-input"
            placeholder="방 코드 입력"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          {error && <p className="error-msg">{error}</p>}
          <button className="lobby-btn primary" onClick={handleJoinRoom}>입장</button>
          <button className="lobby-btn secondary" onClick={() => { setView('main'); setError(''); }}>뒤로</button>
        </div>
      </div>
    );
  }

  // Main
  return (
    <div className="lobby-screen">
      <h1 className="logo">PathClash</h1>
      <div className="lobby-card">
        <input
          className="lobby-input"
          placeholder="닉네임 입력 (미입력 시 Guest)"
          value={myNickname}
          onChange={e => setNickname(e.target.value)}
          maxLength={16}
        />
        <button className="lobby-btn primary" onClick={handleCreateRoom}>🤝 친구 대전 (방 만들기)</button>
        <button className="lobby-btn secondary" onClick={() => setView('join')}>🔑 친구 대전 (코드 입력)</button>
        <button className="lobby-btn accent" onClick={handleRandom}>🎲 랜덤 매칭</button>
      </div>
    </div>
  );
}
