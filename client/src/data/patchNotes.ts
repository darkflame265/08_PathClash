export type PatchNoteChange = "buff" | "nerf";

export type PatchNoteLine = {
  text: string;
  change?: PatchNoteChange;
  label?: string;
};

export type PatchNoteSection = {
  heading: string;
  lines: PatchNoteLine[];
};

export const PATCH_NOTES_VERSION = "2026-04-06-v8";

export function getPatchNotesVersionLabel(lang: "en" | "kr"): string {
  return lang === "en" ? "Version 2026.04.06" : "버전 2026.04.06";
}

export function getPatchNotes(lang: "en" | "kr"): PatchNoteSection[] {
  if (lang === "en") {
    return [
      {
        heading: "Lobby and profile",
        lines: [
          { text: "Refactored the lobby into a mode selector panel and a mode content panel." },
          { text: "Removed the lobby profile card and moved Google link and logout actions into Settings." },
          { text: "Improved loading feedback while account and Google-linked data are being resolved." },
        ],
      },
      {
        heading: "Board skins and presentation",
        lines: [
          { text: "Added Magic board support and rebuilt Pharaoh and Magic boards with per-cell rendering." },
          { text: "Improved board skin previews and linked matching backgrounds for supported boards." },
          { text: "Tutorial matches now always use the classic board for cleaner onboarding." },
        ],
      },
      {
        heading: "Gameplay and fixes",
        lines: [
          { text: "Increased Ability Battle planning time from 7 seconds to 9 seconds." },
          { text: "Added an opponent info panel to Ability Battle and refined result box placement and actions." },
          { text: "Fixed cases where Google-linked nicknames could unexpectedly revert to Guest." },
          { text: "Fixed Ability Battle result text changing after the winner disconnected." },
        ],
      },
    ];
  }

  return [
    {
      heading: "로비 및 프로필",
      lines: [
        { text: "로비를 모드 선택 박스와 모드 내용 박스의 2단 구조로 개편했습니다." },
        { text: "로비 유저정보 박스를 제거하고 설정창으로 구글 연동과 로그아웃 기능을 옮겼습니다." },
        { text: "계정 데이터와 구글 연동 정보를 불러오는 동안 로딩 안내를 더 분명하게 표시합니다." },
      ],
    },
    {
      heading: "보드 스킨 및 연출",
      lines: [
        { text: "매직 보드를 추가하고 파라오 보드와 매직 보드를 셀 단위 렌더 방식으로 정리했습니다." },
        { text: "지원되는 보드 스킨에는 전용 인게임 배경과 스킨 미리보기를 연결했습니다." },
        { text: "튜토리얼에서는 항상 클래식 보드를 사용하도록 정리했습니다." },
      ],
    },
    {
      heading: "게임 변경 및 수정",
      lines: [
        { text: "능력대전 경로 작성 시간을 7초에서 9초로 늘렸습니다." },
        { text: "능력대전 상단에 상대 닉네임과 장착 스킬을 보여주는 박스를 추가했습니다." },
        { text: "구글 연동 계정의 닉네임이 Guest로 되돌아가는 문제를 수정했습니다." },
        { text: "능력대전에서 승패 확정 후 상대가 나가면 결과 문구가 바뀌던 문제를 수정했습니다." },
      ],
    },
  ];
}
