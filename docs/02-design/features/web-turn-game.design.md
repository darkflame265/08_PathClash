# Design: Web Turn-Based Game (PathClash)

> **Feature**: web-turn-game
> **Created**: 2026-02-28
> **Phase**: Design
> **Ref Plan**: `docs/01-plan/features/web-turn-game.plan.md`

---

## 1. 프로젝트 구조 (File Structure)

```
pathclash/
├── client/                          # React + TypeScript (Vite)
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                  # 라우팅 (Lobby ↔ Game)
│       ├── types/
│       │   └── game.types.ts        # 공유 TypeScript 인터페이스
│       ├── socket/
│       │   ├── socketClient.ts      # Socket.IO 클라이언트 인스턴스
│       │   └── socketHandlers.ts    # 이벤트 → Zustand 상태 반영
│       ├── store/
│       │   ├── gameStore.ts         # Zustand 게임 상태
│       │   └── lobbyStore.ts        # Zustand 로비 상태
│       ├── hooks/
│       │   ├── useSocket.ts         # 소켓 연결 관리 훅
│       │   ├── usePathInput.ts      # 경로 지정 (드래그 + 방향키)
│       │   ├── useGameAnimation.ts  # 말 이동 애니메이션
│       │   └── useTimer.ts          # 클라이언트 타이머
│       ├── utils/
│       │   ├── pathUtils.ts         # 경로 유효성 검사
│       │   ├── collisionUtils.ts    # 충돌 감지 알고리즘
│       │   └── animationUtils.ts    # 애니메이션 좌표 계산
│       ├── components/
│       │   ├── Lobby/
│       │   │   ├── LobbyScreen.tsx
│       │   │   ├── NicknameInput.tsx
│       │   │   ├── RoomCodeInput.tsx
│       │   │   └── MatchmakingModal.tsx
│       │   ├── Game/
│       │   │   ├── GameScreen.tsx       # 게임 화면 루트
│       │   │   ├── GameGrid.tsx         # 5×5 그리드 컨테이너
│       │   │   ├── GridCell.tsx         # 개별 셀
│       │   │   ├── PlayerPiece.tsx      # 말 (빨강/파랑)
│       │   │   ├── PathLine.tsx         # SVG 경로선 오버레이
│       │   │   ├── TimerBar.tsx         # 타이머 게이지
│       │   │   ├── HpDisplay.tsx        # HP 하트 UI
│       │   │   ├── RoleIndicator.tsx    # 공격자/도망자 뱃지
│       │   │   ├── PlayerInfo.tsx       # 닉네임 + 프로필 박스
│       │   │   ├── ChatPanel.tsx        # 채팅 패널
│       │   │   └── GameOverOverlay.tsx  # WIN/LOSE + REMATCH
│       │   └── Effects/
│       │       ├── CollisionEffect.tsx  # 충돌 이펙트 (파티클)
│       │       └── ExplosionEffect.tsx  # 폭발 이펙트
│       └── assets/
│           └── sounds/
│               └── hit.mp3
│
└── server/                          # Node.js + Express + Socket.IO
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts                 # 서버 진입점 (Express + Socket.IO)
        ├── types/
        │   └── game.types.ts        # 서버 측 타입
        ├── game/
        │   ├── GameRoom.ts          # 방 상태 + 생명주기
        │   ├── GameEngine.ts        # 순수 게임 로직 (충돌, 역할)
        │   └── ServerTimer.ts       # 서버 타이머 (10초 경로 제한)
        ├── store/
        │   └── RoomStore.ts         # 인메모리 방 저장소
        └── socket/
            ├── socketServer.ts      # Socket.IO 초기화
            ├── roomHandler.ts       # 방 생성/입장 이벤트
            ├── gameHandler.ts       # 게임 이벤트 (경로 제출 등)
            └── chatHandler.ts       # 채팅 이벤트
```

---

## 2. TypeScript 타입 정의

```typescript
// types/game.types.ts

export interface Position {
  row: number; // 0~4
  col: number; // 0~4
}

export type PlayerColor = 'red' | 'blue';
export type GamePhase = 'planning' | 'moving' | 'result' | 'gameover';
export type PlayerRole = 'attacker' | 'escaper';

export interface PlayerState {
  id: string;
  nickname: string;
  color: PlayerColor;
  hp: number;             // 0~3
  position: Position;
  plannedPath: Position[];
  pathSubmitted: boolean;
  role: PlayerRole;
  stats: { wins: number; losses: number };
}

export interface GameState {
  roomId: string;
  code: string;           // 6자리 입장 코드
  turn: number;           // 1부터 시작
  phase: GamePhase;
  pathPoints: number;     // Math.min(4 + turn, 10)
  players: {
    red: PlayerState;
    blue: PlayerState;
  };
  attackerColor: PlayerColor;
}

export interface CollisionEvent {
  step: number;
  position: Position;
  escapeeColor: PlayerColor;
  newHp: number;
}

// Socket 이벤트 페이로드
export interface PathsRevealPayload {
  redPath: Position[];
  bluePath: Position[];
  redStart: Position;
  blueStart: Position;
  collisions: CollisionEvent[];
}

export interface RoundStartPayload {
  turn: number;
  pathPoints: number;
  attackerColor: PlayerColor;
  redPosition: Position;
  bluePosition: Position;
}
```

---

## 3. 소켓 이벤트 프로토콜

### Client → Server

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `create_room` | `{ nickname: string }` | 방 생성 (친구 대전) |
| `join_room` | `{ code: string, nickname: string }` | 코드로 방 입장 |
| `join_random` | `{ nickname: string }` | 랜덤 매치메이킹 |
| `submit_path` | `{ path: Position[] }` | 경로 제출 |
| `request_rematch` | `{}` | 재시합 요청 |
| `accept_rematch` | `{}` | 재시합 수락 (서버에서 중복 처리) |
| `chat_send` | `{ message: string }` | 채팅 전송 |

### Server → Client

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `room_created` | `{ roomId, code, color: 'red' }` | 방 생성 완료 |
| `room_joined` | `{ roomId, color: 'blue', opponentNickname }` | 방 입장 완료 |
| `opponent_joined` | `{ nickname }` | 상대방 입장 알림 |
| `join_error` | `{ message }` | 입장 오류 |
| `game_start` | `GameState` | 게임 시작 |
| `round_start` | `RoundStartPayload` | 라운드 시작 (경로 지정 단계) |
| `opponent_submitted` | `{}` | 상대방 경로 제출 완료 알림 |
| `paths_reveal` | `PathsRevealPayload` | 경로 공개 + 충돌 정보 |
| `round_end` | `{ redPos, bluePos, newTurn }` | 라운드 종료 |
| `game_over` | `{ winner: PlayerColor }` | 게임 종료 |
| `rematch_requested` | `{}` | 상대방 재시합 요청 |
| `rematch_start` | `GameState` | 재시합 시작 (새 게임 상태) |
| `chat_receive` | `{ sender, message, timestamp }` | 채팅 수신 |

---

## 4. 화면 설계 (Screen Layouts)

### 4.1 로비 화면

```
┌──────────────────────────────────────┐
│                                      │
│           PathClash                  │
│         (게임 타이틀)                │
│                                      │
│    ┌──────────────────────────┐     │
│    │  닉네임 입력...           │     │
│    └──────────────────────────┘     │
│                                      │
│    ┌──────────────────────────┐     │
│    │      AI 대전             │     │
│    └──────────────────────────┘     │
│                                      │
│    ┌──────────────────────────┐     │
│    │  친구 대전 (코드 매칭)   │     │
│    └──────────────────────────┘     │
│                                      │
│    ┌──────────────────────────┐     │
│    │      랜덤 매칭           │     │
│    └──────────────────────────┘     │
│                                      │
└──────────────────────────────────────┘

[친구 대전 클릭 시 모달]:
┌──────────────────────────────────────┐
│  방 만들기         방 참가하기       │
│  [방 코드: ABCD12] [코드 입력...]   │
│                    [입장]            │
└──────────────────────────────────────┘
```

### 4.2 인게임 화면

```
┌────────────────────────────────────────────┐
│ [BlueNick ▼]       [====TIMER====]  [🔊] │
│  ♥ ♥ ♥  Blue HP                          │  ← 상대방(파랑) 정보 (자신이 빨강일 때)
├────────────────────────────────────────────┤
│                                            │
│    [공격자: 🔴] 또는 [도망자: 🔵] 배지     │
│                                            │
│        col:  0    1    2    3    4         │
│  row 0  ┌────┬────┬────┬────┬────┐        │
│         │    │    │    │    │    │        │
│  row 1  ├────┼────┼────┼────┼────┤        │
│         │    │    │    │    │    │        │
│  row 2  ├────┼────┼────┼────┼────┤        │
│         │ 🔴 │    │    │    │ 🔵 │        │  ← 초기 배치
│  row 3  ├────┼────┼────┼────┼────┤        │
│         │    │    │    │    │    │        │
│  row 4  └────┴────┴────┴────┴────┘        │
│                                            │
│   (SVG 경로선 오버레이: 빨강 두껍게, 파랑 위)│
│                                            │
├────────────────────────────────────────────┤
│ **Red HP** ♥ ♥ ♥   [RedNick ▼]           │  ← 자신(빨강) 정보
│ [채팅 입력창...]                Tab       │
└────────────────────────────────────────────┘

* 자신이 파랑일 경우 위아래가 뒤바뀜
* [NickName ▼] 클릭 시 프로필 박스 토글
```

### 4.3 게임 종료 오버레이

```
┌────────────────────────────────────────────┐
│              (반투명 배경)                  │
│                                            │
│           ✨ YOU WIN! ✨                   │
│         (또는 💀 YOU LOSE)                 │
│                                            │
│          ┌──────────────┐                 │
│          │   REMATCH    │                 │
│          └──────────────┘                 │
│                                            │
│  (상대방이 재시합을 요청하였습니다...)      │
│                                            │
└────────────────────────────────────────────┘
```

---

## 5. 컴포넌트 상세 설계

### 5.1 GameGrid.tsx

```typescript
// 역할: 5×5 그리드 렌더링, 드래그 이벤트 관리
// Props: 없음 (gameStore에서 직접 구독)
// 구조:
//   <div class="game-grid" onMouseDown onMouseMove onMouseUp>
//     {5×5 GridCell들}
//     <PlayerPiece color="red" />
//     <PlayerPiece color="blue" />
//     <PathLine color="red" />   ← z-index 낮음, strokeWidth 두꺼움
//     <PathLine color="blue" />  ← z-index 높음, strokeWidth 얇음
//     <CollisionEffect />
//   </div>
```

### 5.2 PlayerPiece.tsx

```typescript
// Props: color: PlayerColor, isAttacker: boolean
// 구조:
//   <div
//     class="piece piece-{color}"
//     style={{ transform: `translate(${col * cellSize}px, ${row * cellSize}px)` }}
//   >
//     {isAttacker && <div class="attacker-glow" />}
//   </div>
//
// 이동 애니메이션: CSS transition: transform 200ms linear
// 피격 애니메이션: CSS class "hit-flash" (3회 깜빡임)
// 폭발 애니메이션: CSS class "explode" (확대 후 사라짐)
```

### 5.3 PathLine.tsx

```typescript
// SVG 오버레이로 경로선 렌더링
// Props: color: PlayerColor, path: Position[]
//
// SVG polyline으로 그리드 셀 중앙을 연결
// red:  strokeWidth=6, opacity=0.8, z-index=1 (뒤)
// blue: strokeWidth=3, opacity=0.9, z-index=2 (앞)
//
// 경로 지정 중: 점선 + 반투명
// 이동 중: 실선 + 불투명 (상대방 경로 공개)
```

### 5.4 TimerBar.tsx

```typescript
// Props: duration: number (10), startAt: number (timestamp)
// CSS transition: width linear {duration}s
// 색상: green(>50%) → yellow(20~50%) → red(<20%)
// 서버 timestamp 기준으로 남은 시간 계산
```

### 5.5 HpDisplay.tsx

```typescript
// Props: color: PlayerColor, hp: number, myColor: PlayerColor
// 자신 색상의 "Red HP" or "Blue HP" 텍스트만 font-weight: bold
// hp 개수만큼 ♥ 렌더 (나머지는 ♡ 빈 하트)
// 피격 시: "shake" CSS 애니메이션 (해당 하트에만)
```

### 5.6 usePathInput.ts

```typescript
interface PathInputState {
  path: Position[];
  isActive: boolean;        // 입력 가능 여부 (planning 단계만)
  isDraggingFromPiece: boolean;
  isDraggingFromEnd: boolean;
}

// 드래그 로직:
// MouseDown on own piece → isDraggingFromPiece = true
// MouseDown on path-end cell → isDraggingFromEnd = true (되돌리기 모드)
// MouseMove over new cell →
//   isDraggingFromPiece: path에 추가 (유효성 검사 통과 시)
//   isDraggingFromEnd:   마지막 경로 제거 (되돌리기)
//                        새 방향으로 이동 시 새 경로 추가
// MouseUp → 드래그 종료
//
// 방향키:
// ArrowUp/Down/Left/Right → 현재 경로 끝에서 해당 방향으로 1칸 추가
// (pathPoints 초과 시 무시)
```

---

## 6. 게임 엔진 설계 (Server-side)

### 6.1 충돌 감지 알고리즘

```typescript
// GameEngine.ts
function detectCollisions(
  redPath: Position[],
  bluePath: Position[],
  redStart: Position,
  blueStart: Position
): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  const redSeq = [redStart, ...redPath];
  const blueSeq = [blueStart, ...bluePath];
  const maxLen = Math.max(redSeq.length, blueSeq.length);

  for (let i = 0; i < maxLen; i++) {
    const r = redSeq[Math.min(i, redSeq.length - 1)];
    const b = blueSeq[Math.min(i, blueSeq.length - 1)];

    // 같은 칸 충돌
    if (r.row === b.row && r.col === b.col) {
      events.push({ step: i, position: r, type: 'same_cell' });
    }

    // 교차 충돌 (step i에서 i+1로 이동 시 교차)
    if (i + 1 < maxLen) {
      const rNext = redSeq[Math.min(i + 1, redSeq.length - 1)];
      const bNext = blueSeq[Math.min(i + 1, blueSeq.length - 1)];
      if (r.row === bNext.row && r.col === bNext.col &&
          b.row === rNext.row && b.col === rNext.col) {
        events.push({ step: i, position: r, type: 'cross' });
      }
    }
  }
  return events;
}
```

### 6.2 GameRoom 생명주기

```
상태 전이:
waiting → ready → planning → moving → result → planning (반복)
                                              → gameover

waiting:  한 명만 입장
ready:    두 명 모두 입장, game_start 전송
planning: round_start 전송, 10초 타이머 시작
          → 양쪽 submit_path 수신 시 즉시 paths_reveal
          → 10초 경과 시 미제출자는 현재 위치 유지 경로로 강제 처리
moving:   paths_reveal 전송, 클라이언트 애니메이션 시간만큼 대기 (경로 수 × 200ms)
result:   round_end 전송, HP 0 체크
gameover: game_over 전송
```

### 6.3 REMATCH 처리 (중복 방지)

```typescript
// GameRoom.ts
class GameRoom {
  private rematchRequests: Set<string> = new Set(); // socketId

  handleRematch(socketId: string) {
    if (this.rematchRequests.has(socketId)) return; // 중복 무시
    this.rematchRequests.add(socketId);

    if (this.rematchRequests.size === 1) {
      // 첫 번째 요청 → 상대방에게 알림
      this.notifyOpponent(socketId, 'rematch_requested');
    } else if (this.rematchRequests.size === 2) {
      // 양쪽 모두 수락 → 게임 재시작
      this.rematchRequests.clear();
      this.resetGame();
      this.broadcast('rematch_start', this.getGameState());
    }
  }
}
```

### 6.4 경로 포인트 계산

```typescript
// turn 1 → pathPoints 5
// turn 2 → pathPoints 6
// ...
// turn 6 → pathPoints 10
// turn 7+ → pathPoints 10 (최대)
function calcPathPoints(turn: number): number {
  return Math.min(4 + turn, 10);
}
```

---

## 7. 애니메이션 설계

### 7.1 말 이동 (CSS Transition)

```css
.piece {
  position: absolute;
  width: 60px;
  height: 60px;
  transition: transform 200ms linear;  /* 한 칸당 200ms */
  will-change: transform;
}

/* 이동 시 transform: translate(col * CELL_SIZE, row * CELL_SIZE) 업데이트 */
```

### 7.2 공격자 광원

```css
.attacker-glow {
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  animation: glow-pulse 1s ease-in-out infinite;
}

/* red 공격자 */
.piece-red .attacker-glow {
  background: radial-gradient(circle, rgba(255,100,100,0.6) 0%, transparent 70%);
}

/* blue 공격자 */
.piece-blue .attacker-glow {
  background: radial-gradient(circle, rgba(100,100,255,0.6) 0%, transparent 70%);
}

@keyframes glow-pulse {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50%       { transform: scale(1.3); opacity: 1; }
}
```

### 7.3 피격 깜빡임

```css
@keyframes hit-flash {
  0%, 100% { opacity: 1; }
  25%, 75% { opacity: 0.2; }
}

.piece.hit { animation: hit-flash 600ms ease 3; }
```

### 7.4 폭발 (HP 0)

```css
@keyframes explode {
  0%   { transform: scale(1); opacity: 1; }
  50%  { transform: scale(2); opacity: 0.8; }
  100% { transform: scale(0); opacity: 0; }
}

.piece.exploding { animation: explode 500ms ease-out forwards; }
```

### 7.5 충돌 이펙트

```css
/* CollisionEffect: 절대 위치, 해당 셀 위에 렌더 */
@keyframes collision-burst {
  0%   { transform: scale(0); opacity: 1; }
  60%  { transform: scale(1.5); opacity: 0.8; }
  100% { transform: scale(2); opacity: 0; }
}

.collision-effect {
  animation: collision-burst 400ms ease-out forwards;
  pointer-events: none;
}
```

### 7.6 HP 하트 떨림

```css
@keyframes heart-shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-4px); }
  40%       { transform: translateX(4px); }
  60%       { transform: translateX(-4px); }
  80%       { transform: translateX(4px); }
}

.heart.shaking { animation: heart-shake 400ms ease; }
```

---

## 8. 상태 관리 (Zustand)

### 8.1 gameStore.ts

```typescript
interface GameStore {
  // 상태
  gameState: GameState | null;
  myColor: PlayerColor | null;
  myPath: Position[];          // 현재 지정 중인 경로
  isAnimating: boolean;        // 이동 애니메이션 진행 중
  collisionEffects: { position: Position; id: number }[];
  isMuted: boolean;

  // 액션
  setGameState: (state: GameState) => void;
  setMyColor: (color: PlayerColor) => void;
  updateMyPath: (path: Position[]) => void;
  submitPath: () => void;
  startAnimation: (payload: PathsRevealPayload) => void;
  finishAnimation: () => void;
  triggerCollisionEffect: (position: Position) => void;
  toggleMute: () => void;
  resetGame: () => void;
}
```

---

## 9. 경로 지정 시각 피드백

### 경로 지정 단계 중 렌더:
- **자신의 경로**: 실선, 자신 색상, 반투명
- **상대 경로**: 숨김 (상대방이 제출했으면 체크마크 표시)

### 이동 단계 중 렌더:
- **양쪽 경로**: 모두 공개, 말이 이동하며 지나간 경로는 페이드아웃

### 경로 유효성:
```typescript
function isValidMove(from: Position, to: Position): boolean {
  const dr = Math.abs(to.row - from.row);
  const dc = Math.abs(to.col - from.col);
  // 상하좌우 1칸만 허용
  return (dr + dc === 1) && to.row >= 0 && to.row <= 4 && to.col >= 0 && to.col <= 4;
}
```

---

## 10. 구현 순서 (세부)

### Step 1: 프로젝트 초기화
- `npm create vite@latest client -- --template react-ts`
- `npm init` for server, 의존성: `express`, `socket.io`, `typescript`, `ts-node`
- Zustand, Tailwind CSS 설치

### Step 2: 서버 기반
- `index.ts`: Express + Socket.IO 서버
- `RoomStore.ts`: 인메모리 방 관리
- `GameRoom.ts`: 방 생명주기 (waiting → playing)
- `roomHandler.ts`: `create_room`, `join_room` 이벤트

### Step 3: 게임 코어 (클라이언트)
- `types/game.types.ts`
- `gameStore.ts`
- `GameGrid.tsx`: 5×5 렌더링
- `PlayerPiece.tsx`: 말 기본 렌더
- `usePathInput.ts`: 드래그 + 방향키 경로 지정

### Step 4: 게임 코어 (서버)
- `GameEngine.ts`: 충돌 감지 알고리즘
- `ServerTimer.ts`: 10초 타이머
- `gameHandler.ts`: `submit_path`, `paths_reveal`

### Step 5: 애니메이션 + 이펙트
- `useGameAnimation.ts`: 스텝별 이동
- 광원, 깜빡임, 충돌, 폭발 이펙트

### Step 6: UI 완성
- `TimerBar.tsx`, `HpDisplay.tsx`, `GameOverOverlay.tsx`
- REMATCH 시스템

### Step 7: 로비 + 부가 기능
- `LobbyScreen.tsx`, 소켓 연결
- 채팅, 사운드, 프로필 박스

---

## 11. 주요 설계 결정사항

| 결정 | 이유 |
|------|------|
| SVG PathLine 오버레이 | CSS만으로는 비직선 경로 렌더 어려움, SVG polyline이 직관적 |
| 서버 타이머 기준 | 클라이언트 시간 불일치 방지, 공정한 타임아웃 처리 |
| CSS transition으로 이동 | requestAnimationFrame보다 선언적, 퍼포먼스 동등 |
| 충돌을 서버에서 계산 | 클라이언트 조작 방지, 단일 진실 소스 |
| Zustand | Redux보다 보일러플레이트 적음, 게임 상태 규모에 적합 |
| 인메모리 RoomStore | DB 불필요 (게임 중 상태만 필요), 재배포 시 리셋 허용 |

---

*Generated by PDCA Design Phase — PathClash Web Turn-Based Game*
