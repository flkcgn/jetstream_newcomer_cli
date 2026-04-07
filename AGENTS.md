# Agent Collaboration Guide

This repository uses a **private local documentation workflow** so all agents can
share context without publishing sensitive operational notes.

## 1) Private docs location (non-public)

- Use: `private-docs/`
- Purpose: handovers, hosting notes, tuning notes, internal runbooks.
- Rule: anything under `private-docs/` must stay local and must not be committed.
- Enforcement: `.gitignore` contains `private-docs/`.

## 2) Public docs rule

- `README.md` may be public and committed.
- All additional markdown documentation should be written in `private-docs/`.
- Do not add new public markdown docs unless explicitly requested.

## 3) Mandatory agent handover behavior

At the start of work:
- Read `private-docs/AGENT_HANDOVER_PROMPT.md` if present.
- Read `private-docs/BESPROCHENE_REGELN.md` if present.

During work:
- Extend private docs with decisions, open questions, and operational changes.
- Keep entries concise and actionable.

At the end of work:
- Update handover notes with:
  - branch name
  - latest commit
  - what changed
  - what is next
  - known risks

## 4) Product constraints from stakeholder chat

Unless explicitly changed by the user:
- Feed content policy:
  - include normal posts
  - include quote posts only if they contain own commentary
- Target languages:
  - `en`, `de`, `fr`, `es`, `it`, `bnl`
  - treat `bnl` robustly as `nl` compatibility
- Moderation policy:
  - prefer strict filtering over letting spam/abuse through
  - prioritize newcomer visibility and genuine engagement
  - filter spam, bot-like behavior, hate speech, sexism
- Manual moderation controls:
  - support allowlist and blocklist (DID + handle)
- Hosting goal:
  - VM-ready setup and operational guidance required

## 5) Git safety check before commit

Before each commit, verify private docs are not staged:

1. Run `git status --short`
2. Ensure no `private-docs/*` entries are staged
3. Commit only intended tracked files

If private docs accidentally get staged, unstage them immediately.
