# 친구 시스템 설계 (Friend System Design)

## 개요

친구대전 모드에 소셜 친구 시스템을 추가한다. 친구 목록 패널이 아레나 이미지 자리(ability 모드)를 대체하며, 친구 추가·요청 관리·친선전 도전이 가능하다. 게스트 유저 포함 전체 유저 사용 가능.

---

## 데이터 모델

### Supabase 테이블

**`friends`**
```sql
user_id    UUID  REFERENCES auth.users ON DELETE CASCADE
friend_id  UUID  REFERENCES auth.users ON DELETE CASCADE
created_at TIMESTAMPTZ DEFAULT now()
PRIMARY KEY (user_id, friend_id)
```
- 양방향 관계는 `(A, B)` + `(B, A)` 두 행으로 저장
- 친구 삭제 시 두 행 모두 제거

**`friend_requests`**
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
sender_id   UUID REFERENCES auth.users ON DELETE CASCADE
receiver_id UUID REFERENCES auth.users ON DELETE CASCADE
created_at  TIMESTAMPTZ DEFAULT now()
UNIQUE (sender_id, receiver_id)
```

### 서버 인메모리 (socketServer.ts)

```ts
// 5분 TTL 친구 코드
const friendCodes = new Map<string, { userId: string; nickname: string; expiresAt: number }>();

// 진행 중인 친선전 요청
const challengePending = new Map<string, { fromUserId: string; fromNickname: string; fromSocketId: string }>();
```

- 친구 코드: 대문자 영숫자 6자리 (기존 방 코드와 동일 형식)
- 만료된 코드는 `friend_generate_code` 호출 시 및 주기 정리로 제거

---

## Socket.io 이벤트

### 클라이언트 → 서버 (ack)

| 이벤트 | 요청 페이로드 | 응답 |
|--------|--------------|------|
| `friend_generate_code` | `{ auth }` | `{ code: string, expiresAt: number }` |
| `friend_add_by_code` | `{ auth, code }` | `{ status: 'ok' \| 'not_found' \| 'expired' \| 'already_friends' \| 'self' }` |
| `friend_list` | `{ auth }` | `{ friends: FriendEntry[] }` |
| `friend_requests_list` | `{ auth }` | `{ requests: RequestEntry[] }` |
| `friend_request_respond` | `{ auth, requestId, accept: boolean }` | `{ status: 'ok' \| 'error' }` |
| `friend_remove` | `{ auth, friendId }` | `{ status: 'ok' \| 'error' }` |
| `friend_get_profile` | `{ auth, friendId }` | `{ profile: FriendProfile }` |
| `friend_challenge` | `{ auth, friendId }` | `{ status: 'ok' \| 'offline' \| 'in_game' \| 'error' }` |
| `friend_challenge_response` | `{ auth, fromUserId, accept: boolean }` | `{ status: 'ok' \| 'error' }` |

### 서버 → 클라이언트 (push)

| 이벤트 | 데이터 | 발생 시점 |
|--------|--------|----------|
| `friend_request_received` | `{ requestId, senderNickname }` | 상대가 내 코드로 친구 요청 보냈을 때 |
| `friend_challenge_received` | `{ fromUserId, fromNickname }` | 상대가 친선전 요청 보냈을 때 |
| `friend_challenge_accepted` | `{ roomCode }` | 친선전 수락 완료, 방 코드 전달 |

### 타입 정의

```ts
interface FriendEntry {
  userId: string
  nickname: string
  currentRating: number
  equippedSkin: PieceSkin
  status: 'online' | 'in_game' | 'offline'
}

interface RequestEntry {
  id: string
  senderNickname: string
  senderId: string
  createdAt: string
}

interface FriendProfile {
  userId: string
  nickname: string
  currentRating: number
  equippedSkin: PieceSkin
  wins: number
  losses: number
}
```

---

## 온라인 상태 판별 (서버)

`friend_list` 호출 시 각 친구의 status를 서버에서 판별:

1. `activeUserSockets.has(friendId)` → 소켓 연결 여부
2. 연결 중이면 `abilityStore` / `store` / `coopStore` / `twoVsTwoStore` 에서 해당 소켓이 방에 있는지 확인
3. 방 안에 있으면 `'in_game'`, 방 없으면 `'online'`, 소켓 없으면 `'offline'`

---

## UI 컴포넌트 구조

### 배치

```
lobby-screen
├── lobby-user-header
├── [ability 모드] lobby-arena-center (아레나 이미지)
│   [friend 모드]  FriendListPanel         ← 신규
├── lobby-card (방 만들기 / 코드입력 / 장착스킬)
└── 모달/토스트
```

`showLobbyArenaContent` 조건에 `friend` 모드 추가 대신, 별도 `showFriendListPanel = selectedLobbyMode === 'friend'` 조건으로 렌더링.

### 컴포넌트 목록

**FriendListPanel**
- 친구 목록 스크롤 리스트
  - 행: 스킨 미니 아이콘 + 닉네임 + 레이팅 + 상태 뱃지 (🟢온라인 / 🔵게임중 / ⚫오프라인)
  - 클릭 → FriendContextPopup 표시
- 빈 상태: "아직 친구가 없습니다" 안내 문구
- 하단 버튼 행: [친구 추가] [친구 요청 (N)]
  - N: 받은 요청 수 뱃지

**FriendAddModal**
- 상단: 내 일회용 코드 (대형 표시) + MM:SS 카운트다운
- 코드 재생성 버튼 (만료 후 또는 사용자 요청)
- 구분선
- 하단: 상대방 코드 입력란 + 확인 버튼
- 코드 입력 결과 메시지 표시

**FriendRequestsModal**
- 받은 요청 목록 (닉네임 + 수락 / 거절 버튼)
- 빈 상태: "받은 친구 요청이 없습니다"

**FriendContextPopup**
- 클릭한 친구 행 근처에 작은 팝업
- 3개 버튼: [프로필 보기] [친선전] [친구 삭제]
- 친구 삭제 클릭 시 확인 없이 즉시 삭제 (단순하게)

**FriendProfileModal**
- 스킨 미리보기 (기존 skin preview 컴포넌트 재활용)
- 닉네임, 레이팅, 승/패

**FriendChallengeToast**
- 로비 상단 고정 배너
- 텍스트: "{nickname}님이 친선전을 요청했습니다."
- [수락] [거절] 버튼
- 수락 흐름: `friend_challenge_response` → 서버가 ability room 생성 → `friend_challenge_accepted { roomCode }` → 클라이언트 자동으로 `join_ability_room` 이벤트로 입장 (기존 흐름 재활용)

---

## 친선전 흐름 (서버)

1. A가 `friend_challenge { friendId: B }` 전송
2. 서버: B가 온라인이고 게임 중이 아닌지 확인
3. B의 소켓으로 `friend_challenge_received` push
4. B가 `friend_challenge_response { fromUserId: A, accept: true }` 전송
5. 서버: A와 B의 스킬 로드아웃으로 ability room 생성 (기존 `create_ability_room` 로직 재활용)
6. A 소켓에 `friend_challenge_accepted { roomCode }` push
7. B 소켓에 `ability_room_joined` emit (B가 방장)
8. A 클라이언트: roomCode로 `join_ability_room` 자동 실행

---

## 구현 범위 외 (이번 스펙에서 제외)

- 친구 수 제한 (우선 무제한)
- 차단 기능
- 친구 목록 실시간 상태 폴링 (목록 열 때만 조회)

---

## 파일 구조 (신규/수정)

### 신규
- `client/src/components/Lobby/friends/FriendListPanel.tsx`
- `client/src/components/Lobby/friends/FriendAddModal.tsx`
- `client/src/components/Lobby/friends/FriendRequestsModal.tsx`
- `client/src/components/Lobby/friends/FriendContextPopup.tsx`
- `client/src/components/Lobby/friends/FriendProfileModal.tsx`
- `client/src/components/Lobby/friends/FriendChallengeToast.tsx`

### 수정
- `server/src/socket/socketServer.ts` — 친구 관련 이벤트 핸들러 추가
- `client/src/components/Lobby/LobbyScreen.tsx` — FriendListPanel + Toast 연결
- Supabase: `friends`, `friend_requests` 테이블 추가 (마이그레이션)
