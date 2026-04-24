# 스킬 로테이션 시스템 설계

날짜: 2026-04-24

## 개요

매일 UTC 00:00 기준으로 common/rare/legendary 등급별 1개씩 총 3개의 스킬이 로테이션으로 선정된다. 로테이션 스킬은 해당 스킨을 소유하지 않은 플레이어도 일시적으로 장착할 수 있다. 로테이션이 교체되면 비소유 플레이어의 장착은 다음 로그인 시 자동 해제되고 로비에서 플로팅 텍스트로 알린다.

---

## 1. 로테이션 후보 풀

구매 스킨(tokenPrice > 0)에 연결된 스킬만 포함한다. 승리 기반 무료 스킨(ember/nova/aurora/void) 및 기본 classic은 제외한다.

| 등급 | 스킬 ID |
|------|---------|
| common | `plasma_charge`, `gold_overdrive`, `phase_shift`, `inferno_field`, `quantum_shift` |
| rare | `cosmic_bigbang`, `arc_reactor_field`, `electric_blitz` |
| legendary | `wizard_magic_mine`, `chronos_time_rewind`, `atomic_fission`, `sun_chariot` |

**제외 규칙:** 전날 로테이션에 있었던 스킬 3개는 다음 날 후보에서 제외한다. 등급별 후보가 1개 이하가 되면 제외 규칙을 무시하고 전체 풀에서 선택한다(edge case 방어).

---

## 2. DB 스키마

```sql
CREATE TABLE skill_rotations (
  date            TEXT PRIMARY KEY,  -- 'YYYY-MM-DD' UTC
  common_skill    TEXT NOT NULL,
  rare_skill      TEXT NOT NULL,
  legendary_skill TEXT NOT NULL
);
```

레코드는 날짜별로 1개씩 쌓인다. 전날 레코드를 참조해 제외 목록을 구성하므로 최소 2일치를 보관한다.

---

## 3. 서버 — rotationService.ts

`server/src/services/rotationService.ts`를 신규 생성한다.

### 인메모리 상태

```ts
interface RotationState {
  date: string;           // 'YYYY-MM-DD' UTC
  skills: AbilitySkillId[]; // [common, rare, legendary] 순서
}
let currentRotation: RotationState | null = null;
```

### `initRotation()` — 서버 시작 시 호출

1. `getUtcDateKey()`로 오늘 날짜 문자열 계산
2. DB `skill_rotations` 에서 오늘 레코드 조회
3. 있으면 → `currentRotation` 에 캐시
4. 없으면 → 전날 레코드 조회 → 제외 목록 구성 → 등급별 랜덤 선택 → DB 저장 → 캐시
5. 다음 UTC 자정까지의 ms 계산 후 `setTimeout(resetRotation, delay)` 등록

### `resetRotation()` — 매일 UTC 00:00

1. `initRotation()` 과 동일한 생성 로직 실행
2. 이후 `setInterval(resetRotation, 24 * 60 * 60 * 1000)` 재등록

### `getCurrentRotation()` — 외부에서 읽기

```ts
export function getCurrentRotation(): AbilitySkillId[] {
  return currentRotation?.skills ?? [];
}
```

### `isRotationSkill(skillId)` — 로테이션 풀 소속 여부 판별

```ts
const ROTATION_POOL: Record<'common'|'rare'|'legendary', AbilitySkillId[]> = { ... };
export function isRotationSkill(skillId: AbilitySkillId): boolean { ... }
```

---

## 4. 서버 — readAccountProfile 수정

`server/src/services/playerAuth.ts` 의 `readAccountProfile` 에 두 가지 변경을 추가한다.

### 4-1. 만료 스킬 자동 해제

계정 프로필 로드 시:

1. `equipped_ability_skills` 배열에서 각 스킬을 순회
2. `isRotationSkill(skillId)` 가 true인 스킬에 대해:
   - `getCurrentRotation().includes(skillId)` — 현재 로테이션에 있으면 유지
   - `ownedSkins.includes(ABILITY_SKILLS[skillId].skinId)` — 스킨 소유 시 유지
   - 둘 다 아니면 → 제거 대상(`removedSkills`)
3. 제거 대상이 1개 이상이면 → DB `profiles.equipped_ability_skills` 업데이트

### 4-2. 반환값에 필드 추가

```ts
// AccountProfile 타입에 추가
removedRotationSkills: AbilitySkillId[];  // 제거된 스킬 목록 (없으면 [])
rotationSkills: AbilitySkillId[];         // 현재 로테이션 스킬 3개
```

---

## 5. 서버 — resolveAccount / resolveAccountForUser

`readAccountProfile` 반환값을 그대로 상위로 전달하므로 별도 변경 없음. `AccountProfile` 타입에 필드가 추가되면 자동으로 클라이언트에 전달된다.

---

## 6. 클라이언트 — Zustand store

`client/src/store/gameStore.ts` 에 추가:

```ts
rotationSkills: AbilitySkillId[];  // 초기값 []
```

`updateAccountProfile` 액션에서 `rotationSkills` 갱신.

---

## 7. 클라이언트 — LobbyScreen.tsx

### 7-1. 잠금 해제 조건

```ts
const hasAbilitySkinUnlocked = (skinId: PieceSkin) => {
  // 기존 로직 ...
  // 추가: 로테이션 스킬이면 unlock
  const skillForSkin = Object.values(ABILITY_SKILLS).find(s => s.skinId === skinId);
  if (skillForSkin && rotationSkills.includes(skillForSkin.id)) return true;
  // 기존 fallback
  return ownedSkins.includes(skinId);
};
```

### 7-2. 로테이션 배지

스킬 카드의 스킬명 옆에 배지 렌더링:

```tsx
<strong>
  {lang === "en" ? skill.name.en : skill.name.kr}
  {rotationSkills.includes(skill.id) && (
    <span className="ability-rotation-badge">로테이션</span>
  )}
</strong>
```

### 7-3. 만료 알림

`session_register` / `account_sync` 응답 처리 시:

```ts
if (removedRotationSkills.length > 0) {
  const firstName = ABILITY_SKILLS[removedRotationSkills[0]].name.kr;
  const extra = removedRotationSkills.length > 1
    ? ` 외 ${removedRotationSkills.length - 1}개`
    : '';
  showSkinFloatingMessage(`로테이션 만료로 ${firstName}${extra} 장착이 해제되었습니다.`);
}
```

`showSkinFloatingMessage()` 와 `.skin-floating-message` CSS를 그대로 사용.

---

## 8. CSS — 로테이션 배지 스타일

`LobbyScreen.css` 에 추가:

```css
.ability-rotation-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.65em;
  font-weight: 600;
  background: linear-gradient(90deg, #b8860b, #ffd700, #b8860b);
  color: #1a1a1a;
  vertical-align: middle;
  letter-spacing: 0.02em;
}
```

---

## 9. Supabase schema.sql 업데이트

`skill_rotations` 테이블 DDL을 `supabase/schema.sql` 에 추가한다.

---

## 10. 변경 파일 목록

| 파일 | 변경 유형 |
|------|-----------|
| `server/src/services/rotationService.ts` | 신규 생성 |
| `server/src/services/playerAuth.ts` | 수정 (만료 해제 + 반환 타입) |
| `server/src/index.ts` | 수정 (`initRotation()` 호출) |
| `client/src/store/gameStore.ts` | 수정 (`rotationSkills` 추가) |
| `client/src/components/Lobby/LobbyScreen.tsx` | 수정 (배지, unlock 조건, 알림) |
| `client/src/components/Lobby/LobbyScreen.css` | 수정 (배지 스타일) |
| `supabase/schema.sql` | 수정 (테이블 DDL 추가) |

---

## 11. 미포함 범위

- 로테이션 스킬을 게임 중에 실시간으로 검증하는 로직: 기존 서버 엔진이 `equippedSkills` 를 그대로 사용하므로, 로테이션 만료가 로그인 시 해제되면 인게임 오용은 방지된다. 추가 실시간 검증은 현 설계 범위 밖.
- 관리자용 로테이션 수동 설정 UI: 현재 불필요.
