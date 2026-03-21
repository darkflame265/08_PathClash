"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAbilityRound = resolveAbilityRound;
const GUARD_STEPS = 3;
function samePosition(a, b) {
    return a.row === b.row && a.col === b.col;
}
function positionsTouch(aNow, aPrev, bNow, bPrev) {
    return (samePosition(aNow, bNow) ||
        (samePosition(aNow, bPrev) && samePosition(bNow, aPrev)));
}
function getCrossPositions(origin) {
    return [
        origin,
        { row: origin.row - 1, col: origin.col },
        { row: origin.row + 1, col: origin.col },
        { row: origin.row, col: origin.col - 1 },
        { row: origin.row, col: origin.col + 1 },
    ].filter((position) => position.row >= 0 && position.row <= 4 && position.col >= 0 && position.col <= 4);
}
function sortReservations(reservations) {
    return [...reservations].sort((left, right) => {
        const leftPriority = left.skillId === 'classic_guard' ? -1 : 0;
        const rightPriority = right.skillId === 'classic_guard' ? -1 : 0;
        if (left.step !== right.step)
            return left.step - right.step;
        if (leftPriority !== rightPriority)
            return leftPriority - rightPriority;
        return left.order - right.order;
    });
}
function resolveAbilityRound(params) {
    const { red, blue, attackerColor, obstacles } = params;
    const redStart = { ...red.position };
    const blueStart = { ...blue.position };
    const redPath = [...red.plannedPath];
    const bluePath = [...blue.plannedPath];
    const collisions = [];
    const skillEvents = [];
    let redPos = { ...red.position };
    let bluePos = { ...blue.position };
    let redHp = red.hp;
    let blueHp = blue.hp;
    let redMana = red.mana;
    let blueMana = blue.mana;
    let redInv = red.invulnerableSteps;
    let blueInv = blue.invulnerableSteps;
    const redReservations = sortReservations(red.plannedSkills);
    const blueReservations = sortReservations(blue.plannedSkills);
    const maxStep = Math.max(redPath.length, bluePath.length);
    const applyDamages = (sourceColor, damages, skillId, step, order, affectedPositions) => {
        skillEvents.push({
            step,
            order,
            color: sourceColor,
            skillId,
            affectedPositions,
            damages,
        });
    };
    const processSkill = (color, reservation) => {
        const currentPos = color === 'red' ? redPos : bluePos;
        const opponentPos = color === 'red' ? bluePos : redPos;
        const opponentColor = color === 'red' ? 'blue' : 'red';
        const casterMana = color === 'red' ? redMana : blueMana;
        const casterInv = color === 'red' ? redInv : blueInv;
        void casterInv;
        if (reservation.skillId === 'classic_guard') {
            if (color === 'red') {
                redInv = GUARD_STEPS;
                redMana = Math.max(0, casterMana - 4);
            }
            else {
                blueInv = GUARD_STEPS;
                blueMana = Math.max(0, casterMana - 4);
            }
            skillEvents.push({
                step: reservation.step,
                order: reservation.order,
                color,
                skillId: reservation.skillId,
                invulnerableSteps: GUARD_STEPS,
            });
            return;
        }
        if (reservation.skillId === 'quantum_shift' && reservation.target) {
            const from = { ...currentPos };
            if (color === 'red') {
                redPos = { ...reservation.target };
                redMana = Math.max(0, casterMana - 3);
            }
            else {
                bluePos = { ...reservation.target };
                blueMana = Math.max(0, casterMana - 3);
            }
            skillEvents.push({
                step: reservation.step,
                order: reservation.order,
                color,
                skillId: reservation.skillId,
                from,
                to: reservation.target,
            });
            return;
        }
        if (reservation.skillId === 'ember_blast') {
            const affectedPositions = getCrossPositions(currentPos).filter((position) => !obstacles.some((obstacle) => samePosition(obstacle, position)));
            const damages = [];
            const opponentProtected = opponentColor === 'red' ? redInv > 0 : blueInv > 0;
            if (affectedPositions.some((position) => samePosition(position, opponentPos)) && !opponentProtected) {
                if (opponentColor === 'red') {
                    redHp = Math.max(0, redHp - 1);
                    damages.push({ color: 'red', newHp: redHp, position: { ...opponentPos } });
                }
                else {
                    blueHp = Math.max(0, blueHp - 1);
                    damages.push({ color: 'blue', newHp: blueHp, position: { ...opponentPos } });
                }
            }
            if (color === 'red') {
                redMana = Math.max(0, casterMana - 4);
            }
            else {
                blueMana = Math.max(0, casterMana - 4);
            }
            applyDamages(color, damages, reservation.skillId, reservation.step, reservation.order, affectedPositions);
        }
    };
    for (let step = 0; step <= maxStep; step++) {
        if (step > 0) {
            const redPrev = { ...redPos };
            const bluePrev = { ...bluePos };
            if (step <= redPath.length)
                redPos = { ...redPath[step - 1] };
            if (step <= bluePath.length)
                bluePos = { ...bluePath[step - 1] };
            if (positionsTouch(redPos, redPrev, bluePos, bluePrev)) {
                const escapeeColor = attackerColor === 'red' ? 'blue' : 'red';
                const protectedByGuard = escapeeColor === 'red' ? redInv > 0 : blueInv > 0;
                if (!protectedByGuard) {
                    if (escapeeColor === 'red') {
                        redHp = Math.max(0, redHp - 1);
                        collisions.push({ step, position: { ...redPos }, escapeeColor, newHp: redHp });
                    }
                    else {
                        blueHp = Math.max(0, blueHp - 1);
                        collisions.push({ step, position: { ...bluePos }, escapeeColor, newHp: blueHp });
                    }
                }
            }
            if (redInv > 0)
                redInv -= 1;
            if (blueInv > 0)
                blueInv -= 1;
        }
        for (const reservation of redReservations.filter((item) => item.step === step)) {
            processSkill('red', reservation);
        }
        for (const reservation of blueReservations.filter((item) => item.step === step)) {
            processSkill('blue', reservation);
        }
    }
    let winner = null;
    if (redHp <= 0 && blueHp <= 0)
        winner = 'draw';
    else if (redHp <= 0)
        winner = 'blue';
    else if (blueHp <= 0)
        winner = 'red';
    return {
        payload: {
            redPath,
            bluePath,
            redStart,
            blueStart,
            collisions,
            skillEvents,
        },
        redState: {
            position: redPos,
            hp: redHp,
            mana: redMana,
            invulnerableSteps: redInv,
        },
        blueState: {
            position: bluePos,
            hp: blueHp,
            mana: blueMana,
            invulnerableSteps: blueInv,
        },
        winner,
    };
}
