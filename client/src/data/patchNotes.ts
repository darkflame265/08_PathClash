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

export const PATCH_NOTES_VERSION = "2026-04-19-v20";
const PATCH_NOTES_APP_VERSION = "1.0.32";

export function getPatchNotesVersionLabel(lang: "en" | "kr"): string {
  return lang === "en"
    ? `${PATCH_NOTES_APP_VERSION} Version 2026.04.19`
    : `${PATCH_NOTES_APP_VERSION}버전 2026.04.19`;
}

export function getPatchNotes(lang: "en" | "kr"): PatchNoteSection[] {
  if (lang === "en") {
    return [
      {
        heading: "Balance changes",
        lines: [
          {
            text: "Charge: After using the skill, the piece can now move 1 tile.",
            change: "buff",
          },
        ],
      },
      {
        heading: "Bug fixes",
        lines: [
          {
            text: "Fixed the Achievements and Settings dialogs so the Close button stays pinned while the contents scroll.",
          },
          {
            text: "Locked Android phone screens to portrait orientation while keeping tablet landscape and portrait support.",
          },
          {
            text: "Fixed an Android app issue where lobby and in-game BGM could stop early and restart from the beginning.",
          },
          {
            text: "Improved Android audio playback stability to reduce crackling, adjusted BGM/SFX routing, and boosted SFX volume on phone speakers.",
          },
          {
            text: "Added click sounds to Ability Battle target selection buttons.",
          },
          {
            text: "Redesigned the layout to properly support tablet screen sizes.",
          },
        ],
      },
    ];
  }

  return [
    {
      heading: "밸런스 패치",
      lines: [
        {
          text: "충전: 스킬 사용 후 1칸 이동이 가능해졌습니다.",
          change: "buff",
        },
      ],
    },
    {
      heading: "버그 수정",
      lines: [
        {
          text: "업적창과 설정창에서 내용을 스크롤해도 하단 닫기 버튼이 고정되어 보이도록 수정했습니다.",
        },
        {
          text: "Android 휴대폰에서는 화면이 가로로 회전되지 않도록 고정하고, 태블릿에서는 가로/세로 모드를 계속 지원하도록 수정했습니다.",
        },
        {
          text: "Android 앱에서 로비 및 인게임 BGM이 중간에 끊긴 뒤 처음부터 다시 재생되던 문제를 수정했습니다.",
        },
        {
          text: "Android 앱의 오디오 재생 안정성을 개선해 지지직거리는 현상을 줄이고, BGM/SFX 재생 경로와 휴대폰 스피커용 효과음 볼륨을 조정했습니다.",
        },
        {
          text: "어빌리티 배틀에서 스킬 대상 선택 버튼을 누를 때 클릭음이 재생되도록 수정했습니다.",
        },
        {
          text: "태블릿 화면 크기를 지원하도록 레이아웃을 재설계했습니다.",
        },
      ],
    },
  ];
}
