# 훈련장 스킬 선택 UI 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 훈련장 진입 시 게임이 바로 시작되지 않고, 모든 스킬이 해금된 장착 스킬 선택 오버레이가 먼저 표시되며, 확인 후 게임이 시작된다.

**Architecture:** 서버가 훈련 모드 진입 시 `prepareGameStart()` 대신 `waitForSkillSelection()`을 호출해 클라이언트에 `ability_training_skill_select` 이벤트를 emit한다. 클라이언트는 이 이벤트를 받아 오버레이를 표시하고, 확인 시 `training_skills_confirmed`를 서버로 송신한다. 서버는 플레이어 스킬을 업데이트한 뒤 게임을 시작한다.

**Tech Stack:** TypeScript, Socket.IO, React 19, Zustand

---

## 파일 목록

- Modify: `server/src/game/ability/AbilityRoom.ts` — `waitForSkillSelection()`, `confirmTrainingSkills()` 추가
- Modify: `server/src/socket/socketServer.ts` — training 분기 수정, `training_skills_confirmed` 핸들러 추가
- Modify: `client/src/components/Ability/AbilityScreen.tsx` — 오버레이 상태/렌더링 추가

---

### Task 1: AbilityRoom에 훈련 스킬 선택 메서드 추가

**Files:**
- Modify: `server/src/game/ability/AbilityRoom.ts`

- [ ] **Step 1: `waitForSkillSelection()` 메서드 추가**

`enableTrainingMode()` 메서드 바로 아래에 추가한다. (`server/src/game/ability/AbilityRoom.ts:720`)

```typescript
waitForSkillSelection(): void {
  const player = this.players.get('red');
  if (!player) return;
  this.io.to(player.socketId).emit('ability_training_skill_select');
}
```

- [ ] **Step 2: `confirmTrainingSkills()` 메서드 추가**

`waitForSkillSelection()` 바로 아래에 추가한다.

```typescript
confirmTrainingSkills(socketId: string, skills: AbilitySkillId[]): void {
  const player = [...this.players.values()].find((p) => p.socketId === socketId);
  if (!player) return;
  player.equippedSkills = skills;
  this.prepareGameStart();
  this.markClientReady(socketId);
}
```

- [ ] **Step 3: 서버 빌드 확인**

```bash
cd server && npm run build
```

Expected: 오류 없이 빌드 완료.

- [ ] **Step 4: 커밋**

```bash
git add server/src/game/ability/AbilityRoom.ts
git commit -m "feat(ability): 훈련장 스킬 선택을 위한 waitForSkillSelection/confirmTrainingSkills 추가"
```

---

### Task 2: socketServer.ts 훈련 모드 분기 업데이트

**Files:**
- Modify: `server/src/socket/socketServer.ts`

- [ ] **Step 1: training 분기에서 `prepareGameStart()` → `waitForSkillSelection()` 교체 + `ability_room_joined` 페이로드에 `training: true` 추가**

`server/src/socket/socketServer.ts:1209-1214` 부분을 아래와 같이 수정한다.

기존:
```typescript
socket.emit('ability_room_joined', {
  roomId,
  color: 'red',
  opponentNickname: 'Training Dummy',
});
room.prepareGameStart();
```

변경 후:
```typescript
socket.emit('ability_room_joined', {
  roomId,
  color: 'red',
  opponentNickname: 'Training Dummy',
  training: true,
});
room.waitForSkillSelection();
```

- [ ] **Step 2: `training_skills_confirmed` 이벤트 핸들러 추가**

`ability_client_ready` 핸들러(`server/src/socket/socketServer.ts:1329`) 바로 아래에 추가한다.

```typescript
socket.on(
  'training_skills_confirmed',
  ({ skills }: { skills: AbilitySkillId[] }) => {
    const room = abilityStore.getBySocket(socket.id);
    room?.confirmTrainingSkills(socket.id, skills);
  },
);
```

- [ ] **Step 3: 서버 빌드 확인**

```bash
cd server && npm run build
```

Expected: 오류 없이 빌드 완료.

- [ ] **Step 4: 커밋**

```bash
git add server/src/socket/socketServer.ts
git commit -m "feat(socket): 훈련장 스킬 선택 소켓 흐름 추가"
```

---

### Task 3: AbilityScreen에 훈련 스킬 선택 오버레이 추가

**Files:**
- Modify: `client/src/components/Ability/AbilityScreen.tsx`

- [ ] **Step 1: 필요한 import 추가**

파일 상단 import 목록에 추가한다. `AbilityScreen.tsx:47-51` 부근의 CSS import 아래에:

```typescript
import "../Lobby/LobbyScreen.css";
```

그리고 `useGameStore` 구조분해에 `abilityLoadout` 추가 (`AbilityScreen.tsx:319-331`):

기존:
```typescript
const {
  myColor,
  setMyColor,
  setRoomCode,
  accountDailyRewardTokens,
  currentMatchType,
  rematchRequestSent,
  setRematchRequestSent,
  isSfxMuted,
  sfxVolume,
  triggerHeartShake,
  boardSkin,
} = useGameStore();
```

변경 후:
```typescript
const {
  myColor,
  setMyColor,
  setRoomCode,
  accountDailyRewardTokens,
  currentMatchType,
  rematchRequestSent,
  setRematchRequestSent,
  isSfxMuted,
  sfxVolume,
  triggerHeartShake,
  boardSkin,
  abilityLoadout,
} = useGameStore();
```

- [ ] **Step 2: 훈련 스킬 선택 상태 추가**

`AbilityScreen.tsx:333` 부근 (`const [state, setState] = ...` 바로 아래)에 추가한다.

```typescript
const [showTrainingSkillSelect, setShowTrainingSkillSelect] = useState(false);
const [trainingLoadout, setTrainingLoadout] = useState<AbilitySkillId[]>([]);
```

- [ ] **Step 3: `onRoomJoined`가 `training` 플래그를 받도록 수정**

`AbilityScreen.tsx:2515-2525` 의 `onRoomJoined` 함수를 수정한다.

기존:
```typescript
const onRoomJoined = ({
  roomId,
  color,
}: {
  roomId: string;
  color: PlayerColor;
}) => {
  setMyColor(color);
  setRoomCode(roomId);
  socket.emit("ability_client_ready");
};
```

변경 후:
```typescript
const onRoomJoined = ({
  roomId,
  color,
}: {
  roomId: string;
  color: PlayerColor;
  training?: boolean;
}) => {
  setMyColor(color);
  setRoomCode(roomId);
  socket.emit("ability_client_ready");
};
```

(`training` 플래그는 서버에서 페이로드로 내려오지만 이 시점에서는 따로 처리할 필요 없다. 오버레이는 `ability_training_skill_select` 이벤트로 트리거된다.)

- [ ] **Step 4: `ability_training_skill_select` 소켓 이벤트 리스너 등록**

`AbilityScreen.tsx:2666-2690` 부근의 useEffect 내에서 소켓 이벤트 등록/해제 부분에 추가한다.

기존 등록 블록:
```typescript
socket.on("ability_game_start", onGameStart);
socket.on("ability_round_start", onRoundStart);
socket.on("ability_room_joined", onRoomJoined);
// ...
socket.emit("ability_client_ready");

return () => {
  clearAnimationTimeouts();
  clearSubmitTimeouts();
  socket.off("ability_game_start", onGameStart);
  socket.off("ability_round_start", onRoundStart);
  socket.off("ability_room_joined", onRoomJoined);
  // ...
};
```

`onTrainingSkillSelect` 핸들러를 정의하고 등록/해제한다:

useEffect 내 기존 핸들러 함수들 아래에 추가:
```typescript
const onTrainingSkillSelect = () => {
  setTrainingLoadout(abilityLoadout);
  setShowTrainingSkillSelect(true);
};
```

등록:
```typescript
socket.on("ability_training_skill_select", onTrainingSkillSelect);
```

해제:
```typescript
socket.off("ability_training_skill_select", onTrainingSkillSelect);
```

useEffect 의존성 배열에 `abilityLoadout` 추가.

- [ ] **Step 5: 훈련 스킬 선택 오버레이 렌더링 추가**

JSX 반환부에서, 게임 오버 오버레이나 능력 배너 등 기존 오버레이가 렌더링되는 최상단 부근에 아래 코드를 추가한다. `winner` 조건 렌더링 바로 앞에 삽입한다.

```tsx
{showTrainingSkillSelect && (
  <div
    className="upgrade-modal-backdrop"
    style={{ zIndex: 200 }}
  >
    <div
      className="upgrade-modal skin-modal ability-loadout-modal"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="skin-modal-head">
        <h3>{lang === "en" ? "Equipped Skills" : "장착 스킬"}</h3>
        <div className="skin-token-badge" aria-label="Ability loadout count">
          <span className="skin-token-badge-main">
            <span>{trainingLoadout.length} / 3</span>
            <span>{lang === "en" ? "equipped" : "장착 중"}</span>
          </span>
        </div>
      </div>
      <p>
        {lang === "en"
          ? "Select up to 3 skills. All skills are available in training."
          : "훈련장에서는 모든 스킬을 사용할 수 있습니다. 최대 3개를 선택하세요."}
      </p>
      <div className="skin-option-list">
        {Object.values(ABILITY_SKILLS).map((skill) => {
          const equipped = trainingLoadout.includes(skill.id);
          const skillSummary =
            lang === "en"
              ? { tags: skill.loadoutTags.en, desc: skill.loadoutDescription.en }
              : { tags: skill.loadoutTags.kr, desc: skill.loadoutDescription.kr };
          return (
            <button
              key={skill.id}
              className={`skin-option-card ${equipped ? "is-selected" : ""}`}
              type="button"
              onClick={() => {
                if (equipped) {
                  setTrainingLoadout(trainingLoadout.filter((id) => id !== skill.id));
                  return;
                }
                if (trainingLoadout.length >= 3) {
                  window.alert(
                    lang === "en"
                      ? "You can equip up to 3 skills."
                      : "스킬은 최대 3개까지 장착할 수 있습니다.",
                  );
                  return;
                }
                setTrainingLoadout([...trainingLoadout, skill.id]);
              }}
            >
              <span className="skin-preview ability-skill-preview">
                {renderSkillIcon(skill.id)}
              </span>
              <span className="skin-option-copy">
                <strong>{lang === "en" ? skill.name.en : skill.name.kr}</strong>
                <span>
                  {skillSummary.tags}
                  <br />
                  {skillSummary.desc}
                </span>
              </span>
              <span className="skin-lock-meta ability-skill-meta">
                <span className="skin-lock-icon" aria-hidden="true">✨</span>
                <span>
                  {skill.category === "passive"
                    ? lang === "en" ? "Passive · Auto" : "패시브 · 자동"
                    : lang === "en"
                      ? `${skill.manaCost} mana · ${skill.category}`
                      : `마나 ${skill.manaCost} · ${skill.category === "attack" ? "공격" : skill.category === "defense" ? "방어" : "유틸"}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="upgrade-modal-actions">
        <button
          className="lobby-btn primary"
          type="button"
          onClick={() => {
            const socket = getSocket();
            socket.emit("training_skills_confirmed", { skills: trainingLoadout });
            setShowTrainingSkillSelect(false);
          }}
        >
          {lang === "en" ? "Confirm" : "확인"}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: 클라이언트 빌드 확인**

```bash
cd client && npm run build
```

Expected: TypeScript 오류 없이 빌드 완료.

- [ ] **Step 7: 커밋**

```bash
git add client/src/components/Ability/AbilityScreen.tsx
git commit -m "feat(ability): 훈련장 진입 시 스킬 선택 오버레이 추가"
```

---

## 검증 체크리스트

- [ ] 로비에서 훈련장 버튼 클릭 → 훈련장 화면 진입
- [ ] 진입 직후 게임이 시작되지 않고 스킬 선택 오버레이가 표시된다
- [ ] 오버레이에 17개 스킬이 모두 표시되며 모두 선택 가능하다 (잠금 없음)
- [ ] 기본 선택값이 로비에서 장착한 스킬과 동일하다
- [ ] 최대 3개 초과 선택 시 경고창이 뜬다
- [ ] 확인 버튼 클릭 후 오버레이가 닫히고 게임이 시작된다
- [ ] 확인 후 선택한 스킬로 훈련 게임이 진행된다
- [ ] 라운드 사이에 오버레이가 다시 나타나지 않는다
- [ ] 일반 능력 대전(non-training)에는 영향이 없다
