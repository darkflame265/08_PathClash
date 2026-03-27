# Skill Balance Notes

이 문서는 능력대전 스킬 밸런스 조정 시 참고하는 메모입니다.
실제 값은 반드시 클라이언트/서버 공통 코스트 정의를 함께 확인합니다.

## 기본 원칙

- 표기값과 실제 소모값은 반드시 같아야 합니다.
- 마나 코스트는 클라이언트와 서버에서 같은 원천값을 사용해야 합니다.
- 설명문, 장착 스킬 창, 인게임 버튼, 실제 차감값이 어긋나면 안 됩니다.

## 코스트 수정 규칙

수정 시 반드시 함께 확인할 곳:
- [client/src/types/ability.types.ts](c:/08_PathClash/client/src/types/ability.types.ts)
- [server/src/game/ability/AbilityTypes.ts](c:/08_PathClash/server/src/game/ability/AbilityTypes.ts)
- 장착 스킬 창 설명
- 인게임 스킬 버튼 표기
- 실제 서버 차감

## 패치노트 작성 규칙

마나 코스트가 내려가면:
- `(버프)` / `(Buff)`
- 초록색 표시

마나 코스트가 올라가면:
- `(너프)` / `(Nerf)`
- 빨간색 표시

표기 방식:
- `기존값 -> 변경값`
- 예: `가드 마나 코스트: 4 -> 2 (버프)`

## 최근 밸런스 변경 이력

### 2026.03.27
- 가드: `4 -> 2`
- 양자 도약: `3 -> 4`
- 투명화: `8 -> 4`
- 힐링: `10 -> 8`
- 원자분열: `4 -> 6`
- 용암지대: `4 -> 6`

## 스킬별 운영 메모

### 가드
- 저코스트 방어의 기준점
- 성능이 낮게 느껴지면 코스트 완화 우선 검토

### 양자 도약
- 유틸 기준점
- 이동 설계 자유도가 높아서 코스트가 지나치게 낮으면 과도하게 강해질 수 있음

### 투명화
- 정보 은닉 + 위치 재배치
- 체감이 약하면 코스트 완화 쪽이 우선

### 용암지대
- 지속 압박형 스킬
- 체감 성능이 과하면 코스트 또는 지속시간을 우선 조정

### 원자분열
- 경로 재현형 공격
- 발동 시점을 0칸 고정으로 바꾼 상태
- 코스트와 별개로 분신 지속/충돌 판정 체감도 중요

### 오버드라이브
- 하이리스크 하이리턴
- 과부화 턴의 조합 폭발력이 높아지면 역할 제한이나 반동 강화로 조정

## 관련 파일

- [client/src/types/ability.types.ts](c:/08_PathClash/client/src/types/ability.types.ts)
- [server/src/game/ability/AbilityTypes.ts](c:/08_PathClash/server/src/game/ability/AbilityTypes.ts)
- [client/src/components/Lobby/LobbyScreen.tsx](c:/08_PathClash/client/src/components/Lobby/LobbyScreen.tsx)
