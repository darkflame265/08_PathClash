import { useState, useEffect, useCallback } from 'react';
import { connectSocket } from '../../../socket/socketClient';
import { getSocketAuthPayload } from '../../../auth/guestAuth';
import type { RequestEntry } from './types';

interface Props {
  lang: 'en' | 'kr';
  onClose: () => void;
  onAccepted: () => void;
}

export function FriendRequestsModal({ lang, onClose, onAccepted }: Props) {
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const socket = connectSocket();
      const auth = await getSocketAuthPayload();
      const res = await new Promise<{ requests: RequestEntry[] }>(
        (resolve) => socket.emit('friend_requests_list', { auth }, resolve),
      );
      setRequests(res.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const respond = async (requestId: string, accept: boolean) => {
    setRespondingId(requestId);
    try {
      const socket = connectSocket();
      const auth = await getSocketAuthPayload();
      await new Promise<{ status: string }>(
        (resolve) => socket.emit('friend_request_respond', { auth, requestId, accept }, resolve),
      );
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (accept) onAccepted();
    } finally {
      setRespondingId(null);
    }
  };

  const titleLabel  = lang === 'kr' ? '친구 요청' : 'Friend Requests';
  const emptyLabel  = lang === 'kr' ? '받은 친구 요청이 없습니다' : 'No pending requests';
  const acceptLabel = lang === 'kr' ? '수락' : 'Accept';
  const rejectLabel = lang === 'kr' ? '거절' : 'Decline';
  const closeLabel  = lang === 'kr' ? '닫기' : 'Close';

  return (
    <div className="friend-modal-overlay" onClick={onClose}>
      <div className="friend-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="friend-modal-title">{titleLabel}</h3>
        <div className="friend-req-list">
          {loading && <p className="friend-list-empty">...</p>}
          {!loading && requests.length === 0 && (
            <p className="friend-list-empty">{emptyLabel}</p>
          )}
          {requests.map((r) => (
            <div key={r.id} className="friend-req-row">
              <span className="friend-req-name">{r.senderNickname}</span>
              <div className="friend-req-actions">
                <button
                  type="button"
                  className="lobby-mini-btn"
                  disabled={respondingId === r.id}
                  onClick={() => void respond(r.id, true)}
                >
                  {acceptLabel}
                </button>
                <button
                  type="button"
                  className="lobby-mini-btn"
                  disabled={respondingId === r.id}
                  onClick={() => void respond(r.id, false)}
                >
                  {rejectLabel}
                </button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="lobby-btn secondary" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
