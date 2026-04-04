#!/usr/bin/env node

/**
* jetstream-newcomer-cli

* A command-line tool that listens to the Bluesky Jetstream
* and highlights new, likely human user accounts.
*/

import { startJetstreamPostListener } from './jetstreamClient.js';

async function main(): Promise<void> {
  try {
    await startJetstreamPostListener({
      wantedCollections: ['app.bsky.feed.post'],
      reconnectDelayMs: 5000,
      profileCacheTtlMs: 5 * 60 * 1000,
    });
  } catch (error) {
    console.error('Unexpected error in main():', error);
    process.exitCode = 1;
  }
}

main().catch((error) => {
console.error('Unhandled error in main():', error);
process.exitCode = 1;
});