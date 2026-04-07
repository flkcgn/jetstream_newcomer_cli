#!/usr/bin/env node

// Publishes or updates the feed generator record on Bluesky.
// This registers the feed so that users can discover and subscribe to it.
//
// Usage:
//   FEEDGEN_PUBLISHER_DID=did:plc:... \
//   BLUESKY_HANDLE=your.handle \
//   BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
//   npx tsx src/publishFeed.ts

import { AtpAgent } from '@atproto/api';
import { loadConfig } from './config.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  const service = process.env.BLUESKY_SERVICE ?? 'https://bsky.social';

  if (!handle || !password) {
    console.error('Required environment variables:');
    console.error('  BLUESKY_HANDLE       - Your Bluesky handle');
    console.error('  BLUESKY_APP_PASSWORD  - An app password from Settings > App Passwords');
    console.error('');
    console.error('Optional:');
    console.error('  BLUESKY_SERVICE      - PDS service URL (default: https://bsky.social)');
    console.error('  FEEDGEN_HOSTNAME     - Feed generator hostname');
    console.error('  FEEDGEN_SERVICE_DID  - Feed generator DID');
    console.error('  FEEDGEN_PUBLISHER_DID - Publisher DID');
    console.error('  FEEDGEN_FEED_RECORD_NAME  - Feed record name');
    console.error('  FEEDGEN_FEED_DISPLAY_NAME - Feed display name');
    console.error('  FEEDGEN_FEED_DESCRIPTION  - Feed description');
    process.exitCode = 1;
    return;
  }

  if (!config.publisherDid) {
    console.error('FEEDGEN_PUBLISHER_DID is required.');
    process.exitCode = 1;
    return;
  }

  console.log('Publishing feed generator record...');
  console.log(`  Handle:       ${handle}`);
  console.log(`  Service:      ${service}`);
  console.log(`  Service DID:  ${config.serviceDid}`);
  console.log(`  Publisher:    ${config.publisherDid}`);
  console.log(`  Record name:  ${config.feedRecordName}`);
  console.log(`  Display name: ${config.feedDisplayName}`);
  console.log();

  const agent = new AtpAgent({ service });
  await agent.login({ identifier: handle, password });
  console.log(`Logged in as ${agent.session?.did}`);

  await agent.api.com.atproto.repo.putRecord({
    repo: agent.session?.did ?? '',
    collection: 'app.bsky.feed.generator',
    rkey: config.feedRecordName,
    record: {
      did: config.serviceDid,
      displayName: config.feedDisplayName,
      description: config.feedDescription,
      createdAt: new Date().toISOString(),
    },
  });

  const feedUri = `at://${agent.session?.did}/app.bsky.feed.generator/${config.feedRecordName}`;
  console.log();
  console.log('Feed published successfully!');
  console.log(`  Feed URI: ${feedUri}`);
  console.log();
  console.log('Users can now find and subscribe to this feed in the Bluesky app.');
}

main().catch((error) => {
  console.error('Failed to publish feed:', error);
  process.exitCode = 1;
});
