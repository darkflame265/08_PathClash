# Supabase Structure Summary

이 문서는 `supabase/README.md`의 짧은 요약본입니다.
AI나 사람이 빠르게 전체 구조만 확인할 때 사용합니다.

## 핵심 테이블

- `auth.users`
  - 계정의 기준 테이블
- `public.profiles`
  - 닉네임, 장착 스킨, 장착 보드 스킨, 장착 스킬, guest 여부, 약관/개인정보 동의 버전 기록
- `public.player_stats`
  - 승, 패, 토큰, 일일 보상 진행도
- `public.owned_skins`
  - 보유 스킨 목록
- `public.owned_board_skins`
  - 보유 보드 스킨 목록
- `public.player_achievements`
  - 업적 진행도, 완료 여부, 보상 수령 여부
- `public.account_merges`
  - guest -> 정식 계정 병합 이력
- `public.google_play_token_purchases`
  - Google Play 구매 이력
- `public.nickname_change_history`
  - 닉네임 변경 이력과 토큰 차감 기록

## 관계 핵심

- 대부분 `auth.users`를 기준으로 FK 연결
- 다수 테이블이 `on delete cascade`
- `auth.users` 삭제 시 연결된 public 데이터도 함께 정리됨
- `player_achievements.user_id`도 `auth.users.id`를 참조함

## 업적 구조 메모

업적 시스템은 아래처럼 나뉜다.
- 업적 정의: 코드 카탈로그에서 관리
- 플레이어 업적 상태: `public.player_achievements`에 저장
- 보상 지급 검증: 서버에서 처리

즉 DB에는 업적 목록 자체보다, 플레이어별 상태가 저장된다.

저장되는 값:
- `achievement_id`
- `progress`
- `completed`
- `claimed`
- `completed_at`
- `claimed_at`

## 계정 요약 RPC

- `public.get_account_snapshot(target_user_id uuid)`
- 역할:
  - `profiles`
  - `player_stats`
  - `owned_skins`
  - `owned_board_skins`
  - 장착 능력 스킬
  - `player_achievements`
  를 한 번에 묶어서 현재 계정 요약 JSON으로 반환
- 목적:
  - 웹/앱 초기 진입 시 계정 요약 요청 수를 줄여
    `Connecting guest session...` 체감 지연을 낮추기
- 클라이언트:
  - 이 RPC를 우선 사용하고
  - 아직 SQL이 적용되지 않은 환경에서는 기존 다중 조회 방식으로 fallback

## 닉네임 변경 RPC

- `public.change_nickname_with_tokens(p_nickname text)`
- 역할:
  - 플레이어 토큰 500개를 차감하고
  - `profiles.nickname`을 새 값으로 변경
  - 성공 시 `nickname_change_history`에 변경 이력을 저장
- 목적:
  - 로비 자유 변경을 막고
  - 설정창에서만 유료 이름 변경을 허용
- 반환값:
  - `UPDATED`
  - `NO_CHANGE`
  - `INVALID_NICKNAME`
  - `INSUFFICIENT_TOKENS`
  - `AUTH_REQUIRED`

## 보드 스킨 구매 RPC

- `public.purchase_board_skin_with_tokens(p_board_skin_id text)`
- 역할:
  - 플레이어 토큰을 차감하고
  - `owned_board_skins`에 보드 스킨 소유 정보를 추가
- 현재 가격:
  - `blue_gray`: `2000`
  - `pharaoh`: `7000`
  - `magic`: `7000`
- 반환값:
  - `PURCHASED`
  - `ALREADY_OWNED`
  - `INSUFFICIENT_TOKENS`
  - `AUTH_REQUIRED`

## 닉네임 변경 이력

- `public.nickname_change_history`
- 저장되는 값:
  - `user_id`
  - `old_nickname`
  - `new_nickname`
  - `token_balance_before`
  - `token_balance_after`
  - `cost_tokens`
  - `changed_at`
- 목적:
  - 이름 변경 문의 대응
  - 토큰 차감 검증
  - 운영 추적성 확보

## 약관 동의 메모

`public.profiles`에 아래 값이 저장된다.
- `legal_consent_version`
- `legal_consented_at`

앱은 최초 1회 동의 팝업을 띄우고, 현재 동의 버전을 로컬과 DB에 함께 기록한다.

## 자주 보는 파일

- [schema.sql](c:/08_PathClash/supabase/schema.sql)
- [README.md](c:/08_PathClash/supabase/README.md)
- [guest_cleanup.sql](c:/08_PathClash/supabase/guest_cleanup.sql)
- [playerAuth.ts](c:/08_PathClash/server/src/services/playerAuth.ts)
- [achievementService.ts](c:/08_PathClash/server/src/services/achievementService.ts)
- [achievementCatalog.ts](c:/08_PathClash/server/src/achievements/achievementCatalog.ts)

## 자동 정리

- `pg_cron` 사용
- 등록된 작업:
  - `pathclash-guest-cleanup-weekly`
- 주기:
  - 매주 월요일 `04:00 UTC`
- 기준:
  - `30일 이상` 방치된 guest 계정 자동 삭제

## 메모

- 스키마 변경 시 SQL 파일과 문서를 같이 갱신
- SQL Editor에서만 수동 변경하고 repo에 반영하지 않으면 나중에 구조가 어긋날 수 있음
- 업적 관련 스키마가 바뀌면 `docs/achievement-db-design.md`도 함께 갱신
