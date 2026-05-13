"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WIN_REQUIREMENT_BY_ABILITY_SKILL = exports.WIN_UNLOCKED_ABILITY_SKILLS = void 0;
exports.getFakeAiAbilitySkillPool = getFakeAiAbilitySkillPool;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const SKILL_BY_SKIN = {
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
    moonlight_seed: 'root_wall',
    neon_pulse: 'phase_shift',
    nova: 'nova_blast',
    plasma: 'plasma_charge',
    quantum: 'quantum_shift',
    sun: 'sun_chariot',
    void: 'void_cloak',
    wizard: 'wizard_magic_mine',
    frost_heart: 'ice_field',
};
const DEFAULT_ARENA_REWARD_SKINS = {
    1: ['cosmic', 'plasma'],
    2: ['neon_pulse', 'quantum'],
    3: ['inferno', 'berserker'],
    4: ['electric_core'],
    5: ['wizard'],
    6: ['sun', 'gold_core'],
    7: ['moonlight_seed'],
    8: ['atomic', 'arc_reactor'],
    9: ['frost_heart'],
    10: ['chronos'],
};
exports.WIN_UNLOCKED_ABILITY_SKILLS = [
    'ember_blast',
    'nova_blast',
    'aurora_heal',
    'void_cloak',
];
exports.WIN_REQUIREMENT_BY_ABILITY_SKILL = {
    ember_blast: 10,
    nova_blast: 50,
    aurora_heal: 100,
    void_cloak: 500,
};
function getArenaCatalogCandidates() {
    return [
        path_1.default.resolve(process.cwd(), 'client/src/data/arenaCatalog.ts'),
        path_1.default.resolve(process.cwd(), '../client/src/data/arenaCatalog.ts'),
        path_1.default.resolve(__dirname, '../../../../../client/src/data/arenaCatalog.ts'),
        path_1.default.resolve(__dirname, '../../../../client/src/data/arenaCatalog.ts'),
    ];
}
function parseArenaRewardSkins(source) {
    const match = source.match(/ARENA_REWARD_SKINS[\s\S]*?=\s*\{([\s\S]*?)\};/);
    if (!match)
        return DEFAULT_ARENA_REWARD_SKINS;
    const rewards = {};
    const entryPattern = /(\d+)\s*:\s*\[([^\]]*)\]/g;
    let entry;
    while ((entry = entryPattern.exec(match[1])) !== null) {
        const arena = Number(entry[1]);
        const skins = Array.from(entry[2].matchAll(/["']([^"']+)["']/g)).map((skinMatch) => skinMatch[1]);
        if (Number.isFinite(arena) && skins.length > 0) {
            rewards[arena] = skins;
        }
    }
    return Object.keys(rewards).length > 0 ? rewards : DEFAULT_ARENA_REWARD_SKINS;
}
function loadArenaRewardSkins() {
    for (const candidate of getArenaCatalogCandidates()) {
        if (!fs_1.default.existsSync(candidate))
            continue;
        try {
            return parseArenaRewardSkins(fs_1.default.readFileSync(candidate, 'utf8'));
        }
        catch (error) {
            console.warn('[ability-unlocks] failed to read arena catalog:', error);
        }
    }
    return DEFAULT_ARENA_REWARD_SKINS;
}
function getFakeAiAbilitySkillPool(arena) {
    const normalizedArena = Math.max(1, Math.min(10, Math.trunc(arena)));
    const arenaRewardSkins = loadArenaRewardSkins();
    const skills = new Set();
    for (const [arenaKey, skins] of Object.entries(arenaRewardSkins)) {
        if (Number(arenaKey) > normalizedArena)
            continue;
        for (const skin of skins) {
            const skill = SKILL_BY_SKIN[skin];
            if (skill)
                skills.add(skill);
        }
    }
    for (const skill of exports.WIN_UNLOCKED_ABILITY_SKILLS) {
        skills.add(skill);
    }
    return Array.from(skills);
}
