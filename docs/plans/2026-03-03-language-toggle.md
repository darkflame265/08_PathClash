# Language Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an EN/KR language toggle button at the lobby bottom center, with localStorage persistence and full lobby text translation.

**Architecture:** Two new files (`translations.ts`, `useLang.ts`) keep i18n logic separate from components. `LobbyScreen.tsx` calls `useLang()` and replaces hardcoded strings with `t.xxx`. No external libraries.

**Tech Stack:** React, TypeScript, localStorage

---

### Task 1: Create translations file

**Files:**
- Create: `client/src/i18n/translations.ts`

**Step 1: Create the file with all EN and KR strings**

```ts
export type Lang = 'en' | 'kr';

export const translations = {
  en: {
    // Account card
    accountTitle: 'Account',
    accountDesc: 'Stats and nickname are linked to this device.',
    accountDescGoogle: 'Linked with your Google account.',
    record: (w: number, l: number) => `(${w}W ${l}L)`,
    nickLabel: 'CURRENT NICKNAME',
    nickPlaceholder: 'Enter nickname (default: Guest)',
    upgradeTitle: 'UPGRADE ACCOUNT',
    linkGoogle: 'Link Google Account',
    logout: 'logout',

    // Room created view
    roomCreatedTitle: 'Room Created',
    roomCreatedDesc: 'Share this code with your friend.',
    waitingText: 'Waiting for opponent...',

    // Join view
    joinTitle: 'Join Room',
    joinPlaceholder: 'Enter room code',
    joinBtn: 'Join',
    backBtn: 'Back',
    joinError: 'Please enter a room code.',

    // AI card
    aiTitle: 'vs AI',
    aiDesc: 'Practice against AI. Stats are not recorded.',
    aiBtn: 'Start AI Match',

    // Friend card
    friendTitle: 'Friend Match',
    createRoomBtn: 'Create Room',
    enterCodeBtn: 'Enter Code',

    // Random card
    randomTitle: 'Random Match',
    matchmakingHead: 'Searching...',
    matchmakingDesc: 'Finding an opponent. Only this mode counts for stats.',
    cancelBtn: 'Cancel',
    startBtn: 'Find Match',

    // Upgrade modal
    switchedTitle: 'Switched to existing Google account',
    confirmBtn: 'OK',
  },
  kr: {
    // Account card
    accountTitle: '게스트 계정',
    accountDesc: '전적과 닉네임은 이 기기 계정에 연결됩니다.',
    accountDescGoogle: '구글 계정과 연동 중입니다.',
    record: (w: number, l: number) => `(${w}승 ${l}패)`,
    nickLabel: 'CURRENT NICKNAME',
    nickPlaceholder: '닉네임 입력 (미입력 시 Guest)',
    upgradeTitle: 'UPGRADE ACCOUNT',
    linkGoogle: 'Link Google Account',
    logout: 'logout',

    // Room created view
    roomCreatedTitle: '방 생성 완료',
    roomCreatedDesc: '친구에게 아래 코드를 공유해주세요.',
    waitingText: '상대가 입장할 때까지 기다리는 중...',

    // Join view
    joinTitle: '방 참가',
    joinPlaceholder: '방 코드 입력',
    joinBtn: '입장',
    backBtn: '뒤로',
    joinError: '코드를 입력해주세요.',

    // AI card
    aiTitle: 'AI 대전',
    aiDesc: 'AI와 연습 대전을 즐겨보세요. 전적은 저장되지 않습니다.',
    aiBtn: 'AI와 대전 시작',

    // Friend card
    friendTitle: '친구 대전',
    createRoomBtn: '방 만들기',
    enterCodeBtn: '코드 입력',

    // Random card
    randomTitle: '랜덤 매칭',
    matchmakingHead: '매칭 중...',
    matchmakingDesc: '상대를 찾고 있습니다. 이 모드만 전적이 반영됩니다.',
    cancelBtn: '매칭 취소',
    startBtn: '매칭 시작',

    // Upgrade modal
    switchedTitle: '기존 Google 계정으로 전환되었습니다',
    confirmBtn: '확인',
  },
} as const;

export type Translations = typeof translations.en;
```

**Step 2: Commit**

```bash
git add client/src/i18n/translations.ts
git commit -m "feat: add EN/KR translations object"
```

---

### Task 2: Create useLang hook

**Files:**
- Create: `client/src/hooks/useLang.ts`

**Step 1: Write the hook**

```ts
import { useState } from 'react';
import { translations, type Lang } from '../i18n/translations';

export function useLang() {
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem('lang') as Lang) ?? 'en'
  );

  const toggleLang = () => {
    const next: Lang = lang === 'en' ? 'kr' : 'en';
    localStorage.setItem('lang', next);
    setLang(next);
  };

  return { lang, toggleLang, t: translations[lang] };
}
```

**Step 2: Commit**

```bash
git add client/src/hooks/useLang.ts
git commit -m "feat: add useLang hook with localStorage persistence"
```

---

### Task 3: Update AccountCard to accept translated strings

**Files:**
- Modify: `client/src/components/Lobby/LobbyScreen.tsx`

AccountCard currently has hardcoded Korean strings. Replace with props.

**Step 1: Update AccountCard props interface**

Add a `t` prop of type `Translations` to AccountCard:

```tsx
import type { Translations } from '../../i18n/translations';
import { useLang } from '../../hooks/useLang';

// Add to AccountCard props interface:
t: Translations;
```

**Step 2: Replace hardcoded strings in AccountCard JSX**

```tsx
// Before:
<h2 data-step="G">게스트 계정</h2>
// After:
<h2 data-step="G">{t.accountTitle}</h2>

// Before (guest):
<p>전적과 닉네임은 이 기기 계정에 연결됩니다.{" "}
// After:
<p>{t.accountDesc}{" "}

// Before (google):
<p>구글 계정과 연동 중입니다.{" "}
// After:
<p>{t.accountDescGoogle}{" "}

// Before (record):
({accountWins}승 {accountLosses}패)
// After:
{t.record(accountWins, accountLosses)}

// Before:
<label className="account-input-label">CURRENT NICKNAME</label>
<input placeholder="닉네임 입력 (미입력 시 Guest)" ...
// After:
<label className="account-input-label">{t.nickLabel}</label>
<input placeholder={t.nickPlaceholder} ...

// Before:
<div className="account-upgrade-title">UPGRADE ACCOUNT</div>
<button ...><span>Link Google Account</span>
// After:
<div className="account-upgrade-title">{t.upgradeTitle}</div>
<button ...><span>{t.linkGoogle}</span>

// Before:
<button className="account-logout" ...>logout</button>
// After:
<button className="account-logout" ...>{t.logout}</button>
```

**Step 3: Pass `t` into AccountCard from LobbyScreen**

In LobbyScreen, call `useLang()`:
```tsx
const { lang, toggleLang, t } = useLang();
```

Then pass into AccountCard:
```tsx
const accountCard = (
  <AccountCard
    ...
    t={t}
  />
);
```

---

### Task 4: Replace all remaining hardcoded strings in LobbyScreen

**Files:**
- Modify: `client/src/components/Lobby/LobbyScreen.tsx`

**Step 1: Replace room created view strings**

```tsx
// Before:
<h2 data-step="C">방 생성 완료</h2>
<p>친구에게 아래 코드를 공유해주세요.</p>
<p className="waiting-text">상대가 입장할 때까지 기다리는 중...</p>
// After:
<h2 data-step="C">{t.roomCreatedTitle}</h2>
<p>{t.roomCreatedDesc}</p>
<p className="waiting-text">{t.waitingText}</p>
```

**Step 2: Replace join view strings**

```tsx
// Before:
<h2 data-step="3">방 참가</h2>
<input placeholder="방 코드 입력" ...
<button ...>입장</button>
<button ...>뒤로</button>
// After:
<h2 data-step="3">{t.joinTitle}</h2>
<input placeholder={t.joinPlaceholder} ...
<button ...>{t.joinBtn}</button>
<button ...>{t.backBtn}</button>
```

**Step 3: Replace join error string**

In `handleJoinRoom`:
```tsx
// Before:
setError("코드를 입력해주세요.");
// After:
setError(t.joinError);
```

Note: `t` is in scope via `useLang()` at the top of LobbyScreen. Since `t` is a closure value at the time of the call, this works correctly.

**Step 4: Replace AI card strings**

```tsx
// Before:
<h2 data-step="2">AI 대전</h2>
<p>AI와 연습 대전을 즐겨보세요. 전적은 저장되지 않습니다.</p>
<button ...>AI와 대전 시작</button>
// After:
<h2 data-step="2">{t.aiTitle}</h2>
<p>{t.aiDesc}</p>
<button ...>{t.aiBtn}</button>
```

**Step 5: Replace friend card strings**

```tsx
// Before:
<h2 data-step="3">친구 대전</h2>
<button ...>방 만들기</button>
<button ...>코드 입력</button>
// After:
<h2 data-step="3">{t.friendTitle}</h2>
<button ...>{t.createRoomBtn}</button>
<button ...>{t.enterCodeBtn}</button>
```

**Step 6: Replace random matchmaking strings**

```tsx
// Before:
<h2 data-step="4">랜덤 매칭</h2>
<strong>매칭 중...</strong>
<p>상대를 찾고 있습니다. 이 모드만 전적이 반영됩니다.</p>
<button ...>매칭 취소</button>
<button ...>매칭 시작</button>
// After:
<h2 data-step="4">{t.randomTitle}</h2>
<strong>{t.matchmakingHead}</strong>
<p>{t.matchmakingDesc}</p>
<button ...>{t.cancelBtn}</button>
<button ...>{t.startBtn}</button>
```

**Step 7: Replace UpgradeNoticeDialog strings**

Pass `t` as a prop to `UpgradeNoticeDialog`:

```tsx
// UpgradeNoticeDialog props:
t: Translations;

// JSX:
// Before:
<h3>기존 Google 계정으로 전환되었습니다</h3>
<button ...>확인</button>
// After:
<h3>{t.switchedTitle}</h3>
<button ...>{t.confirmBtn}</button>

// In LobbyScreen where UpgradeNoticeDialog is rendered:
<UpgradeNoticeDialog message={upgradeNotice} onClose={() => setUpgradeNotice("")} t={t} />
```

**Step 8: Commit**

```bash
git add client/src/components/Lobby/LobbyScreen.tsx
git commit -m "feat: replace all lobby hardcoded strings with translation keys"
```

---

### Task 5: Add lang toggle button and CSS

**Files:**
- Modify: `client/src/components/Lobby/LobbyScreen.tsx`
- Modify: `client/src/components/Lobby/LobbyScreen.css`

**Step 1: Add toggle button as last child of `.lobby-screen`**

Inside `LobbyScreen` return, after the `{upgradeNotice && ...}` block:

```tsx
<button className="lang-toggle" onClick={toggleLang}>
  {lang.toUpperCase()}
</button>
```

**Step 2: Add CSS for the toggle button**

Add to `LobbyScreen.css`:

```css
/* ── Language toggle ──────────────────────────────────── */
.lang-toggle {
  align-self: center;
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
  border: 1px solid var(--tile-border, #3a444d);
  background: var(--tile, #2a3137);
  color: var(--text-muted, #9aa4ae);
  font-size: 0.75rem;
  font-weight: 700;
  font-family: var(--mono);
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.15s;
  margin-top: 0.25rem;
  margin-bottom: 1rem;
}

.lang-toggle:hover {
  border-color: var(--text-muted, #9aa4ae);
  color: var(--text, #f0f4f8);
}
```

**Step 3: Commit**

```bash
git add client/src/components/Lobby/LobbyScreen.tsx client/src/components/Lobby/LobbyScreen.css
git commit -m "feat: add language toggle button to lobby bottom center"
```

---

### Task 6: Manual verification

**Step 1: Start dev server**

```bash
cd client && npm run dev
```

**Step 2: Check EN mode (default)**
- Open the lobby in browser
- Verify all text is in English
- Verify button shows "EN" at the bottom center

**Step 3: Toggle to KR**
- Click the EN button
- Verify button changes to "KR"
- Verify all lobby text switches to Korean

**Step 4: Verify localStorage persistence**
- With KR active, refresh the page (F5)
- Verify the language stays KR

**Step 5: Toggle back to EN**
- Click KR button
- Verify everything switches back to English
