"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ABILITY_SKILL_COSTS = void 0;
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
    aurora_heal: 8,
    gold_overdrive: 8,
    quantum_shift: 4,
    plasma_charge: 2,
    void_cloak: 4,
    electric_blitz: 6,
    cosmic_bigbang: 10,
};
