#!/usr/bin/env node

// Removes the feed generator record from Bluesky.
// This unregisters the feed so users can no longer discover it.
//
// Usage:
//   BLUESKY_HANDLE=your.handle \
//   BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
//   npx tsx src/unpublishFeed.ts

import { AtpAgent } from '@atproto/api';
import { loadConfig } from './config.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  const service = process.env.BLUESKY_SERVICE ?? 'https://bsky.social';

  if (!handle || !password) {
    console.error('Required: BLUESKY_HANDLE, BLUESKY_APP_PASSWORD');
    process.exitCode = 1;
    return;
  }

  console.log(`Unpublishing feed "${config.feedRecordName}"...`);

  const agent = new AtpAgent({ service });
  await agent.login({ identifier: handle, password });

  await agent.api.com.atproto.repo.deleteRecord({
    repo: agent.session?.did ?? '',
    collection: 'app.bsky.feed.generator',
    rkey: config.feedRecordName,
  });

  console.log('Feed unpublished successfully.');
}

main().catch((error) => {
  console.error('Failed to unpublish feed:', error);
  process.exitCode = 1;
});
