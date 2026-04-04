#!/usr/bin/env node

/**
 * jetstream-newcomer-cli
 *
 * A command-line tool that listens to the Bluesky Jetstream
 * and highlights posts from newcomers on eurosky.social.
 */

import { startJetstreamPostListener } from './jetstreamClient.js';

// ---------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------

interface CliArgs {
  host: string;
  maxAgeDays: number;
  debug: boolean;
  includeRejected: boolean;
  noColor: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    host: 'eurosky.social',
    maxAgeDays: 7,
    debug: false,
    includeRejected: false,
    noColor: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--debug' || arg === '-d') {
      args.debug = true;
    } else if (arg === '--include-rejected' || arg === '-r') {
      args.includeRejected = true;
    } else if (arg === '--no-color') {
      args.noColor = true;
    } else if (arg === '--host' && argv[i + 1]) {
      args.host = argv[++i];
    } else if (arg.startsWith('--host=')) {
      args.host = arg.slice('--host='.length);
    } else if (arg === '--max-age-days' && argv[i + 1]) {
      args.maxAgeDays = parseInt(argv[++i], 10);
    } else if (arg.startsWith('--max-age-days=')) {
      args.maxAgeDays = parseInt(arg.slice('--max-age-days='.length), 10);
    }
  }

  // Validate maxAgeDays.
  if (isNaN(args.maxAgeDays) || args.maxAgeDays < 1) {
    args.maxAgeDays = 7;
  }

  return args;
}

function printHelp(): void {
  console.log(`
Eurosky Newcomer CLI

Usage: jetstream-newcomer [options]

Options:
  --host <domain>         Target PDS domain (default: eurosky.social)
  --max-age-days <n>      Max account age in days (default: 7)
  --debug, -d             Show debug information
  --include-rejected, -r  Show rejected posts (useful for debugging)
  --no-color              Disable colored output
  --help, -h              Show this help message

Examples:
  jetstream-newcomer
  jetstream-newcomer --host eurosky.social --max-age-days 14
  jetstream-newcomer --debug --include-rejected

Description:
  This tool connects to the Bluesky Jetstream and filters posts from
  newcomers on the specified PDS domain (default: eurosky.social).

  A "newcomer" is an account that:
  - Has a handle ending in .<domain> (e.g., alice.eurosky.social)
  - Was created within the last <max-age-days> days
  - Appears to be a human (not a bot)
  - Is not posting spam or harmful content

  Note: ATProto does not expose PDS migration history, so accounts that
  migrated from another PDS may not be detected as newcomers.
`.trim());
}

// ---------------------------------------------------------
// Main
// ---------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  try {
    await startJetstreamPostListener({
      wantedCollections: ['app.bsky.feed.post'],
      reconnectDelayMs: 5000,
      profileCacheTtlMs: 5 * 60 * 1000,

      evaluationConfig: {
        targetDomain: args.host,
        maxAccountAgeDays: args.maxAgeDays,
      },

      debug: args.debug,
      includeRejected: args.includeRejected,
      useColors: !args.noColor,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exitCode = 1;
});
