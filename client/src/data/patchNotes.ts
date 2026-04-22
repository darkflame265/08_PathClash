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

export const PATCH_NOTES_VERSION = "2026-04-22-v36";
const PATCH_NOTES_APP_VERSION = "1.0.36";

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
            text: "Lava Zone mana cost increased from 6 to 7.",
            change: "nerf",
          },
          {
            text: "Nova Burst mana cost increased from 4 to 5.",
            change: "nerf",
          },
          {
            text: "Phase Shift mana cost decreased from 8 to 7.",
            change: "buff",
          },
          {
            text: "Quantum Shift mana cost decreased from 4 to 3.",
            change: "buff",
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
          text: "용암지대 마나 코스트가 6에서 7로 증가했습니다.",
          change: "nerf",
        },
        {
          text: "노바 폭발 마나 코스트가 4에서 5로 증가했습니다.",
          change: "nerf",
        },
        {
          text: "페이즈 시프트 마나 코스트가 8에서 7로 감소했습니다.",
          change: "buff",
        },
        {
          text: "양자 도약 마나 코스트가 4에서 3으로 감소했습니다.",
          change: "buff",
        },
      ],
    },
  ];
}
