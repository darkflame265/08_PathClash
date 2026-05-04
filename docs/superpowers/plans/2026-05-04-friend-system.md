# Friend System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 친구대전 모드에 소셜 친구 시스템(목록 패널, 친구 추가/요청, 친선전)을 추가한다.

**Architecture:** Supabase `friends`/`friend_requests` 테이블로 영구 저장. 친구 코드(5분 TTL)와 친선전 요청은 서버 인메모리 Map으로 관리. 6개의 React 컴포넌트 신규 생성, LobbyScreen에 연결. 소켓 ack 패턴으로 CRUD, push 이벤트로 실시간 알림.

**Tech Stack:** Node.js + Socket.io + Supabase (서버), React + TypeScript (클라이언트)

---

## 파일 구조

### 신규 생성
- `client/src/components/Lobby/friends/types.ts` — 공유 타입 정의
- `client/src/components/Lobby/friends/FriendListPanel.tsx` — 목록 패널 (아레나 이미지 대체)
- `client/src/components/Lobby/friends/FriendAddModal.tsx` — 코드 생성 + 코드 입력
- `client/src/components/Lobby/friends/FriendRequestsModal.tsx` — 받은 요청 목록
- `client/src/components/Lobby/friends/FriendContextPopup.tsx` — 친구 클릭 팝업
- `client/src/components/Lobby/friends/FriendProfileModal.tsx` — 친구 프로필 보기
- `client/src/components/Lobby/friends/FriendChallengeToast.tsx` — 친선전 요청 배너

### 수정
- `server/src/socket/socketServer.ts` — 친구 Maps + 10개 핸들러 추가
- `client/src/components/Lobby/LobbyScreen.tsx` — 패널/토스트 렌더링 + 소켓 리스너
- `client/src/components/Lobby/LobbyScreen.css` — 새 컴포넌트 CSS

---

## Task 0: Supabase DB 테이블 추가

**Files:** Supabase 대시보드 (코드 변경 없음)

- [ ] **Step 1: Supabase 대시보드 → SQL Editor에서 실행**

```sql
CREATE TABLE public.friends (
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  friend_id  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE public.friend_requests (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id   UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  receiver_id UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sender_id, receiver_id)
);
```

- [ ] **Step 2: 확인**

Supabase 대시보드 → Table Editor에서 `friends`, `friend_requests` 두 테이블 존재 확인.

---

## Task 1: 서버 — 친구 Maps + 코드 생성 + 코드로 친구 요청

**Files:**
- Modify: `server/src/socket/socketServer.ts`

- [ ] **Step 1: `initSocketServer` 상단 Map 선언부에 친구 Map 추가**

`abilityFallbackTimers` 선언 바로 뒤에 삽입:

```ts
const FRIEND_CODE_TTL_MS = 5 * 60 * 1000;
const friendCodes = new Map<string, {
  userId: string;
  nickname: string;
  expiresAt: number;
}>();
const challengePending = new Map<string, {
  fromUserId: string;
  fromNickname: string;
  fromSocketId: string;
  fromPieceSkin: PieceSkin;
  fromBoardSkin: BoardSkin;
  fromEquippedSkills: AbilitySkillId[];
  fromStats: { wins: number; losses: number };
  fromCurrentRating: number;
}>();
```

- [ ] **Step 2: 기존 `setInterval` (room sweep) 뒤에 코드 정리 인터벌 추가**

```ts
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of friendCodes.entries()) {
    if (entry.expiresAt <= now) friendCodes.delete(code);
  }
}, 60_000);
```

- [ ] **Step 3: `io.on('connection', ...)` 내부, `join_ability_room` 핸들러 뒤에 `friend_generate_code` 추가**

```ts
socket.on(
  'friend_generate_code',
  async (
    { auth }: { auth?: AuthPayload },
    ack?: (res: { code: string; expiresAt: number } | { error: string }) => void,
  ) => {
    try {
      const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      if (!userId) { ack?.({ error: 'auth_required' }); return; }
      const profile = await resolvePlayerProfileCached(socket, auth, '');
      // 기존 코드 제거
      for (const [code, entry] of friendCodes.entries()) {
        if (entry.userId === userId) friendCodes.delete(code);
      }
      // 새 코드 생성
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code: string;
      do {
        code = Array.from({ length: 6 }, () =>
          chars[Math.floor(Math.random() * chars.length)],
        ).join('');
      } while (friendCodes.has(code));
      const expiresAt = Date.now() + FRIEND_CODE_TTL_MS;
      friendCodes.set(code, { userId, nickname: profile.nickname, expiresAt });
      ack?.({ code, expiresAt });
    } catch (err) {
      console.error('[friend_generate_code] handler error:', err);
      ack?.({ error: 'server_error' });
    }
  },
);
```

- [ ] **Step 4: `friend_add_by_code` 핸들러 추가**

```ts
socket.on(
  'friend_add_by_code',
  async (
    { auth, code }: { auth?: AuthPayload; code: string },
    ack?: (res: { status: 'ok' | 'not_found' | 'expired' | 'already_friends' | 'self' }) => void,
  ) => {
    try {
      const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      if (!userId || !supabaseAdmin) { ack?.({ status: 'not_found' }); return; }
      const normalized = code.trim().toUpperCase();
      const entry = friendCodes.get(normalized);
      if (!entry) { ack?.({ status: 'not_found' }); return; }
      if (entry.expiresAt <= Date.now()) {
        friendCodes.delete(normalized);
        ack?.({ status: 'expired' }); return;
      }
      if (entry.userId === userId) { ack?.({ status: 'self' }); return; }
      const { data: existing } = await supabaseAdmin
        .from('friends')
        .select('friend_id')
        .eq('user_id', userId)
        .eq('friend_id', entry.userId)
        .maybeSingle();
      if (existing) { ack?.({ status: 'already_friends' }); return; }
      // 중복 요청 방지
      const { data: dupReq } = await supabaseAdmin
        .from('friend_requests')
        .select('id')
        .eq('sender_id', userId)
        .eq('receiver_id', entry.userId)
        .maybeSingle();
      if (!dupReq) {
        await supabaseAdmin
          .from('friend_requests')
          .insert({ sender_id: userId, receiver_id: entry.userId });
      }
      // 대상이 온라인이면 실시간 알림
      const targetSocketId = activeUserSockets.get(entry.userId);
      if (targetSocketId && io.sockets.sockets.has(targetSocketId)) {
        const { data: reqRow } = await supabaseAdmin
          .from('friend_requests')
          .select('id')
          .eq('sender_id', userId)
          .eq('receiver_id', entry.userId)
          .single();
        const senderProfile = await resolvePlayerProfileCached(socket, auth, '');
        io.to(targetSocketId).emit('friend_request_received', {
          requestId: reqRow?.id ?? '',
          senderNickname: senderProfile.nickname,
        });
      }
      friendCodes.delete(normalized);
      ack?.({ status: 'ok' });
    } catch (err) {
      console.error('[friend_add_by_code] handler error:', err);
      ack?.({ status: 'not_found' });
    }
  },
);
```

- [ ] **Step 5: 서버 재시작 후 수동 테스트**

```
cd server && npm run dev
```

1. 탭A에서 소켓 연결 후 `friend_generate_code` emit → `{ code: 'XXXXXX', expiresAt: number }` 응답 확인
2. 탭B에서 해당 코드로 `friend_add_by_code` emit → `{ status: 'ok' }` 확인
3. Supabase `friend_requests` 테이블에 행이 생성되었는지 확인

- [ ] **Step 6: 커밋**

```bash
git add server/src/socket/socketServer.ts
git commit -m "feat(server): 친구 코드 생성 및 코드 기반 친구 요청 이벤트 추가"
```

---

## Task 2: 서버 — 친구 목록 + 요청 목록 + 요청 수락/거절

**Files:**
- Modify: `server/src/socket/socketServer.ts`

- [ ] **Step 1: `friend_list` 핸들러 추가 (Task 1 핸들러 뒤)**

```ts
socket.on(
  'friend_list',
  async (
    { auth }: { auth?: AuthPayload },
    ack?: (res: { friends: Array<{
      userId: string;
      nickname: string;
      currentRating: number;
      equippedSkin: PieceSkin;
      status: 'online' | 'in_game' | 'offline';
    }> }) => void,
  ) => {
    try {
      const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      if (!userId || !supabaseAdmin) { ack?.({ friends: [] }); return; }
      const { data: friendRows } = await supabaseAdmin
        .from('friends')
        .select('friend_id')
        .eq('user_id', userId);
      if (!friendRows || friendRows.length === 0) { ack?.({ friends: [] }); return; }
      const friendIds: string[] = friendRows.map((r: { friend_id: string }) => r.friend_id);
      const [profilesRes, statsRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, nickname, equipped_skin').in('id', friendIds),
        supabaseAdmin.from('player_stats').select('user_id, current_rating').in('user_id', friendIds),
      ]);
      const profileMap = new Map<string, { nickname: string | null; equipped_skin: PieceSkin | null }>(
        (profilesRes.data ?? []).map((p: { id: string; nickname: string | null; equipped_skin: PieceSkin | null }) => [p.id, p]),
      );
      const statsMap = new Map<string, { current_rating: number | null }>(
        (statsRes.data ?? []).map((s: { user_id: string; current_rating: number | null }) => [s.user_id, s]),
      );
      const friends = friendIds.map((fid: string) => {
        const prof = profileMap.get(fid);
        const stats = statsMap.get(fid);
        const sid = activeUserSockets.get(fid);
        let status: 'online' | 'in_game' | 'offline' = 'offline';
        if (sid && io.sockets.sockets.has(sid)) {
          const inGame =
            store.getBySocket(sid) ??
            abilityStore.getBySocket(sid) ??
            coopStore.getBySocket(sid) ??
            twoVsTwoStore.getBySocket(sid);
          status = inGame ? 'in_game' : 'online';
        }
        return {
          userId: fid,
          nickname: prof?.nickname ?? 'Guest',
          currentRating: Number(stats?.current_rating ?? 0),
          equippedSkin: (prof?.equipped_skin ?? 'classic') as PieceSkin,
          status,
        };
      });
      ack?.({ friends });
    } catch (err) {
      console.error('[friend_list] handler error:', err);
      ack?.({ friends: [] });
    }
  },
);
```

- [ ] **Step 2: `friend_requests_list` 핸들러 추가**

```ts
socket.on(
  'friend_requests_list',
  async (
    { auth }: { auth?: AuthPayload },
    ack?: (res: { requests: Array<{ id: string; senderId: string; senderNickname: string; createdAt: string }> }) => void,
  ) => {
    try {
      const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      if (!userId || !supabaseAdmin) { ack?.({ requests: [] }); return; }
      const { data: reqRows } = await supabaseAdmin
        .from('friend_requests')
        .select('id, sender_id, created_at')
        .eq('receiver_id', userId)
        .order('created_at', { ascending: false });
      if (!reqRows || reqRows.length === 0) { ack?.({ requests: [] }); return; }
      const senderIds: string[] = reqRows.map((r: { sender_id: string }) => r.sender_id);
      const { data: profileRows } = await supabaseAdmin
        .from('profiles')
        .select('id, nickname')
        .in('id', senderIds);
      const nickMap = new Map<string, string>(
        (profileRows ?? []).map((p: { id: string; nickname: string | null }) => [p.id, p.nickname ?? 'Guest']),
      );
      const requests = reqRows.map((r: { id: string; sender_id: string; created_at: string }) => ({
        id: r.id,
        senderId: r.sender_id,
        senderNickname: nickMap.get(r.sender_id) ?? 'Guest',
        createdAt: r.created_at,
      }));
      ack?.({ requests });
    } catch (err) {
      console.error('[friend_requests_list] handler error:', err);
      ack?.({ requests: [] });
    }
  },
);
```

- [ ] **Step 3: `friend_request_respond` 핸들러 추가**

```ts
socket.on(
  'friend_request_respond',
  async (
    { auth, requestId, accept }: { auth?: AuthPayload; requestId: string; accept: boolean },
    ack?: (res: { status: 'ok' | 'error' }) => void,
  ) => {
    try {
      const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      if (!userId || !supabaseAdmin) { ack?.({ status: 'error' }); return; }
      const { data: reqRow } = await supabaseAdmin
        .from('friend_requests')
        .select('id, sender_id')
        .eq('id', requestId)
        .eq('receiver_id', userId)
        .maybeSingle();
      if (!reqRow) { ack?.({ status: 'error' }); return; }
      await supabaseAdmin.from('friend_requests').delete().eq('id', requestId);
      if (accept) {
        await supabaseAdmin.from('friends').upsert([
          { user_id: userId, friend_id: reqRow.sender_id },
          { user_id: reqRow.sender_id, friend_id: userId },
        ]);
      }
      ack?.({ status: 'ok' });
    } catch (err) {
      console.error('[friend_request_respond] handler error:', err);
      ack?.({ status: 'error' });
    }
  },
);
```

- [ ] **Step 4: 수동 테스트**

1. 탭B에서 `friend_requests_list` → 탭A가 보낸 요청 목록에 탭A 닉네임 확인
2. `friend_request_respond { requestId, accept: true }` → `{ status: 'ok' }` 확인
3. Supabase `friends` 테이블에 `(탭A→탭B)`, `(탭B→탭A)` 두 행 확인
4. `friend_list` → 양쪽에서 서로 보이는지 확인

- [ ] **Step 5: 커밋**

```bash
git add server/src/socket/socketServer.ts
git commit -m "feat(server): 친구 목록/요청 조회 및 수락/거절 이벤트 추가"
```

---

## Task 3: 서버 — 친구 삭제 + 프로필 조회

**Files:**
- Modify: `server/src/socket/socketServer.ts`

- [ ] **Step 1: `friend_remove` 핸들러 추가**

```ts
socket.on(
  'friend_remove',
  async (
    { auth, friendId }: { auth?: AuthPayload; friendId: string },
    ack?: (res: { status: 'ok' | 'error' }) => void,
  ) => {
    try {
      const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      if (!userId || !supabaseAdmin) { ack?.({ status: 'error' }); return; }
      await supabaseAdmin
        .from('friends')
        .delete()
        .or(
          `and(user_id.eq.${userId},friend_id.eq.${friendId}),` +
          `and(user_id.eq.${friendId},friend_id.eq.${userId})`,
        );
      ack?.({ status: 'ok' });
    } catch (err) {
      console.error('[friend_remove] handler error:', err);
      ack?.({ status: 'error' });
    }
  },
);
```

- [ ] **Step 2: `friend_get_profile` 핸들러 추가**

```ts
socket.on(
  'friend_get_profile',
  async (
    { auth, friendId }: { auth?: AuthPayload; friendId: string },
    ack?: (res: { profile: {
      userId: string;
      nickname: string;
      currentRating: number;
      equippedSkin: PieceSkin;
      wins: number;
      losses: number;
    } | null }) => void,
  ) => {
    try {
      const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      if (!userId || !supabaseAdmin) { ack?.({ profile: null }); return; }
      const { data: friendRow } = await supabaseAdmin
        .from('friends')
        .select('friend_id')
        .eq('user_id', userId)
        .eq('friend_id', friendId)
        .maybeSingle();
      if (!friendRow) { ack?.({ profile: null }); return; }
      const [profRes, statsRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('nickname, equipped_skin').eq('id', friendId).maybeSingle(),
        supabaseAdmin.from('player_stats').select('current_rating, wins, losses').eq('user_id', friendId).maybeSingle(),
      ]);
      ack?.({
        profile: {
          userId: friendId,
          nickname: profRes.data?.nickname ?? 'Guest',
          currentRating: Number(statsRes.data?.current_rating ?? 0),
          equippedSkin: (profRes.data?.equipped_skin ?? 'classic') as PieceSkin,
          wins: Number(statsRes.data?.wins ?? 0),
          losses: Number(statsRes.data?.losses ?? 0),
        },
      });
    } catch (err) {
      console.error('[friend_get_profile] handler error:', err);
      ack?.({ profile: null });
    }
  },
);
```

- [ ] **Step 3: 수동 테스트**

1. `friend_get_profile { friendId }` → 닉네임, 레이팅, 승/패 데이터 확인
2. `friend_remove { friendId }` → `{ status: 'ok' }` 확인
3. Supabase `friends` 테이블에서 양방향 행 삭제 확인
4. `friend_list` → 빈 배열 확인

- [ ] **Step 4: 커밋**

```bash
git add server/src/socket/socketServer.ts
git commit -m "feat(server): 친구 삭제 및 프로필 조회 이벤트 추가"
```

---

## Task 4: 서버 — 친선전 요청 + 수락/거절

**Files:**
- Modify: `server/src/socket/socketServer.ts`

- [ ] **Step 1: `friend_challenge` 핸들러 추가**

```ts
socket.on(
  'friend_challenge',
  async (
    {
      auth,
      friendId,
      pieceSkin,
      boardSkin,
      equippedSkills,
    }: {
      auth?: AuthPayload;
      friendId: string;
      pieceSkin?: PieceSkin;
      boardSkin?: BoardSkin;
      equippedSkills?: AbilitySkillId[];
    },
    ack?: (res: { status: 'ok' | 'offline' | 'in_game' | 'error' }) => void,
  ) => {
    try {
      const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      if (!userId) { ack?.({ status: 'error' }); return; }
      const targetSocketId = activeUserSockets.get(friendId);
      if (!targetSocketId || !io.sockets.sockets.has(targetSocketId)) {
        ack?.({ status: 'offline' }); return;
      }
      const inGame =
        store.getBySocket(targetSocketId) ??
        abilityStore.getBySocket(targetSocketId) ??
        coopStore.getBySocket(targetSocketId) ??
        twoVsTwoStore.getBySocket(targetSocketId);
      if (inGame) { ack?.({ status: 'in_game' }); return; }
      const profile = await resolvePlayerProfileCached(socket, auth, '');
      challengePending.set(friendId, {
        fromUserId: userId,
        fromNickname: profile.nickname,
        fromSocketId: socket.id,
        fromPieceSkin: pieceSkin ?? 'classic',
        fromBoardSkin: boardSkin ?? 'classic',
        fromEquippedSkills: equippedSkills ?? ['classic_guard'],
        fromStats: profile.stats,
        fromCurrentRating: profile.currentRating,
      });
      io.to(targetSocketId).emit('friend_challenge_received', {
        fromUserId: userId,
        fromNickname: profile.nickname,
      });
      ack?.({ status: 'ok' });
    } catch (err) {
      console.error('[friend_challenge] handler error:', err);
      ack?.({ status: 'error' });
    }
  },
);
```

- [ ] **Step 2: `friend_challenge_response` 핸들러 추가**

```ts
socket.on(
  'friend_challenge_response',
  async (
    {
      auth,
      fromUserId,
      accept,
      pieceSkin,
      boardSkin,
      equippedSkills,
    }: {
      auth?: AuthPayload;
      fromUserId: string;
      accept: boolean;
      pieceSkin?: PieceSkin;
      boardSkin?: BoardSkin;
      equippedSkills?: AbilitySkillId[];
    },
    ack?: (res: { status: 'ok' | 'error' }) => void,
  ) => {
    try {
      const userId = await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      if (!userId) { ack?.({ status: 'error' }); return; }
      const challenge = challengePending.get(userId);
      if (!challenge || challenge.fromUserId !== fromUserId) {
        ack?.({ status: 'error' }); return;
      }
      challengePending.delete(userId);
      if (!accept) {
        // 거절 시 도전자에게 알림
        const aSocketId = challenge.fromSocketId;
        if (aSocketId && io.sockets.sockets.has(aSocketId)) {
          io.to(aSocketId).emit('friend_challenge_declined', { byNickname: '' });
        }
        ack?.({ status: 'ok' }); return;
      }
      const aSocketId = challenge.fromSocketId;
      const aSocket = io.sockets.sockets.get(aSocketId);
      if (!aSocket) { ack?.({ status: 'error' }); return; }
      const bProfile = await resolvePlayerProfileCached(socket, auth, '');
      // 방 생성
      const roomId = abilityStore.generateRoomId();
      const code = abilityStore.generateCode();
      const room = new AbilityRoom(roomId, code, io);
      room.enablePrivateMatch();
      // A 입장 (도전자, red)
      const aColor = room.addPlayer(
        aSocket,
        challenge.fromNickname,
        challenge.fromUserId,
        challenge.fromStats,
        challenge.fromCurrentRating,
        challenge.fromPieceSkin,
        challenge.fromBoardSkin,
        challenge.fromEquippedSkills,
      );
      if (!aColor) { ack?.({ status: 'error' }); return; }
      // B 입장 (수락자, blue)
      const bColor = room.addPlayer(
        socket,
        bProfile.nickname,
        bProfile.userId,
        bProfile.stats,
        bProfile.currentRating,
        pieceSkin ?? 'classic',
        boardSkin ?? 'classic',
        equippedSkills ?? ['classic_guard'],
      );
      if (!bColor) { ack?.({ status: 'error' }); return; }
      abilityStore.add(room);
      abilityStore.registerSocket(aSocketId, roomId);
      abilityStore.registerSocket(socket.id, roomId);
      room.prepareGameStart();
      // A에게 게임 시작 신호 (friend_challenge_accepted)
      aSocket.emit('friend_challenge_accepted', {
        roomId,
        color: aColor,
        opponentNickname: bProfile.nickname,
      });
      // B에게 기존 ability_room_joined 신호
      socket.emit('ability_room_joined', {
        roomId,
        color: bColor,
        opponentNickname: challenge.fromNickname,
      });
      ack?.({ status: 'ok' });
    } catch (err) {
      console.error('[friend_challenge_response] handler error:', err);
      ack?.({ status: 'error' });
    }
  },
);
```

- [ ] **Step 3: 수동 테스트**

1. 탭A에서 탭B 유저ID로 `friend_challenge` emit → `{ status: 'ok' }` 확인
2. 탭B에서 `friend_challenge_received { fromUserId, fromNickname }` 수신 확인
3. 탭B에서 `friend_challenge_response { fromUserId, accept: true, pieceSkin: 'classic', boardSkin: 'classic', equippedSkills: ['classic_guard'] }` → 탭A에 `friend_challenge_accepted`, 탭B에 `ability_room_joined` 수신 확인

- [ ] **Step 4: 커밋**

```bash
git add server/src/socket/socketServer.ts
git commit -m "feat(server): 친선전 요청 및 수락/거절 이벤트 추가"
```

---

## Task 5: 클라이언트 — 공유 타입 + FriendListPanel + CSS

**Files:**
- Create: `client/src/components/Lobby/friends/types.ts`
- Create: `client/src/components/Lobby/friends/FriendListPanel.tsx`
- Modify: `client/src/components/Lobby/LobbyScreen.css`

- [ ] **Step 1: `types.ts` 생성**

```ts
import type { PieceSkin } from '../../../types/game.types';

export interface FriendEntry {
  userId: string;
  nickname: string;
  currentRating: number;
  equippedSkin: PieceSkin;
  status: 'online' | 'in_game' | 'offline';
}

export interface RequestEntry {
  id: string;
  senderId: string;
  senderNickname: string;
  createdAt: string;
}

export interface FriendProfile {
  userId: string;
  nickname: string;
  currentRating: number;
  equippedSkin: PieceSkin;
  wins: number;
  losses: number;
}
```

- [ ] **Step 2: `FriendListPanel.tsx` 생성**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { connectSocket } from '../../../socket/socketClient';
import { getSocketAuthPayload } from '../../../auth/guestAuth';
import type { FriendEntry } from './types';

interface Props {
  lang: 'en' | 'kr';
  onAddFriend: () => void;
  onViewRequests: () => void;
  onFriendClick: (friend: FriendEntry, anchorRect: DOMRect) => void;
  refreshTrigger: number;
}

export function FriendListPanel({ lang, onAddFriend, onViewRequests, onFriendClick, refreshTrigger }: Props) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const socket = connectSocket();
      const auth = await getSocketAuthPayload();
      const [listRes, reqRes] = await Promise.all([
        new Promise<{ friends: FriendEntry[] }>((resolve) =>
          socket.emit('friend_list', { auth }, resolve),
        ),
        new Promise<{ requests: Array<{ id: string }> }>((resolve) =>
          socket.emit('friend_requests_list', { auth }, resolve),
        ),
      ]);
      setFriends(listRes.friends ?? []);
      setRequestCount(reqRes.requests?.length ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshTrigger]);

  const statusLabel = (s: FriendEntry['status']) =>
    s === 'online'
      ? lang === 'kr' ? '온라인' : 'Online'
      : s === 'in_game'
        ? lang === 'kr' ? '게임 중' : 'In Game'
        : lang === 'kr' ? '오프라인' : 'Offline';

  const emptyText = lang === 'kr' ? '아직 친구가 없습니다' : 'No friends yet';
  const addLabel = lang === 'kr' ? '친구 추가' : 'Add Friend';
  const reqLabel = lang === 'kr'
    ? `친구 요청${requestCount > 0 ? ` (${requestCount})` : ''}`
    : `Requests${requestCount > 0 ? ` (${requestCount})` : ''}`;

  return (
    <div className="friend-list-panel">
      <div className="friend-list-scroll">
        {loading && <p className="friend-list-empty">...</p>}
        {!loading && friends.length === 0 && (
          <p className="friend-list-empty">{emptyText}</p>
        )}
        {friends.map((f) => (
          <button
            key={f.userId}
            type="button"
            className="friend-row"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
              onFriendClick(f, rect);
            }}
          >
            <span className={`friend-status-badge friend-status-badge--${f.status}`} />
            <span className="friend-row-name">{f.nickname}</span>
            <span className="friend-row-rating">⭐ {f.currentRating}</span>
            <span className="friend-row-status">{statusLabel(f.status)}</span>
          </button>
        ))}
      </div>
      <div className="friend-list-actions">
        <button type="button" className="lobby-mini-btn" onClick={onAddFriend}>
          {addLabel}
        </button>
        <button
          type="button"
          className={`lobby-mini-btn${requestCount > 0 ? ' has-badge' : ''}`}
          onClick={onViewRequests}
        >
          {reqLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `LobbyScreen.css` 끝에 CSS 추가**

```css
/* ── Friend List Panel ─────────────────────────────────── */
.friend-list-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(100%, 34rem);
  margin: auto auto 0;
  padding: 12px;
  background: var(--panel, #1e252b);
  border: 1px solid var(--tile-border, #3a444d);
  border-radius: 1rem;
  flex-shrink: 1;
  min-height: 0;
}

.friend-list-scroll {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  max-height: clamp(10rem, 28dvh, 18rem);
  min-height: 4rem;
}

.friend-list-empty {
  color: var(--text-muted, #8899aa);
  font-size: 0.85rem;
  text-align: center;
  padding: 1rem 0;
  margin: 0;
}

.friend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--tile, #2a3137);
  border: 1px solid transparent;
  cursor: pointer;
  text-align: left;
  width: 100%;
  color: var(--text, #e2e8f0);
  font-size: 0.85rem;
  transition: background 0.12s, border-color 0.12s;
}

.friend-row:hover {
  background: var(--tile-border, #3a444d);
  border-color: rgba(125, 211, 252, 0.2);
}

.friend-status-badge {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.friend-status-badge--online  { background: #4ade80; }
.friend-status-badge--in_game { background: #60a5fa; }
.friend-status-badge--offline { background: #6b7280; }

.friend-row-name {
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-row-rating {
  font-size: 0.78rem;
  color: var(--text-muted, #8899aa);
  flex-shrink: 0;
}

.friend-row-status {
  font-size: 0.75rem;
  color: var(--text-muted, #8899aa);
  flex-shrink: 0;
  min-width: 44px;
  text-align: right;
}

.friend-list-actions {
  display: flex;
  gap: 8px;
}

.friend-list-actions .lobby-mini-btn {
  flex: 1;
}

.lobby-mini-btn.has-badge {
  border-color: rgba(96, 165, 250, 0.5);
  color: #93c5fd;
}
```

- [ ] **Step 4: 커밋**

```bash
git add client/src/components/Lobby/friends/types.ts client/src/components/Lobby/friends/FriendListPanel.tsx client/src/components/Lobby/LobbyScreen.css
git commit -m "feat(client): FriendListPanel 컴포넌트 및 CSS 추가"
```

---

## Task 6: 클라이언트 — FriendAddModal

**Files:**
- Create: `client/src/components/Lobby/friends/FriendAddModal.tsx`
- Modify: `client/src/components/Lobby/LobbyScreen.css`

- [ ] **Step 1: `FriendAddModal.tsx` 생성**

```tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { connectSocket } from '../../../socket/socketClient';
import { getSocketAuthPayload } from '../../../auth/guestAuth';

interface Props {
  lang: 'en' | 'kr';
  onClose: () => void;
}

export function FriendAddModal({ lang, onClose }: Props) {
  const [myCode, setMyCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [inputCode, setInputCode] = useState('');
  const [result, setResult] = useState('');
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generateCode = useCallback(async () => {
    setGenerating(true);
    try {
      const socket = connectSocket();
      const auth = await getSocketAuthPayload();
      const res = await new Promise<{ code?: string; expiresAt?: number; error?: string }>(
        (resolve) => socket.emit('friend_generate_code', { auth }, resolve),
      );
      if (res.code && res.expiresAt) {
        setMyCode(res.code);
        setExpiresAt(res.expiresAt);
        setSecondsLeft(Math.max(0, Math.floor((res.expiresAt - Date.now()) / 1000)));
      }
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => { void generateCode(); }, [generateCode]);

  useEffect(() => {
    if (!expiresAt) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timerRef.current!);
        setMyCode(null);
      }
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [expiresAt]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const handleSubmit = async () => {
    if (!inputCode.trim()) return;
    setSubmitting(true);
    setResult('');
    try {
      const socket = connectSocket();
      const auth = await getSocketAuthPayload();
      const res = await new Promise<{ status: string }>(
        (resolve) => socket.emit('friend_add_by_code', { auth, code: inputCode.trim().toUpperCase() }, resolve),
      );
      const msgMap: Record<string, string> = {
        ok:              lang === 'kr' ? '친구 요청을 보냈습니다!' : 'Friend request sent!',
        not_found:       lang === 'kr' ? '코드를 찾을 수 없습니다.' : 'Code not found.',
        expired:         lang === 'kr' ? '만료된 코드입니다.' : 'Code expired.',
        already_friends: lang === 'kr' ? '이미 친구입니다.' : 'Already friends.',
        self:            lang === 'kr' ? '자신의 코드입니다.' : 'That\'s your own code.',
      };
      setResult(msgMap[res.status] ?? (lang === 'kr' ? '오류가 발생했습니다.' : 'An error occurred.'));
      if (res.status === 'ok') setInputCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const codeLabel        = lang === 'kr' ? '내 친구 코드' : 'My Friend Code';
  const timerExpiredLabel = lang === 'kr' ? '만료됨' : 'Expired';
  const regenLabel       = lang === 'kr' ? '새 코드 생성' : 'New Code';
  const inputLabel       = lang === 'kr' ? '상대방 코드 입력' : 'Enter Friend\'s Code';
  const confirmLabel     = lang === 'kr' ? '확인' : 'Confirm';
  const closeLabel       = lang === 'kr' ? '닫기' : 'Close';

  return (
    <div className="friend-modal-overlay" onClick={onClose}>
      <div className="friend-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="friend-modal-title">{lang === 'kr' ? '친구 추가' : 'Add Friend'}</h3>

        <div className="friend-add-code-section">
          <p className="friend-add-label">{codeLabel}</p>
          {myCode ? (
            <>
              <div className="friend-add-code">{myCode}</div>
              <div className="friend-add-timer">{formatTime(secondsLeft)}</div>
            </>
          ) : (
            <div className="friend-add-code is-expired">{timerExpiredLabel}</div>
          )}
          <button type="button" className="lobby-mini-btn" onClick={() => void generateCode()} disabled={generating}>
            {regenLabel}
          </button>
        </div>

        <div className="friend-modal-divider" />

        <div className="friend-add-input-section">
          <p className="friend-add-label">{inputLabel}</p>
          <div className="friend-add-input-row">
            <input
              className="lobby-input code-input"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="XXXXXX"
            />
            <button type="button" className="lobby-mini-btn" onClick={() => void handleSubmit()} disabled={submitting || !inputCode.trim()}>
              {confirmLabel}
            </button>
          </div>
          {result && <p className="friend-add-result">{result}</p>}
        </div>

        <button type="button" className="lobby-btn secondary" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `LobbyScreen.css` 끝에 CSS 추가**

```css
/* ── Friend Modals (공통) ──────────────────────────────── */
.friend-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.friend-modal {
  background: var(--panel, #1e252b);
  border: 1px solid var(--tile-border, #3a444d);
  border-radius: 1.25rem;
  padding: 1.5rem;
  width: min(90vw, 26rem);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.friend-modal-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text, #e2e8f0);
  margin: 0;
}

.friend-modal-divider {
  height: 1px;
  background: var(--tile-border, #3a444d);
}

/* ── FriendAddModal ────────────────────────────────────── */
.friend-add-code-section,
.friend-add-input-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.friend-add-label {
  font-size: 0.82rem;
  color: var(--text-muted, #8899aa);
  margin: 0;
}

.friend-add-code {
  font-family: var(--mono, 'JetBrains Mono', monospace);
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: 0.3em;
  color: #93c5fd;
  text-align: center;
  padding: 0.5rem;
  background: var(--tile, #2a3137);
  border-radius: 0.75rem;
}

.friend-add-code.is-expired {
  color: var(--text-muted, #8899aa);
  font-size: 1.2rem;
}

.friend-add-timer {
  font-family: var(--mono, 'JetBrains Mono', monospace);
  font-size: 1.1rem;
  color: #fbbf24;
  text-align: center;
}

.friend-add-input-row {
  display: flex;
  gap: 0.5rem;
}

.friend-add-input-row .code-input {
  flex: 1;
  font-family: var(--mono, 'JetBrains Mono', monospace);
  letter-spacing: 0.2em;
}

.friend-add-result {
  font-size: 0.82rem;
  color: #4ade80;
  margin: 0;
}
```

- [ ] **Step 3: 커밋**

```bash
git add client/src/components/Lobby/friends/FriendAddModal.tsx client/src/components/Lobby/LobbyScreen.css
git commit -m "feat(client): FriendAddModal 컴포넌트 추가"
```

---

## Task 7: 클라이언트 — FriendRequestsModal

**Files:**
- Create: `client/src/components/Lobby/friends/FriendRequestsModal.tsx`
- Modify: `client/src/components/Lobby/LobbyScreen.css`

- [ ] **Step 1: `FriendRequestsModal.tsx` 생성**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { connectSocket } from '../../../socket/socketClient';
import { getSocketAuthPayload } from '../../../auth/guestAuth';
import type { RequestEntry } from './types';

interface Props {
  lang: 'en' | 'kr';
  onClose: () => void;
  onAccepted: () => void;
}

export function FriendRequestsModal({ lang, onClose, onAccepted }: Props) {
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const socket = connectSocket();
      const auth = await getSocketAuthPayload();
      const res = await new Promise<{ requests: RequestEntry[] }>(
        (resolve) => socket.emit('friend_requests_list', { auth }, resolve),
      );
      setRequests(res.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const respond = async (requestId: string, accept: boolean) => {
    setRespondingId(requestId);
    try {
      const socket = connectSocket();
      const auth = await getSocketAuthPayload();
      await new Promise<{ status: string }>(
        (resolve) => socket.emit('friend_request_respond', { auth, requestId, accept }, resolve),
      );
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (accept) onAccepted();
    } finally {
      setRespondingId(null);
    }
  };

  const titleLabel  = lang === 'kr' ? '친구 요청' : 'Friend Requests';
  const emptyLabel  = lang === 'kr' ? '받은 친구 요청이 없습니다' : 'No pending requests';
  const acceptLabel = lang === 'kr' ? '수락' : 'Accept';
  const rejectLabel = lang === 'kr' ? '거절' : 'Decline';
  const closeLabel  = lang === 'kr' ? '닫기' : 'Close';

  return (
    <div className="friend-modal-overlay" onClick={onClose}>
      <div className="friend-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="friend-modal-title">{titleLabel}</h3>
        <div className="friend-req-list">
          {loading && <p className="friend-list-empty">...</p>}
          {!loading && requests.length === 0 && (
            <p className="friend-list-empty">{emptyLabel}</p>
          )}
          {requests.map((r) => (
            <div key={r.id} className="friend-req-row">
              <span className="friend-req-name">{r.senderNickname}</span>
              <div className="friend-req-actions">
                <button
                  type="button"
                  className="lobby-mini-btn"
                  disabled={respondingId === r.id}
                  onClick={() => void respond(r.id, true)}
                >
                  {acceptLabel}
                </button>
                <button
                  type="button"
                  className="lobby-mini-btn"
                  disabled={respondingId === r.id}
                  onClick={() => void respond(r.id, false)}
                >
                  {rejectLabel}
                </button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="lobby-btn secondary" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `LobbyScreen.css` 끝에 CSS 추가**

```css
/* ── FriendRequestsModal ───────────────────────────────── */
.friend-req-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 16rem;
  overflow-y: auto;
}

.friend-req-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--tile, #2a3137);
  border-radius: 8px;
}

.friend-req-name {
  flex: 1;
  font-size: 0.9rem;
  color: var(--text, #e2e8f0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-req-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
```

- [ ] **Step 3: 커밋**

```bash
git add client/src/components/Lobby/friends/FriendRequestsModal.tsx client/src/components/Lobby/LobbyScreen.css
git commit -m "feat(client): FriendRequestsModal 컴포넌트 추가"
```

---

## Task 8: 클라이언트 — FriendContextPopup + FriendProfileModal

**Files:**
- Create: `client/src/components/Lobby/friends/FriendContextPopup.tsx`
- Create: `client/src/components/Lobby/friends/FriendProfileModal.tsx`
- Modify: `client/src/components/Lobby/LobbyScreen.css`

- [ ] **Step 1: `FriendContextPopup.tsx` 생성**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { FriendEntry } from './types';

interface Props {
  friend: FriendEntry;
  anchorRect: DOMRect;
  lang: 'en' | 'kr';
  onViewProfile: () => void;
  onChallenge: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export function FriendContextPopup({ friend, anchorRect, lang, onViewProfile, onChallenge, onRemove, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  const profileLabel   = lang === 'kr' ? '프로필 보기' : 'View Profile';
  const challengeLabel = lang === 'kr' ? '친선전' : 'Challenge';
  const removeLabel    = lang === 'kr' ? '친구 삭제' : 'Remove';
  const confirmLabel   = lang === 'kr'
    ? `${friend.nickname}님을 친구에서 삭제하시겠습니까?`
    : `Remove ${friend.nickname} from friends?`;
  const yesLabel       = lang === 'kr' ? '삭제' : 'Remove';
  const noLabel        = lang === 'kr' ? '취소' : 'Cancel';

  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.bottom + 4,
    left: anchorRect.left,
  };

  return (
    <div className="friend-ctx-popup" style={style} ref={popupRef}>
      {confirmDelete ? (
        <div className="friend-ctx-confirm">
          <p className="friend-ctx-confirm-text">{confirmLabel}</p>
          <div className="friend-ctx-confirm-btns">
            <button type="button" className="lobby-mini-btn danger" onClick={onRemove}>{yesLabel}</button>
            <button type="button" className="lobby-mini-btn" onClick={() => setConfirmDelete(false)}>{noLabel}</button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="friend-ctx-btn" onClick={onViewProfile}>{profileLabel}</button>
          <button type="button" className="friend-ctx-btn" onClick={onChallenge}>{challengeLabel}</button>
          <button type="button" className="friend-ctx-btn danger" onClick={() => setConfirmDelete(true)}>{removeLabel}</button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `FriendProfileModal.tsx` 생성**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { connectSocket } from '../../../socket/socketClient';
import { getSocketAuthPayload } from '../../../auth/guestAuth';
import type { FriendProfile } from './types';

interface Props {
  friendId: string;
  lang: 'en' | 'kr';
  onClose: () => void;
}

export function FriendProfileModal({ friendId, lang, onClose }: Props) {
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const socket = connectSocket();
      const auth = await getSocketAuthPayload();
      const res = await new Promise<{ profile: FriendProfile | null }>(
        (resolve) => socket.emit('friend_get_profile', { auth, friendId }, resolve),
      );
      setProfile(res.profile);
    } finally {
      setLoading(false);
    }
  }, [friendId]);

  useEffect(() => { void load(); }, [load]);

  const titleLabel   = lang === 'kr' ? '프로필' : 'Profile';
  const ratingLabel  = lang === 'kr' ? '레이팅' : 'Rating';
  const winsLabel    = lang === 'kr' ? '승' : 'W';
  const lossesLabel  = lang === 'kr' ? '패' : 'L';
  const closeLabel   = lang === 'kr' ? '닫기' : 'Close';
  const loadingLabel = lang === 'kr' ? '불러오는 중...' : 'Loading...';
  const errorLabel   = lang === 'kr' ? '프로필을 불러올 수 없습니다.' : 'Could not load profile.';

  return (
    <div className="friend-modal-overlay" onClick={onClose}>
      <div className="friend-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="friend-modal-title">{titleLabel}</h3>
        {loading && <p className="friend-list-empty">{loadingLabel}</p>}
        {!loading && !profile && <p className="friend-list-empty">{errorLabel}</p>}
        {profile && (
          <div className="friend-profile-body">
            <div className="friend-profile-skin-wrap">
              <span className={`skin-preview skin-preview-${profile.equippedSkin}`} aria-hidden="true" />
            </div>
            <p className="friend-profile-name">{profile.nickname}</p>
            <p className="friend-profile-rating">⭐ {ratingLabel}: {profile.currentRating}</p>
            <p className="friend-profile-record">
              {winsLabel} {profile.wins} / {lossesLabel} {profile.losses}
            </p>
          </div>
        )}
        <button type="button" className="lobby-btn secondary" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `LobbyScreen.css` 끝에 CSS 추가**

```css
/* ── FriendContextPopup ────────────────────────────────── */
.friend-ctx-popup {
  z-index: 300;
  background: var(--panel, #1e252b);
  border: 1px solid var(--tile-border, #3a444d);
  border-radius: 0.75rem;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 130px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.friend-ctx-btn {
  background: transparent;
  border: none;
  color: var(--text, #e2e8f0);
  font-size: 0.88rem;
  padding: 7px 12px;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.1s;
}

.friend-ctx-btn:hover { background: var(--tile, #2a3137); }
.friend-ctx-btn.danger { color: #f87171; }
.friend-ctx-btn.danger:hover { background: rgba(248, 113, 113, 0.1); }

.friend-ctx-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
}

.friend-ctx-confirm-text {
  font-size: 0.82rem;
  color: var(--text, #e2e8f0);
  margin: 0;
  line-height: 1.4;
}

.friend-ctx-confirm-btns {
  display: flex;
  gap: 6px;
}

.lobby-mini-btn.danger {
  border-color: rgba(248, 113, 113, 0.4);
  color: #f87171;
}

.lobby-mini-btn.danger:hover {
  background: rgba(248, 113, 113, 0.12);
}

/* ── FriendProfileModal ────────────────────────────────── */
.friend-profile-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.friend-profile-skin-wrap {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tile, #2a3137);
  border-radius: 50%;
}

.friend-profile-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text, #e2e8f0);
  margin: 0;
}

.friend-profile-rating {
  font-size: 0.9rem;
  color: #fbbf24;
  margin: 0;
}

.friend-profile-record {
  font-size: 0.85rem;
  color: var(--text-muted, #8899aa);
  margin: 0;
}
```

- [ ] **Step 4: 커밋**

```bash
git add client/src/components/Lobby/friends/FriendContextPopup.tsx client/src/components/Lobby/friends/FriendProfileModal.tsx client/src/components/Lobby/LobbyScreen.css
git commit -m "feat(client): FriendContextPopup, FriendProfileModal 컴포넌트 추가"
```

---

## Task 9: 클라이언트 — FriendChallengeToast

**Files:**
- Create: `client/src/components/Lobby/friends/FriendChallengeToast.tsx`
- Modify: `client/src/components/Lobby/LobbyScreen.css`

- [ ] **Step 1: `FriendChallengeToast.tsx` 생성**

```tsx
interface Props {
  fromNickname: string;
  lang: 'en' | 'kr';
  onAccept: () => void;
  onDecline: () => void;
}

export function FriendChallengeToast({ fromNickname, lang, onAccept, onDecline }: Props) {
  const message = lang === 'kr'
    ? `${fromNickname}님이 친선전을 요청했습니다.`
    : `${fromNickname} challenged you to a match!`;
  const acceptLabel  = lang === 'kr' ? '수락' : 'Accept';
  const declineLabel = lang === 'kr' ? '거절' : 'Decline';

  return (
    <div className="friend-challenge-toast">
      <span className="friend-challenge-toast-msg">{message}</span>
      <div className="friend-challenge-toast-btns">
        <button type="button" className="lobby-mini-btn" onClick={onAccept}>{acceptLabel}</button>
        <button type="button" className="lobby-mini-btn" onClick={onDecline}>{declineLabel}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `LobbyScreen.css` 끝에 CSS 추가**

```css
/* ── FriendChallengeToast ──────────────────────────────── */
.friend-challenge-toast {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: rgba(30, 37, 43, 0.95);
  border: 1px solid rgba(96, 165, 250, 0.4);
  border-radius: 0.75rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  margin: 0 0 8px;
}

.friend-challenge-toast-msg {
  flex: 1;
  font-size: 0.88rem;
  color: var(--text, #e2e8f0);
  min-width: 180px;
}

.friend-challenge-toast-btns {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
```

- [ ] **Step 3: 커밋**

```bash
git add client/src/components/Lobby/friends/FriendChallengeToast.tsx client/src/components/Lobby/LobbyScreen.css
git commit -m "feat(client): FriendChallengeToast 컴포넌트 추가"
```

---

## Task 10: LobbyScreen 통합

**Files:**
- Modify: `client/src/components/Lobby/LobbyScreen.tsx`

- [ ] **Step 1: import 추가 (기존 import 블록 끝에)**

```tsx
import { FriendListPanel }      from './friends/FriendListPanel';
import { FriendAddModal }       from './friends/FriendAddModal';
import { FriendRequestsModal }  from './friends/FriendRequestsModal';
import { FriendContextPopup }   from './friends/FriendContextPopup';
import { FriendProfileModal }   from './friends/FriendProfileModal';
import { FriendChallengeToast } from './friends/FriendChallengeToast';
import type { FriendEntry }     from './friends/types';
```

- [ ] **Step 2: state 추가 (기존 useState 선언부 끝에)**

```tsx
const [showFriendAdd, setShowFriendAdd]           = useState(false);
const [showFriendRequests, setShowFriendRequests] = useState(false);
const [friendCtx, setFriendCtx]                   = useState<{ friend: FriendEntry; anchorRect: DOMRect } | null>(null);
const [friendProfileId, setFriendProfileId]       = useState<string | null>(null);
const [challengeToast, setChallengeToast]         = useState<{ fromUserId: string; fromNickname: string } | null>(null);
const [friendListRefresh, setFriendListRefresh]   = useState(0);
```

- [ ] **Step 3: `startSocket` 내부에 소켓 리스너 추가**

`startSocket` 함수 내에서 기존 `socket.off(...)` 목록에 아래 항목 추가:
```tsx
socket.off('friend_challenge_received');
socket.off('friend_challenge_accepted');
```

그리고 기존 `socket.on(...)` 핸들러들 뒤에 추가:
```tsx
socket.on(
  'friend_challenge_received',
  ({ fromUserId, fromNickname }: { fromUserId: string; fromNickname: string }) => {
    setChallengeToast({ fromUserId, fromNickname });
  },
);

socket.on(
  'friend_challenge_accepted',
  ({ roomId, color }: { roomId: string; color: 'red' | 'blue'; opponentNickname: string }) => {
    setChallengeToast(null);
    setMyColor(color);
    setRoomCode(roomId);
    setError('');
    setIsMatchmaking(false);
    setMatchType('friend');
    onAbilityStart();
  },
);
```

- [ ] **Step 4: 친선전 수락 핸들러 추가 (기존 핸들러 함수들 근처에)**

```tsx
const handleChallengeAccept = async () => {
  if (!challengeToast) return;
  const socket = connectSocket();
  const auth = await getSocketAuthPayload();
  await ensureMatchmakingProfile({ syncAbilitySkills: true });
  const store = useGameStore.getState();
  socket.emit('friend_challenge_response', {
    auth,
    fromUserId: challengeToast.fromUserId,
    accept: true,
    pieceSkin: store.pieceSkin,
    boardSkin: store.boardSkin,
    equippedSkills: store.abilityLoadout,
  });
  setChallengeToast(null);
  setMatchType('friend');
};

const handleChallengeDecline = () => {
  if (!challengeToast) return;
  const socket = connectSocket();
  void (async () => {
    const auth = await getSocketAuthPayload();
    socket.emit('friend_challenge_response', {
      auth,
      fromUserId: challengeToast.fromUserId,
      accept: false,
    });
  })();
  setChallengeToast(null);
};

const handleFriendRemove = async (friendId: string) => {
  const socket = connectSocket();
  const auth = await getSocketAuthPayload();
  await new Promise<void>((resolve) =>
    socket.emit('friend_remove', { auth, friendId }, () => resolve()),
  );
  setFriendCtx(null);
  setFriendListRefresh((n) => n + 1);
};

const handleFriendChallenge = async (friend: FriendEntry) => {
  setFriendCtx(null);
  const socket = connectSocket();
  const auth = await getSocketAuthPayload();
  await ensureMatchmakingProfile({ syncAbilitySkills: true });
  const store = useGameStore.getState();
  const res = await new Promise<{ status: string }>((resolve) =>
    socket.emit(
      'friend_challenge',
      {
        auth,
        friendId: friend.userId,
        pieceSkin: store.pieceSkin,
        boardSkin: store.boardSkin,
        equippedSkills: store.abilityLoadout,
      },
      resolve,
    ),
  );
  if (res.status === 'offline') {
    showSkinFloatingMessage(
      lang === 'kr' ? '상대방이 오프라인입니다.' : 'Friend is offline.',
    );
  } else if (res.status === 'in_game') {
    showSkinFloatingMessage(
      lang === 'kr' ? '상대방이 게임 중입니다.' : 'Friend is in a game.',
    );
  }
};
```

- [ ] **Step 5: `showFriendListPanel` 조건 추가 (기존 `showLobbyArenaContent` 선언 근처)**

```tsx
const showFriendListPanel = selectedLobbyMode === 'friend';
```

- [ ] **Step 6: JSX에 FriendListPanel + 토스트 + 모달 추가**

`lobby-screen` 내부에서 `{showLobbyArenaContent && (...)}` 블록 바로 뒤에 패널 추가:

```tsx
{showFriendListPanel && (
  <div className="lobby-arena-center">
    {challengeToast && (
      <FriendChallengeToast
        fromNickname={challengeToast.fromNickname}
        lang={lang}
        onAccept={() => void handleChallengeAccept()}
        onDecline={handleChallengeDecline}
      />
    )}
    <FriendListPanel
      lang={lang}
      onAddFriend={() => setShowFriendAdd(true)}
      onViewRequests={() => setShowFriendRequests(true)}
      onFriendClick={(friend, anchorRect) => setFriendCtx({ friend, anchorRect })}
      refreshTrigger={friendListRefresh}
    />
  </div>
)}
```

그리고 `{showArenaGallery && (...)}` 블록 바로 뒤(모달 영역)에 추가:

```tsx
{showFriendAdd && (
  <FriendAddModal lang={lang} onClose={() => setShowFriendAdd(false)} />
)}

{showFriendRequests && (
  <FriendRequestsModal
    lang={lang}
    onClose={() => setShowFriendRequests(false)}
    onAccepted={() => { setFriendListRefresh((n) => n + 1); }}
  />
)}

{friendCtx && (
  <FriendContextPopup
    friend={friendCtx.friend}
    anchorRect={friendCtx.anchorRect}
    lang={lang}
    onViewProfile={() => { setFriendProfileId(friendCtx.friend.userId); setFriendCtx(null); }}
    onChallenge={() => void handleFriendChallenge(friendCtx.friend)}
    onRemove={() => void handleFriendRemove(friendCtx.friend.userId)}
    onClose={() => setFriendCtx(null)}
  />
)}

{friendProfileId && (
  <FriendProfileModal
    friendId={friendProfileId}
    lang={lang}
    onClose={() => setFriendProfileId(null)}
  />
)}
```

- [ ] **Step 7: `challengeToast`를 `selectedLobbyMode === 'friend'`가 아닐 때도 표시하기**

친선전 요청은 어느 모드에서도 받을 수 있어야 하므로, 위 JSX를 `showFriendListPanel` 조건 밖으로 옮긴다.

`lobby-screen` 최상단 `lobby-user-header` 바로 위에 추가:

```tsx
{challengeToast && (
  <div className="friend-challenge-toast-wrap">
    <FriendChallengeToast
      fromNickname={challengeToast.fromNickname}
      lang={lang}
      onAccept={() => void handleChallengeAccept()}
      onDecline={handleChallengeDecline}
    />
  </div>
)}
```

(위 Step 6의 `{showFriendListPanel && (...)}` 내부에서 FriendChallengeToast 부분은 제거)

`LobbyScreen.css` 끝에 추가:
```css
.friend-challenge-toast-wrap {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 150;
  padding: 8px 16px 0;
}
```

그리고 `lobby-screen`에 `position: relative` 확인 (이미 있을 경우 생략).

- [ ] **Step 8: 전체 빌드 확인**

```bash
cd client && npm run build
```

TypeScript 에러 없는지 확인. 에러 있으면 타입 수정.

- [ ] **Step 9: 수동 기능 테스트**

1. 친구대전 모드 선택 → FriendListPanel 표시 확인
2. "친구 추가" → FriendAddModal, 코드 + 5분 타이머 표시 확인
3. 탭B에서 해당 코드 입력 → "친구 요청을 보냈습니다!" 확인
4. 탭A에서 "친구 요청" → 탭B의 이름 표시 → 수락 → 양쪽 목록에 친구 추가 확인
5. 친구 클릭 → FriendContextPopup 표시 (3개 버튼)
6. "친구 삭제" → 확인 문구 → 삭제 → 목록에서 제거 확인
7. "프로필 보기" → FriendProfileModal 표시 확인
8. "친선전" → 상대에게 배너 표시 → 수락 → 양쪽 게임 화면 진입 확인

- [ ] **Step 10: 커밋**

```bash
git add client/src/components/Lobby/LobbyScreen.tsx client/src/components/Lobby/LobbyScreen.css
git commit -m "feat(client): LobbyScreen에 친구 시스템 UI 통합"
```
