# YouTube Preview Summarizer

A Chrome extension that adds a "Summarize" button to YouTube video thumbnails. Click the button to fetch the video's captions and get an AI-powered summary using Claude.

## Features

- Adds a summarize button to every YouTube thumbnail (homepage, search, subscriptions, sidebar)
- Fetches captions directly from YouTube's innertube API
- Sends captions to Claude for concise bullet-point summaries
- Displays summaries in a clean overlay next to the thumbnail
- Supports dark mode
- Handles YouTube's SPA navigation and infinite scroll
- Caches summaries per session

## Setup

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

This opens a Chrome instance with the extension loaded. Navigate to youtube.com to test.

### Build

```bash
pnpm build
```

The built extension will be in `.output/chrome-mv3/`.

## Configuration

Click the extension icon to open settings:

- **API Key** — Your Anthropic API key (stored locally, never synced)
- **Model** — Choose between Claude Haiku 4.5, Sonnet 4, or Opus 4.6
- **Custom Prompt** — Customize the summarization prompt

## How It Works

1. Content script scans YouTube pages for video thumbnails and injects a summarize button
2. On click, captions are fetched from YouTube's innertube `/player` API (runs in the content script for cookie access)
3. Caption text is sent to the background service worker, which calls the Claude API
4. The summary is displayed in a shadow DOM overlay positioned next to the thumbnail

## Built With

- [WXT](https://wxt.dev/) — Web extension framework
- [Claude API](https://docs.anthropic.com/en/docs/api) — AI summarization
