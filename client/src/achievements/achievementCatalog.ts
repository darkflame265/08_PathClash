export type AchievementCategory =
  | "tutorial"
  | "progress"
  | "mode_win"
  | "collection"
  | "settings"
  | "ability_special"
  | "ability_attack"
  | "ability_defense"
  | "ability_utility";

export interface AchievementCatalogEntry {
  id: string;
  category: AchievementCategory;
  goal: number;
  rewardTokens: number;
  name: { en: string; kr: string };
  description: { en: string; kr: string };
}

const WIN_MILESTONES = [1, 3, 5, 10, 30, 50, 100, 500, 1000, 10000] as const;
const WIN_REWARDS = [20, 30, 40, 60, 100, 150, 250, 700, 1500, 3000] as const;
const TOTAL_WIN_MILESTONES = [10, 50, 100, 500, 1000, 10000] as const;
const TOTAL_WIN_REWARDS = [50, 100, 180, 500, 1000, 3000] as const;
const GAMES_PLAYED_MILESTONES = [10, 50, 100, 500, 1000] as const;
const GAMES_PLAYED_REWARDS = [40, 80, 120, 350, 700] as const;
const SKIN_MILESTONES = [3, 10, 20] as const;
const SKIN_REWARDS = [40, 100, 250] as const;
const DAILY_REWARD_MILESTONES = [10, 50] as const;
const DAILY_REWARD_REWARDS = [80, 300] as const;
const ATTACK_SKILL_MILESTONES = [1, 5, 10, 30] as const;
const ATTACK_SKILL_REWARDS = [50, 60, 80, 100] as const;
const DEFENSE_SKILL_MILESTONES = [1, 5, 10, 30] as const;
const DEFENSE_SKILL_REWARDS = [50, 60, 80, 100] as const;
const UTILITY_SKILL_MILESTONES = [5, 25, 50, 150] as const;
const UTILITY_SKILL_REWARDS = [50, 60, 80, 100] as const;
const FULL_HP_MILESTONES = [1, 5, 30] as const;
const FULL_HP_REWARDS = [80, 180, 500] as const;

const attackSkillNames = {
  ember_blast: { en: "Ember Blast", kr: "엠버 폭발" },
  sun_chariot: { en: "Sun Chariot", kr: "태양전차" },
  atomic_fission: { en: "Atomic Fission", kr: "원자분열" },
  inferno_field: { en: "Inferno Field", kr: "용암지대" },
  nova_blast: { en: "Nova Blast", kr: "노바 폭발" },
  electric_blitz: { en: "Electric Blitz", kr: "벽력일섬" },
  cosmic_bigbang: { en: "Cosmic Big Bang", kr: "빅뱅폭발" },
} as const;

const defenseSkillNames = {
  classic_guard: { en: "Guard", kr: "가드" },
  arc_reactor_field: { en: "AT Field", kr: "AT 필드" },
} as const;

const utilitySkillNames = {
  aurora_heal: { en: "Healing", kr: "힐링" },
  quantum_shift: { en: "Quantum Shift", kr: "양자 도약" },
  plasma_charge: { en: "Charge", kr: "충전" },
  void_cloak: { en: "Void Cloak", kr: "투명화" },
  phase_shift: { en: "Phase Shift", kr: "페이즈 시프트" },
  gold_overdrive: { en: "Overdrive", kr: "오버드라이브" },
  wizard_magic_mine: { en: "Magic Mine", kr: "매직마인" },
  chronos_time_rewind: { en: "Time Rewind", kr: "타임 리와인드" },
} as const;

function buildSeries(
  category: AchievementCategory,
  prefix: string,
  milestones: readonly number[],
  rewards: readonly number[],
  builder: (goal: number, reward: number) => AchievementCatalogEntry,
): AchievementCatalogEntry[] {
  return milestones.map((goal, index) => {
    const entry = builder(
      goal,
      rewards[index] ?? rewards[rewards.length - 1] ?? 0,
    );
    return { ...entry, category, id: `${prefix}${goal}` };
  });
}

const catalog: AchievementCatalogEntry[] = [
  {
    id: "tutorial_complete",
    category: "tutorial",
    goal: 1,
    rewardTokens: 30,
    name: { en: "Tutorial Complete", kr: "튜토리얼 완료" },
    description: {
      en: "Complete the tutorial once.",
      kr: "튜토리얼을 한 번 완료하세요.",
    },
  },
  {
    id: "first_match_played",
    category: "progress",
    goal: 1,
    rewardTokens: 20,
    name: { en: "First Match", kr: "첫 대결" },
    description: {
      en: "Play any mode once.",
      kr: "아무 모드나 한 번 플레이하세요.",
    },
  },
  {
    id: "welcome_to_pathclash",
    category: "progress",
    goal: 1,
    rewardTokens: 2000,
    name: {
      en: "Welcome to PathClash",
      kr: "PathClash에 오신 것을 환영합니다",
    },
    description: {
      en: "Log in with this account once.",
      kr: "해당 계정으로 한 번 접속하세요.",
    },
  },
  {
    id: "first_win",
    category: "progress",
    goal: 1,
    rewardTokens: 30,
    name: { en: "First Victory", kr: "첫 승리" },
    description: {
      en: "Win any match once.",
      kr: "아무 경기에서나 한 번 승리하세요.",
    },
  },
  ...buildSeries(
    "progress",
    "wins_total_",
    TOTAL_WIN_MILESTONES,
    TOTAL_WIN_REWARDS,
    (goal, rewardTokens) => ({
      id: "",
      category: "progress",
      goal,
      rewardTokens,
      name: { en: `Total Wins ${goal}`, kr: `총 승리 ${goal}회` },
      description: {
        en: `Win ${goal} matches in total.`,
        kr: `총 ${goal}회 승리하세요.`,
      },
    }),
  ),
  ...buildSeries(
    "mode_win",
    "ai_win_",
    WIN_MILESTONES,
    WIN_REWARDS,
    (goal, rewardTokens) => ({
      id: "",
      category: "mode_win",
      goal,
      rewardTokens,
      name: { en: `AI Wins ${goal}`, kr: `AI 대전 승리 ${goal}회` },
      description: {
        en: `Win ${goal} AI matches.`,
        kr: `AI 대전에서 ${goal}회 승리하세요.`,
      },
    }),
  ),
  ...buildSeries(
    "mode_win",
    "duel_win_",
    WIN_MILESTONES,
    WIN_REWARDS,
    (goal, rewardTokens) => ({
      id: "",
      category: "mode_win",
      goal,
      rewardTokens,
      name: { en: `Duel Wins ${goal}`, kr: `대결전 승리 ${goal}회` },
      description: {
        en: `Win ${goal} duel matches.`,
        kr: `대결전에서 ${goal}회 승리하세요.`,
      },
    }),
  ),
  ...buildSeries(
    "mode_win",
    "ability_win_",
    WIN_MILESTONES,
    WIN_REWARDS,
    (goal, rewardTokens) => ({
      id: "",
      category: "mode_win",
      goal,
      rewardTokens,
      name: { en: `Ability Wins ${goal}`, kr: `능력대전 승리 ${goal}회` },
      description: {
        en: `Win ${goal} Ability Battle matches.`,
        kr: `능력대전에서 ${goal}회 승리하세요.`,
      },
    }),
  ),
  ...buildSeries(
    "mode_win",
    "twovtwo_win_",
    WIN_MILESTONES,
    WIN_REWARDS,
    (goal, rewardTokens) => ({
      id: "",
      category: "mode_win",
      goal,
      rewardTokens,
      name: { en: `2v2 Wins ${goal}`, kr: `2v2 승리 ${goal}회` },
      description: {
        en: `Win ${goal} 2v2 matches.`,
        kr: `2v2에서 ${goal}회 승리하세요.`,
      },
    }),
  ),
  ...buildSeries(
    "mode_win",
    "coop_clear_",
    WIN_MILESTONES,
    WIN_REWARDS,
    (goal, rewardTokens) => ({
      id: "",
      category: "mode_win",
      goal,
      rewardTokens,
      name: { en: `Co-op Clears ${goal}`, kr: `협동전 클리어 ${goal}회` },
      description: {
        en: `Clear co-op ${goal} times.`,
        kr: `협동전을 ${goal}회 클리어하세요.`,
      },
    }),
  ),
  ...buildSeries(
    "progress",
    "games_played_",
    GAMES_PLAYED_MILESTONES,
    GAMES_PLAYED_REWARDS,
    (goal, rewardTokens) => ({
      id: "",
      category: "progress",
      goal,
      rewardTokens,
      name: { en: `Matches Played ${goal}`, kr: `누적 플레이 ${goal}회` },
      description: {
        en: `Play ${goal} matches in total.`,
        kr: `총 ${goal}회 플레이하세요.`,
      },
    }),
  ),
  ...buildSeries(
    "collection",
    "skins_owned_",
    SKIN_MILESTONES,
    SKIN_REWARDS,
    (goal, rewardTokens) => ({
      id: "",
      category: "collection",
      goal,
      rewardTokens,
      name: { en: `Skins Found ${goal}`, kr: `스킨 수집 ${goal}개` },
      description: {
        en: `Own ${goal} skins.`,
        kr: `스킨 ${goal}개를 보유하세요.`,
      },
    }),
  ),
  ...buildSeries(
    "progress",
    "daily_reward_",
    DAILY_REWARD_MILESTONES,
    DAILY_REWARD_REWARDS,
    (goal, rewardTokens) => ({
      id: "",
      category: "progress",
      goal,
      rewardTokens,
      name: { en: `Daily Rewards ${goal}`, kr: `일일 보상 ${goal}회` },
      description: {
        en: `Earn daily victory rewards ${goal} times.`,
        kr: `일일 승리 보상을 ${goal}회 획득하세요.`,
      },
    }),
  ),
  {
    id: "settings_audio_off_zero",
    category: "settings",
    goal: 1,
    rewardTokens: 50,
    name: { en: "Wise Choice", kr: "현명한 선택" },
    description: {
      en: "Mute music and SFX, and set both volumes to 0.",
      kr: "음악/효과음을 끄고 두 볼륨을 모두 0으로 설정하세요.",
    },
  },
  {
    id: "settings_audio_on_full",
    category: "settings",
    goal: 1,
    rewardTokens: 50,
    name: { en: "Are Your Ears OK?", kr: "당신의 귀 괜찮은가요?" },
    description: {
      en: "Enable music and SFX, and set both volumes to 100.",
      kr: "음악/효과음을 켜고 두 볼륨을 모두 100으로 설정하세요.",
    },
  },
  ...buildSeries(
    "ability_special",
    "ability_win_full_hp_",
    FULL_HP_MILESTONES,
    FULL_HP_REWARDS,
    (goal, rewardTokens) => ({
      id: "",
      category: "ability_special",
      goal,
      rewardTokens,
      name: {
        en: `Perfect Ability Win ${goal}`,
        kr: `풀피 능력대전 승리 ${goal}회`,
      },
      description: {
        en: `Win Ability Battle ${goal} times while staying at 5 HP. Disconnect wins do not count.`,
        kr: `HP 5인 채로 능력대전에서 ${goal}회 승리하세요. 상대 이탈 승리는 제외됩니다.`,
      },
    }),
  ),
  ...Object.entries(attackSkillNames).flatMap(([skillId, labels]) =>
    buildSeries(
      "ability_attack",
      `skill_finish_${skillId}_`,
      ATTACK_SKILL_MILESTONES,
      ATTACK_SKILL_REWARDS,
      (goal, rewardTokens) => ({
        id: "",
        category: "ability_attack",
        goal,
        rewardTokens,
        name: {
          en: `${labels.en} Finish ${goal}`,
          kr: `${labels.kr} 마무리 ${goal}회`,
        },
        description: {
          en: `Finish an opponent with ${labels.en} ${goal} times.`,
          kr: `${labels.kr}로 상대를 ${goal}번 마무리하세요.`,
        },
      }),
    ),
  ),
  ...Object.entries(defenseSkillNames).flatMap(([skillId, labels]) =>
    buildSeries(
      "ability_defense",
      `skill_block_${skillId}_`,
      DEFENSE_SKILL_MILESTONES,
      DEFENSE_SKILL_REWARDS,
      (goal, rewardTokens) => ({
        id: "",
        category: "ability_defense",
        goal,
        rewardTokens,
        name: {
          en: `${labels.en} Block ${goal}`,
          kr: `${labels.kr} 방어 ${goal}회`,
        },
        description: {
          en: `Block attacks with ${labels.en} ${goal} times.`,
          kr: `${labels.kr}로 공격을 ${goal}회 막으세요.`,
        },
      }),
    ),
  ),
  ...Object.entries(utilitySkillNames).flatMap(([skillId, labels]) =>
    buildSeries(
      "ability_utility",
      `skill_use_${skillId}_`,
      UTILITY_SKILL_MILESTONES,
      UTILITY_SKILL_REWARDS,
      (goal, rewardTokens) => ({
        id: "",
        category: "ability_utility",
        goal,
        rewardTokens,
        name: {
          en: `${labels.en} Use ${goal}`,
          kr: `${labels.kr} 사용 ${goal}회`,
        },
        description: {
          en: `Use ${labels.en} ${goal} times in Ability Battle.`,
          kr: `능력대전에서 ${labels.kr}를 ${goal}회 사용하세요.`,
        },
      }),
    ),
  ),
];

export const ACHIEVEMENT_CATALOG = catalog;
export const ACHIEVEMENT_CATALOG_BY_ID = new Map(
  ACHIEVEMENT_CATALOG.map((entry) => [entry.id, entry]),
);

export function getAchievementEntry(achievementId: string) {
  return ACHIEVEMENT_CATALOG_BY_ID.get(achievementId) ?? null;
}
