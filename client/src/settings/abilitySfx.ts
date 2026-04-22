export type AbilitySfxGainId =
  | "guard"
  | "shield_block"
  | "atomic_fission"
  | "charge"
  | "quantum"
  | "ember_blast"
  | "electric_blitz"
  | "sun_chariot"
  | "cosmic_bigbang"
  | "healing"
  | "inferno_field"
  | "phase_shift"
  | "arc_reactor_field"
  | "void_cloak"
  | "chronos_tick_tock"
  | "chronos_rewind_loop"
  | "gold_overdrive_loop"
  | "magic_mine";

export const ABILITY_SFX_GAIN_IDS: AbilitySfxGainId[] = [
  "guard",
  "shield_block",
  "atomic_fission",
  "charge",
  "quantum",
  "ember_blast",
  "electric_blitz",
  "sun_chariot",
  "cosmic_bigbang",
  "healing",
  "inferno_field",
  "phase_shift",
  "arc_reactor_field",
  "void_cloak",
  "chronos_tick_tock",
  "chronos_rewind_loop",
  "gold_overdrive_loop",
  "magic_mine",
];

export const DEFAULT_ABILITY_SFX_GAINS: Record<AbilitySfxGainId, number> =
  ABILITY_SFX_GAIN_IDS.reduce(
    (acc, id) => {
      acc[id] = 1;
      return acc;
    },
    {} as Record<AbilitySfxGainId, number>,
  );

export const ABILITY_SFX_GAIN_LABELS: Record<
  AbilitySfxGainId,
  { en: string; kr: string }
> = {
  guard: { en: "Guard", kr: "가드" },
  shield_block: { en: "Shield Block", kr: "방어 성공" },
  atomic_fission: { en: "Atomic Fission", kr: "원자분열" },
  charge: { en: "Charge", kr: "돌진" },
  quantum: { en: "Quantum Shift", kr: "양자 도약" },
  ember_blast: { en: "Ember Blast", kr: "엠버 폭발" },
  electric_blitz: { en: "Electric Blitz", kr: "전격 질주" },
  sun_chariot: { en: "Sun Chariot", kr: "태양전차" },
  cosmic_bigbang: { en: "Cosmic Big Bang", kr: "코스믹 빅뱅" },
  healing: { en: "Healing", kr: "힐링" },
  inferno_field: { en: "Lava Zone", kr: "용암지대" },
  phase_shift: { en: "Phase Shift", kr: "페이즈 시프트" },
  arc_reactor_field: { en: "AT Field", kr: "AT 필드" },
  void_cloak: { en: "Void Cloak", kr: "공허 은신" },
  chronos_tick_tock: { en: "Chronos Tick", kr: "크로노스 시계" },
  chronos_rewind_loop: { en: "Chronos Rewind", kr: "크로노스 되감기" },
  gold_overdrive_loop: { en: "Overdrive Loop", kr: "오버드라이브 지속음" },
  magic_mine: { en: "Magic Mine", kr: "마법 지뢰" },
};

export function normalizeAbilitySfxGains(
  value: unknown,
): Record<AbilitySfxGainId, number> {
  const source =
    value && typeof value === "object"
      ? (value as Partial<Record<AbilitySfxGainId, unknown>>)
      : {};

  return ABILITY_SFX_GAIN_IDS.reduce(
    (acc, id) => {
      const raw = source[id];
      acc[id] =
        typeof raw === "number" && Number.isFinite(raw)
          ? Math.max(0, Math.min(1, raw))
          : DEFAULT_ABILITY_SFX_GAINS[id];
      return acc;
    },
    {} as Record<AbilitySfxGainId, number>,
  );
}
