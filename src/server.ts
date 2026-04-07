#!/usr/bin/env node

// Feed generator server entry point.
// Combines the Jetstream consumer with the HTTP feed generator server.

import { loadConfig } from './config.js';
import { FeedDatabase } from './database.js';
import { createFeedGeneratorServer } from './feedGenerator.js';
import { startJetstreamPostListener } from './jetstreamClient.js';
import { defaultEvaluationConfig } from './filters.js';

import type { AppBskyFeedPostCommitEvent, CandidateEvaluation } from './type.js';

async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.publisherDid) {
    console.error(
      'FEEDGEN_PUBLISHER_DID is required. Set it to the DID of the Bluesky account that will publish this feed.',
    );
    process.exitCode = 1;
    return;
  }

  const feedUri = `at://${config.publisherDid}/app.bsky.feed.generator/${config.feedRecordName}`;
  console.log(`[server] Feed URI: ${feedUri}`);
  console.log(`[server] Service DID: ${config.serviceDid}`);
  console.log(`[server] Hostname: ${config.hostname}`);

  // Open database.
  const db = new FeedDatabase(config.sqlitePath);
  console.log(`[server] Database opened: ${config.sqlitePath} (${db.count()} posts indexed)`);

  // Schedule periodic garbage collection.
  const gcTimer = setInterval(() => {
    const removed = db.garbageCollect(config.maxPostAgeHours);
    if (removed > 0) {
      console.log(`[gc] Removed ${removed} expired posts (older than ${config.maxPostAgeHours}h)`);
    }
  }, config.gcIntervalMinutes * 60 * 1000);
  gcTimer.unref();

  // Start HTTP server.
  const httpServer = createFeedGeneratorServer({ config, db });

  httpServer.listen(config.port, config.listenHost, () => {
    console.log(`[server] HTTP server listening on ${config.listenHost}:${config.port}`);
    console.log(`[server] Feed skeleton: http://localhost:${config.port}/xrpc/app.bsky.feed.getFeedSkeleton?feed=${encodeURIComponent(feedUri)}`);
  });

  // Build evaluation config with product constraints from AGENTS.md:
  // - Languages: en, de, fr, es, it, nl (bnl treated as nl)
  // - Quote posts: include only if they contain own commentary
  // - Replies: excluded
  const evaluationConfig = {
    ...defaultEvaluationConfig,
    allowedLanguages: ['en', 'de', 'fr', 'es', 'it', 'nl'],
    requireLanguageTag: false,
    includeReplies: false,
    includeQuotePosts: true,
    minQuoteCommentaryChars: 10,
  };

  // Start Jetstream consumer with database callbacks.
  const onPostAccepted = (event: AppBskyFeedPostCommitEvent, evaluation: CandidateEvaluation): void => {
    const uri = `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`;
    db.addPost({
      uri,
      did: event.did,
      indexedAt: Math.floor(event.time_us / 1000),
      score: evaluation.score,
    });
  };

  const onPostDeleted = (did: string, rkey: string): void => {
    const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
    db.removePost(uri);
  };

  // Graceful shutdown.
  const shutdown = (): void => {
    console.log('\n[server] Shutting down...');
    clearInterval(gcTimer);
    httpServer.close();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await startJetstreamPostListener({
    wantedCollections: ['app.bsky.feed.post'],
    reconnectDelayMs: 5000,
    profileCacheTtlMs: 5 * 60 * 1000,
    evaluationConfig,
    debug: process.env.FEEDGEN_DEBUG === 'true',
    includeRejected: false,
    useColors: process.stdout.isTTY ?? false,
    onPostAccepted,
    onPostDeleted,
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exitCode = 1;
});
