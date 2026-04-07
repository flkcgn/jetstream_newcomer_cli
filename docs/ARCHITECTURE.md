# Architecture — Eurosky Newcomer Feed Generator

## Overview

The feed generator consists of two main subsystems that run concurrently in a single Node.js process:

1. **Jetstream Consumer** — Subscribes to the Bluesky firehose and evaluates incoming posts
2. **HTTP Feed Server** — Serves the AT Protocol XRPC endpoints for feed consumption

```
                    ┌──────────────────────────────────────────────┐
                    │              Feed Generator Server            │
                    │                                              │
  Bluesky Jetstream │  ┌─────────────┐    ┌──────────────────┐    │  Bluesky AppView
  (WebSocket)       │  │  Jetstream   │    │  Profile Cache   │    │  (HTTP API)
  ─────────────────►│  │  Consumer    │───►│  (in-memory TTL) │───►│─────────────────►
                    │  └──────┬──────┘    └──────────────────┘    │
                    │         │                                    │
                    │         │ onPostAccepted                     │
                    │         ▼                                    │
                    │  ┌─────────────┐                             │
                    │  │  Evaluation  │                             │
                    │  │  Pipeline    │                             │
                    │  └──────┬──────┘                             │
                    │         │                                    │
                    │         │ accepted posts                     │
                    │         ▼                                    │
                    │  ┌─────────────┐    ┌──────────────────┐    │
                    │  │   SQLite    │◄───│  Garbage         │    │  AT Protocol clients
                    │  │   Database  │    │  Collector       │    │  (PDS / AppView)
                    │  └──────┬──────┘    └──────────────────┘    │  GET /xrpc/...
                    │         │                                    │◄─────────────────
                    │         ▼                                    │
                    │  ┌─────────────┐                             │
                    │  │  HTTP Feed  │                             │
                    │  │  Server     │─────────────────────────────┤
                    │  └─────────────┘                             │
                    └──────────────────────────────────────────────┘
```

## Component Details

### Jetstream Consumer (`jetstreamClient.ts`)

- Connects to `wss://jetstream.atproto.com` via the `@skyware/jetstream` library
- Filters for `app.bsky.feed.post` collection events
- Type-guards incoming events to `AppBskyFeedPostCommitEvent`
- On create events: fetches profile, runs evaluation, calls `onPostAccepted` if accepted
- On delete events: calls `onPostDeleted` to remove from index
- Auto-reconnects on connection loss with configurable delay

### Profile Cache (`profileCache.ts`)

- In-memory cache keyed by DID with configurable TTL (default: 5 minutes)
- Fetches profiles from the public Bluesky AppView API (`public.api.bsky.app`)
- Reduces API calls for frequently-seen authors

### Evaluation Pipeline (`evaluate.ts`)

Eight-stage filter pipeline, each producing a structured result:

| Stage | Module | Decision |
|-------|--------|----------|
| Event filter | `evaluate.ts` | Reply/quote post type check |
| Language | `contentFilters.ts` | Post language ∈ allowed set |
| Membership | `filters.ts` | Handle ends with `.eurosky.social` |
| Newcomer | `filters.ts` | Account age ≤ threshold |
| Human | `filters.ts` | No bot labels/keywords/bridge patterns |
| Engagement | `contentFilters.ts` | Sufficient text length and quality |
| Spam | `contentFilters.ts` | No promotional patterns or excessive links |
| Safety | `contentFilters.ts` | No hate speech or harassment |

Each stage can be a **hard blocker** (immediate rejection) or a **soft signal** (affects score). All stages produce reasons, confidence levels, and signals for debugging.

### SQLite Database (`database.ts`)

- Uses `better-sqlite3` for synchronous access (no async overhead for simple queries)
- WAL mode for concurrent reads during writes
- Schema: `feed_post(uri, did, indexed_at, score)` with indexes on `indexed_at` and `did`
- Cursor-based pagination using `indexed_at` timestamps
- Automatic garbage collection removes posts older than configurable threshold

### HTTP Feed Server (`feedGenerator.ts`)

Standard Node.js `http.createServer` without external framework dependencies.

| Endpoint | Purpose |
|----------|---------|
| `GET /` | Health check with post count |
| `GET /.well-known/did.json` | DID document for `did:web` resolution |
| `GET /xrpc/app.bsky.feed.describeFeedGenerator` | Feed metadata |
| `GET /xrpc/app.bsky.feed.getFeedSkeleton` | Feed skeleton with pagination |

### Configuration (`config.ts`)

All configuration via environment variables with sensible defaults. No `.env` files are committed — they must be created locally per deployment.

## Data Flow

1. Jetstream delivers a `commit` event for `app.bsky.feed.post`
2. Type guard confirms it's a post creation with text
3. Profile is fetched (or served from cache)
4. Evaluation pipeline runs all 8 stages
5. If accepted: post URI + score + timestamp → SQLite
6. If deleted: post URI removed from SQLite
7. When a PDS requests `getFeedSkeleton`: query SQLite ordered by `indexed_at DESC`, paginate via cursor

## Feed Content Policy

Configured in `server.ts` and `filters.ts` per stakeholder constraints:

- **Languages**: `en`, `de`, `fr`, `es`, `it`, `nl`
- **Quote posts**: included only with ≥10 characters of own commentary
- **Replies**: excluded
- **Moderation**: strict filtering — spam, bots, hate speech, sexism filtered out
- **Manual controls**: allowlist and blocklist by DID and handle supported in config

## File Map

```
src/
├── index.ts            CLI entry point (debug tool)
├── server.ts           Feed generator server entry point
├── config.ts           Environment-based configuration
├── database.ts         SQLite storage for feed index
├── feedGenerator.ts    HTTP server with XRPC endpoints
├── jetstreamClient.ts  Jetstream connection and event handling
├── profileCache.ts     In-memory profile cache with TTL
├── type.ts             Domain types and result interfaces
├── filters.ts          Membership, newcomer, human filters
├── contentFilters.ts   Spam, safety, language, engagement filters
├── evaluate.ts         Central evaluation pipeline
├── output.ts           CLI output formatting
├── publishFeed.ts      Feed registration script
├── unpublishFeed.ts    Feed unregistration script
└── __tests__/
    ├── contentFilters.test.ts
    ├── database.test.ts
    ├── evaluate.test.ts
    ├── feedGenerator.test.ts
    └── filters.test.ts
```
