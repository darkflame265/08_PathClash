interface Props {
  fromNickname: string;
  lang: 'en' | 'kr';
  onAccept: () => void;
  onDecline: () => void;
}

export function FriendChallengeToast({ fromNickname, lang, onAccept, onDecline }: Props) {
  const message = lang === 'kr'
    ? `${fromNickname}님이 친선전을 요청했습니다.`
    : `${fromNickname} challenged you to a match!`;
  const acceptLabel  = lang === 'kr' ? '수락' : 'Accept';
  const declineLabel = lang === 'kr' ? '거절' : 'Decline';

  return (
    <div className="friend-challenge-toast">
      <span className="friend-challenge-toast-msg">{message}</span>
      <div className="friend-challenge-toast-btns">
        <button type="button" className="lobby-mini-btn" onClick={onAccept}>{acceptLabel}</button>
        <button type="button" className="lobby-mini-btn" onClick={onDecline}>{declineLabel}</button>
      </div>
    </div>
  );
}
