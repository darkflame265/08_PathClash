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

export const PATCH_NOTES_VERSION = "2026-04-22-v35";
const PATCH_NOTES_APP_VERSION = "1.0.35";

export function getPatchNotesVersionLabel(lang: "en" | "kr"): string {
  return lang === "en"
    ? `${PATCH_NOTES_APP_VERSION} Version 2026.04.22`
    : `${PATCH_NOTES_APP_VERSION}버전 2026.04.22`;
}

export function getPatchNotes(lang: "en" | "kr"): PatchNoteSection[] {
  if (lang === "en") {
    return [
      {
        heading: "Updates",
        lines: [
          {
            text: "Added keyboard and controller controls.",
          },
        ],
      },
    ];
  }

  return [
    {
      heading: "업데이트",
      lines: [
        {
          text: "키보드와 컨트롤러 조작 기능을 추가했습니다.",
        },
      ],
    },
  ];
}
