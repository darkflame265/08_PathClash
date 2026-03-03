export type Lang = "en" | "kr";
export type AccountTitleKey = "guest" | "google";

export type Translations = {
  accountTitleKey: AccountTitleKey;
  accountTitleText: string;
  accountDesc: string;
  accountDescGoogle: string;
  record: (w: number, l: number) => string;
  nickLabel: string;
  nickPlaceholder: string;
  upgradeTitle: string;
  linkGoogle: string;
  logout: string;
  roomCreatedTitle: string;
  roomCreatedDesc: string;
  waitingText: string;
  joinTitle: string;
  joinPlaceholder: string;
  joinBtn: string;
  backBtn: string;
  joinError: string;
  aiTitle: string;
  aiDesc: string;
  aiBtn: string;
  friendTitle: string;
  createRoomBtn: string;
  enterCodeBtn: string;
  randomTitle: string;
  matchmakingHead: string;
  matchmakingDesc: string;
  cancelBtn: string;
  startBtn: string;
  switchedTitle: string;
  confirmBtn: string;
};

export const translations: Record<Lang, Translations> = {
  en: {
    accountTitleKey: "google",
    accountTitleText: "Account",
    accountDesc: "Stats and nickname are linked to this device.",
    accountDescGoogle: "Linked with your Google account.",
    record: (w: number, l: number) => `(${w}W ${l}L)`,
    nickLabel: "CURRENT NICKNAME",
    nickPlaceholder: "Enter nickname (default: Guest)",
    upgradeTitle: "UPGRADE ACCOUNT",
    linkGoogle: "Link Google Account",
    logout: "logout",

    roomCreatedTitle: "Room Created",
    roomCreatedDesc: "Share this code with your friend.",
    waitingText: "Waiting for opponent...",

    joinTitle: "Join Room",
    joinPlaceholder: "Enter room code",
    joinBtn: "Join",
    backBtn: "Back",
    joinError: "Please enter a room code.",

    aiTitle: "vs AI",
    aiDesc: "Practice against AI. Stats are not recorded.",
    aiBtn: "Start AI Match",

    friendTitle: "Friend Match",
    createRoomBtn: "Create Room",
    enterCodeBtn: "Enter Code",

    randomTitle: "Random Match",
    matchmakingHead: "Searching...",
    matchmakingDesc: "Finding an opponent. Only this mode counts for stats.",
    cancelBtn: "Cancel",
    startBtn: "Find Match",

    switchedTitle: "Switched to existing Google account",
    confirmBtn: "OK",
  },
  kr: {
    accountTitleKey: "guest",
    accountTitleText: "게스트 계정",
    accountDesc: "전적과 닉네임은 이 기기 계정에 연결됩니다.",
    accountDescGoogle: "구글 계정과 연동 중입니다.",
    record: (w: number, l: number) => `(${w}승 ${l}패)`,
    nickLabel: "CURRENT NICKNAME",
    nickPlaceholder: "닉네임 입력 (미입력 시 Guest)",
    upgradeTitle: "UPGRADE ACCOUNT",
    linkGoogle: "Link Google Account",
    logout: "logout",

    roomCreatedTitle: "방 생성 완료",
    roomCreatedDesc: "친구에게 아래 코드를 공유해주세요.",
    waitingText: "상대가 입장할 때까지 기다리는 중...",

    joinTitle: "방 참가",
    joinPlaceholder: "방 코드를 입력",
    joinBtn: "입장",
    backBtn: "뒤로",
    joinError: "코드를 입력해주세요.",

    aiTitle: "AI 대전",
    aiDesc: "AI와 연습 대전을 즐겨보세요. 전적은 저장되지 않습니다.",
    aiBtn: "AI와 대전 시작",

    friendTitle: "친구 대전",
    createRoomBtn: "방 만들기",
    enterCodeBtn: "코드 입력",

    randomTitle: "랜덤 매칭",
    matchmakingHead: "매칭 중...",
    matchmakingDesc: "상대를 찾고 있습니다. 이 모드만 전적에 반영됩니다.",
    cancelBtn: "매칭 취소",
    startBtn: "매칭 시작",

    switchedTitle: "기존 Google 계정으로 전환했습니다",
    confirmBtn: "확인",
  },
};
