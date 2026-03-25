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

function getSkillPriority(skillId: AbilitySkillId): number {
  switch (skillId) {
    case 'quantum_shift':
    case 'plasma_charge':
      return 0;
    case 'classic_guard':
      return 1;
    case 'ember_blast':
    case 'nova_blast':
    case 'electric_blitz':
    case 'cosmic_bigbang':
      return 2;
    default:
      return 99;
  }
}

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
    if (left.step !== right.step) return left.step - right.step;
    const leftPriority = getSkillPriority(left.skillId);
    const rightPriority = getSkillPriority(right.skillId);
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.order - right.order;
  });
}

function getNovaPositions(origin: Position): Position[] {
  const positions: Position[] = [origin];
  for (const distance of [1, 2]) {
    positions.push(
      { row: origin.row - distance, col: origin.col - distance },
      { row: origin.row - distance, col: origin.col + distance },
      { row: origin.row + distance, col: origin.col - distance },
      { row: origin.row + distance, col: origin.col + distance },
    );
  }
  return positions.filter(
    (position) =>
      position.row >= 0 &&
      position.row <= 4 &&
      position.col >= 0 &&
      position.col <= 4,
  );
}

function getLinePositions(start: Position, path: Position[]): Position[] {
  return [start, ...path];
}

function sortStepReservations(
  reservations: Array<{ color: PlayerColor; reservation: AbilitySkillReservation }>,
) {
  return [...reservations].sort((left, right) => {
    if (left.reservation.step !== right.reservation.step) {
      return left.reservation.step - right.reservation.step;
    }
    const leftPriority = getSkillPriority(left.reservation.skillId);
    const rightPriority = getSkillPriority(right.reservation.skillId);
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
  const escapeeColor: PlayerColor = attackerColor === 'red' ? 'blue' : 'red';
  const escaperPath = escapeeColor === 'red' ? redPath : bluePath;
  const startsOverlapped = samePosition(redStart, blueStart);
  const ignoreStartTileCollision = startsOverlapped && escaperPath.length > 0;
  const escaperHasStepZeroGuard =
    (escapeeColor === 'red' ? redReservations : blueReservations).some(
      (reservation) =>
        reservation.skillId === 'classic_guard' && reservation.step === 0,
    );

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
      const fullPath = color === 'red' ? redPath : bluePath;
      const path = fullPath.slice(reservation.step);
      const affectedPositions = getLinePositions(currentPos, path);
      const opponentProtected = opponentColor === 'red' ? redInv > 0 : blueInv > 0;
      if (affectedPositions.some((position) => samePosition(position, opponentPos)) && !opponentProtected) {
        if (opponentColor === 'red') {
          redHp = Math.max(0, redHp - 1);
          collisions.push({
            step: reservation.step,
            position: { ...opponentPos },
            escapeeColor: 'red',
            newHp: redHp,
          });
        } else {
          blueHp = Math.max(0, blueHp - 1);
          collisions.push({
            step: reservation.step,
            position: { ...opponentPos },
            escapeeColor: 'blue',
            newHp: blueHp,
          });
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
        [],
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
      return;
    }

    if (reservation.skillId === 'nova_blast') {
      const affectedPositions = getNovaPositions(currentPos).filter(
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
      return;
    }

    if (reservation.skillId === 'cosmic_bigbang') {
      const affectedPositions: Position[] = [];
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
          affectedPositions.push({ row, col });
        }
      }
      const damages: AbilityDamageEvent[] = [];
      const opponentProtected = opponentColor === 'red' ? redInv > 0 : blueInv > 0;
      if (!opponentProtected) {
        if (opponentColor === 'red') {
          redHp = Math.max(0, redHp - 2);
          damages.push({ color: 'red', newHp: redHp, position: { ...opponentPos } });
        } else {
          blueHp = Math.max(0, blueHp - 2);
          damages.push({ color: 'blue', newHp: blueHp, position: { ...opponentPos } });
        }
      }
      if (color === 'red') {
        redMana = Math.max(0, casterMana - 10);
      } else {
        blueMana = Math.max(0, casterMana - 10);
      }
      applyDamages(color, damages, reservation.skillId, reservation.step, reservation.order, affectedPositions);
    }
  };

  for (let step = 0; step <= maxStep; step++) {
    if (step === 0 && startsOverlapped && !ignoreStartTileCollision) {
      const protectedByGuard =
        (escapeeColor === 'red' ? redInv > 0 : blueInv > 0) ||
        escaperHasStepZeroGuard;
      if (!protectedByGuard) {
        if (escapeeColor === 'red') {
          redHp = Math.max(0, redHp - 1);
          collisions.push({
            step: 0,
            position: { ...redStart },
            escapeeColor,
            newHp: redHp,
          });
        } else {
          blueHp = Math.max(0, blueHp - 1);
          collisions.push({
            step: 0,
            position: { ...blueStart },
            escapeeColor,
            newHp: blueHp,
          });
        }
      }
    }

    if (step > 0) {
      const redPrev = { ...redPos };
      const bluePrev = { ...bluePos };
      if (!redBlitz && step <= redPath.length) redPos = { ...redPath[step - 1] };
      if (!blueBlitz && step <= bluePath.length) bluePos = { ...bluePath[step - 1] };

      const overlappingAfterBlitz =
        (redBlitz || blueBlitz) && samePosition(redPos, bluePos);

      if (!overlappingAfterBlitz && positionsTouch(redPos, redPrev, bluePos, bluePrev)) {
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
