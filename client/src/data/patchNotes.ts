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

export const PATCH_NOTES_VERSION = "2026-04-14-v14";
const PATCH_NOTES_APP_VERSION = "1.0.26";

export function getPatchNotesVersionLabel(lang: "en" | "kr"): string {
  return lang === "en"
    ? `${PATCH_NOTES_APP_VERSION} Version 2026.04.14`
    : `${PATCH_NOTES_APP_VERSION}버전 2026.04.14`;
}

export function getPatchNotes(lang: "en" | "kr"): PatchNoteSection[] {
  if (lang === "en") {
    return [
      {
        heading: "UI improvements",
        lines: [
          {
            text: "Added a loading animation in the lobby that shows while account data is still being fetched from the server.",
          },
        ],
      },
      {
        heading: "Bug fixes",
        lines: [
          {
            text: "Fixed a bug on Android where the in-game background music would reset every 32 seconds.",
          },
        ],
      },
    ];
  }

  return [
    {
      heading: "UI 개선",
      lines: [
        {
          text: "로비에서 서버로부터 계정 정보를 불러오는 동안 로딩 애니메이션이 표시되도록 추가했습니다.",
        },
      ],
    },
    {
      heading: "버그 수정",
      lines: [
        {
          text: "앱에서 인게임 배경음악이 32초마다 초기화되던 버그를 수정했습니다.",
        },
      ],
    },
  ];
}
