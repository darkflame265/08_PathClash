"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyAbilityRoundStartLifecycle = applyAbilityRoundStartLifecycle;
function samePosition(left, right) {
    return left.row === right.row && left.col === right.col;
}
function getRandomTeleportPosition(current, opponent, boardSize, random) {
    const candidates = [];
    for (let row = 0; row < boardSize; row += 1) {
        for (let col = 0; col < boardSize; col += 1) {
            if (row === opponent.row && col === opponent.col)
                continue;
            candidates.push({ row, col });
        }
    }
    const filtered = candidates.filter((position) => !samePosition(position, current));
    const pool = filtered.length > 0 ? filtered : candidates;
    return pool[Math.floor(random() * pool.length)] ?? { ...current };
}
function resetPlayerForPlanning(player, pathSubmitted, maxMana, manaPerTurn, overdriveMana) {
    player.pathSubmitted = player.connected === false ? true : pathSubmitted;
    player.plannedPath = [];
    player.plannedSkills = [];
    player.hidden = false;
    player.overdriveActive = false;
    player.reboundLocked = false;
    if (player.pendingOverdriveStage === 1) {
        player.mana = overdriveMana;
        player.overdriveActive = true;
        player.pendingOverdriveStage = 2;
        player.pendingManaBonus = 0;
        return;
    }
    if (player.pendingOverdriveStage === 2) {
        player.mana = 0;
        player.reboundLocked = true;
        player.pendingOverdriveStage = 0;
        player.pendingManaBonus = 0;
        return;
    }
    player.mana = Math.min(maxMana, player.mana + manaPerTurn + player.pendingManaBonus);
    player.pendingManaBonus = 0;
}
function applyAbilityRoundStartLifecycle(red, blue, options) {
    const boardSize = options.boardSize ?? 5;
    const random = options.random ?? Math.random;
    resetPlayerForPlanning(red, options.redPathSubmitted ?? false, options.maxMana, options.manaPerTurn, options.overdriveMana);
    resetPlayerForPlanning(blue, options.bluePathSubmitted ?? false, options.maxMana, options.manaPerTurn, options.overdriveMana);
    if (red.pendingVoidCloak) {
        red.position = getRandomTeleportPosition(red.position, blue.position, boardSize, random);
        red.hidden = true;
        red.pendingVoidCloak = false;
    }
    if (blue.pendingVoidCloak) {
        blue.position = getRandomTeleportPosition(blue.position, red.position, boardSize, random);
        blue.hidden = true;
        blue.pendingVoidCloak = false;
    }
}
