import type { AbilitySkillId } from '../game/ability/AbilityTypes';
import type { PieceSkin } from '../types/game.types';
import { supabaseAdmin } from '../lib/supabase';

// 로테이션 후보 풀 — 구매 스킨 연결 스킬만 포함 (승리 기반/기본 제외)
const ROTATION_POOL: Record<'common' | 'rare' | 'legendary', AbilitySkillId[]> = {
  common: ['plasma_charge', 'gold_overdrive', 'phase_shift', 'inferno_field', 'quantum_shift'],
  rare: ['cosmic_bigbang', 'arc_reactor_field', 'electric_blitz'],
  legendary: ['wizard_magic_mine', 'chronos_time_rewind', 'atomic_fission', 'sun_chariot'],
};

// 각 로테이션 스킬에 연결된 스킨 (만료 시 소유 여부 확인용)
const ROTATION_SKILL_TO_SKIN: Partial<Record<AbilitySkillId, PieceSkin>> = {
  plasma_charge: 'plasma',
  gold_overdrive: 'gold_core',
  phase_shift: 'neon_pulse',
  inferno_field: 'inferno',
  quantum_shift: 'quantum',
  cosmic_bigbang: 'cosmic',
  arc_reactor_field: 'arc_reactor',
  electric_blitz: 'electric_core',
  wizard_magic_mine: 'wizard',
  chronos_time_rewind: 'chronos',
  atomic_fission: 'atomic',
  sun_chariot: 'sun',
};

const ALL_ROTATION_SKILLS = new Set<AbilitySkillId>([
  ...ROTATION_POOL.common,
  ...ROTATION_POOL.rare,
  ...ROTATION_POOL.legendary,
]);

interface RotationState {
  date: string;
  skills: AbilitySkillId[]; // [common, rare, legendary]
}

let currentRotation: RotationState | null = null;

function getUtcDateKey(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function pickRandom<T>(pool: T[], exclude: T[]): T {
  const candidates = pool.filter((s) => !exclude.includes(s));
  const source = candidates.length > 0 ? candidates : pool;
  return source[Math.floor(Math.random() * source.length)];
}

async function generateAndSaveRotation(excludeSkills: AbilitySkillId[]): Promise<AbilitySkillId[]> {
  const common = pickRandom(ROTATION_POOL.common, excludeSkills);
  const rare = pickRandom(ROTATION_POOL.rare, excludeSkills);
  const legendary = pickRandom(ROTATION_POOL.legendary, excludeSkills);
  const skills: AbilitySkillId[] = [common, rare, legendary];

  const dateKey = getUtcDateKey();
  const { error: upsertError } = await supabaseAdmin
    ?.from('skill_rotations')
    .upsert({ date: dateKey, common_skill: common, rare_skill: rare, legendary_skill: legendary })
    ?? { error: null };
  if (upsertError) console.error('[rotation] upsert failed:', upsertError);

  return skills;
}

async function loadOrCreateRotation(): Promise<AbilitySkillId[]> {
  const todayKey = getUtcDateKey();
  const yesterdayKey = getUtcDateKey(-1);

  // 오늘 로테이션이 이미 DB에 있으면 반환
  const { data: todayRow } = await supabaseAdmin
    ?.from('skill_rotations')
    .select('common_skill, rare_skill, legendary_skill')
    .eq('date', todayKey)
    .maybeSingle() ?? { data: null };

  if (todayRow) {
    return [
      todayRow.common_skill as AbilitySkillId,
      todayRow.rare_skill as AbilitySkillId,
      todayRow.legendary_skill as AbilitySkillId,
    ];
  }

  // 어제 로테이션을 읽어 제외 목록 구성
  const { data: yesterdayRow } = await supabaseAdmin
    ?.from('skill_rotations')
    .select('common_skill, rare_skill, legendary_skill')
    .eq('date', yesterdayKey)
    .maybeSingle() ?? { data: null };

  const excludeSkills: AbilitySkillId[] = yesterdayRow
    ? [
        yesterdayRow.common_skill as AbilitySkillId,
        yesterdayRow.rare_skill as AbilitySkillId,
        yesterdayRow.legendary_skill as AbilitySkillId,
      ]
    : [];

  return generateAndSaveRotation(excludeSkills);
}

let resetTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleNextReset(): void {
  if (resetTimeout !== null) clearTimeout(resetTimeout);
  const now = Date.now();
  const nextMidnightUtc = new Date();
  nextMidnightUtc.setUTCHours(24, 0, 0, 0);
  const delay = Math.max(1_000, nextMidnightUtc.getTime() - now);

  resetTimeout = setTimeout(async () => {
    resetTimeout = null;
    await resetRotation();
  }, delay);
}

async function resetRotation(): Promise<void> {
  try {
    const skills = await loadOrCreateRotation();
    currentRotation = { date: getUtcDateKey(), skills };
    console.log('[rotation] reset:', currentRotation);
  } catch (err) {
    console.error('[rotation] resetRotation error:', err);
  }
  scheduleNextReset();
}

/** 서버 시작 시 1회 호출 */
export async function initRotation(): Promise<void> {
  try {
    const skills = await loadOrCreateRotation();
    currentRotation = { date: getUtcDateKey(), skills };
    console.log('[rotation] initialized:', currentRotation);
  } catch (err) {
    console.error('[rotation] initRotation error:', err);
    currentRotation = null;
  }
  scheduleNextReset();
}

/** 현재 로테이션 스킬 3개 반환. 초기화 전이면 빈 배열 */
export function getCurrentRotation(): AbilitySkillId[] {
  return currentRotation?.skills ?? [];
}

/** 이 스킬이 로테이션 후보 풀에 속하는지 */
export function isRotationSkill(skillId: AbilitySkillId): boolean {
  return ALL_ROTATION_SKILLS.has(skillId);
}

/** 이 스킬에 연결된 스킨 ID 반환. 풀 밖이면 null */
export function getRotationSkillSkin(skillId: AbilitySkillId): PieceSkin | null {
  return ROTATION_SKILL_TO_SKIN[skillId] ?? null;
}
