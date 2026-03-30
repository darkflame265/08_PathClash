# 일반 대결전 리매치 후 경로 씹힘 버그 원인 정리

## 증상
- 일반 대결전에서 승부 후 둘 다 `리매치`를 누르면,
- 다음 경기 첫 라운드에서 가끔 한 플레이어가 경로를 분명 작성했는데도
  움직이는 시간이 되면 그 경로가 사라지는 문제가 발생했다.
- 이때 UI에서 패스 포인트가 원래 첫 라운드 기준 `5`여야 하는데,
  가끔 이전 경기 값처럼 `6`으로 보이는 단서가 있었다.

## 핵심 원인
원인은 **리매치 시작 시 클라이언트 store에 이전 경기의 `roundInfo`가 남아 있던 것**이다.

흐름은 이렇다.

1. 이전 경기 마지막 라운드가 끝남
2. 클라이언트 store의 `roundInfo`에는 이전 경기 마지막 라운드 값이 남아 있음
   - 예: `turn = 2`, `pathPoints = 6`, `roundEndsAt = ...`
3. 리매치가 성사되면 서버가 새 경기 `game_start`를 보냄
4. 그런데 클라이언트 `setGameState(gs)`는 새 경기 상태만 바꾸고,
   **이전 경기의 `roundInfo`를 바로 비우지 않았음**
5. 새 경기 첫 `round_start`가 오기 전 잠깐 동안,
   - `gameState`는 새 경기
   - `roundInfo`는 이전 경기
   인 꼬인 상태가 생김
6. 이 상태에서 자동 제출 / 입력 관련 로직이 stale `roundInfo`를 참조하면
   첫 라운드가 꼬이면서 경로가 정상 반영되지 않을 수 있음

즉, 이 버그의 본질은
**경로 입력 자체가 아니라, 리매치 직후 이전 경기 라운드 상태가 새 경기 시작에 섞이는 클라이언트 상태 초기화 누락**이다.

## 최소 수정 방법
파일:
- `client/src/store/gameStore.ts`

수정 대상:
- `setGameState: (gs) => ...`

해야 할 수정:
- 새 게임 상태를 받을 때 아래 두 값을 같이 초기화한다.
  - `roundInfo: null`
  - `animation: null`

예시:

```ts
setGameState: (gs) =>
  set(() => ({
    gameState: gs,
    roundInfo: null,
    animation: null,
    playerPieceSkins: {
      red: gs.players.red.pieceSkin,
      blue: gs.players.blue.pieceSkin,
    },
    redDisplayPos: gs.players.red.position,
    blueDisplayPos: gs.players.blue.position,
    winner: null,
    gameOverMessage: null,
    rematchRequested: false,
    rematchRequestSent: false,
    myPath: [],
    opponentSubmitted: false,
  })),
```

## 왜 이 수정만 하면 되나
- `game_start`는 "새 경기 시작" 이벤트이므로,
  이전 경기의 라운드 정보(`roundInfo`)와 애니메이션(`animation`)이 남아 있을 이유가 없다.
- 따라서 이 둘을 여기서 초기화하는 것은 정상 동작이며,
  다른 기능을 건드리지 않고도 stale 상태 섞임만 제거할 수 있다.

## 관련 단서
이 버그를 추적할 때 가장 중요했던 단서:
- 리매치 후 첫 라운드에서 패스 포인트가 `5`가 아니라 가끔 `6`으로 보임

이건 곧,
- 새 경기의 첫 라운드 상태가 아니라
- 이전 경기의 turn/pathPoints 정보가 잠깐 재사용되고 있다는 뜻이었다.

## 권장 사항
이 버그를 재수정할 때는,
- 다른 path submit / throttle / timing 최적화는 건드리지 말고
- **위의 `setGameState()` 초기화만 먼저 적용해서 검증**하는 것이 좋다.

그 뒤에도 재현되면 그때 서버/클라이언트 제출 타이밍을 추가로 의심하면 되지만,
이번에 확인된 직접 원인은 위 stale `roundInfo` 문제였다.
