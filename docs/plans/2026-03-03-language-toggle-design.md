# Language Toggle Design — 2026-03-03

## Overview

Add an EN/KR language toggle button to the lobby bottom center.
Default language is EN. Setting persists via localStorage.
In-game text is out of scope for now.

## Architecture

### New Files

**`client/src/i18n/translations.ts`**
- Single object with `en` and `kr` keys
- Every key maps to a string (or a function for dynamic values like win/loss counts)
- No external library

**`client/src/hooks/useLang.ts`**
- Reads initial lang from `localStorage.getItem('lang')`, defaults to `'en'`
- Returns `{ lang, toggleLang, t }` where `t = translations[lang]`
- `toggleLang` writes to localStorage and updates state

### Modified Files

**`client/src/components/Lobby/LobbyScreen.tsx`**
- Import and call `useLang()` at the top of `LobbyScreen`
- Replace all hardcoded strings with `t.xxx`
- Add `<button className="lang-toggle" onClick={toggleLang}>{lang.toUpperCase()}</button>` as the last child of `.lobby-screen`

**`client/src/components/Lobby/LobbyScreen.css`**
- Add `.lang-toggle` styles: pill shape, `var(--tile)` background, `var(--text-muted)` color, small font, centered via `align-self: center`

## Text Scope

All lobby text is translated:
- Section headings (Guest Account, AI Match, Friend Match, Random Match)
- Descriptions and sub-labels
- Button labels
- Placeholder and error text
- Modal text (upgrade notice dialog)
- Dynamic strings (wins/losses format)

## Button Position

Centered at the bottom of the lobby scroll area, inside `.lobby-screen` flex column.
Uses `align-self: center` so it sits centered regardless of card width.

## Persistence

`localStorage` key: `'lang'`
Values: `'en'` | `'kr'`
Default: `'en'`
