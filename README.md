# Glance

**Know what you're about to watch.**

Glance adds a one-click summarize button to every YouTube thumbnail. Hover over any video, hit the button, and get AI-generated bullet points in seconds without ever leaving the page.

No more clicking into a 45-minute video to find out it wasn't what you wanted.

## Demo

```
  ┌──────────────────────────┐
  │  ▶  Some Long Video      │
  │  ┌──┐                    │    ┌─────────────────────────┐
  │  │⊞ │  that might be     │───▶│  AI Summary             │
  │  └──┘  worth your time   │    │                         │
  │       ... or might not   │    │  • Main topic covered   │
  │                          │    │  • Key insight #2       │
  │  12:34       3 days ago  │    │  • The surprising part  │
  └──────────────────────────┘    └─────────────────────────┘
        thumbnail                     summary overlay
```

## What it does

- Injects a small button on **every** YouTube thumbnail -- homepage, search, subscriptions, sidebar, even Shorts
- Pulls captions directly from YouTube (manual or auto-generated)
- Sends them to Claude and renders a clean summary overlay right next to the thumbnail
- Smart overlay positioning that stays on-screen
- Automatically matches YouTube's dark mode
- Caches summaries per session so repeat clicks are instant
- Handles YouTube's infinite scroll and SPA navigation seamlessly

## Get started

```bash
git clone https://github.com/mikecfisher/glance.git
cd glance
pnpm install
pnpm dev          # launches Chrome with the extension loaded
```

Then head to youtube.com and hover over any thumbnail -- you'll see the Glance button in the top-left corner.

For a production build:

```bash
pnpm build        # output in .output/chrome-mv3/
```

## Configuration

Click the extension icon to open settings:

| Setting | What it does |
|---------|-------------|
| **API Key** | Your Anthropic API key. Stored locally, never synced. |
| **Model** | Pick your speed/quality tradeoff: Haiku 4.5 (fastest), Sonnet 4, or Opus 4.6 (most capable) |
| **Prompt** | Customize the summary style -- bullet points, TL;DR, key takeaways, whatever you want |

## How it works under the hood

1. Content script watches for thumbnails via MutationObserver and injects buttons
2. On click, captions are fetched from YouTube's innertube `/player` API (runs in the content script for cookie/auth access)
3. Captions are sent to the background service worker, which calls the Claude API directly
4. Summary renders in a Shadow DOM overlay, fully isolated from YouTube's styles

## Built with

- [WXT](https://wxt.dev/) -- TypeScript-first browser extension framework
- [Claude API](https://docs.anthropic.com/en/docs/api) -- AI summarization
- YouTube innertube API -- caption extraction
- Vanilla TypeScript, zero runtime dependencies
