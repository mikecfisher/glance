# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Glance is a Chrome/Firefox extension that adds AI-powered video summarization to YouTube thumbnails. Users click a button injected on thumbnails to get Claude-generated bullet-point summaries of video captions without watching the video.

## Commands

```bash
pnpm dev              # Hot-reload dev server (Chrome)
pnpm dev:firefox      # Hot-reload dev server (Firefox)
pnpm build            # Production build (Chrome, Manifest V3)
pnpm build:firefox    # Production build (Firefox)
pnpm zip              # Package as .zip for distribution
pnpm postinstall      # Runs wxt prepare (auto-runs after install)
```

No test or lint commands are configured.

## Architecture

Built with **WXT** (browser extension framework) and **TypeScript**. No UI framework — vanilla HTML/CSS/TS throughout.

### Entrypoints (in `entrypoints/`)

- **`background.ts`** — Service worker. Listens for `SUMMARIZE_TEXT` messages from the content script, retrieves settings from storage, calls the Anthropic API via `utils/claude.ts`, and returns the summary.
- **`youtube.content/index.ts`** — Content script injected on YouTube. Injects a summarize button on every thumbnail, fetches captions via YouTube's innertube API, sends them to the background worker, and displays results in a Shadow DOM overlay. Handles dark mode detection, smart viewport-aware positioning, and session caching.
- **`popup/main.ts`** — Settings popup. Manages API key, model selection, and custom prompt configuration via browser storage.

### Utilities (in `utils/`)

- **`captions.ts`** — Fetches video captions from YouTube's innertube `/youtubei/v1/player` endpoint. Extracts page config, handles SAPISID cookie auth with SHA-1 signing, selects best caption track (English manual preferred), and parses XML response.
- **`claude.ts`** — Direct Anthropic API client. Posts to `api.anthropic.com/v1/messages` with `anthropic-dangerous-direct-browser-access: true` header for browser-direct calls. Max tokens: 1024.
- **`storage.ts`** — WXT storage abstraction using `storage.defineItem()` with key `"local:ytps-settings"`.
- **`types.ts`** — TypeScript interfaces: `Settings`, `CaptionTrack`, `SummarizeResponse`.
- **`constants.ts`** — Default model (`claude-sonnet-4-20250514`), available models list, default prompt template, max caption chars (48,000).

### Data Flow

```
Thumbnail button click → Content script checks cache →
  If miss: fetch captions (innertube API) → send message to background →
  Background retrieves settings → calls Anthropic API → returns summary →
  Content script caches result → displays overlay
```

### Message Passing Pattern

Content script sends `{ type: "SUMMARIZE_TEXT", text, title }` via `browser.runtime.sendMessage`. Background listener uses async `sendResponse` (returns `true` to keep channel open).

### Extension Permissions

- `storage` — Persist API key, model, custom prompt
- `*://www.youtube.com/*` — Inject UI and access captions
- `https://api.anthropic.com/*` — AI summarization requests
