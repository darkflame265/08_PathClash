# Supabase Structure Summary

이 문서는 `supabase/README.md`의 짧은 요약본입니다.
AI나 사람이 빠르게 전체 구조만 확인할 때 사용합니다.

## 핵심 테이블

- `auth.users`
  - 계정의 기준 테이블
- `public.profiles`
  - 닉네임, 장착 스킨, guest 여부
- `public.player_stats`
  - 승, 패, 토큰, 일일 보상 진행도
- `public.owned_skins`
  - 보유 스킨 목록
- `public.account_merges`
  - guest -> 정식 계정 병합 이력
- `public.google_play_token_purchases`
  - Google Play 구매 이력

## 관계 핵심

- 대부분 `auth.users`를 기준으로 FK 연결
- 다수 테이블이 `on delete cascade`
- `auth.users` 삭제 시 연결된 public 데이터도 함께 정리됨

## 자주 보는 파일

- [schema.sql](c:/08_PathClash/supabase/schema.sql)
- [README.md](c:/08_PathClash/supabase/README.md)
- [guest_cleanup.sql](c:/08_PathClash/supabase/guest_cleanup.sql)
- [playerAuth.ts](c:/08_PathClash/server/src/services/playerAuth.ts)

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
