import { useEffect, useRef, useState } from 'react';
import type { FriendEntry } from './types';

interface Props {
  friend: FriendEntry;
  anchorRect: DOMRect;
  lang: 'en' | 'kr';
  onViewProfile: () => void;
  onChallenge: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export function FriendContextPopup({ friend, anchorRect, lang, onViewProfile, onChallenge, onRemove, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  const profileLabel   = lang === 'kr' ? '프로필 보기' : 'View Profile';
  const challengeLabel = lang === 'kr' ? '친선전' : 'Challenge';
  const removeLabel    = lang === 'kr' ? '친구 삭제' : 'Remove';
  const confirmLabel   = lang === 'kr'
    ? `${friend.nickname}님을 친구에서 삭제하시겠습니까?`
    : `Remove ${friend.nickname} from friends?`;
  const yesLabel       = lang === 'kr' ? '삭제' : 'Remove';
  const noLabel        = lang === 'kr' ? '취소' : 'Cancel';

  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.bottom + 4,
    left: anchorRect.left,
  };

  return (
    <div className="friend-ctx-popup" style={style} ref={popupRef}>
      {confirmDelete ? (
        <div className="friend-ctx-confirm">
          <p className="friend-ctx-confirm-text">{confirmLabel}</p>
          <div className="friend-ctx-confirm-btns">
            <button type="button" className="lobby-mini-btn danger" onClick={onRemove}>{yesLabel}</button>
            <button type="button" className="lobby-mini-btn" onClick={() => setConfirmDelete(false)}>{noLabel}</button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="friend-ctx-btn" onClick={onViewProfile}>{profileLabel}</button>
          <button type="button" className="friend-ctx-btn" onClick={onChallenge}>{challengeLabel}</button>
          <button type="button" className="friend-ctx-btn danger" onClick={() => setConfirmDelete(true)}>{removeLabel}</button>
        </>
      )}
    </div>
  );
}
