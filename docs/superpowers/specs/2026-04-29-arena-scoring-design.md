# Arena & Scoring System Design

**Date:** 2026-04-29
**Scope:** 능력 대전 전용 (일반 대결전 경쟁전은 추후 별도 추가 예정)

---

## 1. 목표

- 유저에게 장기적인 성장 목표 제공
- 반복 플레이 동기 부여
- 5000점 도달 시 랭크전 해금

---

## 2. 데이터 구조

### player_stats 추가 컬럼

```sql
current_rating        integer  NOT NULL DEFAULT 0
highest_arena_reached integer  NOT NULL DEFAULT 1
ranked_unlocked       boolean  NOT NULL DEFAULT false
```

- `current_rating`: 현재 점수 (0 이하로 내려가지 않음, floor 0)
- `highest_arena_reached`: 최고 도달 아레나 번호. 점수가 내려가도 감소하지 않음 (영구 저장)
- `ranked_unlocked`: 5000점 이상 도달 시 `true`로 고정

기존 guest / Google 계정 모두 동일하게 적용.

---

## 3. 아레나 구간

| 아레나 | 점수 범위 |
|--------|-----------|
| Arena 1 | 0 ~ 199 |
| Arena 2 | 200 ~ 499 |
| Arena 3 | 500 ~ 899 |
| Arena 4 | 900 ~ 1399 |
| Arena 5 | 1400 ~ 1999 |
| Arena 6 | 2000 ~ 2699 |
| Arena 7 | 2700 ~ 3499 |
| Arena 8 | 3500 ~ 4199 |
| Arena 9 | 4200 ~ 4799 |
| Arena 10 | 4800 ~ 4999 |
| Ranked Unlocked | 5000 이상 |

---

## 4. 승패 점수 변화

| 아레나 구간 | 승리 | 패배 |
|-------------|------|------|
| Arena 1~3 | +50 | -10 |
| Arena 4~6 | +40 | -25 |
| Arena 7~8 | +30 | -30 |
| Arena 9~10 | +25 | -35 |
| ranked_unlocked = true (current_rating ≥ 5000) | +20 | -40 |

점수는 `current_rating` 기준으로 계산. 패배 시 0 미만으로 내려가지 않음.

---

## 5. 아레나 강등 없음 규칙

- `highest_arena_reached`는 절대 감소하지 않음
- `current_rating`은 자유롭게 변동 가능
- 스킨 구매 잠금 해제 조건은 `highest_arena_reached` 기준으로 판단

---

## 6. 스킨-아레나 해금 매핑

> **수정 파일:**
> - 클라이언트 표시: `client/src/data/arenaCatalog.ts`
> - 서버 검증: `supabase/schema.sql` → `purchase_skin_with_tokens` RPC

기본 매핑 (추후 직접 수정 가능):

| 스킨 | 티어 | 필요 아레나 |
|------|------|------------|
| plasma | common | Arena 1 |
| gold_core | common | Arena 1 |
| neon_pulse | common | Arena 2 |
| inferno | common | Arena 2 |
| quantum | common | Arena 3 |
| cosmic | rare | Arena 4 |
| arc_reactor | rare | Arena 5 |
| electric_core | rare | Arena 6 |
| atomic | legendary | Arena 7 |
| chronos | legendary | Arena 8 |
| wizard | legendary | Arena 9 |
| sun | legendary | Arena 10 |

---

## 7. 서버 흐름 (게임 결과 처리)

**파일:** `server/src/game/ability/AbilityRoom.ts`

게임 종료 시 순서:
1. 승자/패자의 `current_rating` 조회
2. 현재 아레나 계산 (`arenaConfig.ts` 참조)
3. 아레나 구간 기준 승/패 점수 계산
4. `current_rating` 업데이트 (floor 0)
5. 새 rating으로 아레나 재계산
6. `highest_arena_reached < 새 아레나`이면 업데이트
7. `current_rating >= 5000`이면 `ranked_unlocked = true`
8. 결과 페이로드에 포함:
   - `ratingChange` (±숫자)
   - `newRating`
   - `newArena`
   - `arenaPromoted` (boolean) — `highest_arena_reached`가 이번 게임에서 증가했을 때만 true
   - `rankedUnlocked` (boolean)

**파일:** `server/src/game/arenaConfig.ts` (새 파일)
- 아레나 구간 상수
- 점수 변화 테이블
- `getArenaFromRating(rating)` 유틸 함수
- `getRatingChange(arena, isWin)` 유틸 함수

---

## 8. AI 매칭 대기 시간 (아레나별 분기)

**파일:** `server/src/socket/socketServer.ts`

AI 대기 시간은 **current_rating 기준 현재 아레나**로 결정 (highest_arena_reached 아님).

| 아레나 (current_rating 기준) | AI fallback 대기 시간 |
|------------------------------|-----------------------|
| Arena 1~3 | 7초 |
| Arena 4~6 | 12초 |
| Arena 7~8 | 20초 |
| Arena 9~10 | 30초 |
| ranked_unlocked = true | AI 없음 |

- AI 승리 시 점수 지급은 실제 유저 승리와 동일
- 상대의 AI 여부를 클라이언트에 노출하지 않음

---

## 9. 매칭 로직

**파일:** `server/src/socket/socketServer.ts`

- 매칭 풀에서 `current_rating` 차이 ±300 이내 우선 연결
- 3초마다 허용 범위 +200 확장
- 10초 이상 대기 시 범위 제한 해제
- 범위 해제 후에도 아레나별 AI fallback 대기 시간 초과 시 fake AI 투입
- 상대 rating은 클라이언트에 노출하지 않음

---

## 10. UI

### 로비 (client/src/components/Lobby/LobbyScreen.tsx)

- 닉네임 근처: `Arena 6` + `Rating: 2450`
- 5000점 미만: `Next Arena: 250 pts`
- 5000점 이상: `Ranked Unlocked` 배지

### 결과 화면 (client/src/components/Ability/AbilityScreen.tsx)

- 승리: `+40 Rating`
- 패배: `-25 Rating`
- 아레나 승급 시: 팝업/애니메이션 `Arena 5 → Arena 6`

### 스킨 상점 (LobbyScreen.tsx 내 스킨 구매 UI)

- 아레나 조건 미달 스킨: 자물쇠 아이콘 + `Arena 4 필요` 텍스트
- 구매 버튼 비활성화
- 조건 달성 시 자동 해금

---

## 11. 수정 파일 목록

| 파일 | 작업 |
|------|------|
| `supabase/schema.sql` | player_stats 컬럼 추가, purchase_skin_with_tokens RPC 아레나 체크 추가 |
| `server/src/game/arenaConfig.ts` | 신규: 아레나 상수 및 유틸 함수 |
| `server/src/game/ability/AbilityRoom.ts` | 게임 종료 후 rating 업데이트 로직 추가 |
| `server/src/socket/socketServer.ts` | AI 대기 시간 아레나별 분기, 매칭 범위 확장 로직 |
| `client/src/data/arenaCatalog.ts` | 신규: 아레나 상수 + 스킨-아레나 매핑 (수정 포인트) |
| `client/src/components/Lobby/LobbyScreen.tsx` | 로비 rating/arena 표시, 스킨 잠금 UI |
| `client/src/components/Ability/AbilityScreen.tsx` | 결과 화면 rating 변화 표시, 아레나 승급 팝업 |
| `client/src/types/ability.types.ts` | 결과 페이로드에 rating 관련 필드 추가 |
| `client/src/store/gameStore.ts` | currentRating, highestArena, rankedUnlocked 상태 추가 |
| `server/src/services/playerAuth.ts` | 계정 스냅샷에 arena 필드 포함 |
