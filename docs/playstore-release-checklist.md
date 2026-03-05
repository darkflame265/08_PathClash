# PathClash Play Store Release Checklist

이 문서는 현재 `08_PathClash` 프로젝트 기준으로 Android(Play Store) 출시를 위한 실행 체크리스트입니다.

## 0) 현재 상태 요약 (2026-03-05)

- 앱 식별자: `com.pathclash.game`
- Android min/target SDK: 24 / 36
- OAuth 딥링크 스킴(코드 기준): `com.pathclash.game://auth/callback`
- 확인 필요 리스크:
  - 에뮬레이터에서 Google 연동 시 주소창(Custom Tab) 복귀 이슈가 남아 있음
  - 이슈 해결 전에는 프로덕션 출시 보류 권장

## 1) 릴리즈 전 필수 고정값

- [ ] `client/capacitor.config.ts`
  - `appId: "com.pathclash.game"` 유지
- [ ] `client/android/app/build.gradle`
  - `applicationId "com.pathclash.game"` 유지
  - `versionCode`, `versionName`를 출시 규칙에 맞게 증가
- [ ] Supabase Auth Redirect URL
  - `com.pathclash.game://auth/callback` 등록
  - 불필요하거나 오타인 URL 제거

## 2) 계정/정책(콘솔 제출용)

- [ ] Privacy Policy URL 준비
  - 권장 URL: `https://pathclash.com/privacy.html`
- [ ] 앱 지원 연락처 이메일 준비
- [ ] 계정 삭제 요청 방법 준비
  - 최소한 이메일 접수 방식 또는 폼/웹페이지
- [ ] 데이터 수집 항목 정리
  - 로그인 정보(Google), 닉네임, 전적(승/패), 기기 연동 계정 데이터

## 3) 서명/빌드 파이프라인

- [ ] 업로드 키스토어 생성 (분실 금지)
- [ ] `client/android/keystore.properties` 생성 (`keystore.properties.example` 기반)
- [ ] Android Studio에서 `.aab` 생성 가능한지 확인
- [ ] Internal testing 트랙 업로드 후 설치/로그인/매치 테스트

참고 문서:
- `docs/android-release-signing.md`

권장 버전 정책:

- `versionName`: 사용자 표시 버전 (`1.0.0`, `1.0.1` ...)
- `versionCode`: 매 배포마다 정수 증가 (`1`, `2`, `3` ...)

## 4) 출시 전 기능 QA (실기기 필수)

- [ ] 앱 첫 실행
- [ ] 게스트 로그인 자동 생성/유지
- [ ] Google 연동 (로그인 후 앱으로 정상 복귀)
- [ ] 앱 재실행 후 세션 유지
- [ ] 대전/AI/친구코드/랜덤매치 동작
- [ ] 한글/영문 토글 및 레이아웃 깨짐 여부
- [ ] 네트워크 끊김/복구 시 예외 처리

## 5) Play Console 입력 순서

1. 앱 기본정보(이름, 설명, 카테고리, 연락처)
2. 앱 콘텐츠 설문(광고 여부, 연령 등급, 데이터 안전)
3. 개인정보처리방침 URL 입력
4. 스크린샷/아이콘/Feature Graphic 업로드
5. Internal testing 배포
6. 문제 없으면 Production 점진 배포

## 6) 이 프로젝트에서 다음 단계(권장)

1. OAuth 복귀 이슈부터 해결 (현재 최우선)
2. 업로드 키스토어 생성 + 보관 전략 수립
3. Play Console Internal testing 1차 배포
