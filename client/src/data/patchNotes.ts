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

export const PATCH_NOTES_VERSION = "2026-04-17-v17";
const PATCH_NOTES_APP_VERSION = "1.0.29";

export function getPatchNotesVersionLabel(lang: "en" | "kr"): string {
  return lang === "en"
    ? `${PATCH_NOTES_APP_VERSION} Version 2026.04.17`
    : `${PATCH_NOTES_APP_VERSION}버전 2026.04.17`;
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
            text: "Fixed an Android app issue where lobby and in-game BGM could stop early and restart from the beginning.",
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
          text: "Android 앱에서 로비 및 인게임 BGM이 중간에 끊긴 뒤 처음부터 다시 재생되던 문제를 수정했습니다.",
        },
        {
          text: "태블릿 화면 크기를 지원하도록 레이아웃을 재설계했습니다.",
        },
      ],
    },
  ];
}
