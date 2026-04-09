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

export const PATCH_NOTES_VERSION = "2026-04-09-v10";

export function getPatchNotesVersionLabel(lang: "en" | "kr"): string {
  return lang === "en" ? "Version 2026.04.09" : "버전 2026.04.09";
}

export function getPatchNotes(lang: "en" | "kr"): PatchNoteSection[] {
  if (lang === "en") {
    return [
      {
        heading: "Lobby and friend matches",
        lines: [
          { text: "Added Classic and Ability Battle switching to Friend Match." },
          { text: "Added rematch buttons to Friend Match result boxes." },
          { text: "Removed token reward messages from Friend Match victory boxes." },
        ],
      },
      {
        heading: "Skins and unlocks",
        lines: [
          { text: "Added the Chronos legendary skin and the Time Rewind passive skill." },
          { text: "Added token prices and ownership unlock flow for board skins." },
          { text: "Chronos now requires purchasing the skin before its passive can be used." },
          { text: "Sun visuals were adjusted to render more consistently across desktop and mobile displays." },
        ],
      },
      {
        heading: "Ability Battle and combat",
        lines: [
          { text: "Added the Magic Mine skill for Wizard and improved its trap preview and trigger timing." },
          { text: "Added the Sun Chariot skill for Sun and tuned its size and hit behavior." },
          { text: "Disconnected opponents now remain in the match as grayscale pieces instead of ending the game immediately." },
          { text: "When the opponent disconnects, your path points are temporarily raised so you can finish the match faster." },
          { text: "Improved Time Rewind so Chronos rewinds after movement ends along the turn path." },
          { text: "Added rewind sound effects and improved the Chronos rewind presentation." },
        ],
      },
      {
        heading: "Progress and account data",
        lines: [
          { text: "Added a welcome achievement that grants bonus tokens." },
          { text: "Added achievement series for Magic Mine and Time Rewind usage." },
          { text: "Equipped Ability Battle skills are now saved per account instead of only on the device." },
        ],
      },
    ];
  }

  return [
    {
      heading: "로비 및 친구 대전",
      lines: [
        { text: "친구 대전에 클래식과 능력대전 전환 기능을 추가했습니다." },
        { text: "친구 대전 승패 박스에 재시합 버튼을 추가했습니다." },
        { text: "친구 대전 승리 박스에서 토큰 획득 문구가 뜨지 않도록 수정했습니다." },
      ],
    },
    {
      heading: "스킨 및 해금",
      lines: [
        { text: "레전더리 스킨 크로노스와 패시브 스킬 타임 리와인드를 추가했습니다." },
        { text: "보드 스킨에도 토큰 구매와 보유 해금 흐름을 추가했습니다." },
        { text: "크로노스는 스킨을 구매해야 패시브를 사용할 수 있도록 조정했습니다." },
        { text: "썬 스킨이 PC와 모바일에서 더 비슷하게 보이도록 렌더링을 조정했습니다." },
      ],
    },
    {
      heading: "능력대전 및 전투",
      lines: [
        { text: "위자드 전용 공격 스킬 매직마인을 추가하고 함정 표시와 발동 타이밍을 개선했습니다." },
        { text: "썬 전용 공격 스킬 태양전차를 추가하고 크기와 충돌 판정을 조정했습니다." },
        { text: "상대가 연결을 끊어도 게임이 즉시 끝나지 않고 흑백 말 상태로 계속 진행되도록 변경했습니다." },
        { text: "상대가 연결을 끊으면 남아 있는 플레이어의 패스 포인트를 일시적으로 30까지 높여 마무리를 돕습니다." },
        { text: "크로노스의 타임 리와인드가 턴 종료 후 경로를 거꾸로 따라 되감기되도록 개선했습니다." },
        { text: "타임 리와인드 전용 효과음을 추가하고 리와인드 연출을 개선했습니다." },
      ],
    },
    {
      heading: "업적 및 계정 데이터",
      lines: [
        { text: "2000토큰을 지급하는 웰컴 업적을 추가했습니다." },
        { text: "매직마인과 타임 리와인드 사용 업적 시리즈를 추가했습니다." },
        { text: "능력대전 장착 스킬 정보가 기기별이 아닌 계정별로 저장되도록 수정했습니다." },
      ],
    },
  ];
}
