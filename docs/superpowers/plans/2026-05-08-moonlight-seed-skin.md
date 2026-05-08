# 월광씨앗 스킨 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rare 등급 "월광씨앗(moonlight_seed)" 스킨을 추가한다. Arena 7(몽환의 숲) 해금, 1400토큰. 씨앗 코어+덩굴+반딧불+달빛 먼지 캔버스 애니메이션.

**Architecture:** 기존 rare 캔버스 스킨(CosmicCanvas, ElectricCoreCanvas) 패턴을 그대로 따른다. `MoonlightSeedCanvas.tsx`가 핵심 렌더링을 담당하고, `Game.tsx`(인게임)와 `Preview.tsx`(스킨샵)가 그것을 각자의 className으로 감싼다. 타입·아레나·스킨샵 등록은 각 파일에 한 줄씩 추가.

**Tech Stack:** React, TypeScript, Canvas API, CSS, Supabase PL/pgSQL

---

### Task 1: 스킨 파일 디렉토리 및 meta 생성

**Files:**
- Create: `client/src/skins/rare/moonlight_seed/meta.ts`

- [ ] **Step 1: meta.ts 생성**

```ts
export const moonlightSeedSkinMeta = {
  id: "moonlight_seed",
  tier: "rare",
} as const;
```

- [ ] **Step 2: 커밋**

```bash
git add client/src/skins/rare/moonlight_seed/meta.ts
git commit -m "feat: add moonlight_seed skin directory and meta"
```

---

### Task 2: MoonlightSeedCanvas 컴포넌트 생성

**Files:**
- Create: `client/src/skins/rare/moonlight_seed/MoonlightSeedCanvas.tsx`

- [ ] **Step 1: MoonlightSeedCanvas.tsx 생성**

```tsx
import { useEffect, useRef } from "react";

interface Props {
  className?: string;
}

const VINE_CONFIGS = [
  { a: -82, lf: 0.74, co: 0.15, speed: 0.007, phase: 0.0 },
  { a: -20, lf: 0.68, co: -0.16, speed: 0.006, phase: 1.1 },
  { a:  44, lf: 0.65, co:  0.18, speed: 0.008, phase: 2.2 },
  { a: 112, lf: 0.60, co: -0.15, speed: 0.007, phase: 3.3 },
  { a: 170, lf: 0.66, co:  0.16, speed: 0.006, phase: 0.8 },
  { a:-130, lf: 0.72, co: -0.17, speed: 0.007, phase: 1.9 },
] as const;

const ROOT_CONFIGS = [
  { a:  82, lf: 0.30, co:  0.05 },
  { a: 100, lf: 0.35, co: -0.04 },
  { a: 118, lf: 0.25, co:  0.07 },
] as const;

interface Firefly {
  bx: number; by: number;
  size: number;
  blinkPhase: number; blinkSpeed: number;
  risePhase: number; riseSpeed: number; riseAmt: number;
}

interface Dust {
  x: number; y: number;
  size: number;
  phase: number; speed: number;
  dx: number; dy: number;
}

export function MoonlightSeedCanvas({ className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let fireflies: Firefly[] = [];
    let dust: Dust[] = [];
    let cx = 0, cy = 0, r = 0;
    let frameId = 0;
    let t = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = rect.width / 2;
      cy = rect.height / 2;
      r = Math.min(cx, cy) - 1;

      fireflies = Array.from({ length: 14 }, () => {
        const ang = Math.random() * Math.PI * 2;
        const pr = (0.16 + Math.random() * 0.62) * r;
        return {
          bx: cx + Math.cos(ang) * pr,
          by: cy + Math.sin(ang) * pr,
          size: 0.8 + Math.random() * 1.8,
          blinkPhase: Math.random() * Math.PI * 2,
          blinkSpeed: 0.025 + Math.random() * 0.035,
          risePhase: Math.random() * Math.PI * 2,
          riseSpeed: 0.008 + Math.random() * 0.012,
          riseAmt: (0.12 + Math.random() * 0.18) * r,
        };
      });

      dust = Array.from({ length: 30 }, () => {
        const ang = Math.random() * Math.PI * 2;
        const pr = Math.random() * 0.75 * r;
        return {
          x: cx + Math.cos(ang) * pr,
          y: cy + Math.sin(ang) * pr,
          size: 0.3 + Math.random() * 0.8,
          phase: Math.random() * Math.PI * 2,
          speed: 0.012 + Math.random() * 0.02,
          dx: (Math.random() - 0.5) * 0.25 * (r / 100),
          dy: (-0.08 - Math.random() * 0.14) * (r / 100),
        };
      });
    };

    const drawBg = (w: number, h: number) => {
      const bg = ctx.createRadialGradient(cx, cy - r * 0.1, 0, cx, cy, r);
      bg.addColorStop(0, "#071508");
      bg.addColorStop(0.55, "#040d05");
      bg.addColorStop(1, "#020704");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const bw = r * 0.28;
      const beam = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
      beam.addColorStop(0, "rgba(210,255,225,0)");
      beam.addColorStop(0.5, "rgba(210,255,225,0.032)");
      beam.addColorStop(1, "rgba(210,255,225,0)");
      ctx.fillStyle = beam;
      ctx.fillRect(cx - bw, 0, bw * 2, h);
    };

    const drawRoots = () => {
      for (const root of ROOT_CONFIGS) {
        const rad = (root.a * Math.PI) / 180;
        const len = root.lf * r;
        const ex = cx + Math.cos(rad) * len;
        const ey = cy + Math.sin(rad) * len;
        const perpRad = rad + Math.PI / 2;
        const cpx = cx + Math.cos(rad) * len * 0.5 + Math.cos(perpRad) * root.co * r;
        const cpy = cy + Math.sin(rad) * len * 0.5 + Math.sin(perpRad) * root.co * r;
        ctx.beginPath();
        ctx.moveTo(cx, cy + r * 0.09);
        ctx.quadraticCurveTo(cpx, cpy, ex, ey);
        ctx.strokeStyle = "rgba(18,65,28,0.6)";
        ctx.lineWidth = Math.max(0.5, r * 0.01);
        ctx.lineCap = "round";
        ctx.stroke();
      }
    };

    const drawVine = (vine: typeof VINE_CONFIGS[number]) => {
      const rad = (vine.a * Math.PI) / 180;
      const progress = 0.55 + 0.45 * Math.sin(t * vine.speed + vine.phase);
      const maxLen = vine.lf * r * progress;
      const ex = cx + Math.cos(rad) * maxLen;
      const ey = cy + Math.sin(rad) * maxLen;
      const perpRad = rad + Math.PI / 2;
      const coOff = vine.co * r * progress;
      const cpx = cx + Math.cos(rad) * maxLen * 0.52 + Math.cos(perpRad) * coOff;
      const cpy = cy + Math.sin(rad) * maxLen * 0.52 + Math.sin(perpRad) * coOff;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cpx, cpy, ex, ey);
      ctx.strokeStyle = `rgba(50,190,80,${0.13 * progress})`;
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.lineCap = "round";
      ctx.shadowBlur = r * 0.1;
      ctx.shadowColor = "rgba(50,200,80,0.45)";
      ctx.stroke();
      ctx.shadowBlur = 0;

      const grad = ctx.createLinearGradient(cx, cy, ex, ey);
      grad.addColorStop(0, "rgba(14,72,28,0.75)");
      grad.addColorStop(0.55, `rgba(38,155,65,${0.9 * progress})`);
      grad.addColorStop(1, `rgba(95,250,130,${progress})`);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cpx, cpy, ex, ey);
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(0.5, r * 0.016);
      ctx.lineCap = "round";
      ctx.stroke();

      const mx = cx + Math.cos(rad) * maxLen * 0.62 + Math.cos(perpRad) * coOff * 0.55;
      const my = cy + Math.sin(rad) * maxLen * 0.62 + Math.sin(perpRad) * coOff * 0.55;
      ctx.fillStyle = `rgba(60,200,80,${progress * 0.55})`;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(0.5, r * 0.015), 0, Math.PI * 2);
      ctx.fill();

      const budR = Math.max(1, (3 + progress * 2.2) * (r / 100));
      const budGlow = ctx.createRadialGradient(ex, ey, 0, ex, ey, budR * 2.8);
      budGlow.addColorStop(0, `rgba(180,255,200,${progress * 0.92})`);
      budGlow.addColorStop(0.45, `rgba(70,215,105,${progress * 0.45})`);
      budGlow.addColorStop(1, "rgba(35,155,65,0)");
      ctx.fillStyle = budGlow;
      ctx.beginPath();
      ctx.arc(ex, ey, budR * 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(215,255,225,${progress * 0.95})`;
      ctx.beginPath();
      ctx.arc(ex, ey, budR * 0.52, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawFireflies = () => {
      for (const ff of fireflies) {
        const alpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * ff.blinkSpeed + ff.blinkPhase));
        const fy = ff.by + Math.sin(t * ff.riseSpeed + ff.risePhase) * ff.riseAmt;
        const dx = ff.bx - cx, dy = fy - cy;
        if (dx * dx + dy * dy > (r - 4) * (r - 4)) continue;
        const glowR = ff.size * (r / 100) * 4;
        const glow = ctx.createRadialGradient(ff.bx, fy, 0, ff.bx, fy, glowR);
        glow.addColorStop(0, `rgba(155,255,185,${alpha * 0.75})`);
        glow.addColorStop(1, "rgba(55,195,85,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(ff.bx, fy, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(228,255,235,${alpha})`;
        ctx.beginPath();
        ctx.arc(ff.bx, fy, ff.size * (r / 100) * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawDust = () => {
      for (const d of dust) {
        const alpha = 0.18 + 0.28 * (0.5 + 0.5 * Math.sin(t * d.speed + d.phase));
        d.x += d.dx;
        d.y += d.dy;
        const dx = d.x - cx, dy = d.y - cy;
        if (dx * dx + dy * dy > (r * 0.76) * (r * 0.76)) {
          const ang = Math.random() * Math.PI * 2;
          const pr = (0.2 + Math.random() * 0.52) * r;
          d.x = cx + Math.cos(ang) * pr;
          d.y = cy + Math.sin(ang) * pr + r * 0.28;
        }
        ctx.fillStyle = `rgba(200,255,210,${alpha})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size * (r / 100), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawSeed = () => {
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.038);
      const auraR = r * 0.24;
      const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, auraR);
      aura.addColorStop(0, `rgba(95,255,125,${0.3 + pulse * 0.18})`);
      aura.addColorStop(0.5, `rgba(45,175,75,${0.2 + pulse * 0.12})`);
      aura.addColorStop(1, "rgba(28,115,52,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.17, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(60,200,85,${0.18 + pulse * 0.12})`;
      ctx.lineWidth = Math.max(0.5, r * 0.01);
      ctx.stroke();

      const sr = r * 0.115;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.22);
      ctx.scale(1, 1.38);
      const seedGrad = ctx.createRadialGradient(-sr * 0.22, -sr * 0.39, 0, 0, 0, sr);
      seedGrad.addColorStop(0, "#ecfff2");
      seedGrad.addColorStop(0.28, "#80ffaa");
      seedGrad.addColorStop(0.65, "#2daa55");
      seedGrad.addColorStop(1, "#0d4a20");
      ctx.fillStyle = seedGrad;
      ctx.shadowBlur = sr * 0.7;
      ctx.shadowColor = "rgba(60,220,90,0.6)";
      ctx.beginPath();
      ctx.arc(0, 0, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.68)";
      ctx.beginPath();
      ctx.ellipse(-sr * 0.28, -sr * 0.39, sr * 0.33, sr * 0.19, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawBorderGlow = () => {
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.038);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(45,195,80,${0.45 + pulse * 0.3})`;
      ctx.lineWidth = Math.max(1, r * 0.02);
      ctx.shadowBlur = r * 0.14;
      ctx.shadowColor = "rgba(45,195,80,0.65)";
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const frame = () => {
      if (r === 0) { frameId = requestAnimationFrame(frame); return; }
      const w = cx * 2, h = cy * 2;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      drawBg(w, h);
      drawRoots();
      for (const vine of VINE_CONFIGS) drawVine(vine);
      drawDust();
      drawFireflies();
      drawSeed();
      ctx.restore();
      drawBorderGlow();
      t++;
      frameId = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    frameId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
```

- [ ] **Step 2: 커밋**

```bash
git add client/src/skins/rare/moonlight_seed/MoonlightSeedCanvas.tsx
git commit -m "feat: add MoonlightSeedCanvas animation component"
```

---

### Task 3: Game.tsx + game.css 생성 (인게임 렌더)

**Files:**
- Create: `client/src/skins/rare/moonlight_seed/Game.tsx`
- Create: `client/src/skins/rare/moonlight_seed/game.css`

- [ ] **Step 1: Game.tsx 생성**

```tsx
import { MoonlightSeedCanvas } from "./MoonlightSeedCanvas";
import "./game.css";

export function MoonlightSeedGame() {
  return <MoonlightSeedCanvas className="moonlight-seed-canvas" />;
}
```

- [ ] **Step 2: game.css 생성**

```css
.player-piece.piece-skin-moonlight_seed .piece-inner {
  background: #040c05;
  box-shadow:
    0 0 calc(var(--piece-glow, 12px) * 1.0) rgba(45, 175, 80, 0.50),
    0 0 calc(var(--piece-glow, 12px) * 2.2) rgba(25, 120, 50, 0.28),
    inset 0 0 8px rgba(60, 200, 90, 0.06);
  border-color: rgba(45, 175, 80, 0.55);
}

.player-piece.piece-skin-moonlight_seed .piece-inner::before,
.player-piece.piece-skin-moonlight_seed .piece-inner::after {
  content: none;
}

.moonlight-seed-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 50%;
  pointer-events: none;
}
```

- [ ] **Step 3: 커밋**

```bash
git add client/src/skins/rare/moonlight_seed/Game.tsx client/src/skins/rare/moonlight_seed/game.css
git commit -m "feat: add moonlight_seed game skin component"
```

---

### Task 4: Preview.tsx + preview.css 생성 (스킨샵 미리보기)

**Files:**
- Create: `client/src/skins/rare/moonlight_seed/Preview.tsx`
- Create: `client/src/skins/rare/moonlight_seed/preview.css`

- [ ] **Step 1: Preview.tsx 생성**

```tsx
import { MoonlightSeedCanvas } from "./MoonlightSeedCanvas";
import "./preview.css";

export function MoonlightSeedPreview() {
  return <MoonlightSeedCanvas className="skin-preview-moonlight_seed-canvas" />;
}
```

- [ ] **Step 2: preview.css 생성**

```css
.skin-preview-moonlight_seed {
  background: #040c05;
  box-shadow:
    0 0 12px rgba(45, 175, 80, 0.5),
    0 0 28px rgba(25, 120, 50, 0.28),
    inset 0 0 8px rgba(60, 200, 90, 0.06);
  border-color: rgba(45, 175, 80, 0.55);
  overflow: hidden;
  position: relative;
}

.skin-preview-moonlight_seed::before,
.skin-preview-moonlight_seed::after {
  content: none;
}

.skin-preview-moonlight_seed-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 50%;
  pointer-events: none;
}
```

- [ ] **Step 3: 커밋**

```bash
git add client/src/skins/rare/moonlight_seed/Preview.tsx client/src/skins/rare/moonlight_seed/preview.css
git commit -m "feat: add moonlight_seed preview skin component"
```

---

### Task 5: PieceSkin 타입에 moonlight_seed 추가

**Files:**
- Modify: `client/src/types/game.types.ts:9-27`

- [ ] **Step 1: PieceSkin 유니온에 추가**

`client/src/types/game.types.ts` 의 `PieceSkin` 타입에 `'moonlight_seed'` 추가:

```ts
export type PieceSkin =
  | 'classic'
  | 'ember'
  | 'nova'
  | 'aurora'
  | 'void'
  | 'plasma'
  | 'gold_core'
  | 'neon_pulse'
  | 'cosmic'
  | 'inferno'
  | 'arc_reactor'
  | 'electric_core'
  | 'berserker'
  | 'quantum'
  | 'moonlight_seed'
  | 'atomic'
  | 'chronos'
  | 'wizard'
  | 'sun';
```

- [ ] **Step 2: 커밋**

```bash
git add client/src/types/game.types.ts
git commit -m "feat: add moonlight_seed to PieceSkin type"
```

---

### Task 6: PlayerPiece에 스킨 등록

**Files:**
- Modify: `client/src/components/Game/PlayerPiece.tsx`

- [ ] **Step 1: import 추가** (파일 상단 기존 import 블록에)

기존 `import { BerserkerGame } ...` 아래에 추가:

```tsx
import { MoonlightSeedGame } from '../../skins/rare/moonlight_seed/Game';
```

- [ ] **Step 2: skin prop 유니온에 추가**

`PlayerPiece` Props의 `skin` 유니온 (44-62행) 에 `"moonlight_seed"` 추가:

```tsx
  skin?:
    | "classic"
    | "ember"
    | "nova"
    | "aurora"
    | "void"
    | "plasma"
    | "gold_core"
    | "neon_pulse"
    | "cosmic"
    | "inferno"
    | "arc_reactor"
    | "electric_core"
    | "berserker"
    | "quantum"
    | "moonlight_seed"
    | "atomic"
    | "chronos"
    | "sun"
    | "wizard";
```

- [ ] **Step 3: 렌더 조건 추가**

인게임 스킨 렌더 블록 (`{effectiveSkin === "berserker" && <BerserkerGame />}` 바로 아래)에 추가:

```tsx
{effectiveSkin === "moonlight_seed" && <MoonlightSeedGame />}
```

- [ ] **Step 4: 커밋**

```bash
git add client/src/components/Game/PlayerPiece.tsx
git commit -m "feat: register moonlight_seed skin in PlayerPiece"
```

---

### Task 7: 아레나 카탈로그에 등록

**Files:**
- Modify: `client/src/data/arenaCatalog.ts:112-164`

- [ ] **Step 1: SKIN_ARENA_REQUIREMENTS에 추가**

`// Arena 6: 피라미드` 아래, `// Arena 8: 과학의 방` 위에 삽입:

```ts
  // Arena 7: 몽환의 숲
  moonlight_seed: 7,
```

- [ ] **Step 2: ARENA_REWARD_SKINS에 추가**

`6: ["sun", "gold_core"],` 아래에 삽입:

```ts
  7: ["moonlight_seed"],
```

- [ ] **Step 3: 커밋**

```bash
git add client/src/data/arenaCatalog.ts
git commit -m "feat: register moonlight_seed at arena 7 in arenaCatalog"
```

---

### Task 8: LobbyScreen 스킨샵에 등록

**Files:**
- Modify: `client/src/components/Lobby/LobbyScreen.tsx`

- [ ] **Step 1: Preview import 추가**

파일 상단 기존 `import { BerserkerPreview }` 아래에 추가:

```tsx
import { MoonlightSeedPreview } from "../../skins/rare/moonlight_seed/Preview";
```

- [ ] **Step 2: skinChoices id 유니온에 추가** (1679-1697행)

기존 id 유니온에 `"moonlight_seed"` 추가:

```ts
    id:
      | "classic"
      | "ember"
      | "nova"
      | "aurora"
      | "void"
      | "plasma"
      | "gold_core"
      | "neon_pulse"
      | "cosmic"
      | "inferno"
      | "arc_reactor"
      | "wizard"
      | "electric_core"
      | "berserker"
      | "moonlight_seed"
      | "quantum"
      | "atomic"
      | "chronos"
      | "sun";
```

- [ ] **Step 3: skinChoices 배열에 항목 추가**

`berserker` 항목 바로 뒤에 삽입:

```ts
    {
      id: "moonlight_seed",

      name: lang === "en" ? "Moonlight Seed" : "월광씨앗",

      desc:
        lang === "en"
          ? "Rare dreamwood seed — moonlit vines bloom and fireflies drift through the enchanted forest."
          : "희귀 몽환 씨앗 — 달빛 덩굴이 자라고 반딧불이 몽환의 숲을 유영한다.",

      requiredWins: null,

      requiredPlays: null,

      tokenPrice: 1400,

      tier: "rare",
    },
```

- [ ] **Step 4: renderPieceSkinPreview에 추가** (2159행 근처)

`{skinId === "berserker" && <BerserkerPreview />}` 바로 아래에 추가:

```tsx
{skinId === "moonlight_seed" && <MoonlightSeedPreview />}
```

- [ ] **Step 5: 커밋**

```bash
git add client/src/components/Lobby/LobbyScreen.tsx
git commit -m "feat: add moonlight_seed to skin shop in LobbyScreen"
```

---

### Task 9: Supabase SQL 마이그레이션 파일 생성

**Files:**
- Create: `supabase/add_moonlight_seed_skin.sql`

이 파일을 Supabase SQL Editor에서 실행하면 `purchase_skin_with_tokens` 함수가 `moonlight_seed`를 1400토큰·아레나 7 조건으로 지원한다.

- [ ] **Step 1: SQL 파일 생성**

```sql
-- Migration: moonlight_seed 스킨 추가
-- 실행: Supabase SQL Editor에서 실행
-- 효과: purchase_skin_with_tokens RPC가 moonlight_seed를 1400토큰·Arena 7 조건으로 지원

create or replace function public.purchase_skin_with_tokens(
  p_skin_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_tokens integer;
  v_cost integer;
  v_required_arena integer;
  v_highest_arena integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return 'AUTH_REQUIRED';
  end if;

  v_cost := case p_skin_id
    when 'plasma'          then 480
    when 'gold_core'       then 480
    when 'neon_pulse'      then 480
    when 'inferno'         then 480
    when 'quantum'         then 480
    when 'cosmic'          then 1400
    when 'arc_reactor'     then 1400
    when 'electric_core'   then 1400
    when 'berserker'       then 1400
    when 'moonlight_seed'  then 1400
    when 'atomic'          then 3600
    when 'chronos'         then 3600
    when 'wizard'          then 3600
    when 'sun'             then 3600
    else null
  end;

  if v_cost is null then
    return 'INVALID_SKIN';
  end if;

  v_required_arena := case p_skin_id
    when 'plasma'          then 1
    when 'cosmic'          then 1
    when 'neon_pulse'      then 2
    when 'quantum'         then 2
    when 'inferno'         then 3
    when 'berserker'       then 3
    when 'electric_core'   then 4
    when 'wizard'          then 5
    when 'sun'             then 6
    when 'gold_core'       then 6
    when 'moonlight_seed'  then 7
    when 'atomic'          then 8
    when 'arc_reactor'     then 8
    when 'chronos'         then 10
    else 1
  end;

  select coalesce(highest_arena_reached, 1)
    into v_highest_arena
    from public.player_stats
   where user_id = v_user_id;

  if coalesce(v_highest_arena, 1) < v_required_arena then
    return 'ARENA_REQUIRED';
  end if;

  select tokens
    into v_tokens
    from public.player_stats
   where user_id = v_user_id
   for update;

  if not found then
    return 'INSUFFICIENT_TOKENS';
  end if;

  if exists (
    select 1
      from public.owned_skins
     where user_id = v_user_id
       and skin_id = p_skin_id
  ) then
    return 'ALREADY_OWNED';
  end if;

  if coalesce(v_tokens, 0) < v_cost then
    return 'INSUFFICIENT_TOKENS';
  end if;

  insert into public.owned_skins (user_id, skin_id)
  values (v_user_id, p_skin_id)
  on conflict (user_id, skin_id) do nothing;

  if not found then
    return 'ALREADY_OWNED';
  end if;

  update public.player_stats
     set tokens = tokens - v_cost,
         updated_at = now()
   where user_id = v_user_id;

  return 'PURCHASED';
end;
$$;
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/add_moonlight_seed_skin.sql
git commit -m "feat: add moonlight_seed SQL migration for purchase_skin_with_tokens"
```

---

## 검증 체크리스트

구현 완료 후 확인:

- [ ] `npm run build` 또는 `npm run dev`에서 TypeScript 오류 없음
- [ ] 스킨샵에서 "월광씨앗" 카드가 표시됨 (1400토큰 표시)
- [ ] 스킨 미리보기에서 캔버스 애니메이션 작동
- [ ] 인게임 PlayerPiece에서 moonlight_seed 스킨 정상 렌더
- [ ] Arena 7 미만 유저에게 잠금 표시됨
- [ ] SQL 파일을 Supabase에서 실행 후 `purchase_skin_with_tokens('moonlight_seed')` RPC가 올바른 응답 반환
