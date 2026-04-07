# Content Policy — Eurosky Newcomer Feed

This document describes what content is included or excluded from the "Welcome Newcomers" feed, and the rationale behind each rule.

## Included

- **Normal posts** from newcomer accounts on eurosky.social
- **Quote posts** that include at least 10 characters of original commentary

## Excluded

- **Replies** — the feed focuses on standalone posts to highlight newcomers
- **Quote posts without sufficient commentary** — reposting without adding at least 15 characters of context is not considered engagement
- **Posts in unsupported languages** — only `en`, `de`, `fr`, `es`, `it`, `nl` are accepted
- **Posts from non-eurosky accounts** — handle must end in `.eurosky.social`
- **Posts from established accounts** — only accounts ≤ 7 days old qualify as newcomers
- **Bot posts** — accounts with bot labels, bot keywords, or bridge patterns are filtered
- **Spam** — promotional patterns, excessive links/hashtags/mentions, crypto/NFT patterns
- **Low-effort posts** — single emoji, "lol", "same", etc.
- **Unsafe content** — hate speech, harassment, threats, self-labeled NSFW/gore/violence

## Language Policy

Supported languages reflecting the eurosky.social community:

| Code | Language |
|------|----------|
| `en` | English |
| `de` | German |
| `fr` | French |
| `es` | Spanish |
| `it` | Italian |
| `nl` | Dutch (also covers `bnl` region) |

Posts without language tags are allowed (many clients don't set them). Regional variants (e.g. `de-DE`, `en-US`) are normalized to their base language.

## Moderation Philosophy

The feed follows a **strict filtering** approach:

- **False negatives over false positives** — it is better to miss a legitimate newcomer than to include spam or abuse
- **Newcomer visibility** — the primary goal is to surface genuine newcomers
- **Conservative heuristics** — when uncertain, the system rejects

## Manual Moderation

The system supports:

- **Allowlist** (DID + handle) — force-include accounts regardless of filter results
- **Blocklist** (DID + handle) — force-exclude accounts regardless of filter results

These lists are configured via `EvaluationConfig` and can be extended at runtime.

## Newcomer Detection Limitations

ATProto does not expose PDS migration history. This means:

- Accounts **created directly on eurosky.social** are detected correctly
- Accounts that **migrated from another PDS** appear with their original creation date and may be incorrectly classified as "not new"

This is accepted as a known limitation. The system prefers missing some newcomers over incorrectly labeling established accounts.
