# CLAUDE.md

이 문서는 PathClash 저장소를 새 세션의 AI가 빠르게 이해하고 안전하게 수정하기 위한 현재 프로젝트 메모다. 오래된 README나 일부 docs에는 깨진 인코딩/과거 상태가 남아 있을 수 있으니, 이 파일을 우선 기준으로 삼는다.

## 1. 프로젝트 요약

PathClash는 5x5 보드에서 플레이어가 경로를 미리 그리고, 양쪽 경로가 동시에 실행되는 실시간 전략 게임이다. 기본 1v1의 핵심은 추격자/도망자 역할 교대, 경로 예측, 충돌 판정, HP 감소다.

현재 구현된 주요 모드:
- 기본 1v1: AI 대전, 친구 코드 대전, 랜덤 매칭
- Coop 협동 모드
- 2v2 모드
- Ability Battle 모드

기술 스택:
- Frontend: React 19, TypeScript, Vite, Zustand
- Realtime: Socket.IO
- Backend: Node.js, Express 5, TypeScript
- Database/Auth: Supabase(PostgreSQL + Auth)
- Android: Capacitor 8
- Payments: Google Play Billing + 서버 검증
- Audio: Howler.js 중심, 일부 짧은 SFX는 HTMLAudioElement/WebAudio 사용

## 2. 현재 버전/릴리즈 상태

Android 버전 정보는 `server/src/config/app-version.json`이 기준이다.

현재 값:
- `appId`: `com.pathclash.game`
- `versionCode`: `29`
- `versionName`: `1.0.29`

Android release AAB 위치:
- `client/android/app/build/outputs/bundle/release/app-release.aab`

중요:
- 2026-04-17 기준 최신 정리 후 AAB 크기는 약 11.9 MB다.
- 이전에 잘못 만든 약 19.1 MB AAB에는 로비/인게임 BGM mp3 복제본이 중복 포함되어 있었다. 출시/테스트에는 최신 11.9 MB AAB를 써야 한다.
- 폰에 debug/local APK가 이미 설치된 경우 Play Console AAB 업데이트가 `Path Clash를 설치할 수 없음`으로 실패할 수 있다. 가장 흔한 원인은 서명 키 불일치다. 기존 앱을 삭제하고 Play 테스트 링크에서 새로 설치한다.
- 이미 같은 패키지의 `versionCode >= 29`가 설치되어 있으면 업데이트가 안 된다. 이 경우 `versionCode`를 올려야 한다.

릴리즈 명령:
```bash
cd client
npm run build
npx cap sync android
cd android
gradlew.bat bundleRelease
```

## 3. 핵심 디렉토리

루트:
- `client/`: React/Vite 클라이언트와 Capacitor Android 프로젝트
- `server/`: Express + Socket.IO 게임 서버
- `supabase/`: DB schema, RPC, guest cleanup SQL
- `docs/`: 설계/출시/스토어/분석 문서
- `CLAUDE.md`: 현재 AI 온보딩 기준 문서

프론트엔드 주요 폴더:
- `client/src/App.tsx`: 앱 진입점, 인증 초기화, 화면 전환, BGM 제어 호출, Android back/appState 처리
- `client/src/auth/guestAuth.ts`: Supabase Auth, guest session, Google 연동, 계정 요약, 설정/스킨 동기화
- `client/src/components/Lobby/`: 로비, 매칭, 계정/스킨/보드/업적/상점/설정 UI
- `client/src/components/Game/`: 기본 1v1 게임 화면
- `client/src/components/Coop/`: 협동 모드 화면
- `client/src/components/TwoVsTwo/`: 2v2 화면
- `client/src/components/Ability/`: Ability Battle 화면
- `client/src/store/gameStore.ts`: Zustand 전역 상태
- `client/src/socket/`: Socket.IO 클라이언트와 이벤트 핸들러
- `client/src/utils/soundUtils.ts`: SFX와 BGM 컨트롤러
- `client/src/data/patchNotes.ts`: 앱 내 패치노트
- `client/src/skins/`: 스킨별 Game/Preview/meta/css

백엔드 주요 폴더:
- `server/src/index.ts`: Express 서버, CORS, Android 버전 체크, Google Play 결제 검증 REST
- `server/src/socket/socketServer.ts`: Socket.IO 이벤트, 세션 등록, 매칭, 각 모드 진입, 업적/계정 socket 처리
- `server/src/game/GameRoom.ts`: 기본 1v1 방 진행
- `server/src/game/GameEngine.ts`: 기본 게임 판정/경로/충돌 계산
- `server/src/game/coop/`: CoopRoom/CoopEngine/CoopTypes
- `server/src/game/twovtwo/`: TwoVsTwoRoom/Engine/Types
- `server/src/game/ability/`: AbilityRoom/Engine/Types
- `server/src/services/playerAuth.ts`: access token 검증, 계정 요약, 전적/토큰/게스트 승격
- `server/src/services/achievementService.ts`: 업적 진행/보상/토큰 지급
- `server/src/services/googlePlayVerifier.ts`: Google Play 구매 토큰 검증

## 4. 게임 서버 원칙

게임 규칙의 최종 권한은 서버에 있다.

- 라운드 시작/종료, 경로 실행, 충돌 판정, HP 감소, 승패 판정은 서버가 결정한다.
- 클라이언트는 입력, 애니메이션, 표시, 사운드 중심이다.
- 규칙 변경 시 프론트 타입/화면만 보지 말고 반드시 서버 엔진과 Room 클래스를 같이 본다.

기본 1v1 관련:
- `server/src/game/GameRoom.ts`
- `server/src/game/GameEngine.ts`
- `client/src/components/Game/GameScreen.tsx`
- `client/src/components/Game/GameGrid.tsx`
- `client/src/types/game.types.ts`

모드별 변경 시:
- Coop: `server/src/game/coop`, `client/src/components/Coop`, `client/src/types/coop.types.ts`
- 2v2: `server/src/game/twovtwo`, `client/src/components/TwoVsTwo`, `client/src/types/twovtwo.types.ts`
- Ability: `server/src/game/ability`, `client/src/components/Ability`, `client/src/types/ability.types.ts`

## 5. Auth, Supabase, 계정

기본 진입은 guest 계정이다.

- 앱 진입 시 Supabase 세션을 확인한다.
- 세션이 없으면 익명 guest session을 만들거나 저장된 guest session을 복구한다.
- 이후 Google 계정으로 연동/전환할 수 있다.
- guest -> Google 승격, 기존 Google 계정 전환 로직은 민감하므로 `guestAuth.ts`와 `playerAuth.ts`를 같이 본다.

중요 파일:
- `client/src/lib/supabase.ts`
- `client/src/auth/guestAuth.ts`
- `server/src/lib/supabase.ts`
- `server/src/services/playerAuth.ts`
- `supabase/schema.sql`
- `docs/supabase-structure.md`

DB 주요 테이블:
- `profiles`: 닉네임, 장착 스킨, 보드 스킨, ability loadout, guest 여부, 약관 동의
- `player_stats`: 승패, 토큰, 일일 보상
- `owned_skins`
- `owned_board_skins`
- `player_achievements`
- `google_play_token_purchases`
- `nickname_change_history`

계정 요약은 우선 RPC `get_account_snapshot(target_user_id uuid)`를 사용하고, 없으면 다중 조회 fallback을 탄다.

주의:
- 앱 초기화 중 Supabase/Auth 요청이 여러 번 발생할 수 있다.
- Supabase Dashboard의 Logs & Analytics / Primary Database 화면 자체도 `application_name=supabase/dashboard`로 DB request를 많이 만들 수 있다. request 폭증 분석 시 게임 코드 요청과 dashboard 요청을 구분한다.
- `achievements_sync_settings`는 앱 시작 시에도 호출될 수 있다. 서버에서 `forceRevalidate: true`와 `resolveAccount()`가 붙어 있어 DB 요청 비용이 비교적 크다. request 최적화가 필요하면 이 경로를 우선 본다.

## 6. Socket.IO 통신

핵심 채널은 Socket.IO다. REST는 결제/버전 체크 등 일부에만 사용한다.

클라이언트:
- `client/src/socket/socketClient.ts`
- `client/src/socket/socketHandlers.ts`

서버:
- `server/src/socket/socketServer.ts`

주요 이벤트:
- `session_register`
- `create_room`
- `join_room`
- `join_random`
- `join_ai`
- `join_coop`
- `join_2v2`
- `join_ability`
- `request_rematch`
- `achievements_claim`
- `achievements_claim_all`
- `achievements_sync_settings`
- `finalize_google_upgrade`

세션 처리:
- 서버는 `registerSocketSession()`으로 access token을 검증하고 socket-user 매핑을 관리한다.
- 일부 이벤트는 `allowConcurrentSessions`를 허용한다.
- `session_replaced` 이벤트가 오면 클라이언트는 로비로 돌아가고 재연결 안내를 띄운다.

## 7. Android와 Play Store

Capacitor 설정:
- `client/capacitor.config.ts`
- `client/android/app/build.gradle`
- `client/android/app/src/main/AndroidManifest.xml`

Android 패키지:
- `com.pathclash.game`

서명:
- `client/android/keystore.properties`
- `client/android/release-keystore.jks`
- 절대 Git에 올리면 안 된다.

release AAB 생성:
```bash
cd client
npm run build
npx cap sync android
cd android
gradlew.bat bundleRelease
```

설치 실패 흔한 원인:
- 기기에 debug APK가 이미 설치되어 release/Play AAB와 서명 키가 다름
- 기존 설치 앱의 versionCode가 새 AAB보다 같거나 높음
- 잘못된/오래된 AAB를 업로드함

대응:
- debug/local 앱은 삭제 후 Play 테스트 링크로 설치
- 업데이트 테스트 시 versionCode를 반드시 증가
- AAB 크기 확인 후 최신 파일을 업로드

## 8. 오디오/BGM 주의사항

2026-04-17에 Android APK/AAB에서 로비/인게임 BGM이 중간에 끊기고 처음부터 다시 재생되는 버그를 수정했다.

핵심 원인:
- 긴 BGM을 `new Audio(...).loop = true` 형태로 Android WebView에서 재생할 때 불안정하게 재시작되는 문제가 있었다.

현재 구조:
- BGM은 `client/src/utils/soundUtils.ts`에서 Howler/WebAudio 기반 `Howl`로 관리한다.
- `Howler.autoUnlock = true`
- `Howler.autoSuspend = false`
- `App.tsx`는 `playBgmTrack`, `pauseAllBgm`, `setBgmVolume`, `setBgmMuted`, `unloadBgm`만 호출한다.

파일:
- 로비 BGM: `client/public/music/Lobby_bgm_3.ogg`
- 인게임 BGM: `client/public/music/InGame_bgm_3.ogg`
- 승리/패배 BGM: `victory_bgm.mp3`, `defeat_bgm.mp3`

중요:
- `Lobby_bgm_3.mp3`, `InGame_bgm_3.mp3`를 다시 public에 복제하지 말 것. AAB 크기가 약 7.2 MB 증가한다.
- BGM 버그 수정은 mp3 전환이 아니라 Howler/WebAudio 전환이 핵심이다.
- 짧은 SFX는 아직 `new Audio` clone 방식도 사용한다. 긴 BGM과 혼동하지 말 것.
- Howler 타입은 `client/src/types/howler.d.ts`에 최소 선언이 있다.

## 9. 업적과 토큰

업적 정의는 코드 카탈로그에 있고, 플레이어별 상태는 DB에 저장한다.

주요 파일:
- `server/src/achievements/achievementCatalog.ts`
- `server/src/services/achievementService.ts`
- `client/src/achievements/achievementCatalog.ts`
- `client/src/components/Lobby/LobbyScreen.tsx`
- `supabase/schema.sql`

서버 원칙:
- 보상 수령 가능 여부는 서버가 검증한다.
- 토큰 지급은 서버/DB 기준이다.
- 클라이언트는 표시와 요청만 담당한다.

업적 관련 Socket 이벤트:
- `achievements_claim`
- `achievements_claim_all`
- `achievements_sync_settings`

주의:
- `resolveAccount()`가 계정 요약을 만들면서 업적 파생 진행도 동기화도 할 수 있다.
- DB request 최적화 시 `readAccountProfile()`, `syncAchievementDerivedProgress()`, `listPlayerAchievements()` 경로를 함께 본다.

## 10. 스킨, 보드 스킨, Ability 스킬

스킨 구조:
- `client/src/skins/common`
- `client/src/skins/rare`
- `client/src/skins/legendary`

스킨 폴더 기본 구조:
- `Game.tsx`
- `Preview.tsx`
- `game.css`
- `preview.css`
- `meta.ts`

특수 스킨:
- `electric_core`: canvas 기반. `ElectricCoreCanvas.tsx`와 CSS를 같이 봐야 한다.
- `cosmic`: canvas 기반 요소가 있다.
- `sun`: 이미지/vector 문서와 asset이 포함되어 있다.
- `chronos`, `wizard`, `atomic`: legendary 계열 특수 연출이 있다.

장착/구매/가격:
- 클라이언트 UI만 바꾸면 안 된다.
- 가격과 구매 검증은 Supabase RPC/서버/DB와 맞아야 한다.
- 보드 스킨 구매 RPC: `purchase_board_skin_with_tokens`
- 닉네임 변경 RPC: `change_nickname_with_tokens`

## 11. 패치노트

앱 내 패치노트:
- `client/src/data/patchNotes.ts`

현재:
- `PATCH_NOTES_VERSION = "2026-04-17-v17"`
- 앱 표시 버전: `1.0.29`
- 2026-04-17 항목에는 Android BGM 재시작 버그 수정과 태블릿 레이아웃 수정이 들어 있다.

릴리즈 전에는 패치노트 날짜/버전/내용을 같이 확인한다.

## 12. 환경 변수

클라이언트:
- `VITE_SERVER_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_NATIVE_REDIRECT_URL`
- `VITE_APP_URL`

서버:
- `PORT`
- `CLIENT_URL`
- `ALLOWED_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_PLAY_PACKAGE_NAME`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- token pack product envs:
  - `GOOGLE_PLAY_TOKEN_PACK_STARTER_ID`
  - `GOOGLE_PLAY_TOKEN_PACK_SMALL_ID`
  - `GOOGLE_PLAY_TOKEN_PACK_MEDIUM_ID`
  - `GOOGLE_PLAY_TOKEN_PACK_LARGE_ID`
  - `GOOGLE_PLAY_TOKEN_PACK_WHALE_ID`

주의:
- 개발 중 production Supabase에 연결하면 request가 실제로 쌓인다.
- 로컬 테스트 중 request 폭증이 의심되면 먼저 localhost 탭/서버와 Supabase Dashboard 로그 화면을 모두 닫고 5~10분 관찰한다.

## 13. 빌드와 검증

클라이언트:
```bash
cd client
npm run build
```

서버:
```bash
cd server
npm run build
```

Android:
```bash
cd client
npm run build
npx cap sync android
cd android
gradlew.bat assembleDebug
gradlew.bat bundleRelease
```

Lint:
```bash
cd client
npm run lint
```

주의:
- 현재 `npm run lint`는 Android build intermediates와 기존 React hook/compiler 규칙 문제로 실패할 수 있다. 새 변경과 무관한 기존 에러가 섞여 나올 수 있으니, lint 결과는 파일별로 분리해서 판단한다.

## 14. 작업 시 주의할 최근 이슈

1. Android BGM 재시작 버그
   - `new Audio` BGM 방식으로 되돌리지 말 것.
   - `soundUtils.ts`의 Howler BGM 컨트롤러 유지.

2. AAB 용량 증가
   - 로비/인게임 mp3 복제본을 public에 넣지 말 것.
   - 현재 public music에는 ogg 2개와 결과 mp3 2개만 있어야 한다.

3. Play 설치 실패
   - debug APK와 release/Play AAB는 서명 키가 달라 업데이트 불가할 수 있다.
   - 기존 앱 삭제 후 Play 테스트 링크 설치가 가장 빠른 확인법.

4. Supabase request 폭증 오해
   - Dashboard 로그 화면 자체가 DB request를 만든다.
   - 로그의 `application_name=supabase/dashboard`는 게임이 아니라 dashboard 요청이다.
   - 그래도 앱 시작 요청 최적화 여지는 있다.

5. `GameScreen` lazy load/handshake
   - 예전에는 화면 마운트 타이밍 때문에 AI 첫 진입 무한 로딩이 있었다.
   - `game_client_ready`류 handshake/서버 시작 순서를 되돌릴 때 주의한다.

6. 타이머/timeout 정리
   - GameRoom/AbilityRoom/CoopRoom에는 planning/moving/nextRound timeout이 있다.
   - 플레이어 이탈, room close, rematch 시 stale timeout이 남지 않게 해야 한다.

## 15. 새 세션에서 먼저 읽을 파일 순서

1. `CLAUDE.md`
2. `client/src/App.tsx`
3. `client/src/utils/soundUtils.ts`
4. `client/src/auth/guestAuth.ts`
5. `client/src/store/gameStore.ts`
6. `client/src/components/Lobby/LobbyScreen.tsx`
7. `client/src/components/Game/GameScreen.tsx`
8. `server/src/socket/socketServer.ts`
9. `server/src/services/playerAuth.ts`
10. `server/src/services/achievementService.ts`
11. `server/src/game/GameRoom.ts`
12. `server/src/game/ability/AbilityRoom.ts`
13. `supabase/schema.sql`
14. `docs/supabase-structure.md`

## 16. 일반 작업 원칙

- 규칙/승패/경제/결제는 서버와 DB를 최종 기준으로 본다.
- 클라이언트 UI만 수정해서 서버/DB와 불일치하게 만들지 않는다.
- Android 릴리즈 전에는 versionCode, AAB 크기, signing, 패치노트를 확인한다.
- Supabase schema/RPC를 바꾸면 `supabase/schema.sql`과 관련 docs도 같이 갱신한다.
- 깨진 인코딩 문서는 부분 수정보다 전체 교체가 안전하다.
- 이미 생성된 `dist`, Android build outputs, node_modules는 소스가 아니다. 빌드 결과와 소스 변경을 구분한다.
