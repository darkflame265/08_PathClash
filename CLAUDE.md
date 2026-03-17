# CLAUDE.md

이 문서는 PathClash 저장소를 빠르게 이해하고, 현재 구조에 맞게 안전하게 수정하기 위한 프로젝트 메모다.

## 1. 프로젝트 개요
PathClash는 5x5 보드에서 경로를 미리 작성한 뒤, 양쪽 말이 동시에 이동하는 실시간 턴 전략 게임이다.

현재 지원 모드:
- AI 대전
- 친구 대전
- 랜덤 매칭
- 협동전 UI 자리만 존재함 (아직 기능 미구현)

기술 스택:
- 프론트엔드: React + TypeScript + Vite
- 백엔드: Node.js + Express + Socket.IO
- 인증/데이터: Supabase
- 안드로이드 앱: Capacitor
- 인앱 결제: Google Play + 서버 검증

## 2. 현재 프로젝트에서 중요한 사실

### 2-1. 게스트 계정이 기본 진입점
- 세션이 없으면 익명(게스트) 계정으로 바로 시작한다.
- 이후 필요할 때 Google 계정으로 연동한다.
- 게스트 -> Google 연동 시, 이미 기존 PathClash 데이터가 있는 Google 계정이면 경고 후 전환 여부를 선택한다.
- 기존 데이터가 없는 Google 계정이면 게스트 진행을 그대로 승격한다.

관련 파일:
- `client/src/auth/guestAuth.ts`
- `server/src/services/playerAuth.ts`

### 2-2. 게임 규칙의 최종 권한은 서버에 있음
- 실제 라운드 진행, 충돌 판정, HP 감소, 승패 판정은 서버가 결정한다.
- 프론트는 대부분 UI와 입력 전달 역할이다.

관련 파일:
- `server/src/game/GameRoom.ts`
- `server/src/game/GameEngine.ts`
- `server/src/socket/socketServer.ts`

### 2-3. Socket.IO가 핵심 통신 채널
- 방 생성/입장/랜덤 매칭/AI 대전은 Socket.IO 이벤트로 처리한다.
- REST는 결제 토큰 지급 검증 같은 일부 기능에만 쓴다.

중요 이벤트 예시:
- `create_room`
- `join_room`
- `join_random`
- `join_ai`
- `request_rematch`
- `finalize_google_upgrade`

관련 파일:
- `client/src/socket/socketClient.ts`
- `client/src/socket/socketHandlers.ts`
- `server/src/socket/socketServer.ts`

### 2-4. 결제는 서버 검증이 들어가 있음
- Google Play 구매 후 바로 토큰을 넣지 않는다.
- 서버에서 Google Play Developer API로 구매 토큰을 검증한 뒤 토큰을 지급한다.
- 미완료 구매 복구 흐름도 들어가 있다.

관련 파일:
- `client/src/payments/tokenShop.ts`
- `server/src/index.ts`
- `server/src/services/googlePlayVerifier.ts`
- `supabase/schema.sql`

### 2-5. 스킨은 파일 분리 중이며, 일부는 이미 분리됨
현재 분리된 스킨 구조:
- `client/src/skins/common/...`
- `client/src/skins/rare/...`
- `client/src/skins/legendary/...`

이미 분리된 스킨 예시:
- common: `plasma`, `gold_core`, `neon_pulse`, `inferno`, `quantum`
- rare: `cosmic`, `arc_reactor`, `electric_core`
- legendary: `atomic`

프리뷰/인게임 렌더 연결 위치:
- 인게임: `client/src/components/Game/PlayerPiece.tsx`
- 로비 미리보기: `client/src/components/Lobby/LobbyScreen.tsx`

## 3. 디렉토리 구조

### 루트
- `client/` - 프론트엔드
- `server/` - 실시간 게임 서버
- `supabase/` - 스키마, RPC 함수, 정책
- `docs/` - 문서
- `coop_mode.md` - 협동전 규칙 문서
- `electric_core.md` - Electric Core 참고 문서
- `README.md` - 공개용 소개 문서

### 프론트엔드
- `client/src/App.tsx`
  - 앱 진입점
  - auth 초기화
  - 로비/게임 화면 분기
  - lazy load 적용됨

- `client/src/auth/guestAuth.ts`
  - 게스트 세션 초기화
  - Google 연동/전환
  - Supabase RPC 호출

- `client/src/components/Lobby/`
  - 로비 UI
  - 계정, AI 대전, 친구 대전, 랜덤 매칭, 협동전 카드 UI
  - 스킨창 / 설정창 / 오디오창 / 토큰샵 포함

- `client/src/components/Game/`
  - 인게임 UI
  - 보드, 타이머, 채팅, 플레이어 패널, 경로 작성

- `client/src/store/gameStore.ts`
  - Zustand 전역 상태
  - 인증, 계정, 스킨, 게임 상태, 오디오 설정

- `client/src/i18n/translations.ts`
  - EN / KR 번역 정의

- `client/src/skins/`
  - 스킨별 `Game.tsx`, `Preview.tsx`, `game.css`, `preview.css`, `meta.ts`

### 백엔드
- `server/src/index.ts`
  - Express 서버
  - Socket.IO 연결
  - 결제 검증 REST API

- `server/src/socket/socketServer.ts`
  - 방 생성/입장/매칭/AI 처리
  - Google 연동 finalize socket 처리

- `server/src/game/GameRoom.ts`
  - 실제 매치 진행 로직
  - 라운드 진행, 경로 공개, 이동 완료, 승패 판정
  - 타이머/timeout 정리 중요

- `server/src/game/GameEngine.ts`
  - 보드 계산, 장애물 생성, 충돌 계산

- `server/src/game/AiPlanner.ts`
  - AI 경로 생성

- `server/src/store/RoomStore.ts`
  - 방 저장소, socket-room 매핑, random queue 관리
  - sweep 로직 있음

- `server/src/services/playerAuth.ts`
  - access token 검증
  - 계정 요약 조회/생성
  - 게스트 -> Google 연동 마무리

### 데이터베이스
- `supabase/schema.sql`
  - `profiles`
  - `player_stats`
  - `owned_skins`
  - `account_merges`
  - `google_play_token_purchases`
  - `grant_tokens_from_google_purchase`
  - `purchase_skin_with_tokens`

## 4. 지금 구조에서 꼭 기억해야 할 포인트

### 4-1. `GameScreen` lazy load 이슈는 서버 handshake로 막고 있음
- 예전에는 `GameScreen`이 늦게 마운트되면 AI 첫 진입에서 무한 로딩이 났다.
- 현재는 `game_client_ready` handshake 후 서버가 게임을 시작한다.
- 이 구조를 함부로 되돌리면 AI 첫 진입 버그가 재발할 수 있다.

관련 파일:
- `client/src/components/Game/GameScreen.tsx`
- `server/src/socket/socketServer.ts`
- `server/src/game/GameRoom.ts`

### 4-2. 게임 중 이탈은 timeout 정리가 중요
- 플레이어가 나간 뒤 예약된 timeout이 남아 있으면 서버가 크래시할 수 있었다.
- 현재는 `GameRoom`에서 pending timeout 정리 로직을 갖고 있다.
- 라운드 예약 로직을 수정할 때는 stale timeout 문제를 다시 만들지 않도록 주의해야 한다.

### 4-3. 스킨 구매 가격은 DB 함수가 최종 기준
- 클라이언트가 가격을 정하지 않는다.
- `purchase_skin_with_tokens(p_skin_id)` 함수가 허용 스킨과 가격을 직접 결정한다.
- UI에서 가격만 바꾸고 SQL을 안 바꾸면 불일치가 생긴다.

### 4-4. Electric Core는 canvas 기반 특수 스킨
- `electric_core`는 다른 CSS 기반 스킨과 달리 canvas 애니메이션을 사용한다.
- 관련 수정은 `ElectricCoreCanvas.tsx`, `game.css`, `preview.css`를 같이 봐야 한다.

## 5. 스킨 작업 규칙

### 5-1. 현재 스킨 연결 방식
- 인게임 렌더: `PlayerPiece.tsx`
- 로비 미리보기: `LobbyScreen.tsx`
- 스킨 목록/가격/설명: `LobbyScreen.tsx`
- DB 구매 가격 검증: `supabase/schema.sql`

### 5-2. 스킨 파일 구조
각 스킨 폴더는 보통 아래 구성을 가진다.
- `Game.tsx`
- `game.css`
- `Preview.tsx`
- `preview.css`
- `meta.ts`

### 5-3. 프리뷰는 인게임과 별도로 조정 가능
- 일부 스킨은 preview 전용 레이어를 따로 둔다.
- 특히 `cosmic`, `quantum`, `arc_reactor`, `electric_core`는 preview 전용 정렬/크기 보정이 들어가 있다.

## 6. 협동전 상태
- 현재는 로비에 협동전 카드와 버튼만 있다.
- 버튼 클릭 시 “아직 미구현 입니다.” 경고만 띄운다.
- 실제 규칙 문서는 `coop_mode.md`에 정리되어 있다.
- 구현 전에는 반드시 `coop_mode.md`를 기준으로 상태 모델을 먼저 확정해야 한다.

## 7. 환경 변수

### 클라이언트
- `VITE_SERVER_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_POLICY_URL_KR`
- `VITE_POLICY_URL_EN`
- `VITE_TERMS_URL_KR`
- `VITE_TERMS_URL_EN`
- `VITE_DONATE_URL`

### 서버
- `PORT`
- `CLIENT_URL`
- `ALLOWED_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_PLAY_PACKAGE_NAME`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- 토큰팩 product env들

## 8. 배포 메모
- 웹 프론트 변경: Render `Static Site` 재배포
- 서버 변경: Render `Web Service` 재배포
- Android 앱 변경: AAB / APK 다시 빌드
- SQL 함수 변경: Supabase SQL Editor에서 해당 함수 재실행 필요

## 9. 먼저 읽을 파일 순서
1. `README.md`
2. `client/src/App.tsx`
3. `client/src/auth/guestAuth.ts`
4. `client/src/components/Lobby/LobbyScreen.tsx`
5. `client/src/components/Game/GameScreen.tsx`
6. `client/src/components/Game/PlayerPiece.tsx`
7. `server/src/socket/socketServer.ts`
8. `server/src/game/GameRoom.ts`
9. `supabase/schema.sql`
10. `coop_mode.md`

## 10. 작업 원칙
- 규칙 변경은 서버 기준으로 본다.
- 결제/계정/스킨 가격은 클라이언트만 보고 수정하지 않는다.
- 스킨은 가능하면 폴더 단위로 분리하고, preview와 game을 따로 본다.
- 인코딩이 깨진 문서는 부분 수정하지 말고 UTF-8로 전체 교체하는 편이 안전하다.
