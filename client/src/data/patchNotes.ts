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

export const PATCH_NOTES_VERSION = "2026-04-03-v6";

export function getPatchNotesVersionLabel(lang: "en" | "kr"): string {
  return lang === "en" ? "Version 2026.04.03" : "버전 2026.04.03";
}

export function getPatchNotes(lang: "en" | "kr"): PatchNoteSection[] {
  if (lang === "en") {
    return [
      {
        heading: "New systems",
        lines: [
          {
            text: "Added the achievements system with progress tracking, individual claims, Claim All rewards, and lobby NEW indicators.",
          },
          {
            text: "Added a first-launch legal consent flow for the Terms of Service and Privacy Policy.",
          },
          {
            text: "Updated the Privacy Policy and Terms of Service to match Google Sign-In, purchases, achievements, account linking, and consent records.",
          },
        ],
      },
      {
        heading: "Tutorial and lobby improvements",
        lines: [
          {
            text: "Expanded the AI tutorial into multiple guided scenarios and improved AI/tutorial entry flow and retry behavior.",
          },
          {
            text: "Added a dedicated Tutorial button in the lobby and improved AI matchmaking entry feedback.",
          },
          {
            text: "Reworked lobby utility buttons, added larger icons, and randomized the skin button icon on each lobby load.",
          },
        ],
      },
      {
        heading: "Gameplay feel and fixes",
        lines: [
          {
            text: "Added path drawing sound feedback when adding or erasing each tile during planning.",
          },
          {
            text: "Added roll-in entrance animation for pieces and improved hit visuals, including clearer translucency on damage.",
          },
          {
            text: "Fixed several timing issues, including the missing first-round AI timer after refresh and more natural collision/skill hit order in Ability Battle.",
          },
        ],
      },
    ];
  }

  return [
    {
      heading: "신규 시스템",
      lines: [
        {
          text: "업적 시스템을 추가했습니다. 진행도 확인, 개별 수령, 모든 보상 획득, 로비 NEW 표시를 지원합니다.",
        },
        {
          text: "첫 실행 시 이용약관 및 개인정보처리방침 동의 흐름을 추가했습니다.",
        },
        {
          text: "구글 로그인, 결제, 업적, 계정 연동, 동의 기록에 맞춰 개인정보처리방침과 이용약관을 갱신했습니다.",
        },
      ],
    },
    {
      heading: "튜토리얼 및 로비 개선",
      lines: [
        {
          text: "AI 튜토리얼을 다단계 시나리오로 확장하고, 진입과 재시도 흐름을 더 자연스럽게 개선했습니다.",
        },
        {
          text: "로비에 전용 튜토리얼 버튼을 추가하고 AI 대전 진입 피드백을 더 명확하게 다듬었습니다.",
        },
        {
          text: "로비 하단 유틸리티 버튼을 개편하고, 아이콘 확대 및 스킨 버튼 랜덤 아이콘을 추가했습니다.",
        },
      ],
    },
    {
      heading: "게임 감각 및 수정",
      lines: [
        {
          text: "경로 작성 시 한 칸 추가하거나 지울 때마다 효과음이 나도록 추가했습니다.",
        },
        {
          text: "말 등장 롤인 애니메이션과 피격 반투명 효과를 보강해 타격감과 가독성을 개선했습니다.",
        },
        {
          text: "새로고침 후 AI 대전 첫 라운드 타이머가 보이지 않던 문제와 능력대전 충돌/스킬 피격 타이밍 표시를 수정했습니다.",
        },
      ],
    },
  ];
}
