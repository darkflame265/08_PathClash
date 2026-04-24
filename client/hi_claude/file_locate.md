이 작업이면 Claude가 우선 보면 될 파일은 이쪽입니다.

가장 핵심:

client/src/components/Game/GameScreen.tsx
일반전 충돌 애니메이션, 이동 연출, 타이밍 제어 쪽 핵심입니다.

client/src/components/Game/GameGrid.tsx
격자 위에 충돌 파티클이나 이펙트를 실제로 그릴 위치입니다.

client/src/components/Game/GameGrid.css
충돌 파티클, 플래시, 스케일, 흔들림 같은 시각효과 CSS는 여기서 잡을 가능성이 큽니다.

client/src/store/gameStore.ts
이미 collisionEffects, triggerCollisionEffect, animation, currentStep 같은 충돌 연출용 상태가 들어 있습니다.
hit stop용 상태를 추가하거나 기존 충돌 상태를 확장할 가능성이 큽니다.

충돌 데이터가 어디서 오는지 보려면:

client/src/types/game.types.ts
충돌 이벤트 타입 정의 확인.

server/src/game/GameEngine.ts
일반전 충돌 판정이 여기서 만들어집니다.

server/src/game/GameRoom.ts
서버가 충돌 이벤트를 클라이언트로 보내는 흐름 확인용.

능력대전까지 같이 넣을 생각이면 추가로:

client/src/components/Ability/AbilityScreen.tsx
client/src/components/Ability/AbilityGrid.tsx
client/src/components/Ability/AbilityScreen.css
server/src/game/ability/AbilityEngine.ts
Claude에게 짧게 넘기려면 이렇게 주면 됩니다:

일반전 충돌 연출: GameScreen.tsx, GameGrid.tsx, GameGrid.css, gameStore.ts
충돌 이벤트 소스 확인: game.types.ts, GameEngine.ts, GameRoom.ts
능력대전까지 확장 시: AbilityScreen.tsx, AbilityGrid.tsx, AbilityScreen.css, AbilityEngine.ts
가장 먼저 볼 파일 1순위는
client/src/components/Game/GameScreen.tsx 과 client/src/store/gameStore.ts 입니다.
