# Claude Request: Responsive In-Game Layout Fix

이 프로젝트의 인게임 화면을 반응형 레이아웃으로 수정해줘.

## 문제

- 내 컴퓨터에서는 정상인데, 더 작은 노트북이나 태블릿에서는 게임 보드가 화면 밖으로 돌출됨
- 보드, HUD, 버튼, 채팅창, 오버레이가 현재 디스플레이 크기에 맞게 자동으로 줄어들거나 재배치되어야 함
- 피그마의 오토 레이아웃처럼 화면 크기에 따라 자연스럽게 맞춰졌으면 함

## 핵심 목표

- 휴대폰, 태블릿, 작은 노트북, 데스크탑에서 모두 인게임이 usable 하게 보이도록 수정
- 보드가 항상 화면 안에 들어오도록 우선 배치
- 공간이 부족할 때 보드, 패딩, 폰트, 버튼, 카드 크기가 함께 축소되도록 조정
- 필요하면 레이아웃을 세로 스택 또는 2단 구조로 전환
- `overflow` 때문에 핵심 UI가 잘리거나 가려지지 않게 수정
- 단순히 `zoom`이나 전체 `transform: scale()`로만 때우지 말고 레이아웃 자체를 responsive 하게 조정

## 수정 범위

아래 파일들만 우선 읽고 수정해줘. 괜한 파일 탐색은 하지 말아줘.

### 우선 확인 및 수정 대상

- `client/src/components/Game/GameScreen.tsx`
- `client/src/components/Game/GameScreen.css`
- `client/src/components/Game/GameGrid.tsx`
- `client/src/components/Game/GameGrid.css`
- `client/src/components/Game/GameOverOverlay.tsx`
- `client/src/components/Game/GameOverOverlay.css`
- `client/src/components/Game/ChatPanel.tsx`
- `client/src/components/Game/ChatPanel.css`
- `client/src/components/Game/PlayerInfo.tsx`
- `client/src/components/Game/PlayerInfo.css`
- `client/src/components/Game/HpDisplay.tsx`
- `client/src/components/Game/HpDisplay.css`
- `client/src/components/Game/TimerBar.tsx`
- `client/src/components/Game/TimerBar.css`

### 필요할 때만 참고

- `client/src/store/gameStore.ts`
- `client/src/socket/socketHandlers.ts`

## 현재 의심 포인트

- 고정 `px` 기반 크기와 간격이 많아서 작은 화면에서 전체 합이 viewport를 초과하는 문제
- 보드 크기 계산은 일부 adaptive 하더라도, 주변 카드/HUD/채팅창/오버레이가 함께 줄어들지 않아 레이아웃 전체가 깨지는 문제
- 게임 보드 컨테이너와 인접 UI의 `min-width`, `height`, `padding`, `gap`, `font-size`가 작은 화면 기준으로 설계되지 않았을 가능성

## 수정 방식

- 먼저 현재 인게임 레이아웃 구조를 분석해서 병목 원인을 설명해줘
- 그 다음 실제 코드 수정까지 진행해줘
- 보드 크기를 viewport 또는 부모 컨테이너 기준으로 계산하도록 유지 또는 개선해줘
- 고정값 위주 스타일은 `clamp()`, `min()`, `max()`, `grid`, `flex`, `aspect-ratio` 등을 활용해서 반응형으로 바꿔줘
- 작은 화면에서는 레이아웃을 재배치해서라도 보드와 핵심 정보가 잘리지 않게 해줘
- 세로 높이가 부족한 환경도 고려해줘

## 검증 기준

다음 환경을 기준으로 레이아웃이 깨지지 않게 확인해줘.

- 모바일 세로
- 태블릿 세로
- 태블릿 가로
- 13인치 노트북
- 일반 데스크탑
- 16:9 화면

## 결과물 요구사항

- 실제 코드 수정
- 어떤 파일을 왜 바꿨는지 설명
- 특히 어떤 고정 크기 때문에 문제가 났고, 그걸 어떤 반응형 규칙으로 바꿨는지 설명

## 한 줄 요약

핵심은 어떤 화면 크기에서도 보드가 잘리지 않고, 인게임 전체가 현재 화면 안에서 자연스럽게 축소 또는 재배치되어 playable 하도록 만드는 것이다.
