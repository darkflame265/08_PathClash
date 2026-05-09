# 빙결지대 (Ice Field) 스킬 설계 문서

**날짜**: 2026-05-09  
**스킬 ID**: `ice_field`  
**연결 스킨**: `frost_heart` (Legendary, Arena 9)

---

## 1. 개요

빙결지대는 원하는 위치에 빙판 장애물을 설치하는 유틸 스킬이다. 빙판을 밟은 플레이어는 진입 방향으로 강제 슬라이드된다. 용암지대·루트장벽과 동일한 배치 방식을 따르며, 이동 재생 시 원래 경로를 반투명하게 표시한다.

---

## 2. 스킬 메타데이터

| 항목 | 값 |
|------|----|
| 스킬 ID | `ice_field` |
| 한국어 이름 | 빙결지대 |
| 영어 이름 | Ice Field |
| 유형 | 유틸 |
| 마나 코스트 | 6 |
| 발동 단계 | step 0 (계획 단계만) |
| 타겟 규칙 | position (위치 선택) |
| 역할 제한 | 없음 (attacker/escaper 모두 사용 가능) |
| 지속 시간 | 3턴 |
| 연결 스킨 | frost_heart |
| 아이콘 | SVG 눈송이 — `/ui/ability/ice_field.svg` |

---

## 3. 핵심 메커니즘 — 슬라이드

### 3-1. 슬라이드 발동 조건

플레이어가 이동 중 빙판 타일 칸에 진입하는 순간 발동된다.

### 3-2. 슬라이드 방향 결정

슬라이드 방향 = 이전 칸 → 빙판 칸 벡터  
`(dr, dc) = (icePos.row - prevPos.row, icePos.col - prevPos.col)`

### 3-3. 슬라이드 경로 계산

빙판 칸에서 출발해 `(dr, dc)` 방향으로 한 칸씩 연장한다. 다음 중 하나를 만나면 **직전 칸**에서 정지한다:

- 그리드 경계 밖 → 경계 마지막 칸에서 정지
- 다른 장애물 (용암지대, 루트장벽, 다른 빙판) → 장애물 직전 칸에서 정지

슬라이드 연장이 0칸인 경우(빙판 칸이 이미 경계이거나 바로 다음 칸이 장애물): 빙판 칸 자체에 멈춤.

### 3-4. 경로 교체

서버가 플레이어의 원래 경로 중 **빙판 타일 이후 부분**을 슬라이드 경로로 대체한다.

- 대체된 원래 경로(overridden path)는 `iceSlideOverriddenPaths`로 보존된다.
- PP(경로 포인트)는 강제 슬라이드에 소모되지 않는다.

### 3-5. 예시

```
그리드 (5×5), 플레이어가 오른쪽→왼쪽(dc=-1) 이동 중
[2][1][ICE][3][4]  row=2
    ↑ 플레이어가 ICE 밟음
슬라이드 방향: dc=-1 (왼쪽)
슬라이드 경로: ICE → col=1 → col=0 (경계) → col=0에서 정지
원래 경로(col=3, col=4 부분) → iceSlideOverriddenPaths에 저장 → 반투명 표시
```

---

## 4. 서버 변경사항

### 4-1. `AbilityTypes.ts`

```typescript
// 유니온 추가
type AbilitySkillId = ... | 'ice_field';

// 타일 타입
interface AbilityIceFieldTile {
  position: Position;
  remainingTurns: number;
}

// 배틀 스테이트
interface AbilityBattleState {
  ...
  activeIceFieldTiles: AbilityIceFieldTile[];
}

// PathsReveal 페이로드
interface PathsRevealPayload {
  ...
  iceSlideOverriddenPaths: {
    red: Position[] | null;
    blue: Position[] | null;
  };
}
```

### 4-2. `AbilityEngine.ts`

**배치 처리** (step 0 예약 처리 블록):
- `ice_field` 예약 → 마나 차감 + `updateIceFieldTile(activeIceFieldTiles, target, 3)` 호출
- 스킬 이벤트 생성

**이동 처리** (각 스텝 이동 루프 내):
```
if 플레이어가 빙판 타일에 진입:
  direction = 진입 방향(dr, dc) 계산
  slidePath = computeSlidePath(icePosition, direction, obstacles, gridSize)
  overriddenPath = 원래 경로[현재스텝 이후]
  남은 경로 = slidePath로 교체
  iceSlideOverriddenPaths[color] = overriddenPath
```

**턴 종료 처리**:
- `activeIceFieldTiles`의 `remainingTurns` 감소
- 0 도달 시 타일 제거

---

## 5. 클라이언트 변경사항

### 5-1. `ability.types.ts`

`AbilitySkillId`에 `'ice_field'` 추가. 스킬 메타데이터 객체에 코스트·이름·규칙·`skinId` 추가.

### 5-2. `AbilityScreen.tsx`

- `pendingIceField: boolean` 상태 추가
- `handleSkillClick("ice_field")` 연결
- `paths_reveal` 이벤트에서 `iceSlideOverriddenPaths` 수신 및 저장

### 5-3. `AbilityGrid.tsx`

- **빙판 타일 시각화**: 그리드 셀에 눈송이 아이콘 + 반투명 파란 오버레이 렌더링 (`activeIceFieldTiles` 기반)
- **타겟 선택 UI**: `pendingIceField === true` 시 셀 클릭 오버레이 활성화 (inferno_field 패턴 동일)
- **슬라이드 오버라이드 경로 렌더링**: `iceSlideOverriddenPaths`를 `muted` PropLine으로 렌더링 (루트장벽 `movingRootWallBlockedPaths`와 동일 패턴)

### 5-4. 스킬 아이콘

- 파일: `/ui/ability/ice_field.svg`
- 디자인: 6갈래 눈송이, 프로스트 하트 스킨 arm 구조와 동일한 언어
- 색상: `#67e8f9` (시안 아이스 블루)

---

## 6. 처리하지 않는 엣지 케이스

- **슬라이드 중 두 번째 빙판 진입**: 두 번째 빙판을 장애물로 취급하여 직전에서 정지 (체이닝 없음)
- **슬라이드 중 용암지대 진입**: 용암 직전에서 정지 (용암 피해 없음)
- **같은 칸에 두 장애물**: 배치 불가 처리 (다른 장애물과 동일 규칙)
- **빙판 위에 이미 서 있는 플레이어**: 슬라이드 미발동 — 진입 이동이 없으므로 조건 불충족

---

## 7. 기존 코드 패턴 재사용 요약

| 컴포넌트 | 참조 패턴 |
|----------|-----------|
| 배치 처리 | `inferno_field` 처리 블록 |
| 타일 관리 | `updateLavaTile` 함수 패턴 |
| 반투명 경로 | `movingRootWallBlockedPaths` + muted PathLine |
| 타겟 선택 UI | `pendingInferno` / `onInfernoTargetSelect` 패턴 |
| 서버 페이로드 | `rootWallBlockedPaths` 구조 |
