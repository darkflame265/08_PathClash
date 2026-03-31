# 업적 DB 설계 초안

## 목표

업적 시스템에서 가장 중요한 것은:
- 보상 중복 지급 방지
- 서버 기준 검증
- 확장 가능한 구조
이다.

## 추천 구조

1차 구현에서는 아래 구조를 추천한다.

### 1. 업적 정의
- 코드에서 관리

### 2. 플레이어 업적 상태
- DB에서 관리

즉 DB에는 “업적 목록 자체”보다
- 유저가 어떤 업적을 완료했는지
- 어떤 업적 보상을 이미 받았는지
를 저장한다.

## 추천 테이블

### `public.player_achievements`

권장 컬럼:
- `user_id uuid not null`
- `achievement_id text not null`
- `progress integer not null default 0`
- `completed boolean not null default false`
- `claimed boolean not null default false`
- `completed_at timestamptz null`
- `claimed_at timestamptz null`
- `updated_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`

기본키:
- `(user_id, achievement_id)`

의미:
- 한 유저는 한 업적에 대해 하나의 상태 row만 가진다.

## 왜 이 구조가 좋은가

장점:
- 구현이 단순하다.
- `claimed` 여부를 안전하게 관리할 수 있다.
- `Claim All` 구현이 쉽다.
- 나중에 업적 개수가 늘어도 확장 가능하다.

## progress를 저장해야 하나

권장 답:
- 저장하는 쪽이 낫다.

이유:
- 모든 업적을 매번 실시간 계산하면 비효율적일 수 있다.
- 어떤 업적은 기존 테이블에서 쉽게 계산 가능하지만,
  어떤 업적은 별도 누적이 필요하다.
- 그래서 `progress`를 공통 컬럼으로 두면 유연하다.

## 계산 가능한 업적 vs 저장형 업적

### A. 계산 가능한 업적

예:
- 총 승리 수
- 특정 모드 승리 수
- 보유 스킨 수

이 업적들은 기존 테이블에서 계산 가능하다.
하지만 UI 응답성과 구현 단순성을 위해
최종적으로는 `player_achievements`에도 반영해 두는 것이 좋다.

### B. 저장형 업적

예:
- 리매치 횟수
- 능력대전 스킬 사용 누적 횟수
- 이벤트 한정 조건
- 숨겨진 퍼즐 업적

이런 것은 별도 이벤트가 발생할 때마다 progress를 직접 올리는 편이 좋다.

## 추천 서버 처리 방식

### 업적 진행도 갱신

경기 종료 또는 특정 이벤트 시 서버에서:
- 관련 업적 progress를 갱신
- goal 이상이면 `completed = true`
- 첫 완료 시 `completed_at = now()`

### 업적 단일 수령

서버에서:
1. 해당 업적 row 조회
2. 완료 여부 확인
3. 이미 수령했는지 확인
4. 토큰 지급
5. `claimed = true`, `claimed_at = now()` 업데이트

### 모든 보상 획득

서버에서:
1. `completed = true and claimed = false` 업적 전부 조회
2. 총 토큰 합 계산
3. 토큰 지급
4. 대상 업적 전부 `claimed = true`로 변경

가능하면 트랜잭션으로 처리한다.

## 권장 SQL 예시

```sql
create table if not exists public.player_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  progress integer not null default 0,
  completed boolean not null default false,
  claimed boolean not null default false,
  completed_at timestamptz null,
  claimed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
```

## 인덱스 메모

기본키만으로도 대부분 충분하지만,
`Claim All`과 목록 조회를 빠르게 하려면 아래 인덱스를 고려할 수 있다.

```sql
create index if not exists idx_player_achievements_claimable
on public.player_achievements (user_id, completed, claimed);
```

## RLS 방향

기본 방향:
- 유저는 자기 업적 상태만 읽을 수 있어야 한다.
- 직접 insert/update는 막거나 매우 제한해야 한다.
- 보상 수령과 진행도 갱신은 서버/service role 또는 security definer 함수에서 처리한다.

즉:
- 읽기: 본인만 가능
- 쓰기: 서버만 가능

## 업적 정의 테이블은 필요한가

1차 버전에서는 없어도 된다.

나중에 아래가 필요해지면 추가를 고려한다.
- 운영자가 DB에서 업적 내용을 직접 수정하고 싶다
- 배포 없이 업적 보상/문구를 바꾸고 싶다
- 숨김/시즌 업적을 자주 켜고 끈다

그때 후보 테이블:
- `achievement_definitions`

하지만 1차에선 과하므로 추천하지 않는다.

## Claim All 보안 메모

`Claim All`은 특히 서버에서 처리해야 한다.

이유:
- 클라이언트가 claim 가능한 업적 id 목록을 조작할 수 있다.
- 서버가 직접 `completed && !claimed` 조건으로 찾아야 안전하다.

안전한 방식:
- 클라이언트는 그냥 `claim all` 요청만 보냄
- 서버가 내부적으로 대상 업적을 계산

## 추천 1차 구현 요약

1. `player_achievements` 테이블 추가
2. 업적 정의는 코드에서 관리
3. 진행도 갱신은 서버 이벤트 기반
4. 단일 수령 / 전체 수령은 서버에서 검증 후 처리
5. 토큰 지급은 항상 서버에서만 처리

## 다음 단계

다음 구현 단계에서는:
- 실제 SQL 파일 작성
- 서버 claim 함수 설계
- 업적 catalog 코드 작성
순서로 가면 된다.
