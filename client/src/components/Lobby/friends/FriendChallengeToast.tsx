type Props =
  | {
      kind: "incoming";
      nickname: string;
      lang: "en" | "kr";
      onAccept: () => void;
      onDecline: () => void;
    }
  | {
      kind: "outgoing";
      nickname: string;
      lang: "en" | "kr";
      onCancel: () => void;
    };

export function FriendChallengeToast(props: Props) {
  const { lang, nickname } = props;
  const isIncoming = props.kind === "incoming";
  const message =
    lang === "kr"
      ? isIncoming
        ? `${nickname}님이 친선전을 요청했습니다.`
        : `${nickname}님에게 친선전을 요청했습니다.`
      : isIncoming
        ? `${nickname} challenged you to a match!`
        : `You challenged ${nickname} to a match.`;
  const acceptLabel = lang === "kr" ? "수락" : "Accept";
  const declineLabel = lang === "kr" ? "거절" : "Decline";
  const cancelLabel = lang === "kr" ? "취소" : "Cancel";

  return (
    <div className="friend-challenge-toast">
      <span className="friend-challenge-toast-msg">{message}</span>
      <div className="friend-challenge-toast-btns">
        {isIncoming ? (
          <>
            <button type="button" className="lobby-mini-btn" onClick={props.onAccept}>
              {acceptLabel}
            </button>
            <button type="button" className="lobby-mini-btn" onClick={props.onDecline}>
              {declineLabel}
            </button>
          </>
        ) : (
          <button type="button" className="lobby-mini-btn" onClick={props.onCancel}>
            {cancelLabel}
          </button>
        )}
      </div>
    </div>
  );
}
