# CLAUDE.md

이 파일은 새로운 Claude 세션이 이 저장소를 빠르게 이해하고 작업할 수 있도록 최소한의 프로젝트 맥락을 정리한 문서다.

## 이 프로젝트가 무엇인지

PathClash는 브라우저에서 플레이하는 실시간 1대1 전략 게임이다.

- 프론트엔드: React + TypeScript + Vite
- 백엔드: Node.js + Express + Socket.IO
- 인증 / 데이터 저장: Supabase
- 핵심 게임 구조: 5x5 보드에서 두 플레이어가 각자 경로를 그린 뒤, 두 경로가 동시에 실행됨

주요 사용자 흐름:

- 방 생성 후 코드 공유
- 코드로 방 참가
- 랜덤 매칭
- AI 대전
- 자동 익명 로그인으로 바로 시작
- 이후 원하면 Google 계정으로 업그레이드

## 반드시 지켜야할 점

- OOP 기반 설계
- 계획부터 말하고 승인 받은 후에 작업 진행
- 최적화를 고려한 코드 작성성

## 저장소 구조

### 루트

- `client/` - 프론트엔드 앱
- `server/` - 실시간 게임 서버
- `supabase/` - SQL 스키마 및 인증 관련 DB 설정
- `docs/` - 문서 및 Claude/Codex 작업 요청서
- `my_game_rule.txt` - 게임 규칙 메모
- `README.md` - 외부 공개용 프로젝트 소개

### 프론트엔드

- `client/src/App.tsx`
  - 앱 시작점
  - 게스트 인증 초기화
  - 인증 상태를 store에 반영

- `client/src/auth/guestAuth.ts`
  - 자동 익명 로그인
  - 세션 복원
  - 닉네임 동기화
  - Google 계정 업그레이드 흐름

- `client/src/components/Lobby/`
  - 로비 UI
  - 방 생성, 코드 입장, AI 매치, 랜덤 매칭

- `client/src/components/Game/`
  - 인게임 UI
  - 보드, 타이머, HP, 채팅, 게임오버 오버레이, 플레이어 카드

- `client/src/store/gameStore.ts`
  - Zustand 기반 전역 상태
  - 인증, 로비, 게임, 애니메이션, 리매치, 채팅, 언어(lang) 상태 관리

- `client/src/hooks/useLang.ts`
  - 언어 토글 훅
  - gameStore의 `lang`/`setLang`을 읽어 `{ lang, toggleLang, t }` 반환

- `client/src/i18n/translations.ts`
  - EN/KR 번역 객체
  - `Translations` 타입 정의

- `client/src/socket/`
  - Socket.IO 클라이언트
  - 서버 이벤트 핸들러

- `client/src/lib/supabase.ts`
  - 브라우저용 Supabase 클라이언트

### 백엔드

- `server/src/index.ts`
  - Express 서버 시작
  - Socket.IO 서버 생성
  - CORS origin 처리

- `server/src/socket/socketServer.ts`
  - 소켓 이벤트 진입점
  - 방 생성/입장/매칭/인증 관련 소켓 이벤트 처리

- `server/src/game/GameRoom.ts`
  - 실제 매치 룸 로직 핵심
  - 턴 진행, 경로 제출, 충돌 판정, 리매치 처리

- `server/src/game/GameEngine.ts`
  - 보드/경로/충돌 계산 함수

- `server/src/game/AiPlanner.ts`
  - AI 이동 경로 생성

- `server/src/store/RoomStore.ts`
  - 룸 저장소 및 랜덤 매칭 대기열 관리

- `server/src/services/playerAuth.ts`
  - 토큰으로 현재 유저 식별
  - 프로필 및 전적 조회/갱신
  - 게스트 -> Google 업그레이드 마무리

- `server/src/lib/supabase.ts`
  - 서버용 Supabase admin 클라이언트

### 데이터베이스

- `supabase/schema.sql`
  - `profiles`
  - `player_stats`
  - `account_merges`
  - RLS 정책 정의

## 중요한 시스템

### 1. 게스트 인증은 핵심 기능이다

이 프로젝트는 세션이 없으면 자동으로 익명 로그인한다.

주요 파일:

- `client/src/auth/guestAuth.ts`

중요한 동작:

- 기존 세션이 있으면 새 익명 계정을 만들면 안 됨
- 먼저 세션 복원을 시도하고, 없을 때만 새 게스트 계정을 생성함
- 나중의 Google 로그인은 별도 신규 계정이 아니라 업그레이드 흐름으로 다뤄야 함

### 2. 실시간 게임은 Socket.IO 중심이다

프론트엔드는 REST보다 Socket.IO 이벤트를 중심으로 서버와 통신한다.

대표 이벤트:

- `create_room`
- `join_room`
- `join_random`
- `join_ai`
- `request_rematch`
- `finalize_google_upgrade`

게임 흐름이 이상하면 우선 아래 두 파일을 같이 봐야 한다.

- `client/src/socket/socketHandlers.ts`
- `server/src/socket/socketServer.ts`

### 3. 게임 규칙의 최종 판정은 서버가 가진다

실제 충돌 판정과 턴 진행은 서버가 권한을 가진다.

게임 규칙을 바꾸려면 주로 아래를 봐야 한다.

- `server/src/game/GameRoom.ts`
- `server/src/game/GameEngine.ts`
- `server/src/types/game.types.ts`

프론트만 바꿔서는 게임 규칙 변경이 끝나지 않는 경우가 많다.

### 4. 다국어(i18n) 시스템

언어 상태는 Zustand `gameStore`의 `lang` 필드에 저장되며 localStorage에 영속된다.

핵심 파일:

- `client/src/i18n/translations.ts` — 번역 키/값 정의
- `client/src/hooks/useLang.ts` — React 컴포넌트용 훅
- `client/src/store/gameStore.ts` — `lang`/`setLang` 액션

**React 컴포넌트에서 사용:**
```typescript
const { t } = useLang();
// t.someKey 로 번역 문자열 접근
```

**React 외부(socketHandlers 등)에서 사용:**
```typescript
import { translations } from '../i18n/translations';
const t = translations[useGameStore.getState().lang];
```

**번역 키 추가 방법:**
1. `Translations` 타입에 키 추가
2. `en` 객체에 영어 값 추가
3. `kr` 객체에 한국어 값 추가
4. KR에서 의도적으로 영어를 유지하는 경우 `// intentionally English (...)` 주석 필수

### 5. 전적과 계정 데이터는 Supabase를 사용한다

클라이언트:

- 일반 사용자 권한으로 본인 프로필/전적 조회 및 일부 업데이트

서버:

- Supabase admin 클라이언트로 인증 검증 및 일부 계정/전적 처리

인증/전적 관련 변경 시 반드시 함께 볼 파일:

- `client/src/auth/guestAuth.ts`
- `server/src/services/playerAuth.ts`
- `supabase/schema.sql`

## 스킨 디자인 수정

스킨 관련 작업은 아래 4개 파일만 건드린다. 다른 파일은 탐색할 필요 없다.

| 파일 | 역할 |
|------|------|
| `client/src/components/Game/PlayerPiece.css` | 인게임 말(piece) 시각 디자인 — `.piece-skin-{id}` 클래스 |
| `client/src/components/Lobby/LobbyScreen.css` | 스킨 선택창 미리보기 — `.skin-preview-{id}` 클래스 |
| `client/src/components/Lobby/LobbyScreen.tsx` | 스킨 목록 정의 (id, name, desc, requiredWins, tokenPrice) |
| `client/src/components/Game/FlagSkin.tsx` | 국기 스킨 SVG 모양만 담당 |

### 스킨 CSS 패턴

- **인게임** — `.piece-skin-{id} .piece-inner` + `::before` + `::after` 로 구성
- **미리보기** — `.skin-preview-{id}` + `::before` + `::after` 로 구성
- `piece-inner`는 `border-radius: 50%; overflow: hidden;` 이므로 내부 자식은 자동으로 원형 클리핑됨
- keyframe 이름은 `{스킨id}-{역할}` 규칙으로 네이밍 (예: `gold-orbit-cw`, `cosmic-nebula-pulse`)

---

## 앞으로 수정할 때의 기본 원칙

- 큰 리팩터링보다, 필요한 범위만 최소 수정하는 편이 좋다
- 인게임 UI 수정은 `client/src/components/Game/`부터 본다
- 로비/계정 관련 수정은 `client/src/components/Lobby/`와 `client/src/auth/guestAuth.ts`부터 본다
- 매칭/방 흐름 수정은 `server/src/socket/socketServer.ts`와 `server/src/store/RoomStore.ts`부터 본다
- 실제 게임 규칙 수정은 `server/src/game/GameRoom.ts`부터 본다
- 인증/보안 변경은 항상 `supabase/schema.sql`까지 교차 확인한다
- 번역 문자열 추가/수정은 `client/src/i18n/translations.ts`만 건드리면 된다

## 환경 변수

### 클라이언트

- `VITE_SERVER_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 서버

- `PORT`
- `CLIENT_URL`
- `ALLOWED_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

중요:

- `.env` 파일은 Git에서 제외되어야 한다
- 비밀 키는 절대 커밋하면 안 된다

## 실무적으로 알아둘 점

- 일부 파일은 인코딩 이력 때문에 한글이 깨져 보일 수 있다
- 검색/SEO 관련 수정은 보통 `client/index.html`, `client/public/`을 건드린다
- 브라우저 탭 / 검색 결과 파비콘은 현재 `client/public/favicon.ico`를 사용한다
- 인게임 반응형 문제는 주로 아래 파일들에서 발생한다
  - `client/src/components/Game/GameScreen.tsx`
  - `client/src/components/Game/GameScreen.css`
  - `client/src/components/Game/GameGrid.tsx`
  - `client/src/components/Game/GameGrid.css`

## 프로젝트를 빨리 이해하려면 이 순서로 읽기

1. `README.md`
2. `client/src/App.tsx`
3. `client/src/auth/guestAuth.ts`
4. `client/src/components/Lobby/LobbyScreen.tsx`
5. `client/src/components/Game/GameScreen.tsx`
6. `server/src/socket/socketServer.ts`
7. `server/src/game/GameRoom.ts`
8. `supabase/schema.sql`

## 이 프로젝트를 보는 기본 관점

이 저장소는 아래 네 가지가 결합된 구조로 이해하면 된다.

- 실시간 멀티플레이 게임
- 게스트 우선 온보딩
- Supabase 기반 인증과 전적 저장
- UI는 프론트가 보여주지만, 실제 게임 판정은 서버가 가진 구조
