# 업적 DB 설계

## 목표

업적 시스템에서 가장 중요한 것은 아래 네 가지다.
- 보상 중복 지급 방지
- 서버 기준 검증
- 진행도 유지
- 기기 변경 후에도 상태 유지

## 현재 적용 상태

현재 기준으로 업적 시스템은 실제 코드와 스키마에 반영되어 있다.

적용 위치:
- `supabase/schema.sql`
- `server/src/achievements/achievementCatalog.ts`
- `server/src/services/achievementService.ts`
- `client/src/achievements/achievementCatalog.ts`
- `client/src/auth/guestAuth.ts`
- `client/src/components/Lobby/LobbyScreen.tsx`

현재 반영된 내용:
- 업적 정의는 코드 카탈로그로 관리
- 플레이어별 업적 진행도와 수령 여부는 DB 저장
- 업적 단일 수령 / 전체 수령은 서버 검증 후 처리
- 로비 업적 창에서 업적 목록, 개별 수령, 모든 보상 획득 가능
- guest -> 구글 계정 업그레이드 시 업적 데이터 병합 처리

## 구조 요약

### 1. 업적 정의
- 코드에서 관리
- 모든 유저가 같은 업적 정의를 공유
- 출시 후 업적 추가 계획이 없으므로 1차 구조로 적합함

### 2. 플레이어 업적 상태
- DB에서 관리
- 유저별 진행도, 완료 여부, 보상 수령 여부를 저장

### 3. 보상 지급
- 서버에서만 처리
- 클라이언트는 요청만 보내고, 실제 검증과 토큰 지급은 서버가 담당

## 테이블

### `public.player_achievements`

컬럼:
- `user_id uuid not null references auth.users(id) on delete cascade`
- `achievement_id text not null`
- `progress integer not null default 0`
- `completed boolean not null default false`
- `claimed boolean not null default false`
- `completed_at timestamptz null`
- `claimed_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

기본키:
- `(user_id, achievement_id)`

의미:
- 한 유저는 한 업적에 대해 하나의 상태 row만 가진다.

## 인덱스

현재 적용 인덱스:

```sql
create index if not exists idx_player_achievements_claimable
on public.player_achievements (user_id, completed, claimed);
```

의도:
- 업적 목록 조회
- `모든 보상 획득` 대상 탐색
- 완료 + 미수령 업적 조회 최적화

## RLS

현재 적용 내용:
- `alter table public.player_achievements enable row level security;`
- 본인 업적 조회용 select policy 추가

방향:
- 읽기: 본인만 가능
- 쓰기: 서버/service role만 처리

즉 클라이언트는 업적 상태를 직접 수정하지 않는다.

## 진행도 저장 방식

현재 구조는 두 가지 방식을 같이 사용한다.

### A. 파생 계산형 진행도 동기화
예:
- 총 승리 수
- 모드별 승리 수
- 보유 스킨 수

이런 업적은 기존 데이터에서 계산 가능하므로, 서버에서 계정 요약을 읽을 때 동기화한다.

관련 파일:
- `server/src/services/achievementService.ts`
- `server/src/services/playerAuth.ts`

### B. 이벤트 누적형 진행도 저장
예:
- 튜토리얼 완료
- 일일 보상 횟수
- 능력대전 특수 승리
- 특정 공격 스킬 마무리 횟수
- 특정 방어 스킬 방어 횟수
- 유틸 스킬 사용 횟수
- 오디오 설정 업적

이런 업적은 서버 이벤트가 발생할 때 직접 progress를 갱신한다.

## 서버 처리 방식

### 업적 목록 조회
- 계정 요약 조회 시 업적 상태도 함께 내려준다
- 클라이언트는 이를 그대로 로비 업적 창에 표시한다

### 단일 업적 수령
서버에서:
1. `achievement_id` 존재 여부 확인
2. 완료 여부 확인
3. 이미 수령했는지 확인
4. 토큰 지급
5. `claimed = true`, `claimed_at = now()` 저장

### 모든 보상 획득
서버에서:
1. `completed = true and claimed = false` 업적 전부 조회
2. 총 토큰 합 계산
3. 토큰 지급
4. 대상 업적 전부 `claimed = true` 처리

현재 구현은 서버 기준 검증으로 동작하며, 필요하면 나중에 DB 트랜잭션 강화 가능

## 계정 이전 / 기기 변경

이 구조에서는 업적 진행도와 수령 여부가 `user_id` 기준으로 저장된다.

즉:
- 앱 재설치
- 기기 변경
- 같은 구글 계정 재로그인

을 해도 업적 상태는 유지된다.

또한 현재 서버 구현에는 guest -> 구글 계정 업그레이드 시 업적 데이터 병합 처리도 들어가 있다.

## 왜 업적 정의 테이블을 따로 만들지 않았는가

현재 출시 구조에서는 업적 정의를 별도 DB 테이블로 두지 않는다.

이유:
- 업적 정의는 코드로 관리하는 편이 리뷰와 추적이 쉽다
- 출시 후 추가 업적 계획이 없다
- 서버/클라이언트가 같은 카탈로그를 공유하면 구현이 단순하다

즉 DB는 플레이어 상태 저장에 집중하고, 업적 정의는 코드 카탈로그가 담당한다.

## 현재 구현 요약

1. `player_achievements` 테이블 추가
2. 업적 정의는 코드 카탈로그로 관리
3. 진행도는 파생 계산형 + 이벤트 누적형 혼합 처리
4. 단일 수령 / 전체 수령은 서버 검증 후 처리
5. 토큰 지급은 항상 서버에서만 처리
6. 기기 변경 후에도 업적 상태 유지

## 이후 문서 갱신 규칙

앞으로 아래가 바뀌면 이 문서도 같이 갱신한다.
- `player_achievements` 스키마 변경
- 업적 수령 방식 변경
- guest 계정 병합 방식 변경
- 업적 진행도 계산 전략 변경
