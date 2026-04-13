현재 일반 대결전용 가짜 AI가 사용할 스킬 의사결정 로직을 구현해줘.
AI는 인게임에서 장착한 스킬 3개만 사용할 수 있고, 마나는 최대 10, 매턴 2씩 회복된다.

목표:

- AI가 공격 턴 / 도망 턴에서
  현재 장착한 스킬 3개 중 무엇을 쓸지,
  언제 쓸지,
  어디에 쓸지
  판단하는 공통 스킬 AI 시스템을 만들어줘.
- 단순 규칙 나열이 아니라, 실제로 경로 후보와 스킬 후보를 비교해서 점수화 후 최선의 행동을 선택해야 한다.

전제:

- 5x5 보드
- 장애물 존재
- 공격 턴 AI / 도망 턴 AI 모두 존재
- 기존에 만들었거나 만들 예정인
  - 공격 전용 경로 생성 함수
  - 도망 전용 경로 생성 함수
  - 상대 후보 경로 예측 함수
  - danger heatmap / enemy path heatmap
    이 있으면 재사용 가능
- 스킬 사용 여부는 “경로 + 스킬”의 조합 단위로 평가해야 함

구현 목표:

1. 공통 스킬 판단 시스템 추가
2. 공격 턴용 스킬 사용 판단
3. 도망 턴용 스킬 사용 판단
4. 마나 운영 고려
5. 디버그 로그 제공
6. 나중에 weight 튜닝 가능하도록 상수 분리

==================================================
[공통 AI 구조]
==================================================

다음 구조로 구현해줘.

- chooseAiAction(state)
  - 현재 턴 역할(attack / escape)에 따라 분기
  - 기본 경로(스킬 없음) 후보 계산
  - 장착한 스킬 3개 각각에 대해 스킬 사용 후보 계산
  - 각 후보를 점수화
  - 가장 점수가 높은 행동 선택

- buildBasePathCandidates(state)
- buildSkillActionCandidates(state, equippedSkills)
- scoreActionCandidate(state, candidate)

candidate는 아래 정보를 포함:

- selectedSkill (없으면 null)
- skillUsage
  - castStep
  - targetCell / targetDirection / blinkTarget 등
- resultingPath
- predictedHitScore
- predictedSurvivalScore
- manaCost
- debugReason

공통 점수 방향:

- 공격 턴:
  attackScore = hitScore + controlScore + futurePositionScore - selfRisk - manaWaste
- 도망 턴:
  escapeScore = survivalScore + mobilityScore + futureEscapeScore - dangerScore - manaWaste

기본 원칙:

- 스킬은 “쓸 수 있다”가 아니라
  “이번 턴 실제 기대값이 기본 경로보다 충분히 좋아질 때만” 사용
- 애매한 이득이면 아끼고,
  확실한 이득이면 사용

==================================================
[마나 규칙]
==================================================

- 최대 마나 10
- 매턴 +2 회복
- 사용 가능한 스킬은 현재 장착 3개만
- 다음 턴 고코스트 스킬(8~10코) 준비 가치도 고려

공통 마나 운영 규칙:

- 이번 턴 소이득보다 다음 턴 큰 킬각이 크면 아껴라
- 상대 HP가 낮으면 공격 스킬 사용 성향 증가
- 내 HP가 낮으면 방어/도주 스킬 우선
- 10코 상태에서는 빅뱅폭발 가치 평가 강화
- 8코 상태에서는 태양전차/매직마인/고코스트 공격/수비 판단 강화

manaWaste 패널티:

- 현재 턴 기대값이 낮은데 고코스트 쓰면 감점
- low-cost defensive lifesaving은 감점 약하게
- big swing / lethal / unavoidable survival이면 감점 약하게

==================================================
[스킬별 구현 규칙]
==================================================

장착 가능한 스킬 목록:

- 가드
- 엠버폭발
- 노바폭발
- 용암지대
- 양자 도약
- 빅뱅폭발
- AT 필드
- 벽력일섬
- 매직마인
- 타임 리와인드 (패시브)
- 원자분열
- 태양전차

---

1. 가드

---

- 마나코스트 2
- 방어
- 2칸 시간 동안 무적
- 사용 시 이번 턴 이동 불가

AI 사용 조건:

- 이번 턴 예상 피격량이 높음
- 이동으로도 위험 회피가 어렵음
- 내 HP가 낮음
- 상대가 공격 스킬 킬각을 만들 가능성이 큼

금지 조건:

- 이동만으로 안전 확보 가능
- 이번 턴 킬각이 더 중요함

구현:

- guard candidate는 “정지 + 무적”
- score는 blockedExpectedDamage, surviveBonus, lostMobilityPenalty 기반

---

2. 엠버폭발

---

- 마나코스트 4
- 공격
- 자신 중심 십자 범위 1피해

AI 사용 조건:

- 상대 후보 경로가 내 경로 중 특정 step에서 십자 범위에 많이 걸림
- 근접전, 병목 구간, 현재 위치 중심 근접 압박 시 유리

구현:

- 내 resultingPath의 각 step마다
  십자 AoE coverage 계산
- coverage 최대 step을 castStep으로 선택
- candidate score에 hit coverage 반영

---

3. 노바폭발

---

- 마나코스트 4
- 공격
- 지정 시점에 자신 중심 대각선 2칸 X자 범위 1피해

AI 사용 조건:

- 상대 후보 경로가 X자 대각 영역에 더 많이 걸릴 때
- 대각 회피 / 퍼짐 경로 대응에 유리할 때

구현:

- 각 step마다 X자 AoE coverage 계산
- coverage 최대 step 선택
- 엠버폭발 candidate와 함께 비교해서 더 좋은 쪽 선택 가능

---

4. 용암지대

---

- 마나코스트 6
- 공격
- 선택한 1칸을 2턴 동안 위험 지역으로 설정
- 밟거나 지나가거나 서 있으면 1피해

AI 사용 조건:

- 상대 후보 경로들이 자주 지나는 병목 칸 존재
- 상대 안전 루트가 좁음
- 장기 압박 가치가 높음

구현:

- enemy path heatmap 기반으로 설치 후보 셀 평가
- 단순 방문 빈도뿐 아니라
  - 병목 가중치
  - 최종 도착 빈도
  - 중간 경유 빈도
    반영
- selfCrossRisk 있으면 감점

---

5. 양자 도약

---

- 마나코스트 4
- 유틸
- 8방향 1칸 순간이동 후 경로 계속 작성

AI 사용 조건:

- 공격 턴:
  blink 후 인터셉트 경로 질이 상승
- 도망 턴:
  blink 후 danger heatmap이 낮은 영역으로 탈출 가능
  또는 병목 탈출 / 열린 공간 확보 가능

구현:

- 8개 blinkTarget 각각 평가
- 공격 턴: blink 후 path hit quality 최대
- 도망 턴: blink 후 survival quality 최대
- 일반 이동만으로 동일 효과면 감점

---

6. 빅뱅폭발

---

- 마나코스트 10
- 공격
- 보드 전체 2피해
- 가드에 막힘
- 이번 턴 이동 불가

AI 사용 조건:

- 상대 HP가 2 이하
- 상대가 가드 사용 가능성이 낮음
- 내가 정지해도 생존 리스크 감수할 가치 있음

구현:

- killProbability 계산
- enemyGuardProbability 또는 enemyDefensePossibility 반영
- immobileRisk 반영
- 확실한 킬각 아니면 남발 금지

---

7. AT 필드

---

- 마나코스트 6
- 방어
- 공격 스킬 1회 무효화 및 반사
- 빅뱅은 반사 없이 무효화만

AI 사용 조건:

- 상대가 이번 턴 공격 스킬을 쓸 확률이 높음
- 내 HP가 낮아 방어 가치가 큼
- 가드보다 기대값이 높음

구현:

- enemyLikelySkillAttack 평가 필요
- blockedExpectedDamage + reflectedDamagePotential 기반 점수
- enemyManaThreshold(4/6/8/10) 참고

---

8. 벽력일섬

---

- 마나코스트 6
- 공격
- 방향 선택
- 장애물 무시 직선 돌진
- 경로 위 적에게 피해

AI 사용 조건:

- 상대 후보 경로가 특정 행/열 라인에 몰림
- 일반 경로보다 직선 인터셉트 가치 높음
- 장애물 무시 이점 큼

구현:

- 상하좌우 4방향 candidate 생성
- 각 방향에 대해
  - lineCoverage
  - interceptChance
  - endPositionRisk
    평가
- 최적 direction 선택

---

9. 매직마인

---

- 마나코스트 8
- 공격
- 지정 step 시점 현재 위치에 함정 설치
- 상대가 밟으면 1피해
- 5턴 지속

AI 사용 조건:

- 장기전
- 상대가 자주 선택하는 병목/중앙/안전 루트 존재
- 즉시 딜보다 future trap value가 큼

구현:

- 내 경로 각 step 위치에 설치 candidate 생성
- futureEnemyVisitProbability 기반 평가
- selfTrapRisk 감점
- 장기 pressure score 반영

---

10. 타임 리와인드

---

- 코스트 0
- 패시브
- 치명상 시 경기당 1회 이번 턴 종료 후 턴 시작 위치로 되감김

구현 방식:

- active skill candidate가 아니라
  AI risk tolerance modifier로 구현
- rewindAvailable == true 이면:
  - 공격 턴에서 selfRisk 허용치 증가
  - 킬각 시 더 공격적인 경로 허용
  - 도망 턴에서도 약간의 counter-risk 허용
- 단, 턴 시작 위치가 이미 위험하면 패시브 가치 낮게 평가

---

11. 원자분열

---

- 마나코스트 6
- 공격
- 이동 시작 시 이전 턴 경로를 따라 움직이는 잔상 생성
- 잔상이 적과 충돌 시 피해

AI 사용 조건:

- previousTurnPath가 의미 있는 압박선
- 현재 경로 + 과거 경로를 동시에 활용해 다중 압박 가능
- 상대가 좁은 공간 / 포위각에 있음

구현:

- previousTurnPath와 currentCandidatePath를 함께 시뮬레이션
- shadowPathHitChance + currentPathHitChance 합산
- previousTurnPath가 무의미하면 사용 금지

---

12. 태양전차

---

- 마나코스트 8
- 공격
- 이동 중 3x3 충돌 범위
- 1회만 피격 가능

AI 사용 조건:

- 상대 후보 경로가 내 이동선 주변 1칸 내에 많이 퍼져 있음
- 병목 / 좁은 공간 / 중앙 장악 구간에서 강함
- 일반 충돌보다 coverage 이득 큼

구현:

- 각 path candidate를 3x3 hitbox로 확장해서 coverage 계산
- firstHitProbability를 중요 가중치로 반영
- 1회만 피격 가능하므로 첫 충돌 가치가 높은 경로 선호

==================================================
[공격 턴 / 도망 턴 우선순위]
==================================================

공격 턴 우선순위 대략:

1. 확정 킬 (빅뱅폭발)
2. 직선 인터셉트 (벽력일섬)
3. 넓은 압박 (태양전차)
4. 잔상/이중 압박 (원자분열)
5. 장기 차단 (용암지대 / 매직마인)
6. 근접 폭발 (엠버폭발 / 노바폭발)

도망 턴 우선순위 대략:

1. 가드
2. AT 필드
3. 양자 도약
4. 패시브 리와인드 기반 위험 허용 조정

단, 실제 선택은 우선순위 고정이 아니라 score 기반으로 결정해야 함.

==================================================
[필요한 함수 구조]
==================================================

가능하면 아래 형태로 구현해줘.

- chooseAiAction(state)
- buildBasePathCandidates(state)
- buildSkillActionCandidates(state, equippedSkills)
- buildSkillCandidatesForSkill(state, skill)
- scoreActionCandidate(state, candidate)
- scoreAttackCandidate(state, candidate)
- scoreEscapeCandidate(state, candidate)

스킬별 전용 헬퍼:

- evaluateGuardCandidate(...)
- evaluateEmberExplosionCandidates(...)
- evaluateNovaExplosionCandidates(...)
- evaluateLavaPlacementCandidates(...)
- evaluateQuantumBlinkCandidates(...)
- evaluateBigBangCandidate(...)
- evaluateAtFieldCandidate(...)
- evaluateThunderDashCandidates(...)
- evaluateMagicMineCandidates(...)
- applyRewindRiskModifier(...)
- evaluateFissionCandidates(...)
- evaluateSunChariotCandidates(...)

==================================================
[디버그 로그]
==================================================

디버깅 가능하게 로그 추가:

- current role: attack / escape
- equipped skills
- current mana
- base path candidate count
- skill candidate count per skill
- chosen candidate
- top 5 candidates with scores
- reason for chosen candidate
- killProbability / surviveProbability / lineCoverage / heatmapScore 등 주요 수치

==================================================
[중요한 제약]
==================================================

- AI는 스킬을 무조건 쓰면 안 됨
- 기본 경로보다 기대값이 충분히 좋을 때만 사용
- 경로와 스킬을 별개로 보지 말고 “경로 + 스킬 조합”으로 평가
- 장착한 3개 스킬만 고려
- 마나 최대 10, 턴당 2 회복 규칙 반영
- 공격 AI는 hit maximize / control maximize
- 도망 AI는 survival maximize / danger minimize
- 랜덤성은 완전 멍청한 무작위가 아니라
  top safe/top strong 후보군 내부에서만 약하게 허용 가능

==================================================
[최종 요청]
==================================================

현재 프로젝트 구조에 맞춰 바로 붙일 수 있게 구현해줘.
수정한 파일/함수 목록과
각 스킬이 어떤 조건에서 어떻게 판단되도록 만들었는지 요약도 같이 설명해줘.
필요하면 기존 공격/도망 경로 생성 로직 위에 얹는 방식으로 리팩터링해줘.
디버그는 뺴줘. 딱히 디버그 넣어도 고칠 이유 없으니까. 오히려 리소스 낭비임.
