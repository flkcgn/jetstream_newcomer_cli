# Eurosky Newcomer Feed Generator

A Bluesky custom feed generator that surfaces posts from newcomers on [eurosky.social](https://eurosky.social). Includes both a CLI debugging tool and a production-ready feed server.

## What This Does

This project runs a Bluesky custom feed generator that:

1. **Connects to the Jetstream** firehose and receives all `app.bsky.feed.post` events in real-time
2. **Filters posts** from accounts on eurosky.social that are new (≤ 7 days), human, and not spam
3. **Indexes accepted posts** into a SQLite database with scoring
4. **Serves the feed** via standard AT Protocol XRPC endpoints (`getFeedSkeleton`, `describeFeedGenerator`)
5. **Provides a DID document** at `/.well-known/did.json` for `did:web` resolution

Users can subscribe to this feed in the Bluesky app to discover newcomers on eurosky.social.

## Requirements

- Node.js ≥ 20
- TypeScript

## Quick Start

### Feed Generator Server

```bash
npm install
npm run build

# Configure (see Environment Variables below)
export FEEDGEN_HOSTNAME=feed.example.com
export FEEDGEN_PUBLISHER_DID=did:plc:your-did-here

# Run the feed server
npm run start:server
```

### CLI Debugging Tool

The original CLI tool is still available for debugging and testing the filter pipeline:

```bash
npm run dev -- --host eurosky.social --max-age-days 7 --debug
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FEEDGEN_HOSTNAME` | Public hostname of the feed generator | `localhost` |
| `FEEDGEN_PORT` | HTTP server port | `3000` |
| `FEEDGEN_LISTEN_HOST` | Bind address | `0.0.0.0` |
| `FEEDGEN_SERVICE_DID` | DID for the feed generator service | `did:web:<hostname>` |
| `FEEDGEN_PUBLISHER_DID` | DID of the Bluesky account publishing the feed | *(required)* |
| `FEEDGEN_FEED_RECORD_NAME` | Short name used in the feed URI | `eurosky-newcomers` |
| `FEEDGEN_FEED_DISPLAY_NAME` | Display name shown to users | `Welcome Newcomers (eurosky.social)` |
| `FEEDGEN_FEED_DESCRIPTION` | Description shown to users | Posts from newcomers... |
| `FEEDGEN_SQLITE_PATH` | Path to SQLite database file | `feed.db` |
| `FEEDGEN_MAX_POST_AGE_HOURS` | Max age of indexed posts before garbage collection | `48` |
| `FEEDGEN_GC_INTERVAL_MINUTES` | How often to run garbage collection | `30` |
| `FEEDGEN_DEBUG` | Enable debug logging in server mode | `false` |

## Publishing the Feed

To register the feed on the Bluesky network so users can discover and subscribe:

```bash
export BLUESKY_HANDLE=your-handle.bsky.social
export BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
export FEEDGEN_HOSTNAME=feed.example.com
export FEEDGEN_PUBLISHER_DID=did:plc:your-did-here

npm run publish-feed
```

To remove the feed registration:

```bash
npm run unpublish-feed
```

## XRPC Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check with feed metadata and post count |
| `GET /.well-known/did.json` | DID document for `did:web` resolution |
| `GET /xrpc/app.bsky.feed.describeFeedGenerator` | Feed generator description |
| `GET /xrpc/app.bsky.feed.getFeedSkeleton?feed=<at-uri>` | Feed skeleton with cursor pagination |

## Feed Content Policy

- **Normal posts** from newcomers are included
- **Quote posts** are included only if they contain own commentary (≥ 10 characters)
- **Replies** are excluded
- **Languages**: `en`, `de`, `fr`, `es`, `it`, `nl`

## Filter Pipeline

| Stage | What It Checks | Hard Blocker? |
|-------|---------------|---------------|
| **Language** | Post language tags match allowed languages | Yes |
| **Membership** | Handle ends with target domain | Yes |
| **Newcomer** | Account age ≤ threshold | Yes |
| **Human** | No bot labels/keywords, not a bridge account | Yes |
| **Engagement** | Post is substantial (not low-effort) | Yes |
| **Spam** | Link count, hashtags, promotional patterns | Yes |
| **Safety** | Hate speech, harassment patterns | Yes |

## CLI Options (Debug Tool)

| Option | Description | Default |
|--------|-------------|---------|
| `--host <domain>` | Target PDS domain to filter | `eurosky.social` |
| `--max-age-days <n>` | Max account age in days | `7` |
| `--debug`, `-d` | Show debug information | `false` |
| `--include-rejected`, `-r` | Show rejected posts (for debugging) | `false` |
| `--no-color` | Disable colored output | `false` |
| `--help`, `-h` | Show help | |

## Development

```bash
# Type check
npm run typecheck

# Build
npm run build

# Run tests
npm test

# Run CLI in development
npm run dev

# Run feed server in development
npm run dev:server
```

## Architecture

```
src/
├── index.ts           # CLI entry point (debug tool)
├── server.ts          # Feed generator server entry point
├── config.ts          # Environment-based configuration
├── database.ts        # SQLite storage for feed index
├── feedGenerator.ts   # HTTP server with XRPC endpoints
├── jetstreamClient.ts # Jetstream connection and event handling
├── profileCache.ts    # In-memory profile cache with TTL
├── type.ts            # Domain types and result interfaces
├── filters.ts         # Membership, newcomer, human filters
├── contentFilters.ts  # Spam, safety, language, and engagement filters
├── evaluate.ts        # Central evaluation combining all stages
├── output.ts          # CLI output formatting
├── publishFeed.ts     # Feed registration script
└── unpublishFeed.ts   # Feed unregistration script
```

## Hosting

The feed generator is designed to be hosted on a VM with a public hostname. Requirements:

1. A domain name pointing to the server (for `did:web` resolution)
2. TLS termination (e.g., via nginx or Caddy reverse proxy)
3. Node.js ≥ 20 runtime
4. A Bluesky account to publish the feed record

### Example with systemd

```ini
[Unit]
Description=Eurosky Newcomer Feed Generator
After=network.target

[Service]
Type=simple
User=feedgen
WorkingDirectory=/opt/eurosky-feed
ExecStart=/usr/bin/node dist/server.js
Restart=always
Environment=FEEDGEN_HOSTNAME=feed.example.com
Environment=FEEDGEN_PUBLISHER_DID=did:plc:your-did
Environment=FEEDGEN_PORT=3000

[Install]
WantedBy=multi-user.target
```

## License

MIT License – see [LICENSE](LICENSE).
