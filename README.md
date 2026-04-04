# Bluesky Jetstream CLI

A simple CLI tool to consume the Bluesky / AT Protocol **Jetstream** feed and analyze **new accounts** on Bluesky.

## Features

- Consume the AT Protocol **Jetstream** feed.
- Identify **new accounts** by profile metadata (e.g., `indexedAt`, `postsCount`).
- Heuristically detect **human‑like** accounts (no bot labels, no "bot" in profile text).
- Optional: future custom **"Welcome Newcomers"** feed.

## Requirements

- Node.js ≥ 20
- TypeScript

## Quick Start

```bash
git clone https://github.com/flkcgn/jetstream_newcomer_cli/settings
cd jetstream_newcomer_cli
npm install
tsc
npm run dev
```

## License

MIT License – see [LICENSE](LICENSE).