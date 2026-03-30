# Current Hit Effect Notes

This document records the current hit-feedback implementation so it can be re-applied
after rolling back to an earlier version where the temporary transparency effect looked better.

## Goal

Keep the stronger hit feel:

1. Short hit freeze feel
2. Scale pop
3. White flash
4. Center-out spark particles
5. Short collision impact effect

Do **not** keep the directional push / knockback translation.

## Files touched

- `client/src/components/Game/PlayerPiece.tsx`
- `client/src/components/Game/PlayerPiece.css`
- `client/src/components/Effects/CollisionEffect.tsx`
- `client/src/components/Effects/CollisionEffect.css`
- `client/src/components/Game/GameGrid.tsx`
- `client/src/components/Ability/AbilityGrid.tsx`
- `client/src/components/TwoVsTwo/TwoVsTwoGrid.tsx`
- `client/src/components/Coop/CoopGrid.tsx`
- `client/src/store/gameStore.ts`
- `client/src/components/Ability/AbilityScreen.tsx`
- `client/src/components/TwoVsTwo/TwoVsTwoScreen.tsx`
- `client/src/socket/socketHandlers.ts`

## What to keep after rollback

### 1. PlayerPiece overlay flash

In `PlayerPiece.tsx`, inside `.piece-visual`, add:

```tsx
<span className="piece-hit-flash" aria-hidden="true" />
```

This should sit before `.piece-inner`.

### 2. Hit pop animation on the piece visual

In `PlayerPiece.css`, the hit animation should affect `.piece-visual`, not the outer
positioned wrapper.

Use this pattern:

```css
.player-piece.hit .piece-visual {
  animation: hit-impact 180ms cubic-bezier(0.2, 0.9, 0.25, 1) both;
}
```

### 3. Pop-only keyframes

The current good version does **not** translate the piece.

```css
@keyframes hit-impact {
  0% { transform: scale(1); }
  18% { transform: scale(1); }
  42% { transform: scale(1.15); }
  68% { transform: scale(0.95); }
  100% { transform: scale(1); }
}
```

This is the "1.0 -> 1.15 -> 0.95 -> 1.0" pop.

### 4. White flash

Add a dedicated flash element:

```css
.piece-hit-flash {
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
  background:
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.94), rgba(255, 255, 255, 0.42) 46%, transparent 72%);
  mix-blend-mode: screen;
  z-index: 3;
}

.player-piece.hit .piece-hit-flash {
  animation: hit-flash-white 140ms ease-out both;
}

@keyframes hit-flash-white {
  0% { opacity: 0; }
  10% { opacity: 0.95; }
  28% { opacity: 0.55; }
  100% { opacity: 0; }
}
```

### 5. Temporary piece transparency

The current attempt used stronger temporary opacity reduction:

```css
.player-piece.hit .piece-inner {
  opacity: 0.4;
  animation: hit-surface-fade 220ms ease-out both;
  box-shadow:
    0 0 calc(var(--piece-glow, 12px) * 1.2) rgba(255, 255, 255, 0.34),
    0 0 calc(var(--piece-glow, 12px) * 1.7) rgba(255, 255, 255, 0.16);
}

.player-piece.hit .piece-inner::before,
.player-piece.hit .piece-inner::after,
.player-piece.hit .piece-inner > *,
.player-piece.hit .piece-inner canvas {
  opacity: 0.4;
  animation: hit-surface-fade 220ms ease-out both;
}

@keyframes hit-surface-fade {
  0% { opacity: 0.4; }
  22% { opacity: 0.34; }
  100% { opacity: 1; }
}
```

After rollback, compare with the older "good" transparency version and keep whichever looks better.

### 6. Spark collision effect

`CollisionEffect.tsx` should render:

```tsx
<div className="collision-effect" ...>
  <span className="collision-effect-core" />
  <span className="collision-effect-spark collision-effect-spark-a" />
  <span className="collision-effect-spark collision-effect-spark-b" />
  <span className="collision-effect-spark collision-effect-spark-c" />
  <span className="collision-effect-spark collision-effect-spark-d" />
  <span className="collision-effect-spark collision-effect-spark-e" />
  <span className="collision-effect-spark collision-effect-spark-f" />
</div>
```

And `CollisionEffect.css` should follow this shape:

```css
.collision-effect {
  position: absolute;
  width: 70px;
  height: 70px;
  pointer-events: none;
  z-index: 20;
  animation: collision-impact 220ms ease-out forwards;
}

.collision-effect-core {
  position: absolute;
  inset: 32%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.98), #fbbf24 38%, #ef4444 72%, transparent 100%);
  filter: drop-shadow(0 0 10px rgba(251, 191, 36, 0.34));
  animation: collision-core-pop 180ms ease-out forwards;
}

.collision-effect-spark {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 4px;
  height: 18px;
  margin-left: -2px;
  margin-top: -9px;
  border-radius: 999px;
  opacity: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(251, 191, 36, 0.92), rgba(239, 68, 68, 0));
  transform-origin: 50% 100%;
  animation: collision-spark 220ms ease-out forwards;
}
```

Per-spark rotation values:

```css
.collision-effect-spark-a { --spark-rotate: 0deg; }
.collision-effect-spark-b { --spark-rotate: 58deg; animation-delay: 14ms; }
.collision-effect-spark-c { --spark-rotate: 118deg; animation-delay: 22ms; }
.collision-effect-spark-d { --spark-rotate: 180deg; animation-delay: 10ms; }
.collision-effect-spark-e { --spark-rotate: 240deg; animation-delay: 18ms; }
.collision-effect-spark-f { --spark-rotate: 302deg; animation-delay: 26ms; }
```

Core keyframes:

```css
@keyframes collision-impact {
  0% {
    transform: translate(-50%, -50%) scale(0.88);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.18);
    opacity: 0;
  }
}

@keyframes collision-core-pop {
  0% {
    transform: scale(0.35);
    opacity: 0;
  }
  20% {
    transform: scale(1.18);
    opacity: 1;
  }
  100% {
    transform: scale(0.82);
    opacity: 0;
  }
}

@keyframes collision-spark {
  0% {
    opacity: 0;
    transform: rotate(var(--spark-rotate, 0deg)) translateY(0) scaleY(0.5);
  }
  16% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: rotate(var(--spark-rotate, 0deg)) translateY(-22px) scaleY(1.15);
  }
}
```

### 7. Hit duration / timing

Current test values:

- hit flag duration:
  - normal duel: `900ms`
  - ability battle: `900ms`
  - 2v2: `900ms`
- collision effect lifetime:
  - normal duel store: `320ms`
  - ability battle local collision: `320ms`
  - 2v2 local collision: `320ms`

These values may be too long for the final version. Keep them here as reference only.

### 8. Collision effect timing delay

To avoid the spark showing up before the two pieces visually touch, the current code delays
the collision impact effect close to the end of the step.

Normal duel:

```ts
const COLLISION_IMPACT_DELAY_MS = Math.max(0, STEP_DURATION - 24);
```

and then wraps the hit/collision visual handling in:

```ts
window.setTimeout(() => {
  // triggerHit
  // triggerCollisionEffect
  // HP update
  // explosion if needed
}, COLLISION_IMPACT_DELAY_MS);
```

2v2 uses the same idea with `STEP_DURATION_MS - 24`.

This is a visual timing fix only. Game rules are unchanged.

## Re-apply order after rollback

Recommended order:

1. Roll back to the version where hit transparency looked correct
2. Re-apply `CollisionEffect.tsx/css` spark effect
3. Re-apply `.piece-hit-flash` and `hit-impact`
4. Re-apply collision timing delay
5. Compare old transparency vs current stronger fade and choose one

## Notes

- Do not re-introduce directional push / knockback translation.
- Keep the hit effect attached to `.piece-visual`, not the root `.player-piece`,
  so the piece position transition is not interrupted.
