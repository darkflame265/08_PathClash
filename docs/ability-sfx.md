# Ability SFX Notes

이 문서는 능력대전 스킬 전용 사운드 효과를 정리한 문서입니다.
파일 경로, 사용 스킬, preload 구조를 한 곳에서 관리하기 위한 용도입니다.

## 기준 코드

- [soundUtils.ts](c:/08_PathClash/client/src/utils/soundUtils.ts)
- [AbilityScreen.tsx](c:/08_PathClash/client/src/components/Ability/AbilityScreen.tsx)

## 운영 원칙

- 스킬 전용 SFX 경로와 볼륨 감쇠값은 `soundUtils.ts`의 `ABILITY_SFX` 레지스트리에서 관리합니다.
- 새 스킬 SFX를 추가할 때는:
  1. `client/public/sfx/ability`에 파일 추가
  2. `ABILITY_SFX`에 경로와 gain 추가
  3. 필요한 `play...()` 함수 연결
  4. 문서도 갱신
- 능력대전 화면 진입 시 `preloadAbilitySfxAssets()`로 주요 스킬 SFX를 미리 preload 합니다.
- 루프 사운드는 일반 단발 SFX와 분리 관리합니다.

## 현재 스킬 SFX 매핑

| 스킬 | 함수 | 파일 | 비고 |
| --- | --- | --- | --- |
| 가드 | `playGuard()` | `/sfx/ability/guard.mp3` | 단발 |
| 원자분열 | `playAtomicFission()` | `/sfx/ability/atomic_fission.wav` | 단발 |
| 충전 | `playCharge()` | `/sfx/ability/charge.mp3` | 단발 |
| 양자 도약 | `playQuantum()` | `/sfx/ability/quantum.mp3` | 단발 |
| 엠버 폭발 | `playEmber()` | `/sfx/ability/ember_blast.mp3` | 노바 폭발도 재사용 |
| 벽력일섬 | `playBlitz()` | `/sfx/ability/electric_blitz.mp3` | 단발 |
| 빅뱅폭발 | `playBigBang()` | `/sfx/ability/cosmic_bigbang.mp3` | 단발 |
| 힐링 | `playHealing()` | `/sfx/ability/healing_skill.mp3` | 단발 |
| 용암지대 | `playInferno()` | `/sfx/ability/inferno_field.mp3` | 단발 |
| 페이즈 시프트 | `playPhaseShift()` | `/sfx/ability/phase_shift.mp3` | 단발 |
| AT 필드 | `playArcReactor()` | `/sfx/ability/arc_reactor_field.mp3` | 단발 |
| 투명화 | `playVoidCloak()` | `/sfx/ability/void_cloak.mp3` | 실제 은신/랜덤 이동 순간 재생 |
| 오버드라이브 | `startOverdriveLoop()` | `/sfx/ability/gold_overdrive_loop.mp3` | 과부화 상태 동안 루프 |

## 전용 SFX가 없는 스킬

현재 기준으로 아래 스킬은 별도 파일이 없습니다.

- 노바 폭발
  - `ember_blast.mp3` 재사용
- 오버드라이브 발동 1회성 효과
  - 현재는 과부화 루프만 존재

## preload 구조

능력대전 진입 시:
- [AbilityScreen.tsx](c:/08_PathClash/client/src/components/Ability/AbilityScreen.tsx)에서 `preloadAbilitySfxAssets()` 호출
- 이 함수는 `ABILITY_SFX` 레지스트리에 등록된 모든 파일에 `audio.load()`를 요청합니다

목적:
- 첫 스킬 발동 시 소리 재생이 늦는 현상 완화
- 파일 경로 누락 여부를 한 곳에서 관리

## 볼륨 조정 규칙

- 각 파일의 체감 볼륨은 `ABILITY_SFX`의 `gain` 값으로 조정합니다.
- 전역 볼륨은 사용자 설정값을 따릅니다.
- 특정 파일만 유독 크거나 작으면 `gain`만 수정합니다.

예:
- `charge.mp3`가 너무 크면 `charge.gain` 감소
- `bigbang`이 너무 약하면 `cosmic_bigbang.gain` 증가

## 관련 체크리스트

새 SFX 추가 후 확인할 것:
1. 파일이 `client/public/sfx/ability`에 있는지
2. 경로 오타가 없는지
3. mute 상태에서 재생되지 않는지
4. 볼륨이 다른 스킬에 비해 과하지 않은지
5. 모바일에서도 정상 재생되는지
