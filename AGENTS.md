# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Eurosky Newcomer CLI — a Node.js/TypeScript CLI that consumes the Bluesky Jetstream WebSocket firehose and filters posts from newcomer accounts on a configurable PDS domain (default: `eurosky.social`). See `README.md` for full details.

### Development commands

All standard commands are in `package.json` scripts:

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Type check | `npm run typecheck` |
| Build | `npm run build` |
| Test | `npm test` |
| Dev mode | `npm run dev` |

### Non-obvious notes

- **No ESLint config file exists.** ESLint v10 is installed as a devDependency but no `eslint.config.*` is present, so `npx eslint .` will error. Use `npm run typecheck` as the primary lint check.
- **No environment variables or secrets required.** The CLI uses only public, unauthenticated Bluesky APIs.
- **Internet access required for `npm run dev`.** The CLI connects to the public Bluesky Jetstream WebSocket and the Bluesky AppView API. Unit tests (`npm test`) run fully offline.
- **`--include-rejected` flag is useful for debugging.** Without it, output may be sparse since only posts from eurosky.social newcomers are shown. Use `npm run dev -- --include-rejected --debug` to see all evaluated posts.
