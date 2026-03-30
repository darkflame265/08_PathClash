# Operations Notes

이 문서는 PathClash 운영 중 자주 확인하는 실무 메모입니다.

## AAB / 앱 배포

- Android AAB는 `client/android/app/build/outputs/bundle/release/app-release.aab`에 생성됩니다.
- 배포 전 확인:
  - `versionCode` 증가
  - `versionName` 반영
  - env 분리 규칙 확인: `npm run dev`는 `client/.env.development`(localhost), production 빌드와 `npm run android:release`는 `client/.env.production`(Render 서버 URL) 사용

### 배포 전 체크리스트

1. 환경 확인
   - development / production env 파일이 올바르게 분리돼 있는지 확인
   - AAB 제출용은 `client/.env.production`이 Render 서버 URL을 가리키는지 확인
2. 버전 확인
   - `client/android/app/build.gradle`의 `versionCode` 증가
   - `versionName` 갱신
   - 서버 최소 지원 버전 확인: `ANDROID_LATEST_VERSION_CODE`, `ANDROID_MIN_SUPPORTED_VERSION_CODE`
3. 빌드 확인
   - `client npm run build`
   - `client npm run android:sync`
   - `client npm run android:bundle`
4. 능력대전 핵심 점검
   - 스킬 버튼 표기값 = 실제 마나 차감값
   - 인게임 설명 = 장착 스킬 창 설명
   - 주요 스킬 SFX 재생 여부
   - 모바일 UI에서 터치 막힘/겹침 여부
5. 패치노트 반영 확인
   - 패치노트 버전 키 증가
   - KR/EN 내용 갱신
   - `NEW` 배지 동작 확인
6. 산출물 확인
   - AAB 경로 확인
   - 내부 테스트 업로드 전 최종 파일 시각 확인

관련 문서:
- [playstore-release-checklist.md](c:/08_PathClash/docs/playstore-release-checklist.md)
- [android-release-signing.md](c:/08_PathClash/docs/android-release-signing.md)

## 서버 / 환경 주의

- AAB는 빌드 시점의 `VITE_SERVER_URL`이 앱 안에 고정됩니다.
- 모바일 앱에서 `localhost`는 개발 PC가 아니라 기기 자신을 가리킵니다.
- 내부 테스트용 앱을 만들 때는 반드시 배포 서버 URL인지 확인해야 합니다.
- Android 앱은 실행 시 서버에 현재 `versionCode`를 보내 최신/최소 지원 버전과 비교합니다.
- 서버 환경변수 `ANDROID_LATEST_VERSION_CODE`, `ANDROID_MIN_SUPPORTED_VERSION_CODE`로 강제 업데이트 기준을 관리합니다.
- 현재 앱 버전이 최소 지원 버전보다 낮으면 업데이트 모달을 띄우고 플레이 스토어 이동을 유도합니다.
- 오래된 네이티브 앱이 버전 정보를 보내지 못해도, 서버는 native origin을 기준으로 매칭/입장 단계에서 차단합니다.
- `VITE_SERVER_URL`은 수동으로 `client/.env`에서 토글하지 않고, Vite 모드별 env 파일(`.env.development`, `.env.production`)로 관리합니다.
- 게임 초기 언어는 `localStorage('lang')` 값이 있으면 그 값을 우선 사용합니다.
- 저장된 언어 값이 없으면 `navigator.languages[0]` 또는 `navigator.language`를 읽어 기본 언어를 결정합니다.
- locale이 `ko*`로 시작하면 `KR`, 그 외는 `EN`으로 시작합니다.
- 로비 첫 진입 시 표시되는 AI 튜토리얼 선택 팝업도 이 초기 언어 규칙을 그대로 따릅니다.

## 패치노트 운영

- 패치노트는 로비 하단 버튼으로 열립니다.
- 새 버전이 있으면 `NEW` 배지가 붙습니다.
- 강제 팝업은 사용하지 않습니다.
- 패치노트는 KR/EN 모두 관리합니다.

상세 규칙:
- [patch-notes-process.md](c:/08_PathClash/docs/patch-notes-process.md)

## SFX / 이펙트 운영

- 스킬 전용 사운드는 중앙 레지스트리에서 관리합니다.
- 능력대전 진입 시 주요 스킬 SFX를 preload 합니다.
- 새 스킬 효과음을 추가하거나 파일명을 바꿀 때는 아래 문서를 같이 갱신합니다.

관련 문서:
- [ability-sfx.md](c:/08_PathClash/docs/ability-sfx.md)

## 능력대전 운영 체크리스트

패치 후 우선 점검할 것:
1. 스킬 버튼 표기값과 실제 마나 차감 일치 여부
2. 인게임 스킬 설명과 장착 스킬 창 설명 일치 여부
3. 이동 스킬, 지속 스킬, 종료 알림 시점
4. 모바일 UI에서 버튼 터치 영역 문제
5. 스킬 전용 SFX 재생 여부

## 룸 / 소켓 정리

이미 서버에는 orphan room / dead socket 정리 로직이 있습니다.

확인 코드:
- [socketServer.ts](c:/08_PathClash/server/src/socket/socketServer.ts)
- [RoomStore.ts](c:/08_PathClash/server/src/store/RoomStore.ts)
- [CoopRoomStore.ts](c:/08_PathClash/server/src/store/CoopRoomStore.ts)
- [TwoVsTwoRoomStore.ts](c:/08_PathClash/server/src/store/TwoVsTwoRoomStore.ts)
- [AbilityRoomStore.ts](c:/08_PathClash/server/src/store/AbilityRoomStore.ts)

동작:
- 1분마다 sweep 실행
- 끊긴 소켓 매핑 정리
- 오래된 waiting room 정리
- 빈 room 정리
- stale queue entry 정리

### 관측 로그 / 부하 테스트

- `[metrics]` 로그는 실제 소켓/룸/큐/캐시 활동이 있을 때만 출력됩니다.
- `[perf]` 로그는 느린 프로필 조회가 발생했을 때만 출력됩니다.
- Render Logs에서 `[metrics]`, `[perf]`로 검색해 필요한 로그만 필터링할 수 있습니다.
- 소켓 부하 테스트는 `server` 디렉터리에서 아래 스크립트로 실행합니다:

```bash
npm run load:test -- --mode idle --clients 200 --duration 60 --server https://zero8-pathclash.onrender.com
```

- 지원 모드:
  - `idle`: 연결만 유지
  - `ai`: AI 대전 입장 후 빈 경로 제출 반복
  - `random`: 랜덤 대결전 입장 후 빈 경로 제출 반복
- 예시:
  - 연결 수만 보기: `npm run load:test -- --mode idle --clients 300 --duration 90`
  - AI전 부하 보기: `npm run load:test -- --mode ai --clients 100 --duration 90`
  - 랜덤 매칭 보기: `npm run load:test -- --mode random --clients 100 --duration 90`

## Supabase 운영

### 게스트 계정 자동 정리

등록된 cron 작업:
- 이름: `pathclash-guest-cleanup-weekly`
- 주기: 매주 월요일 `04:00 UTC`
- 기준: `30일 이상` 방치된 guest 계정 삭제

관련 문서:
- [supabase README](c:/08_PathClash/supabase/README.md)
- [guest_cleanup.sql](c:/08_PathClash/supabase/guest_cleanup.sql)

확인 SQL:
```sql
select *
from cron.job
where jobname = 'pathclash-guest-cleanup-weekly';
```

삭제 SQL:
```sql
select cron.unschedule('pathclash-guest-cleanup-weekly');
```

## 추천 운영 원칙

- DB 수동 변경 시 repo SQL 파일도 함께 갱신
- 스킬 밸런스 수정 시 패치노트까지 같은 턴에 반영
- 앱 테스트 빌드와 배포 빌드의 서버 URL을 혼동하지 않기
- 능력대전은 기능 추가보다 상태 정리와 일관성 점검을 우선하기
