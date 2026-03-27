# Operations Notes

이 문서는 PathClash 운영 중 자주 확인하는 실무 메모입니다.

## AAB / 앱 배포

- Android AAB는 `client/android/app/build/outputs/bundle/release/app-release.aab`에 생성됩니다.
- 배포 전 확인:
  - `versionCode` 증가
  - `versionName` 반영
  - `VITE_SERVER_URL`이 배포 서버를 바라보는지 확인

### 배포 전 체크리스트

1. 환경 확인
   - `client/.env` 또는 빌드 대상 env가 배포 서버 URL을 가리키는지 확인
   - `localhost` 값이 남아 있지 않은지 확인
2. 버전 확인
   - `client/android/app/build.gradle`의 `versionCode` 증가
   - `versionName` 갱신
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
