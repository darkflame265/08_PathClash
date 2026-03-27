import type {
  CollisionEvent,
  PlayerColor,
  Position,
} from '../../types/game.types';
import { ABILITY_SKILL_COSTS } from './AbilityTypes';
import type {
  AbilityDamageEvent,
  AbilityHealEvent,
  AbilityLavaTile,
  AbilityPlayerState,
  AbilityResolutionPayload,
  AbilitySkillEvent,
  AbilitySkillId,
  AbilitySkillReservation,
} from './AbilityTypes';

const GUARD_STEPS = 2;
const AT_FIELD_STEPS = 2;
const CHARGE_MANA_BONUS = 4;

function getSkillPriority(skillId: AbilitySkillId): number {
  switch (skillId) {
    case 'quantum_shift':
    case 'plasma_charge':
    case 'aurora_heal':
    case 'gold_overdrive':
    case 'void_cloak':
      return 0;
    case 'arc_reactor_field':
    case 'phase_shift':
    case 'classic_guard':
      return 1;
    case 'ember_blast':
    case 'atomic_fission':
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

function updateLavaTile(
  lavaTiles: AbilityLavaTile[],
  position: Position,
  remainingTurns: number,
) {
  const existing = lavaTiles.find((tile) => samePosition(tile.position, position));
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, remainingTurns);
    return;
  }
  lavaTiles.push({
    position: { ...position },
    remainingTurns,
  });
}

function isAffectedByLava(
  prev: Position,
  next: Position,
  lavaPosition: Position,
) {
  void prev;
  return samePosition(next, lavaPosition);
}

export function resolveAbilityRound(params: {
  red: AbilityPlayerState;
  blue: AbilityPlayerState;
  attackerColor: PlayerColor;
  obstacles: Position[];
  lavaTiles: AbilityLavaTile[];
}): {
  payload: AbilityResolutionPayload;
  redState: Pick<AbilityPlayerState, 'position' | 'hp' | 'mana' | 'invulnerableSteps' | 'pendingManaBonus' | 'pendingOverdriveStage' | 'pendingVoidCloak' | 'overdriveActive' | 'reboundLocked'>;
  blueState: Pick<AbilityPlayerState, 'position' | 'hp' | 'mana' | 'invulnerableSteps' | 'pendingManaBonus' | 'pendingOverdriveStage' | 'pendingVoidCloak' | 'overdriveActive' | 'reboundLocked'>;
  lavaTiles: AbilityLavaTile[];
  winner: PlayerColor | 'draw' | null;
} {
  const { red, blue, attackerColor, obstacles } = params;
  const redStart = { ...red.position };
  const blueStart = { ...blue.position };
  const redPath = [...red.plannedPath];
  const bluePath = [...blue.plannedPath];
  const collisions: CollisionEvent[] = [];
  const skillEvents: AbilitySkillEvent[] = [];
  const activeLavaTiles: AbilityLavaTile[] = params.lavaTiles.map((tile) => ({
    position: { ...tile.position },
    remainingTurns: tile.remainingTurns,
  }));

  let redPos = { ...red.position };
  let bluePos = { ...blue.position };
  let redHp = red.hp;
  let blueHp = blue.hp;
  let redMana = red.mana;
  let blueMana = blue.mana;
  let redInv = red.invulnerableSteps;
  let blueInv = blue.invulnerableSteps;
  let redAtFieldSteps = 0;
  let blueAtFieldSteps = 0;
  let redPhaseShift = false;
  let bluePhaseShift = false;
  let redPendingManaBonus = red.pendingManaBonus;
  let bluePendingManaBonus = blue.pendingManaBonus;
  let redPendingOverdriveStage = red.pendingOverdriveStage;
  let bluePendingOverdriveStage = blue.pendingOverdriveStage;
  let redPendingVoidCloak = red.pendingVoidCloak;
  let bluePendingVoidCloak = blue.pendingVoidCloak;
  let redOverdriveActive = red.overdriveActive;
  let blueOverdriveActive = blue.overdriveActive;
  let redReboundLocked = red.reboundLocked;
  let blueReboundLocked = blue.reboundLocked;
  let redBlitz = false;
  let blueBlitz = false;
  let attackerQuantumOverlapPending = false;
  let redCloneStart: Position | null = null;
  let blueCloneStart: Position | null = null;
  let redClonePath: Position[] = [];
  let blueClonePath: Position[] = [];
  let redCloneStep: number | null = null;
  let blueCloneStep: number | null = null;
  let redClonePos: Position | null = null;
  let blueClonePos: Position | null = null;

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
  const escaperHasStepZeroPhaseShift =
    (escapeeColor === 'red' ? redReservations : blueReservations).some(
      (reservation) =>
        reservation.skillId === 'phase_shift' && reservation.step === 0,
    );
  const escaperHasStepZeroAtField =
    (escapeeColor === 'red' ? redReservations : blueReservations).some(
      (reservation) =>
        reservation.skillId === 'arc_reactor_field' && reservation.step === 0,
    );

  const applyDamages = (
    sourceColor: PlayerColor,
    damages: AbilityDamageEvent[],
    heals: AbilityHealEvent[],
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
      heals,
    });
  };

  const isProtectedByCollision = (color: PlayerColor) =>
    color === 'red'
      ? redInv > 0 || redPhaseShift || redAtFieldSteps > 0
      : blueInv > 0 || bluePhaseShift || blueAtFieldSteps > 0;

  const isProtectedByInv = (color: PlayerColor) =>
    color === 'red' ? redInv > 0 || redPhaseShift : blueInv > 0 || bluePhaseShift;

  const spendMana = (casterManaValue: number, skillId: AbilitySkillId) =>
    Math.max(0, casterManaValue - ABILITY_SKILL_COSTS[skillId]);

  const resolveAttackSkill = (
    sourceColor: PlayerColor,
    targetColor: PlayerColor,
    skillId: AbilitySkillId,
    damage: number,
    sourcePosition: Position,
    targetPosition: Position,
    damages: AbilityDamageEvent[],
    reflectAllowed = true,
  ) => {
    if (isProtectedByInv(targetColor)) return;

    const targetAtField =
      targetColor === 'red' ? redAtFieldSteps > 0 : blueAtFieldSteps > 0;
    if (targetAtField) {
      if (targetColor === 'red') redAtFieldSteps = 0;
      else blueAtFieldSteps = 0;

      if (!reflectAllowed || skillId === 'cosmic_bigbang') return;

      if (isProtectedByInv(sourceColor)) return;

      if (sourceColor === 'red') {
        redHp = Math.max(0, redHp - damage);
        damages.push({
          color: 'red',
          newHp: redHp,
          position: { ...sourcePosition },
        });
      } else {
        blueHp = Math.max(0, blueHp - damage);
        damages.push({
          color: 'blue',
          newHp: blueHp,
          position: { ...sourcePosition },
        });
      }
      return;
    }

    if (targetColor === 'red') {
      redHp = Math.max(0, redHp - damage);
      damages.push({
        color: 'red',
        newHp: redHp,
        position: { ...targetPosition },
      });
    } else {
      blueHp = Math.max(0, blueHp - damage);
      damages.push({
        color: 'blue',
        newHp: blueHp,
        position: { ...targetPosition },
      });
    }
  };

  const resolveCollisionHit = (
    sourceColor: PlayerColor,
    targetColor: PlayerColor,
    position: Position,
    step: number,
  ) => {
    if (isProtectedByInv(targetColor)) return;

    const targetAtField =
      targetColor === 'red' ? redAtFieldSteps > 0 : blueAtFieldSteps > 0;
    if (targetAtField) {
      if (targetColor === 'red') redAtFieldSteps = 0;
      else blueAtFieldSteps = 0;

      if (isProtectedByInv(sourceColor)) return;

      if (sourceColor === 'red') {
        redHp = Math.max(0, redHp - 1);
        collisions.push({
          step,
          position: { ...position },
          escapeeColor: 'red',
          newHp: redHp,
        });
      } else {
        blueHp = Math.max(0, blueHp - 1);
        collisions.push({
          step,
          position: { ...position },
          escapeeColor: 'blue',
          newHp: blueHp,
        });
      }
      return;
    }

    if (targetColor === 'red') {
      redHp = Math.max(0, redHp - 1);
      collisions.push({
        step,
        position: { ...position },
        escapeeColor: 'red',
        newHp: redHp,
      });
    } else {
      blueHp = Math.max(0, blueHp - 1);
      collisions.push({
        step,
        position: { ...position },
        escapeeColor: 'blue',
        newHp: blueHp,
      });
    }
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
        redMana = spendMana(casterMana, reservation.skillId);
      } else {
        blueInv = GUARD_STEPS;
        blueMana = spendMana(casterMana, reservation.skillId);
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

    if (reservation.skillId === 'arc_reactor_field') {
      if (color === 'red') {
        redAtFieldSteps = AT_FIELD_STEPS;
        redMana = spendMana(casterMana, reservation.skillId);
      } else {
        blueAtFieldSteps = AT_FIELD_STEPS;
        blueMana = spendMana(casterMana, reservation.skillId);
      }
      skillEvents.push({
        step: reservation.step,
        order: reservation.order,
        color,
        skillId: reservation.skillId,
      });
      return;
    }

    if (reservation.skillId === 'phase_shift') {
      if (color === 'red') {
        redPhaseShift = true;
        redMana = spendMana(casterMana, reservation.skillId);
      } else {
        bluePhaseShift = true;
        blueMana = spendMana(casterMana, reservation.skillId);
      }
      skillEvents.push({
        step: reservation.step,
        order: reservation.order,
        color,
        skillId: reservation.skillId,
        phaseShiftActive: true,
      });
      return;
    }

    if (reservation.skillId === 'quantum_shift' && reservation.target) {
      const from = { ...currentPos };
      const createsOverlap =
        color === attackerColor && samePosition(reservation.target, opponentPos);
      if (color === 'red') {
        redPos = { ...reservation.target };
        redMana = spendMana(casterMana, reservation.skillId);
      } else {
        bluePos = { ...reservation.target };
        blueMana = spendMana(casterMana, reservation.skillId);
      }
      if (createsOverlap) {
        attackerQuantumOverlapPending = true;
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
        redMana = spendMana(casterMana, reservation.skillId);
        redPendingManaBonus = CHARGE_MANA_BONUS;
      } else {
        blueMana = spendMana(casterMana, reservation.skillId);
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

    if (reservation.skillId === 'aurora_heal') {
      const heals: AbilityHealEvent[] = [];
      if (color === 'red') {
        redMana = spendMana(casterMana, reservation.skillId);
        redHp = Math.min(3, redHp + 1);
        heals.push({ color: 'red', newHp: redHp, position: { ...currentPos } });
      } else {
        blueMana = spendMana(casterMana, reservation.skillId);
        blueHp = Math.min(3, blueHp + 1);
        heals.push({ color: 'blue', newHp: blueHp, position: { ...currentPos } });
      }
      applyDamages(
        color,
        [],
        heals,
        reservation.skillId,
        reservation.step,
        reservation.order,
        [{ ...currentPos }],
      );
      return;
    }

    if (reservation.skillId === 'gold_overdrive') {
      if (color === 'red') {
        redMana = spendMana(casterMana, reservation.skillId);
        redPendingOverdriveStage = 1;
      } else {
        blueMana = spendMana(casterMana, reservation.skillId);
        bluePendingOverdriveStage = 1;
      }
      skillEvents.push({
        step: reservation.step,
        order: reservation.order,
        color,
        skillId: reservation.skillId,
        overdriveStage: 1,
      });
      return;
    }

    if (reservation.skillId === 'void_cloak') {
      if (color === 'red') {
        redMana = spendMana(casterMana, reservation.skillId);
        redPendingVoidCloak = true;
      } else {
        blueMana = spendMana(casterMana, reservation.skillId);
        bluePendingVoidCloak = true;
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
      const damages: AbilityDamageEvent[] = [];
      if (affectedPositions.some((position) => samePosition(position, opponentPos))) {
        resolveAttackSkill(
          color,
          opponentColor,
          reservation.skillId,
          1,
          currentPos,
          opponentPos,
          damages,
        );
      }
      if (color === 'red') {
        redMana = spendMana(casterMana, reservation.skillId);
        redPos = { ...(path[path.length - 1] ?? currentPos) };
        redBlitz = true;
      } else {
        blueMana = spendMana(casterMana, reservation.skillId);
        bluePos = { ...(path[path.length - 1] ?? currentPos) };
        blueBlitz = true;
      }
      applyDamages(
        color,
        damages,
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
      if (affectedPositions.some((position) => samePosition(position, opponentPos))) {
        resolveAttackSkill(
          color,
          opponentColor,
          reservation.skillId,
          1,
          currentPos,
          opponentPos,
          damages,
        );
      }
      if (color === 'red') {
        redMana = spendMana(casterMana, reservation.skillId);
      } else {
        blueMana = spendMana(casterMana, reservation.skillId);
      }
      applyDamages(color, damages, [], reservation.skillId, reservation.step, reservation.order, affectedPositions);
      return;
    }

    if (reservation.skillId === 'atomic_fission') {
      const cloneStart = color === 'red' ? red.previousTurnStart : blue.previousTurnStart;
      const clonePath = (color === 'red' ? red.previousTurnPath : blue.previousTurnPath).map((position) => ({ ...position }));
      if (!cloneStart || clonePath.length === 0) {
        if (color === 'red') {
          redMana = spendMana(casterMana, reservation.skillId);
        } else {
          blueMana = spendMana(casterMana, reservation.skillId);
        }
        skillEvents.push({
          step: reservation.step,
          order: reservation.order,
          color,
          skillId: reservation.skillId,
          cloneStart: null,
          clonePath: [],
        });
        return;
      }
      if (color === 'red') {
        redMana = spendMana(casterMana, reservation.skillId);
        redCloneStart = { ...cloneStart };
        redClonePath = clonePath;
        redCloneStep = reservation.step;
        redClonePos = { ...cloneStart };
      } else {
        blueMana = spendMana(casterMana, reservation.skillId);
        blueCloneStart = { ...cloneStart };
        blueClonePath = clonePath;
        blueCloneStep = reservation.step;
        blueClonePos = { ...cloneStart };
      }
      skillEvents.push({
        step: reservation.step,
        order: reservation.order,
        color,
        skillId: reservation.skillId,
        cloneStart: { ...cloneStart },
        clonePath,
      });
      return;
    }

    if (reservation.skillId === 'inferno_field' && reservation.target) {
      if (color === 'red') {
        redMana = spendMana(casterMana, reservation.skillId);
      } else {
        blueMana = spendMana(casterMana, reservation.skillId);
      }
      updateLavaTile(activeLavaTiles, reservation.target, 2);
      skillEvents.push({
        step: reservation.step,
        order: reservation.order,
        color,
        skillId: reservation.skillId,
        affectedPositions: [{ ...reservation.target }],
        to: { ...reservation.target },
        lavaRemainingTurns: 2,
      });
      return;
    }

    if (reservation.skillId === 'nova_blast') {
      const affectedPositions = getNovaPositions(currentPos).filter(
        (position) => !obstacles.some((obstacle) => samePosition(obstacle, position)),
      );
      const damages: AbilityDamageEvent[] = [];
      if (affectedPositions.some((position) => samePosition(position, opponentPos))) {
        resolveAttackSkill(
          color,
          opponentColor,
          reservation.skillId,
          1,
          currentPos,
          opponentPos,
          damages,
        );
      }
      if (color === 'red') {
        redMana = spendMana(casterMana, reservation.skillId);
      } else {
        blueMana = spendMana(casterMana, reservation.skillId);
      }
      applyDamages(color, damages, [], reservation.skillId, reservation.step, reservation.order, affectedPositions);
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
      resolveAttackSkill(
        color,
        opponentColor,
        reservation.skillId,
        2,
        currentPos,
        opponentPos,
        damages,
        false,
      );
      if (color === 'red') {
        redMana = spendMana(casterMana, reservation.skillId);
      } else {
        blueMana = spendMana(casterMana, reservation.skillId);
      }
      applyDamages(color, damages, [], reservation.skillId, reservation.step, reservation.order, affectedPositions);
    }
  };

  for (let step = 0; step <= maxStep; step++) {
    let redPrevForStep = { ...redPos };
    let bluePrevForStep = { ...bluePos };
    let redClonePrevForStep = redClonePos ? { ...redClonePos } : null;
    let blueClonePrevForStep = blueClonePos ? { ...blueClonePos } : null;

    if (step === 0 && startsOverlapped && !ignoreStartTileCollision) {
      const protectedByGuard =
        escaperHasStepZeroGuard || escaperHasStepZeroPhaseShift || escaperHasStepZeroAtField;
      if (protectedByGuard) {
        if (escaperHasStepZeroAtField) {
          resolveCollisionHit(attackerColor, escapeeColor, redStart, 0);
        }
      } else {
        resolveCollisionHit(attackerColor, escapeeColor, redStart, 0);
      }
    }

    if (step > 0) {
      const redPrev = { ...redPos };
      const bluePrev = { ...bluePos };
      redPrevForStep = redPrev;
      bluePrevForStep = bluePrev;
      const redNext =
        !redBlitz && step <= redPath.length ? { ...redPath[step - 1] } : redPos;
      const blueNext =
        !blueBlitz && step <= bluePath.length ? { ...bluePath[step - 1] } : bluePos;

      const startsStepOverlapped = samePosition(redPrev, bluePrev);
      const escaperStayedStill =
        escapeeColor === 'red'
          ? samePosition(redNext, redPrev)
          : samePosition(blueNext, bluePrev);
      const attackerMoved =
        attackerColor === 'red'
          ? !samePosition(redNext, redPrev)
          : !samePosition(blueNext, bluePrev);

      redPos = redNext;
      bluePos = blueNext;

      if (
        attackerQuantumOverlapPending &&
        startsStepOverlapped &&
        escaperStayedStill &&
        attackerMoved
      ) {
        resolveCollisionHit(attackerColor, escapeeColor, redPrev, step);
      }
      attackerQuantumOverlapPending = false;
      const overlappingAfterBlitz =
        (redBlitz || blueBlitz) && samePosition(redPos, bluePos);

      if (
        !overlappingAfterBlitz &&
        !redPhaseShift &&
        !bluePhaseShift &&
        positionsTouch(redPos, redPrev, bluePos, bluePrev)
      ) {
        resolveCollisionHit(attackerColor, escapeeColor, redPos, step);
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

    const getClonePositionForStep = (
      cloneStart: Position | null,
      clonePath: Position[],
      cloneStep: number | null,
      currentStep: number,
    ): Position | null => {
      if (!cloneStart || cloneStep === null) return null;
      if (currentStep < cloneStep) return null;
      if (currentStep === cloneStep) return { ...cloneStart };
      const index = currentStep - cloneStep - 1;
      if (index < 0 || index >= clonePath.length) return null;
      return { ...clonePath[index] };
    };

    const redCloneNext = getClonePositionForStep(
      redCloneStart,
      redClonePath,
      redCloneStep,
      step,
    );
    const blueCloneNext = getClonePositionForStep(
      blueCloneStart,
      blueClonePath,
      blueCloneStep,
      step,
    );

    redClonePos = redCloneNext;
    blueClonePos = blueCloneNext;

    if (
      redClonePrevForStep &&
      redCloneNext &&
      attackerColor === 'red' &&
      positionsTouch(bluePos, bluePrevForStep, redCloneNext, redClonePrevForStep)
    ) {
      resolveCollisionHit('red', 'blue', redCloneNext, step);
    }

    if (
      blueClonePrevForStep &&
      blueCloneNext &&
      attackerColor === 'blue' &&
      positionsTouch(redPos, redPrevForStep, blueCloneNext, blueClonePrevForStep)
    ) {
      resolveCollisionHit('blue', 'red', blueCloneNext, step);
    }

    const applyLavaDamage = (
      color: PlayerColor,
      prevPos: Position,
      nextPos: Position,
      protectedByGuard: boolean,
    ) => {
      if (protectedByGuard) return;
      for (const lavaTile of activeLavaTiles) {
        if (!isAffectedByLava(prevPos, nextPos, lavaTile.position)) continue;
        if (color === 'red') {
          redHp = Math.max(0, redHp - 1);
          collisions.push({
            step,
            position: { ...lavaTile.position },
            escapeeColor: 'red',
            newHp: redHp,
          });
        } else {
          blueHp = Math.max(0, blueHp - 1);
          collisions.push({
            step,
            position: { ...lavaTile.position },
            escapeeColor: 'blue',
            newHp: blueHp,
          });
        }
      }
    };

    applyLavaDamage('red', redPrevForStep, redPos, isProtectedByCollision('red'));
    applyLavaDamage('blue', bluePrevForStep, bluePos, isProtectedByCollision('blue'));

    if (redAtFieldSteps > 0) redAtFieldSteps -= 1;
    if (blueAtFieldSteps > 0) blueAtFieldSteps -= 1;
  }

  let winner: PlayerColor | 'draw' | null = null;
  if (redHp <= 0 && blueHp <= 0) winner = 'draw';
  else if (redHp <= 0) winner = 'blue';
  else if (blueHp <= 0) winner = 'red';

  const nextLavaTiles = activeLavaTiles
    .map((tile) => ({
      position: { ...tile.position },
      remainingTurns: tile.remainingTurns - 1,
    }))
    .filter((tile) => tile.remainingTurns > 0);

  return {
    payload: {
      redPath,
      bluePath,
      redStart,
      blueStart,
      lavaTiles: activeLavaTiles.map((tile) => ({
        position: { ...tile.position },
        remainingTurns: tile.remainingTurns,
      })),
      collisions,
      skillEvents,
    },
    redState: {
      position: redPos,
      hp: redHp,
      mana: redMana,
      invulnerableSteps: redInv,
      pendingManaBonus: redPendingManaBonus,
      pendingOverdriveStage: redPendingOverdriveStage,
      pendingVoidCloak: redPendingVoidCloak,
      overdriveActive: redOverdriveActive,
      reboundLocked: redReboundLocked,
    },
    blueState: {
      position: bluePos,
      hp: blueHp,
      mana: blueMana,
      invulnerableSteps: blueInv,
      pendingManaBonus: bluePendingManaBonus,
      pendingOverdriveStage: bluePendingOverdriveStage,
      pendingVoidCloak: bluePendingVoidCloak,
      overdriveActive: blueOverdriveActive,
      reboundLocked: blueReboundLocked,
    },
    lavaTiles: nextLavaTiles,
    winner,
  };
}

