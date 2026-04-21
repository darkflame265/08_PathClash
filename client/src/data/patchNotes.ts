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

export const PATCH_NOTES_VERSION = "2026-04-21-v22";
const PATCH_NOTES_APP_VERSION = "1.0.34";

export function getPatchNotesVersionLabel(lang: "en" | "kr"): string {
  return lang === "en"
    ? `${PATCH_NOTES_APP_VERSION} Version 2026.04.21`
    : `${PATCH_NOTES_APP_VERSION}버전 2026.04.21`;
}

export function getPatchNotes(lang: "en" | "kr"): PatchNoteSection[] {
  if (lang === "en") {
    return [
      {
        heading: "Updates",
        lines: [
          {
            text: "Fixed translation errors.",
          },
          {
            text: "Trying to buy a skin without enough diamonds now shows a floating warning.",
          },
          {
            text: "The equipped skill window now shows the currently selected skills at the top.",
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
          text: "번역 오류를 수정했습니다.",
        },
        {
          text: "다이아몬드가 부족한 상태로 스킨 구매를 시도하면 플로팅 알림이 뜨도록 개선했습니다.",
        },
        {
          text: "장착 스킬 창 상단에 현재 선택된 스킬이 표시되도록 개선했습니다.",
        },
      ],
    },
  ];
}
