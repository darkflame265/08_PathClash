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

export const PATCH_NOTES_VERSION = "2026-04-27-v42";
const PATCH_NOTES_APP_VERSION = "1.0.42";

export function getPatchNotesVersionLabel(lang: "en" | "kr"): string {
  return lang === "en"
    ? `${PATCH_NOTES_APP_VERSION} Version 2026.04.27`
    : `${PATCH_NOTES_APP_VERSION}버전 2026.04.27`;
}

export function getPatchNotes(lang: "en" | "kr"): PatchNoteSection[] {
  if (lang === "en") {
    return [
      {
        heading: "Updates",
        lines: [
          {
            text: "Three Ability Battle skills are now available for free each day through daily rotation.",
          },
          {
            text: "Added glow effects to skill icons.",
          },
          {
            text: "Fixed an issue where SFX preview buttons in Sound > Advanced Settings could ignore early clicks.",
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
          text: "매일 스킬 3개를 로테이션으로 무료 제공하도록 추가했습니다.",
        },
        {
          text: "스킬 아이콘에 glow 효과를 추가했습니다.",
        },
        {
          text: "소리 > 고급 설정에서 SFX 재생 버튼 클릭이 초반에 씹히던 문제를 수정했습니다.",
        },
      ],
    },
  ];
}
