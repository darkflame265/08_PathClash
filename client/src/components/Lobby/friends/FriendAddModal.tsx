import { useState, useEffect, useRef, useCallback } from 'react';
import { connectSocket } from '../../../socket/socketClient';
import { getSocketAuthPayload } from '../../../auth/guestAuth';

interface Props {
  lang: 'en' | 'kr';
  onClose: () => void;
}

export function FriendAddModal({ lang, onClose }: Props) {
  const [myCode, setMyCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [inputCode, setInputCode] = useState('');
  const [result, setResult] = useState('');
  const [resultIsError, setResultIsError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generateCode = useCallback(async () => {
    setGenerating(true);
    try {
      const socket = connectSocket();
      const auth = await getSocketAuthPayload();
      const res = await new Promise<{ code?: string; expiresAt?: number; error?: string }>(
        (resolve) => socket.emit('friend_generate_code', { auth }, resolve),
      );
      if (res.code && res.expiresAt) {
        setMyCode(res.code);
        setExpiresAt(res.expiresAt);
        setSecondsLeft(Math.max(0, Math.floor((res.expiresAt - Date.now()) / 1000)));
      }
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => { void generateCode(); }, [generateCode]);

  useEffect(() => {
    if (!expiresAt) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timerRef.current!);
        setMyCode(null);
      }
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [expiresAt]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const handleSubmit = async () => {
    if (!inputCode.trim()) return;
    setSubmitting(true);
    setResult('');
    try {
      const socket = connectSocket();
      const auth = await getSocketAuthPayload();
      const res = await new Promise<{ status: string }>(
        (resolve) => socket.emit('friend_add_by_code', { auth, code: inputCode.trim().toUpperCase() }, resolve),
      );
      const msgMap: Record<string, string> = {
        ok:              lang === 'kr' ? '친구 요청을 보냈습니다!' : 'Friend request sent!',
        not_found:       lang === 'kr' ? '코드를 찾을 수 없습니다.' : 'Code not found.',
        expired:         lang === 'kr' ? '만료된 코드입니다.' : 'Code expired.',
        already_friends: lang === 'kr' ? '이미 친구입니다.' : 'Already friends.',
        self:            lang === 'kr' ? '자신의 코드입니다.' : 'That\'s your own code.',
      };
      const isErr = res.status !== 'ok';
      setResultIsError(isErr);
      setResult(msgMap[res.status] ?? (lang === 'kr' ? '오류가 발생했습니다.' : 'An error occurred.'));
      if (res.status === 'ok') setInputCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const codeLabel         = lang === 'kr' ? '내 친구 코드' : 'My Friend Code';
  const timerExpiredLabel = lang === 'kr' ? '만료됨' : 'Expired';
  const regenLabel        = lang === 'kr' ? '새 코드 생성' : 'New Code';
  const inputLabel        = lang === 'kr' ? '상대방 코드 입력' : 'Enter Friend\'s Code';
  const confirmLabel      = lang === 'kr' ? '확인' : 'Confirm';
  const closeLabel        = lang === 'kr' ? '닫기' : 'Close';

  return (
    <div className="friend-modal-overlay" onClick={onClose}>
      <div className="friend-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="friend-modal-title">{lang === 'kr' ? '친구 추가' : 'Add Friend'}</h3>

        <div className="friend-add-code-section">
          <p className="friend-add-label">{codeLabel}</p>
          {myCode ? (
            <>
              <div className="friend-add-code">{myCode}</div>
              <div className="friend-add-timer">{formatTime(secondsLeft)}</div>
            </>
          ) : (
            <div className="friend-add-code is-expired">{timerExpiredLabel}</div>
          )}
          <button type="button" className="lobby-mini-btn" onClick={() => void generateCode()} disabled={generating}>
            {regenLabel}
          </button>
        </div>

        <div className="friend-modal-divider" />

        <div className="friend-add-input-section">
          <p className="friend-add-label">{inputLabel}</p>
          <div className="friend-add-input-row">
            <input
              className="lobby-input code-input"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="XXXXXX"
            />
            <button type="button" className="lobby-mini-btn" onClick={() => void handleSubmit()} disabled={submitting || !inputCode.trim()}>
              {confirmLabel}
            </button>
          </div>
          {result && <p className={`friend-add-result${resultIsError ? ' error' : ''}`}>{result}</p>}
        </div>

        <button type="button" className="lobby-btn secondary" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
