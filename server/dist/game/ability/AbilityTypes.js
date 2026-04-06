"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ABILITY_SKILL_SERVER_RULES = exports.ABILITY_SKILL_COSTS = void 0;
// Single source of truth for server-side mana costs.
// When balance changes happen, update this object and keep engine/validation
// logic reading from it instead of hard-coded subtractions.
exports.ABILITY_SKILL_COSTS = {
    classic_guard: 2,
    arc_reactor_field: 6,
    phase_shift: 8,
    ember_blast: 4,
    atomic_fission: 6,
    inferno_field: 6,
    nova_blast: 4,
    sun_chariot: 8,
    aurora_heal: 8,
    gold_overdrive: 8,
    quantum_shift: 4,
    plasma_charge: 2,
    void_cloak: 4,
    electric_blitz: 6,
    cosmic_bigbang: 10,
};
// Shared validation metadata for server-side planning rules.
// Keep common restrictions here so role/timing/target/cost rules do not drift
// between validation branches as new skills are added.
exports.ABILITY_SKILL_SERVER_RULES = {
    classic_guard: {
        roleRestriction: 'escaper',
        stepRule: 'zero_only',
        targetRule: 'none',
        requiresEmptyPathWhenNotOverdrive: true,
    },
    arc_reactor_field: {
        roleRestriction: 'escaper',
        stepRule: 'any',
        targetRule: 'none',
    },
    phase_shift: {
        roleRestriction: 'escaper',
        stepRule: 'zero_only',
        targetRule: 'none',
    },
    ember_blast: {
        roleRestriction: 'attacker',
        stepRule: 'any',
        targetRule: 'none',
    },
    atomic_fission: {
        roleRestriction: 'attacker',
        stepRule: 'zero_only',
        targetRule: 'none',
        requiresPreviousTurnPath: true,
    },
    inferno_field: {
        roleRestriction: 'attacker',
        stepRule: 'any',
        targetRule: 'position',
    },
    nova_blast: {
        roleRestriction: 'attacker',
        stepRule: 'any',
        targetRule: 'none',
    },
    sun_chariot: {
        roleRestriction: 'attacker',
        stepRule: 'any',
        targetRule: 'none',
    },
    aurora_heal: {
        roleRestriction: 'any',
        stepRule: 'any',
        targetRule: 'none',
    },
    gold_overdrive: {
        roleRestriction: 'escaper',
        stepRule: 'any',
        targetRule: 'none',
    },
    quantum_shift: {
        roleRestriction: 'any',
        stepRule: 'any',
        targetRule: 'position',
    },
    plasma_charge: {
        roleRestriction: 'any',
        stepRule: 'zero_only',
        targetRule: 'none',
        requiresEmptyPathWhenNotOverdrive: true,
    },
    void_cloak: {
        roleRestriction: 'any',
        stepRule: 'any',
        targetRule: 'none',
    },
    electric_blitz: {
        roleRestriction: 'attacker',
        stepRule: 'any',
        targetRule: 'position',
        exclusiveWhenNotOverdrive: true,
    },
    cosmic_bigbang: {
        roleRestriction: 'attacker',
        stepRule: 'zero_only',
        targetRule: 'none',
        requiresEmptyPathWhenNotOverdrive: true,
        exclusiveWhenNotOverdrive: true,
    },
};
