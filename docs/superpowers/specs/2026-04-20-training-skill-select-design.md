# 훈련장 스킬 선택 UI 설계

## 개요

훈련장 진입 시 게임이 바로 시작되지 않고, 모든 스킬이 해금된 장착 스킬 UI가 먼저 표시된다. 플레이어가 스킬을 선택하고 확인을 누르면 게임이 시작된다.

---

## 서버 변경

### `server/src/socket/socketServer.ts`

훈련 모드 진입 시 `room.prepareGameStart()` 대신 `room.waitForSkillSelection()`을 호출한다.

`ability_room_joined` 페이로드에 `training: true` 플래그를 추가한다.

`training_skills_confirmed` 이벤트 핸들러를 추가한다:
- 소켓 ID로 방을 찾는다.
- `room.confirmTrainingSkills(skills)` 호출.

### `server/src/game/ability/AbilityRoom.ts`

메서드 2개 추가:

**`waitForSkillSelection()`**
- 플레이어(red) 소켓에 `ability_training_skill_select` 이벤트를 emit한다.

**`confirmTrainingSkills(skills: AbilitySkillId[])`**
- 플레이어의 `equippedSkills`를 전달받은 skills로 업데이트한다.
- `this.prepareGameStart()`를 호출해 게임을 시작한다.

---

## 클라이언트 변경

### `client/src/components/Ability/AbilityScreen.tsx`

**소켓 이벤트 처리:**
- `ability_training_skill_select` 수신 시:
  - `showTrainingSkillSelect` 상태를 `true`로 설정.
  - `trainingLoadout` 상태를 현재 `equippedSkills`(= `ability_room_joined`에서 받은 값)로 초기화.

**확인 처리:**
- 확인 버튼 클릭 시:
  - `training_skills_confirmed` 이벤트를 선택된 스킬과 함께 emit.
  - `showTrainingSkillSelect`를 `false`로 설정.

**오버레이 렌더링:**
- `showTrainingSkillSelect`가 `true`일 때 AbilityScreen 위에 전체 화면 오버레이를 렌더링.
- 오버레이 내용: 로비의 기존 장착 스킬 UI 구조 그대로 사용.
  - 17개 스킬 전부 표시.
  - owned/unowned 구분 없이 모두 선택 가능 (훈련장 한정 전체 해금).
  - 최대 3개 선택 (로비와 동일한 제한).
  - 하단 확인 버튼.

**`ability_room_joined` 페이로드 변경:**
- `training?: boolean` 필드 추가 수신. 클라이언트는 이 필드로 훈련 모드 여부를 판단한다.

---

## 데이터 흐름

```
로비 훈련장 버튼 클릭
  → join_ability { training: true, equippedSkills: [...] }
  → 서버: AbilityRoom 생성, 봇 추가, waitForSkillSelection()
  → ability_room_joined { training: true, ... }
  → ability_training_skill_select
  → 클라이언트: 스킬 선택 오버레이 표시 (초기값 = 로비 장착 스킬)
  → 플레이어가 스킬 선택 후 확인
  → training_skills_confirmed { skills: [...] }
  → 서버: equippedSkills 업데이트, prepareGameStart()
  → ability_round_start
  → 게임 정상 진행
```

---

## 제약 사항

- 스킬 선택은 훈련장 진입 시 최초 1회만 나타난다. 라운드 사이에는 나타나지 않는다.
- 훈련장 내 스킬 선택에서 고른 스킬은 로비의 장착 스킬 설정을 덮어쓰지 않는다. 훈련장 세션 내에서만 유효하다.
- 기존 훈련 모드의 더미 봇, 마나 설정, 경로 포인트 등은 변경하지 않는다.
