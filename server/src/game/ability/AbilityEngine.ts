import type {
  CollisionEvent,
  PlayerColor,
  Position,
} from '../../types/game.types';
import type {
  AbilityDamageEvent,
  AbilityPlayerState,
  AbilityResolutionPayload,
  AbilitySkillEvent,
  AbilitySkillId,
  AbilitySkillReservation,
} from './AbilityTypes';

const GUARD_STEPS = 2;
const CHARGE_MANA_BONUS = 4;

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function positionsTouch(aNow: Position, aPrev: Position, bNow: Position, bPrev: Position): boolean {
  return (
    samePosition(aNow, bNow) ||
    (samePosition(aNow, bPrev) && samePosition(bNow, aPrev))
  );
}

function getCrossPositions(origin: Position): Position[] {
  return [
    origin,
    { row: origin.row - 1, col: origin.col },
    { row: origin.row + 1, col: origin.col },
    { row: origin.row, col: origin.col - 1 },
    { row: origin.row, col: origin.col + 1 },
  ].filter((position) => position.row >= 0 && position.row <= 4 && position.col >= 0 && position.col <= 4);
}

function sortReservations(reservations: AbilitySkillReservation[]): AbilitySkillReservation[] {
  return [...reservations].sort((left, right) => {
    const leftPriority = left.skillId === 'classic_guard' ? -1 : 0;
    const rightPriority = right.skillId === 'classic_guard' ? -1 : 0;
    if (left.step !== right.step) return left.step - right.step;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.order - right.order;
  });
}

function getLinePositions(start: Position, path: Position[]): Position[] {
  return [start, ...path];
}

function sortStepReservations(
  reservations: Array<{ color: PlayerColor; reservation: AbilitySkillReservation }>,
) {
  return [...reservations].sort((left, right) => {
    const leftPriority = left.reservation.skillId === 'classic_guard' ? -1 : 0;
    const rightPriority = right.reservation.skillId === 'classic_guard' ? -1 : 0;
    if (left.reservation.step !== right.reservation.step) {
      return left.reservation.step - right.reservation.step;
    }
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.reservation.order - right.reservation.order;
  });
}

export function resolveAbilityRound(params: {
  red: AbilityPlayerState;
  blue: AbilityPlayerState;
  attackerColor: PlayerColor;
  obstacles: Position[];
}): {
  payload: AbilityResolutionPayload;
  redState: Pick<AbilityPlayerState, 'position' | 'hp' | 'mana' | 'invulnerableSteps' | 'pendingManaBonus'>;
  blueState: Pick<AbilityPlayerState, 'position' | 'hp' | 'mana' | 'invulnerableSteps' | 'pendingManaBonus'>;
  winner: PlayerColor | 'draw' | null;
} {
  const { red, blue, attackerColor, obstacles } = params;
  const redStart = { ...red.position };
  const blueStart = { ...blue.position };
  const redPath = [...red.plannedPath];
  const bluePath = [...blue.plannedPath];
  const collisions: CollisionEvent[] = [];
  const skillEvents: AbilitySkillEvent[] = [];

  let redPos = { ...red.position };
  let bluePos = { ...blue.position };
  let redHp = red.hp;
  let blueHp = blue.hp;
  let redMana = red.mana;
  let blueMana = blue.mana;
  let redInv = red.invulnerableSteps;
  let blueInv = blue.invulnerableSteps;
  let redPendingManaBonus = red.pendingManaBonus;
  let bluePendingManaBonus = blue.pendingManaBonus;
  let redBlitz = false;
  let blueBlitz = false;

  const redReservations = sortReservations(red.plannedSkills);
  const blueReservations = sortReservations(blue.plannedSkills);
  const maxStep = Math.max(redPath.length, bluePath.length);

  const applyDamages = (
    sourceColor: PlayerColor,
    damages: AbilityDamageEvent[],
    skillId: AbilitySkillId,
    step: number,
    order: number,
    affectedPositions: Position[],
  ) => {
    skillEvents.push({
      step,
      order,
      color: sourceColor,
      skillId,
      affectedPositions,
      damages,
    });
  };

  const processSkill = (color: PlayerColor, reservation: AbilitySkillReservation) => {
    const currentPos = color === 'red' ? redPos : bluePos;
    const opponentPos = color === 'red' ? bluePos : redPos;
    const opponentColor: PlayerColor = color === 'red' ? 'blue' : 'red';
    const casterMana = color === 'red' ? redMana : blueMana;
    const casterInv = color === 'red' ? redInv : blueInv;
    void casterInv;

    if (reservation.skillId === 'classic_guard') {
      if (color === 'red') {
        redInv = GUARD_STEPS;
        redMana = Math.max(0, casterMana - 4);
      } else {
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
      } else {
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

    if (reservation.skillId === 'plasma_charge') {
      if (color === 'red') {
        redMana = Math.max(0, casterMana - 2);
        redPendingManaBonus = CHARGE_MANA_BONUS;
      } else {
        blueMana = Math.max(0, casterMana - 2);
        bluePendingManaBonus = CHARGE_MANA_BONUS;
      }
      skillEvents.push({
        step: reservation.step,
        order: reservation.order,
        color,
        skillId: reservation.skillId,
      });
      return;
    }

    if (reservation.skillId === 'electric_blitz') {
      const path = color === 'red' ? redPath : bluePath;
      const affectedPositions = getLinePositions(currentPos, path);
      const damages: AbilityDamageEvent[] = [];
      const opponentProtected = opponentColor === 'red' ? redInv > 0 : blueInv > 0;
      if (affectedPositions.some((position) => samePosition(position, opponentPos)) && !opponentProtected) {
        if (opponentColor === 'red') {
          redHp = Math.max(0, redHp - 1);
          damages.push({ color: 'red', newHp: redHp, position: { ...opponentPos } });
        } else {
          blueHp = Math.max(0, blueHp - 1);
          damages.push({ color: 'blue', newHp: blueHp, position: { ...opponentPos } });
        }
      }
      if (color === 'red') {
        redMana = Math.max(0, casterMana - 6);
        redPos = { ...(path[path.length - 1] ?? currentPos) };
        redBlitz = true;
      } else {
        blueMana = Math.max(0, casterMana - 6);
        bluePos = { ...(path[path.length - 1] ?? currentPos) };
        blueBlitz = true;
      }
      applyDamages(
        color,
        damages,
        reservation.skillId,
        reservation.step,
        reservation.order,
        affectedPositions,
      );
      const lastEvent = skillEvents[skillEvents.length - 1];
      if (lastEvent && lastEvent.skillId === reservation.skillId && lastEvent.step === reservation.step && lastEvent.order === reservation.order && lastEvent.color === color) {
        lastEvent.from = { ...currentPos };
        lastEvent.to = { ...(path[path.length - 1] ?? currentPos) };
      }
      return;
    }

    if (reservation.skillId === 'ember_blast') {
      const affectedPositions = getCrossPositions(currentPos).filter(
        (position) => !obstacles.some((obstacle) => samePosition(obstacle, position)),
      );
      const damages: AbilityDamageEvent[] = [];
      const opponentProtected = opponentColor === 'red' ? redInv > 0 : blueInv > 0;
      if (affectedPositions.some((position) => samePosition(position, opponentPos)) && !opponentProtected) {
        if (opponentColor === 'red') {
          redHp = Math.max(0, redHp - 1);
          damages.push({ color: 'red', newHp: redHp, position: { ...opponentPos } });
        } else {
          blueHp = Math.max(0, blueHp - 1);
          damages.push({ color: 'blue', newHp: blueHp, position: { ...opponentPos } });
        }
      }
      if (color === 'red') {
        redMana = Math.max(0, casterMana - 4);
      } else {
        blueMana = Math.max(0, casterMana - 4);
      }
      applyDamages(color, damages, reservation.skillId, reservation.step, reservation.order, affectedPositions);
    }
  };

  for (let step = 0; step <= maxStep; step++) {
    if (step > 0) {
      const redPrev = { ...redPos };
      const bluePrev = { ...bluePos };
      if (!redBlitz && step <= redPath.length) redPos = { ...redPath[step - 1] };
      if (!blueBlitz && step <= bluePath.length) bluePos = { ...bluePath[step - 1] };

      if (positionsTouch(redPos, redPrev, bluePos, bluePrev)) {
        const escapeeColor: PlayerColor = attackerColor === 'red' ? 'blue' : 'red';
        const protectedByGuard = escapeeColor === 'red' ? redInv > 0 : blueInv > 0;
        if (!protectedByGuard) {
          if (escapeeColor === 'red') {
            redHp = Math.max(0, redHp - 1);
            collisions.push({ step, position: { ...redPos }, escapeeColor, newHp: redHp });
          } else {
            blueHp = Math.max(0, blueHp - 1);
            collisions.push({ step, position: { ...bluePos }, escapeeColor, newHp: blueHp });
          }
        }
      }

      if (redInv > 0) redInv -= 1;
      if (blueInv > 0) blueInv -= 1;
    }

    const stepReservations = sortStepReservations([
      ...redReservations
        .filter((item) => item.step === step)
        .map((reservation) => ({ color: 'red' as const, reservation })),
      ...blueReservations
        .filter((item) => item.step === step)
        .map((reservation) => ({ color: 'blue' as const, reservation })),
    ]);

    for (const { color, reservation } of stepReservations) {
      processSkill(color, reservation);
    }
  }

  let winner: PlayerColor | 'draw' | null = null;
  if (redHp <= 0 && blueHp <= 0) winner = 'draw';
  else if (redHp <= 0) winner = 'blue';
  else if (blueHp <= 0) winner = 'red';

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
      pendingManaBonus: redPendingManaBonus,
    },
    blueState: {
      position: bluePos,
      hp: blueHp,
      mana: blueMana,
      invulnerableSteps: blueInv,
      pendingManaBonus: bluePendingManaBonus,
    },
    winner,
  };
}
