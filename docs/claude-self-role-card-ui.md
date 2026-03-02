# Claude Request: Style Only My Role Card Area

이 프로젝트에서 인게임 화면의 **내 플레이어 카드 영역**, 그중에서도 **자신의 역할 카드가 있는 부분만** 시각적으로 개선해줘.

## 작업 범위

불필요한 파일 탐색은 하지 말고 아래 파일만 먼저 읽고 수정해줘.

### 우선 수정 대상

- `client/src/components/Game/GameScreen.tsx`
- `client/src/components/Game/GameScreen.css`

### 필요할 때만 참고

- `client/src/components/Game/PlayerInfo.tsx`
- `client/src/components/Game/PlayerInfo.css`
- `client/src/components/Game/HpDisplay.tsx`
- `client/src/components/Game/HpDisplay.css`

## 정확히 수정할 영역

내 카드 영역은 아래 JSX 블록이다.

- `client/src/components/Game/GameScreen.tsx`
- 자기 카드 컨테이너: `gs-player-card gs-self gs-color-${myColor}`
- 자기 역할 배지: `gs-role-badge gs-role-badge-self`

현재 자기 역할 표시 관련 위치:

- 역할 카드 컨테이너 시작 부근: `GameScreen.tsx` line ~161
- 역할 아이콘: `GameScreen.tsx` line ~163
- 역할 라벨: `GameScreen.tsx` line ~164

현재 관련 CSS 클래스:

- `.gs-player-card`
- `.gs-self`
- `.gs-self.gs-color-red`
- `.gs-self.gs-color-blue`
- `.gs-role-badge`
- `.gs-role-badge-self`
- `.gs-role-icon`
- `.gs-role-label`

## 요구사항

- **상대 플레이어 카드 쪽은 건드리지 말고**, **내 플레이어 카드 영역만** 꾸며줘
- 특히 **내 역할 카드 부분**이 눈에 잘 띄게 바꿔줘
- 플레이어가 글자를 읽지 않아도 분위기, 색, 형태만 보고 자기 역할이 `ATK`인지 `RUN`인지 바로 알 수 있게 해줘
- 단순히 텍스트 색만 바꾸지 말고, 카드 배경/배지/강조선/아이콘 분위기까지 포함해서 구분해줘

## 역할별 방향

### ATK

- 공격적이고 압박감 있는 분위기
- 뜨거운 계열 색상 사용: crimson / red / orange-red 계열
- 조금 더 각지고 강한 형태
- 타격감 있는 glow, 경고선, 전술적인 느낌 가능

### RUN

- 회피/생존/민첩한 분위기
- 차가운 계열 색상 사용: cyan / teal / mint / electric blue 계열
- 더 유선형이고 가벼운 형태
- 흐르는 느낌, speed line, 탈출/이동의 느낌 가능

## 제한사항

- 레이아웃을 크게 깨지 않게 해줘
- 현재 반응형 구조를 망치지 않게 해줘
- 자기 카드 전체를 완전히 새로 만들기보다, **현재 구조를 유지하면서 스타일을 강화**하는 방향으로 가줘
- 너무 과하게 번쩍이지 말고, 게임 UI와 어울리는 수준으로 정리해줘

## 선호하는 결과

- 내 카드만 봐도 지금 내가 공격자인지 도주자인지 즉시 인지 가능
- `ATK`와 `RUN`이 서로 완전히 다른 카드 언어를 갖도록
- 색만 다른 수준이 아니라 배지 분위기와 카드 accent 자체가 다르게 보이도록

## 구현 기대

- 필요하면 JSX에 역할별 class 분기 정도는 추가 가능
- 주 작업은 CSS 중심으로 해줘
- 수정 후 어떤 class를 추가했고 왜 그렇게 나눴는지 간단히 설명해줘

## 한 줄 요약

인게임에서 **내 플레이어 카드의 역할 영역만** 역할별로 강하게 시각 구분되도록 꾸며줘. 상대 카드나 전체 레이아웃은 최소한만 건드려줘.
