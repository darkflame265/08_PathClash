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

export const PATCH_NOTES_VERSION = "2026-04-11-v13";

export function getPatchNotesVersionLabel(lang: "en" | "kr"): string {
  return lang === "en" ? "Version 2026.04.11" : "버전 2026.04.11";
}

export function getPatchNotes(lang: "en" | "kr"): PatchNoteSection[] {
  if (lang === "en") {
    return [
      {
        heading: "Skin preview improvements",
        lines: [
          { text: "Expanded skin detail previews with richer linked skill info, including icon, type, and mana cost." },
          { text: "Aligned and enlarged skill icons inside the skin detail modal for clearer readability." },
          { text: "Locked skins now appear in grayscale in the skin selection grid, and unlock-based skins now return to full color correctly once their conditions are met." },
        ],
      },
      {
        heading: "Preview rendering polish",
        lines: [
          { text: "Adjusted Chronos thumbnail scaling in the skin grid." },
          { text: "Improved Electric Core thumbnail rendering so the lightning fills the preview more naturally." },
          { text: "Fixed Cosmic preview centering so it matches the in-game look more closely." },
        ],
      },
      {
        heading: "Ability battle updates",
        lines: [
          { text: "Training mode now starts with 10 path points and a 10 path point cap." },
          { text: "Chronos Time Rewind now shows an X mark after it has been consumed in battle." },
          { text: "Matches that exceed the round limit are now closed automatically, and players are returned to the lobby with a notice." },
        ],
      },
    ];
  }

  return [
    {
      heading: "스킨 미리보기 개선",
      lines: [
        { text: "스킨 상세 미리보기 창에 연결 스킬의 아이콘, 유형, 소모 마나 정보를 추가했습니다." },
        { text: "스킨 상세 미리보기 창의 스킬 아이콘 정렬과 크기를 다듬어 가독성을 높였습니다." },
        { text: "해금하지 않은 스킨이 스킨 선택 그리드에서 흑백으로 보이도록 변경하고, 승리 횟수·플레이 횟수 조건을 달성한 스킨은 정상 색상으로 보이도록 수정했습니다." },
      ],
    },
    {
      heading: "프리뷰 렌더링 보정",
      lines: [
        { text: "스킨 선택 그리드에서 크로노스 스킨의 썸네일 스케일을 조정했습니다." },
        { text: "일렉트릭 코어 스킨의 썸네일에서 번개가 더 자연스럽게 뻗어 보이도록 보정했습니다." },
        { text: "코스믹 스킨의 미리보기 위치를 인게임과 더 가깝게 맞추도록 수정했습니다." },
      ],
    },
    {
      heading: "능력 대전 변경",
      lines: [
        { text: "훈련장에서 시작 패스 포인트와 최대 패스 포인트가 10으로 적용되도록 변경했습니다." },
        { text: "크로노스의 타임 리와인드가 발동된 뒤에는 인게임 스킬 박스에서 소모 표시가 보이도록 추가했습니다." },
        { text: "일정 라운드 수를 초과한 방은 자동으로 종료되며, 플레이어는 안내 문구와 함께 로비로 복귀하도록 개선했습니다." },
      ],
    },
  ];
}
