import { useEffect, useState, useCallback } from 'react';
import { connectSocket } from '../../../socket/socketClient';
import { getSocketAuthPayload } from '../../../auth/guestAuth';
import type { FriendEntry } from './types';

interface Props {
  lang: 'en' | 'kr';
  onAddFriend: () => void;
  onViewRequests: () => void;
  onFriendClick: (friend: FriendEntry, anchorRect: DOMRect) => void;
  refreshTrigger: number;
}

export function FriendListPanel({ lang, onAddFriend, onViewRequests, onFriendClick, refreshTrigger }: Props) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const socket = connectSocket();
      const auth = await getSocketAuthPayload();
      const [listRes, reqRes] = await Promise.all([
        new Promise<{ friends: FriendEntry[] }>((resolve) =>
          socket.emit('friend_list', { auth }, resolve),
        ),
        new Promise<{ requests: Array<{ id: string }> }>((resolve) =>
          socket.emit('friend_requests_list', { auth }, resolve),
        ),
      ]);
      setFriends(listRes.friends ?? []);
      setRequestCount(reqRes.requests?.length ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshTrigger]);

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
