<div align="center">

<img src="assets/banner.png" alt="" width="820">

# LLM Council

**One prompt. Three models. Side by side.**

Ask ChatGPT, Claude, and Gemini the same question at the same time —<br>
compare their answers without leaving your keyboard.

<br>

<img src="screenshots/query-response.png" alt="All three models answering the same question" width="820">

<br>

<video src="https://github.com/charlesnchr/llm-council/raw/main/screenshots/demo.mp4" width="820" autoplay loop muted playsinline></video>

<br>

[Install](#install) · [Getting Started](#getting-started) · [Shortcuts](#keyboard-shortcuts) · [How It Works](#how-it-works)

</div>

---

<br>

## The Problem

You have a question. You want to see how GPT, Claude, and Gemini each handle it. So you open three tabs, paste the same prompt into each one, and then flip back and forth comparing. It's tedious and you lose context switching between windows.

LLM Council removes all of that. One text field, three panels, instant comparison.

<br>

## Features

<table>
<tr>
<td width="50%">

### Command Palette

`Cmd+K` opens a fuzzy-search palette with every action in the app — toggle platforms, reload panels, rename tabs, open devtools. If you've used VS Code, you already know how this works.

</td>
<td width="50%">

<img src="screenshots/command-palette.png" alt="Command palette" width="400">

</td>
</tr>
</table>

### Three Panels, One Query

Each model runs in its own isolated webview with a persistent session. Type a question, hit Enter, and all three models receive it simultaneously. Drag the dividers to resize panels to your liking.

### Platform Toggles

Don't need Gemini for this one? `Cmd+Shift+3` hides it. Want to focus on just Claude? Open the palette and run "Show Only Claude". The toggles in the bottom bar give you a quick visual of what's active.

### Tabbed Conversations

`Cmd+T` opens a new tab with fresh sessions across all three platforms. Tabs auto-rename from the conversation title as responses come in. Open as many parallel threads as you need.

### Cookie Sync from Chrome

Click **Sync from Chrome** and the app imports your existing Chrome sessions — no need to log into each platform again. It reads Chrome's encrypted cookie database directly from your macOS Keychain.

<br>

## Install

### Download the app (recommended)

Grab the latest `.dmg` from the [Releases](https://github.com/charlesnchr/llm-council/releases) page. Open it, drag **LLM Council** to Applications, then clear the quarantine flag (the app is unsigned):

```bash
xattr -c /Applications/LLM\ Council.app
```

### Or run from source

```bash
git clone https://github.com/charlesnchr/llm-council.git
cd llm-council
npm install
npx electron .
```

### Build it yourself

```bash
npm run dist
```

This produces `dist/LLM Council-*.dmg` and a `.zip` with the standalone `.app` inside.

<br>

## Getting Started

On first launch, click **Sync from Chrome** in the top right to pull in your browser sessions. You need to be logged into ChatGPT, Claude, and Gemini in Chrome beforehand.

### Requirements

- **macOS** (Apple Silicon) — cookie import uses the macOS Keychain for Chrome decryption
- **Chrome** — logged into the three platforms
- **Node.js 18+** (only needed when running from source)

<br>

## Keyboard Shortcuts

| Shortcut | Action |
|:--|:--|
| `Cmd+K` | Command palette |
| `Cmd+L` | Focus query input |
| `Cmd+Shift+1` | Toggle ChatGPT |
| `Cmd+Shift+2` | Toggle Claude |
| `Cmd+Shift+3` | Toggle Gemini |
| `Cmd+Shift+R` | Reload all panels |
| `Cmd+N` | New chat (reset current tab) |
| `Cmd+T` | New tab |
| `Cmd+W` | Close tab |
| `Cmd+1`–`9` | Jump to tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |

Everything is also accessible through the command palette.

<br>

## How It Works

Each platform runs in an Electron `<webview>` with its own `persist:` session partition, so cookies and state are fully isolated between models.

When you press Send, platform-specific injection scripts locate the input field in each webview's DOM (handling contenteditable divs, ProseMirror editors, shadow DOM in Gemini), insert the query text, and programmatically click the send button.

Cookie import shells out to `sqlite3` to read Chrome's `Cookies` database, decrypts the values using PBKDF2-derived keys from the Chrome Safe Storage keychain entry, and loads them into each webview's Electron session.

<br>

## License

MIT
