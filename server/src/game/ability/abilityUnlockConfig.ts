import fs from 'fs';
import path from 'path';
import type { PieceSkin } from '../../types/game.types';
import type { AbilitySkillId } from './AbilityTypes';

const SKILL_BY_SKIN: Partial<Record<PieceSkin, AbilitySkillId>> = {
  arc_reactor: 'arc_reactor_field',
  atomic: 'atomic_fission',
  aurora: 'aurora_heal',
  berserker: 'berserker_rage',
  chronos: 'chronos_time_rewind',
  cosmic: 'cosmic_bigbang',
  electric_core: 'electric_blitz',
  ember: 'ember_blast',
  gold_core: 'gold_overdrive',
  inferno: 'inferno_field',
  neon_pulse: 'phase_shift',
  nova: 'nova_blast',
  plasma: 'plasma_charge',
  quantum: 'quantum_shift',
  sun: 'sun_chariot',
  void: 'void_cloak',
  wizard: 'wizard_magic_mine',
};

const DEFAULT_ARENA_REWARD_SKINS: Record<number, PieceSkin[]> = {
  1: ['cosmic', 'plasma'],
  2: ['neon_pulse', 'quantum'],
  3: ['inferno', 'berserker'],
  4: ['electric_core'],
  5: ['wizard'],
  6: ['sun', 'gold_core'],
  8: ['atomic', 'arc_reactor'],
  10: ['chronos'],
};

export const WIN_UNLOCKED_ABILITY_SKILLS: AbilitySkillId[] = [
  'ember_blast',
  'nova_blast',
  'aurora_heal',
  'void_cloak',
];

export const WIN_REQUIREMENT_BY_ABILITY_SKILL: Partial<
  Record<AbilitySkillId, number>
> = {
  ember_blast: 10,
  nova_blast: 50,
  aurora_heal: 100,
  void_cloak: 500,
};

function getArenaCatalogCandidates(): string[] {
  return [
    path.resolve(process.cwd(), 'client/src/data/arenaCatalog.ts'),
    path.resolve(process.cwd(), '../client/src/data/arenaCatalog.ts'),
    path.resolve(__dirname, '../../../../../client/src/data/arenaCatalog.ts'),
    path.resolve(__dirname, '../../../../client/src/data/arenaCatalog.ts'),
  ];
}

function parseArenaRewardSkins(source: string): Record<number, PieceSkin[]> {
  const match = source.match(
    /ARENA_REWARD_SKINS[\s\S]*?=\s*\{([\s\S]*?)\};/,
  );
  if (!match) return DEFAULT_ARENA_REWARD_SKINS;

  const rewards: Record<number, PieceSkin[]> = {};
  const entryPattern = /(\d+)\s*:\s*\[([^\]]*)\]/g;
  let entry: RegExpExecArray | null;
  while ((entry = entryPattern.exec(match[1])) !== null) {
    const arena = Number(entry[1]);
    const skins = Array.from(entry[2].matchAll(/["']([^"']+)["']/g)).map(
      (skinMatch) => skinMatch[1] as PieceSkin,
    );
    if (Number.isFinite(arena) && skins.length > 0) {
      rewards[arena] = skins;
    }
  }

  return Object.keys(rewards).length > 0 ? rewards : DEFAULT_ARENA_REWARD_SKINS;
}

function loadArenaRewardSkins(): Record<number, PieceSkin[]> {
  for (const candidate of getArenaCatalogCandidates()) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return parseArenaRewardSkins(fs.readFileSync(candidate, 'utf8'));
    } catch (error) {
      console.warn('[ability-unlocks] failed to read arena catalog:', error);
    }
  }
  return DEFAULT_ARENA_REWARD_SKINS;
}

export function getFakeAiAbilitySkillPool(arena: number): AbilitySkillId[] {
  const normalizedArena = Math.max(1, Math.min(10, Math.trunc(arena)));
  const arenaRewardSkins = loadArenaRewardSkins();
  const skills = new Set<AbilitySkillId>();

  for (const [arenaKey, skins] of Object.entries(arenaRewardSkins)) {
    if (Number(arenaKey) > normalizedArena) continue;
    for (const skin of skins) {
      const skill = SKILL_BY_SKIN[skin];
      if (skill) skills.add(skill);
    }
  }

  for (const skill of WIN_UNLOCKED_ABILITY_SKILLS) {
    skills.add(skill);
  }

  return Array.from(skills);
}
