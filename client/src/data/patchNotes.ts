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

export const PATCH_NOTES_VERSION = "2026-04-05-v7";

export function getPatchNotesVersionLabel(lang: "en" | "kr"): string {
  return lang === "en" ? "Version 2026.04.05" : "버전 2026.04.05";
}

export function getPatchNotes(lang: "en" | "kr"): PatchNoteSection[] {
  if (lang === "en") {
    return [
      {
        heading: "Board skins and visuals",
        lines: [
          { text: "Added board skin tabs and expanded board skin support in the skin menu." },
          { text: "Added Pharaoh and Magic board skins with dedicated in-game backgrounds." },
          { text: "Tutorial matches now always use the classic board for cleaner onboarding." },
        ],
      },
      {
        heading: "Profile and lobby improvements",
        lines: [
          { text: "Nickname changes now happen from Settings only and cost 500 tokens." },
          { text: "First-time players now set a free nickname before the tutorial prompt appears." },
          { text: "Added clearer loading indicators while account data and Google account data are being fetched." },
        ],
      },
      {
        heading: "Gameplay changes and fixes",
        lines: [
          { text: "Ability Battle starting HP has been increased from 3 to 5." },
          { text: "Co-op matches now continue if one teammate disconnects, and only remaining winners receive rewards." },
          { text: "Improved several in-game UI details including overlap HP visibility and path sound feedback." },
        ],
      },
    ];
  }

  return [
    {
      heading: "보드 스킨 및 연출",
      lines: [
        { text: "스킨창에 보드 스킨 탭을 추가하고 보드 스킨 표시를 확장했습니다." },
        { text: "파라오 보드와 매직 보드를 추가하고 전용 인게임 배경을 연결했습니다." },
        { text: "튜토리얼에서는 항상 클래식 보드를 사용하도록 정리했습니다." },
      ],
    },
    {
      heading: "프로필 및 로비 개선",
      lines: [
        { text: "닉네임 변경은 설정창에서만 가능하도록 바꾸고 비용을 500토큰으로 조정했습니다." },
        { text: "처음 시작한 플레이어는 튜토리얼 전에 무료로 닉네임을 정하도록 추가했습니다." },
        { text: "계정 데이터와 구글 계정 정보를 불러오는 동안 로딩 안내를 더 명확하게 표시합니다." },
      ],
    },
    {
      heading: "게임 변경 및 수정",
      lines: [
        { text: "능력대전 시작 HP를 3에서 5로 늘리고 체력 표시도 5칸으로 맞췄습니다." },
        { text: "협동전은 한 명이 나가도 계속 진행되며 남은 사람이 승리하면 보상을 받습니다." },
        { text: "말 겹침 시 체력바 표시와 경로 작성 효과음을 포함한 인게임 UI를 다듬었습니다." },
      ],
    },
  ];
}
