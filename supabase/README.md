# Supabase Database Notes

이 문서는 `PathClash` 프로젝트의 Supabase DB 구조를 빠르게 이해하기 위한 정리 문서입니다.

기준 파일:
- [schema.sql](./schema.sql)

주의:
- 이 문서는 **repo 기준**입니다.
- 실제 원격 Supabase DB가 이 문서와 완전히 같으려면, 수동 변경 없이 `schema.sql` 기준으로 관리되어야 합니다.

## 개요

현재 프로젝트는 아래 public 테이블을 중심으로 동작합니다.

1. `profiles`
2. `player_stats`
3. `owned_skins`
4. `account_merges`
5. `google_play_token_purchases`

모든 주요 계정 데이터는 `auth.users`를 기준으로 연결됩니다.

## 관계

- `public.profiles.id -> auth.users.id`
- `public.player_stats.user_id -> auth.users.id`
- `public.owned_skins.user_id -> auth.users.id`
- `public.account_merges.source_user_id -> auth.users.id`
- `public.account_merges.target_user_id -> auth.users.id`
- `public.google_play_token_purchases.user_id -> auth.users.id`

대부분 `on delete cascade`를 사용하므로, `auth.users`에서 계정을 삭제하면 연결된 public 데이터도 함께 정리됩니다.

## 테이블 설명

### 1. `public.profiles`

역할:
- 플레이어 기본 프로필 저장

주요 컬럼:
- `id uuid primary key`
- `nickname text`
- `equipped_skin text`
- `is_guest boolean`
- `created_at timestamptz`
- `updated_at timestamptz`

메모:
- 게스트 계정 여부는 `is_guest`로 관리
- 현재 장착 중인 스킨은 `equipped_skin`

### 2. `public.player_stats`

역할:
- 플레이어 승패/토큰/일일 보상 진행도 저장

주요 컬럼:
- `user_id uuid primary key`
- `wins integer`
- `losses integer`
- `tokens integer`
- `daily_reward_wins integer`
- `daily_reward_day date`
- `updated_at timestamptz`

메모:
- 승리 보상 토큰은 서버에서 이 테이블에 누적
- 일일 보상 진행도도 여기서 관리

### 3. `public.owned_skins`

역할:
- 플레이어가 소유한 스킨 목록 저장

주요 컬럼:
- `user_id uuid`
- `skin_id text`
- `purchased_at timestamptz`

제약:
- `primary key (user_id, skin_id)`

메모:
- 토큰 구매 스킨 소유 여부 판정에 사용

### 4. `public.account_merges`

역할:
- 게스트 계정 -> 정식 계정 업그레이드/병합 이력 저장

주요 컬럼:
- `source_user_id uuid primary key`
- `target_user_id uuid`
- `merged_wins integer`
- `merged_losses integer`
- `created_at timestamptz`

메모:
- 계정 전환/병합 관련 안전장치 성격

### 5. `public.google_play_token_purchases`

역할:
- Google Play 토큰 구매 이력 저장

주요 컬럼:
- `purchase_token text primary key`
- `user_id uuid`
- `pack_id text`
- `product_id text`
- `tokens integer`
- `created_at timestamptz`

메모:
- 중복 지급 방지 기준은 `purchase_token`

## 주요 RPC / DB 함수

### `public.grant_tokens_from_google_purchase(...)`

역할:
- Google Play 구매 토큰이 처음 들어온 경우에만 토큰 지급

동작:
- `google_play_token_purchases`에 구매 이력 기록
- 중복 토큰이면 `false`
- 처음 들어온 구매면 `player_stats.tokens` 증가 후 `true`

### `public.purchase_skin_with_tokens(p_skin_id text)`

역할:
- 토큰으로 스킨 구매

동작:
- 로그인 여부 확인
- 스킨 가격 계산
- 이미 보유 중인지 확인
- 토큰 부족 여부 확인
- `owned_skins` 추가
- `player_stats.tokens` 차감

반환값 예:
- `AUTH_REQUIRED`
- `INVALID_SKIN`
- `ALREADY_OWNED`
- `INSUFFICIENT_TOKENS`
- `PURCHASED`

## RLS 정책

현재 `schema.sql` 기준:
- `profiles`, `player_stats`, `account_merges`, `owned_skins`, `google_play_token_purchases`
  에 RLS 적용

기본 방향:
- 자신의 데이터만 읽기 가능
- `profiles`는 자신의 row만 insert/update 가능

운영상 write는 서버의 service role 또는 security definer 함수가 담당하는 구조입니다.

## 서버 코드에서 주로 참조하는 곳

### 서버
- [playerAuth.ts](../server/src/services/playerAuth.ts)

주요 역할:
- 계정 조회
- 프로필 읽기
- 승패 기록
- 토큰 지급
- guest -> google 업그레이드

### 클라이언트
- [guestAuth.ts](../client/src/auth/guestAuth.ts)

주요 역할:
- 익명 로그인
- 닉네임/장착 스킨 동기화
- 스킨 구매 RPC 호출
- 계정 전환 흐름

## 게스트 계정 정리 정책

관련 파일:
- [guest_cleanup.sql](./guest_cleanup.sql)

현재 제안된 안전 기준:
- `is_guest = true`
- `wins = 0`
- `losses = 0`
- `tokens = 0`
- `owned_skins` 없음
- `google_play_token_purchases` 없음
- `account_merges` 이력 없음
- 마지막 활동이 오래됨

권장 운영 방식:
1. 후보 조회
2. 수동 확인
3. cron 자동화

## 운영 메모

### 1. 원격 DB와 repo 스키마를 맞추는 법

권장:
- DB 변경은 가능하면 SQL 파일로 남기기
- `schema.sql` 또는 별도 migration 파일 갱신하기

비권장:
- Supabase SQL Editor에서만 수동 변경하고 repo 반영 안 하기

### 2. AI 협업용 규칙

다른 AI/도구와 같이 작업할 때는 아래를 먼저 보면 됩니다.

읽기 순서 추천:
1. [schema.sql](./schema.sql)
2. [README.md](./README.md)
3. [guest_cleanup.sql](./guest_cleanup.sql)
4. [playerAuth.ts](../server/src/services/playerAuth.ts)

### 3. 스키마 변경 시 같이 확인할 것

- `schema.sql`
- 서버 `playerAuth.ts`
- 클라이언트 `guestAuth.ts`
- RLS 정책
- security definer 함수

## 한 줄 요약

이 프로젝트의 Supabase 구조는:
- `profiles` = 프로필
- `player_stats` = 승패/토큰
- `owned_skins` = 보유 스킨
- `account_merges` = 계정 병합 이력
- `google_play_token_purchases` = 결제 이력

을 `auth.users` 기준으로 묶는 구조입니다.
