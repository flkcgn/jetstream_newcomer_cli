# Eurosky Newcomer CLI

A CLI tool that consumes the Bluesky Jetstream feed and identifies posts from newcomers on [eurosky.social](https://eurosky.social).

## What This Tool Does

This tool connects to the Bluesky Jetstream and filters posts from accounts that:

1. **Are on eurosky.social** – Handle ends with `.eurosky.social`
2. **Are newcomers** – Account created within the last 7 days (configurable)
3. **Appear human** – No bot labels, no bot keywords in profile
4. **Are not spam** – No excessive links, hashtags, or promotional patterns
5. **Pass safety checks** – No obvious hate speech or harassment

The goal is to surface "Welcome Newcomers" candidates for a future custom feed.

## Requirements

- Node.js ≥ 20
- TypeScript

## Quick Start

```bash
git clone https://github.com/flkcgn/jetstream_newcomer_cli.git
cd jetstream_newcomer_cli
npm install
npm run build
npm run dev
```

Or with arguments:

```bash
npm run dev -- --host eurosky.social --max-age-days 7 --debug
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--host <domain>` | Target PDS domain to filter | `eurosky.social` |
| `--max-age-days <n>` | Max account age in days | `7` |
| `--debug`, `-d` | Show debug information | `false` |
| `--include-rejected`, `-r` | Show rejected posts (for debugging) | `false` |
| `--no-color` | Disable colored output | `false` |
| `--help`, `-h` | Show help | |

## What "New on eurosky.social" Means

A **newcomer** is defined as an account that:

- Has a handle ending in `.eurosky.social` (e.g., `alice.eurosky.social`)
- Was **created** within the configured timeframe (default: 7 days)

### Important Limitations

**ATProto does not expose PDS migration history.** This means:

- ✅ Accounts **created directly on eurosky.social** are detected correctly
- ⚠️ Accounts that **migrated from another PDS** appear with their original global creation date, so recent migrants may be incorrectly classified as "not new"

This is a fundamental limitation of the data available from the Bluesky AppView API. The tool uses a **conservative approach**: it prefers missing some newcomers over incorrectly labeling established accounts as new.

## Filter Pipeline

The evaluation pipeline applies these stages in order:

| Stage | What It Checks | Hard Blocker? |
|-------|---------------|---------------|
| **Language** | Post language tags match allowed languages | Yes |
| **Membership** | Handle ends with target domain | Yes |
| **Newcomer** | Account age ≤ threshold | Yes |
| **Human** | No bot labels/keywords, not a bridge account | Yes |
| **Engagement** | Post is substantial (not low-effort) | Yes |
| **Spam** | Link count, hashtags, promotional patterns | Yes |
| **Safety** | Hate speech, harassment patterns | Yes |

Each stage produces a **structured result** with:
- Boolean decision
- Confidence level (`high`, `medium`, `low`)
- Reasons explaining the decision
- Signals used for the decision

## Heuristics and Approximations

All filters are **best-effort heuristics**. They are designed to:

- ✅ Prefer **false negatives** over **false positives**
- ✅ Be **conservative** when uncertain
- ✅ Provide **explainable decisions** via reasons/signals
- ✅ Support **future ranking** via scores

### Bot Detection

Checks for:
- Self-declared bot labels (`bot`, `automation`)
- Bot keywords in handle/display name/description
- Bridge account patterns (e.g., `*.ap.brid.gy`)
- Profile completeness as a soft signal

### Spam Detection

Checks for:
- Excessive links (> 3)
- Excessive hashtags (> 5)
- Excessive mentions (> 10)
- Promotional patterns ("giveaway", "airdrop", "click here", etc.)
- Crypto/NFT patterns (`$TOKEN`, Ethereum addresses)
- High uppercase ratio in longer texts

### Safety Filter

Checks for:
- Configurable blocklist patterns
- Post self-labels (nsfw, gore, violence)
- Basic threat/harassment patterns

The safety filter is intentionally minimal and rule-based. For production use, consider integrating with external moderation APIs.

## Output Format

Accepted posts show:
- Timestamp
- Handle and display name
- DID
- Truncated post text
- Key signals (account age, human score, spam score)
- Overall score and confidence

With `--debug`, additional information is shown including cursor values and detailed reasons.

## Development

```bash
# Type check
npm run typecheck

# Build
npm run build

# Run tests
npm test

# Run in development
npm run dev
```

## Architecture

```
src/
├── index.ts           # CLI entry point with argument parsing
├── jetstreamClient.ts # Jetstream connection and event handling
├── profileCache.ts    # In-memory profile cache with TTL
├── type.ts            # Domain types and result interfaces
├── filters.ts         # Membership, newcomer, human filters
├── contentFilters.ts  # Spam, safety, language, and engagement filters
├── evaluate.ts        # Central evaluation combining all stages
└── output.ts          # CLI output formatting
```

## Deployment (VM / Docker)

### Docker

```bash
# Build image
docker build -t jetstream-newcomer .

# Run
docker run --rm jetstream-newcomer --host eurosky.social --max-age-days 7
```

### Systemd (VM)

```bash
# Copy the service file
sudo cp deploy/jetstream-newcomer.service /etc/systemd/system/

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now jetstream-newcomer

# Check logs
journalctl -u jetstream-newcomer -f
```

### Direct Node.js

```bash
npm ci && npm run build
node dist/index.js --host eurosky.social --max-age-days 7
```

## Manual Moderation

The evaluation pipeline supports allowlists and blocklists by DID and handle.
These can be configured in the `EvaluationConfig`:

```typescript
{
  allowDids: ['did:plc:trusted-user'],
  allowHandles: ['friend.eurosky.social'],
  blockDids: ['did:plc:known-spammer'],
  blockHandles: ['spammer.eurosky.social'],
}
```

- **Allowlisted** accounts bypass all filters and are always accepted.
- **Blocklisted** accounts are immediately rejected before any evaluation.

## Future Work

This CLI is designed as the foundation for a **custom "Welcome Newcomers" feed**. The structured evaluation results (confidence levels, scores, signals) are preserved to support future ranking and feed generation.

## License

MIT License – see [LICENSE](LICENSE).
