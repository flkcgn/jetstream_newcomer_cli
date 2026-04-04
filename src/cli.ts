#!/usr/bin/env node

import { startJetstreamPostListener } from './jetstreamClient.js';

// ANSI color helpers for simple terminal output.
const color = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
};

async function main(): Promise<void> {
  await startJetstreamPostListener({
    wantedCollections: ['app.bsky.feed.post'],
    reconnectDelayMs: 5000,
  });
}

main().catch((error) => {
  console.error(`${color.red}Unhandled error in main()${color.reset}`, error);
  process.exitCode = 1;
});