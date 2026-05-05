import { useEffect, useState, useCallback, useRef } from 'react';
import { connectSocket, connectSocketReady } from '../../../socket/socketClient';
import { getSocketAuthPayload } from '../../../auth/guestAuth';
import type { FriendEntry } from './types';

interface Props {
  lang: 'en' | 'kr';
  onAddFriend: () => void;
  onViewRequests: () => void;
  onFriendClick: (friend: FriendEntry, anchorRect: DOMRect) => void;
  refreshTrigger: number;
}

function emitAckWithTimeout<T>(
  socket: ReturnType<typeof connectSocket>,
  eventName: string,
  payload: unknown,
  fallback: T,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, timeoutMs);

    socket.emit(eventName, payload, (response: T) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(response);
    });
  });
}

export function FriendListPanel({ lang, onAddFriend, onViewRequests, onFriendClick, refreshTrigger }: Props) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadRequestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true);
    try {
      const socket = await connectSocketReady();
      const auth = await getSocketAuthPayload();
      const [listRes, reqRes] = await Promise.all([
        emitAckWithTimeout<{ friends: FriendEntry[] }>(
          socket,
          'friend_list',
          { auth },
          { friends: [] },
        ),
        emitAckWithTimeout<{ requests: Array<{ id: string }> }>(
          socket,
          'friend_requests_list',
          { auth },
          { requests: [] },
        ),
      ]);
      if (loadRequestIdRef.current !== requestId) return;
      setFriends(listRes.friends ?? []);
      setRequestCount(reqRes.requests?.length ?? 0);
    } catch {
      if (loadRequestIdRef.current !== requestId) return;
      setFriends([]);
      setRequestCount(0);
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshTrigger]);

  useEffect(() => {
    const socket = connectSocket();
    const handlePresenceUpdated = ({ friend }: { friend?: FriendEntry }) => {
      if (!friend) return;
      setFriends((prev) => {
        const index = prev.findIndex((entry) => entry.userId === friend.userId);
        if (index < 0) return prev;
        const next = [...prev];
        next[index] = { ...next[index], ...friend };
        return next;
      });
    };
    const handleListChanged = () => {
      void load();
    };
    const handleRequestCountUpdated = ({ count }: { count?: number }) => {
      setRequestCount(Number(count ?? 0));
    };
    const handleRequestReceived = () => {
      setRequestCount((prev) => prev + 1);
    };

    socket.on('friend_presence_updated', handlePresenceUpdated);
    socket.on('friend_list_changed', handleListChanged);
    socket.on('friend_request_count_updated', handleRequestCountUpdated);
    socket.on('friend_request_received', handleRequestReceived);

    return () => {
      socket.off('friend_presence_updated', handlePresenceUpdated);
      socket.off('friend_list_changed', handleListChanged);
      socket.off('friend_request_count_updated', handleRequestCountUpdated);
      socket.off('friend_request_received', handleRequestReceived);
    };
  }, [load]);

  const statusLabel = (s: FriendEntry['status']) =>
    s === 'online'
      ? lang === 'kr' ? '온라인' : 'Online'
      : s === 'in_game'
        ? lang === 'kr' ? '게임 중' : 'In Game'
        : lang === 'kr' ? '오프라인' : 'Offline';

  const emptyText = lang === 'kr' ? '아직 친구가 없습니다' : 'No friends yet';
  const addLabel = lang === 'kr' ? '친구 추가' : 'Add Friend';
  const reqLabel = lang === 'kr'
    ? `친구 요청${requestCount > 0 ? ` (${requestCount})` : ''}`
    : `Requests${requestCount > 0 ? ` (${requestCount})` : ''}`;

  return (
    <div className="friend-list-panel">
      <div className="friend-list-scroll">
        {loading && <p className="friend-list-empty">...</p>}
        {!loading && friends.length === 0 && (
          <p className="friend-list-empty">{emptyText}</p>
        )}
        {friends.map((f) => (
          <button
            key={f.userId}
            type="button"
            className="friend-row"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
              onFriendClick(f, rect);
            }}
          >
            <span className={`friend-status-badge friend-status-badge--${f.status}`} />
            <span className="friend-row-name">{f.nickname}</span>
            <span className="friend-row-rating">⭐ {f.currentRating}</span>
            <span className="friend-row-status">{statusLabel(f.status)}</span>
          </button>
        ))}
      </div>
      <div className="friend-list-actions">
        <button type="button" className="lobby-mini-btn" onClick={onAddFriend}>
          {addLabel}
        </button>
        <button
          type="button"
          className={`lobby-mini-btn${requestCount > 0 ? ' has-badge' : ''}`}
          onClick={onViewRequests}
        >
          {reqLabel}
        </button>
      </div>
    </div>
  );
}
