import { useCallback, useEffect, useState } from 'react';
import { getSocketAuthPayload } from '../../../auth/guestAuth';
import { connectSocket } from '../../../socket/socketClient';
import type { FriendProfile } from './types';

interface Props {
  friendId: string;
  lang: 'en' | 'kr';
  onClose: () => void;
}

export function FriendProfileModal({ friendId, lang, onClose }: Props) {
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const socket = connectSocket();
      const auth = await getSocketAuthPayload();
      const res = await new Promise<{ profile: FriendProfile | null }>(
        (resolve) => socket.emit('friend_get_profile', { auth, friendId }, resolve),
      );
      setProfile(res.profile);
    } finally {
      setLoading(false);
    }
  }, [friendId]);

  useEffect(() => {
    void load();
  }, [load]);

  const titleLabel = lang === 'kr' ? '프로필' : 'Profile';
  const ratingLabel = lang === 'kr' ? '레이팅' : 'Rating';
  const winsLabel = lang === 'kr' ? '승' : 'W';
  const lossesLabel = lang === 'kr' ? '패' : 'L';
  const closeLabel = lang === 'kr' ? '닫기' : 'Close';
  const loadingLabel = lang === 'kr' ? '불러오는 중...' : 'Loading...';
  const errorLabel =
    lang === 'kr' ? '프로필을 불러오지 못했습니다.' : 'Could not load profile.';

  return (
    <div className="friend-modal-overlay" onClick={onClose}>
      <div className="friend-modal" onClick={(event) => event.stopPropagation()}>
        <h3 className="friend-modal-title">{titleLabel}</h3>
        {loading && <p className="friend-list-empty">{loadingLabel}</p>}
        {!loading && !profile && <p className="friend-list-empty">{errorLabel}</p>}
        {profile && (
          <div className="friend-profile-body">
            <p className="friend-profile-name">{profile.nickname}</p>
            <p className="friend-profile-rating">
              ⭐ {ratingLabel}: {profile.currentRating}
            </p>
            <p className="friend-profile-record">
              {winsLabel} {profile.wins} / {lossesLabel} {profile.losses}
            </p>
          </div>
        )}
        <button type="button" className="lobby-btn secondary" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
