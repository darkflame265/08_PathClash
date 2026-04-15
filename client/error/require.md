현재 내 웹게임(PathClash)의 레이아웃이 환경별로 다르게 동작해야 합니다.

문제 상황:

- 모바일에서는 정상적으로 세로 UI로 잘 보임
- 데스크탑에서는 중앙 정렬된 레이아웃으로 정상
- 태블릿(에뮬레이터 기준)에서는 UI가 깨지고, 요소들이 비정상적으로 늘어나거나 위치가 틀어짐

원하는 목표:

1. 모바일 (small screen)

- 화면을 꽉 채우는 세로 UI 유지
- 현재 디자인 그대로 유지

2. 태블릿 (medium screen)

- 클래시로얄처럼 "가운데 고정된 세로 게임 화면" 형태
- 최대 너비 제한 (예: 480~540px)
- 좌우는 검은 여백 (letterbox)
- UI 절대 늘어나지 않도록

3. 데스크탑 (large screen)

- 현재처럼 중앙 정렬된 카드형 UI 유지
- 필요하면 max-width 유지

---

핵심 요구사항:

- vw 기반 레이아웃 때문에 태블릿에서 깨지는 문제 해결
- 전체 레이아웃을 "고정된 세로 viewport 기반"으로 리팩토링
- 최상위 컨테이너 구조를 다음처럼 변경:

  outer container:
  - full width/height
  - background: black
  - flex center

  inner game viewport:
  - width: 100%
  - max-width: 520px (or similar)
  - height: 100%
  - overflow hidden

---

추가 요구:

1. media query 기준 정리:
   - mobile: < 768px
   - tablet: 768 ~ 1024px
   - desktop: > 1024px

2. 내부 UI에서 vw 사용 줄이고
   - max-width
   - aspect-ratio
   - flex 기반으로 변경

3. 보드 및 주요 UI 요소가
   - 태블릿에서 과도하게 커지지 않도록 제한

---

결과물:

- 수정된 CSS / layout 구조 코드
- 변경된 컨테이너 구조 설명
- 왜 태블릿에서 깨졌는지 원인 분석

현재 코드 구조를 최대한 유지하면서, 레이아웃만 안정적으로 수정해줘.
