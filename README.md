<div align="center">

<img src="assets/banner.png" alt="" width="820">

# LLMux

**Your universal LLM gateway.**

One input. Multiple models. Launch from Raycast or use directly.<br>
Multiplex your queries across ChatGPT, Claude, and Gemini — or just use the one you need.

<br>

<img src="screenshots/query-response.png" alt="Three models responding to the same query" width="820">

<br>

<video src="https://github.com/charlesnchr/llmux/raw/main/screenshots/demo.mp4" width="820" autoplay loop muted playsinline></video>

<br>

[Install](#install) · [Features](#features) · [Shortcuts](#keyboard-shortcuts) · [How It Works](#how-it-works)

</div>

---

<br>

## What is LLMux

LLMux is an Electron app that wraps ChatGPT, Claude, and Gemini in side-by-side panels. Type a query once, get three answers simultaneously. Or toggle down to a single model and use it as a focused daily driver.

It remembers which models you have active, so new tabs match your last configuration. Combined with the Raycast extension, it becomes a keyboard-first LLM launcher: type your question anywhere, hit enter, and LLMux opens with all your models already working on it.

<br>

## Features

<table>
<tr>
<td width="50%">

### Raycast Integration

Install the bundled Raycast extension and query your models from anywhere on your Mac. LLMux opens, creates a new tab, and fires the query to all active models — all without touching the app first.

</td>
<td width="50%">

### Command Palette

`Cmd+K` opens a fuzzy-search palette with every action in the app. Toggle platforms, reload panels, rename tabs, open devtools — VS Code-style.

<img src="screenshots/command-palette.png" alt="Command palette" width="380">

</td>
</tr>
</table>

### Multiplexer Mode

All three models in one frame, answering the same question. Resize panels by dragging dividers. Compare reasoning, tone, and accuracy at a glance.

### Single-Model Mode

Don't always need all three. Toggle off what you don't need with `Ctrl+Option+1/2/3`, or use the command palette to "Show Only Claude." LLMux remembers your selection — new tabs inherit whichever models you last had active.

### Tabbed Conversations

`Cmd+T` opens a new tab with fresh sessions. Tabs auto-rename from conversation titles as responses come in. Run as many parallel threads as you want.

### Cookie Sync

Click **Sync from Chrome** to import your existing browser sessions. LLMux reads Chrome's encrypted cookie database from your macOS Keychain — no need to log into each platform again.

<br>

## Install

### Homebrew (recommended)

The easiest way to install. Homebrew handles the unsigned-app quarantine automatically.

```bash
brew install charlesnchr/tap/llmux
```

### Download

Grab the `.dmg` from the [Releases](https://github.com/charlesnchr/llmux/releases) page. Drag to Applications, then clear the quarantine flag (the app is unsigned — Homebrew does this for you):

```bash
xattr -cr /Applications/LLMux.app
```

### From source

```bash
git clone https://github.com/charlesnchr/llmux.git
cd llmux
npm install
npx electron .
```

### Raycast extension

The extension is in the `raycast-extension/` directory. To install:

```bash
cd raycast-extension
npm install && npm run build
```

Then open Raycast, go to Extensions, and import the built extension from the directory.

<br>

## Keyboard Shortcuts

| Shortcut | Action |
|:--|:--|
| `Cmd+K` | Command palette |
| `Cmd+L` | Focus query input |
| `Ctrl+Option+1` | Toggle ChatGPT |
| `Ctrl+Option+2` | Toggle Claude |
| `Ctrl+Option+3` | Toggle Gemini |
| `Cmd+Shift+R` | Reload all panels |
| `Cmd+N` | New chat (reset current tab) |
| `Cmd+T` | New tab |
| `Cmd+W` | Close tab |
| `Cmd+1`--`9` | Jump to tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |

Everything is also accessible through the command palette.

<br>

## How It Works

Each platform runs in an Electron `<webview>` with its own `persist:` session partition, so cookies and state are fully isolated between models.

When you press Send, platform-specific injection scripts locate the input field in each webview's DOM (handling contenteditable divs, ProseMirror editors, shadow DOM in Gemini), insert the query text, and programmatically click the send button.

The Raycast extension communicates via the `llmux://` custom URL protocol. When you send a query from Raycast, it opens `llmux://query?text=...`, which the Electron app intercepts, creates a new tab, and injects the query.

Cookie import reads Chrome's encrypted SQLite cookie database on macOS, decrypts values using PBKDF2-derived keys from the Chrome Safe Storage keychain entry, and loads them into each webview's session.

### Requirements

- **macOS** (Apple Silicon) — cookie import uses the macOS Keychain
- **Chrome** — logged into the three platforms
- **Node.js 18+** (only needed when running from source)

<br>

## License

MIT
