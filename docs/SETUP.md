# Setup Guide — Eurosky Newcomer Feed Generator

## Local Development

### 1. Install Dependencies

```bash
git clone https://github.com/flkcgn/jetstream_newcomer_cli.git
cd jetstream_newcomer_cli
npm install
```

### 2. Run the CLI (Debug Tool)

The CLI connects to the Jetstream and prints accepted/rejected posts in real-time:

```bash
# Default: eurosky.social newcomers from the last 7 days
npm run dev

# With options
npm run dev -- --host eurosky.social --max-age-days 14 --debug --include-rejected
```

### 3. Run the Feed Server (Development)

```bash
export FEEDGEN_HOSTNAME=localhost
export FEEDGEN_PUBLISHER_DID=did:plc:your-did-here

npm run dev:server
```

The server will start on port 3000 (default). Test it:

```bash
# Health check
curl http://localhost:3000/

# DID document
curl http://localhost:3000/.well-known/did.json

# Feed skeleton
curl "http://localhost:3000/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://did:plc:your-did-here/app.bsky.feed.generator/eurosky-newcomers"
```

### 4. Run Tests

```bash
npm test           # Unit tests (node:test)
npm run typecheck  # TypeScript type checking
npm run build      # Full build
```

## Environment Variables Reference

### Feed Server (Required)

| Variable | Description |
|----------|-------------|
| `FEEDGEN_HOSTNAME` | Public hostname where the feed is reachable (e.g. `feed.eurosky.social`) |
| `FEEDGEN_PUBLISHER_DID` | DID of the Bluesky account that publishes this feed |

### Feed Server (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `FEEDGEN_PORT` | `3000` | HTTP server port |
| `FEEDGEN_LISTEN_HOST` | `0.0.0.0` | Bind address |
| `FEEDGEN_SERVICE_DID` | `did:web:<hostname>` | DID for the feed generator service |
| `FEEDGEN_FEED_RECORD_NAME` | `eurosky-newcomers` | Short name in the feed URI |
| `FEEDGEN_FEED_DISPLAY_NAME` | `Welcome Newcomers (eurosky.social)` | Display name shown to users |
| `FEEDGEN_FEED_DESCRIPTION` | *(see config.ts)* | Description shown to users |
| `FEEDGEN_SQLITE_PATH` | `feed.db` | Path to SQLite database file |
| `FEEDGEN_MAX_POST_AGE_HOURS` | `48` | Max age before garbage collection |
| `FEEDGEN_GC_INTERVAL_MINUTES` | `30` | GC frequency |
| `FEEDGEN_DEBUG` | `false` | Enable debug logging |

### Feed Publishing

| Variable | Description |
|----------|-------------|
| `BLUESKY_HANDLE` | Your Bluesky handle (e.g. `you.bsky.social`) |
| `BLUESKY_APP_PASSWORD` | App password from Bluesky Settings > App Passwords |
| `BLUESKY_SERVICE` | PDS service URL (default: `https://bsky.social`) |

## Publishing the Feed

After the server is running and reachable via HTTPS:

```bash
export BLUESKY_HANDLE=your-handle.bsky.social
export BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
export FEEDGEN_HOSTNAME=feed.eurosky.social
export FEEDGEN_PUBLISHER_DID=did:plc:your-did

npm run publish-feed
```

This creates an `app.bsky.feed.generator` record in your Bluesky repo, making the feed discoverable.

## Unpublishing the Feed

```bash
npm run unpublish-feed
```

## npm Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run dev` | Run CLI debug tool with tsx |
| `npm run dev:server` | Run feed server with tsx (hot reload) |
| `npm run build` | Compile TypeScript to dist/ |
| `npm start` | Run compiled CLI |
| `npm run start:server` | Run compiled feed server |
| `npm run publish-feed` | Register feed on Bluesky |
| `npm run unpublish-feed` | Remove feed from Bluesky |
| `npm test` | Run unit tests |
| `npm run typecheck` | TypeScript type checking |
