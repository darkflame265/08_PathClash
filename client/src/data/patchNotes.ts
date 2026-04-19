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

export const PATCH_NOTES_VERSION = "2026-04-19-v21";
const PATCH_NOTES_APP_VERSION = "1.0.33";

export function getPatchNotesVersionLabel(lang: "en" | "kr"): string {
  return lang === "en"
    ? `${PATCH_NOTES_APP_VERSION} Version 2026.04.19`
    : `${PATCH_NOTES_APP_VERSION}버전 2026.04.19`;
}

export function getPatchNotes(lang: "en" | "kr"): PatchNoteSection[] {
  if (lang === "en") {
    return [
      {
        heading: "Updates",
        lines: [
          {
            text: "Updated Ability Battle skill Korean descriptions based on the revised English loadout descriptions.",
          },
          {
            text: "Quantum Shift target icons no longer appear on the opponent's current position.",
          },
          {
            text: "Disabled the extra SFX amplification so sound effects now use the same gain level as BGM.",
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
          text: "어빌리티 배틀 스킬의 수정된 영어 loadout 설명을 기준으로 한국어 설명을 정리했습니다.",
        },
        {
          text: "양자도약의 이동 위치 선택 아이콘이 상대 말의 현재 위치에는 나타나지 않도록 수정했습니다.",
        },
        {
          text: "추가 SFX 증폭을 꺼서 효과음이 BGM과 같은 gain 수준을 사용하도록 조정했습니다.",
        },
      ],
    },
  ];
}
