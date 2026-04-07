// Jetstream client for consuming Bluesky firehose events.

import { Jetstream } from '@skyware/jetstream';
import { setTimeout as sleep } from 'node:timers/promises';

import { ProfileCache } from './profileCache.js';
import { defaultEvaluationConfig } from './filters.js';
import { evaluateCandidatePost, createRejectedEvaluation } from './evaluate.js';
import {
  formatAcceptedPost,
  formatRejectedPost,
  formatStartupMessage,
  formatConnectedMessage,
  formatReconnectMessage,
  type OutputOptions,
} from './output.js';

import type {
  JetstreamEvent,
  AppBskyFeedPostCommitEvent,
  EvaluationConfig,
} from './type.js';

// ---------------------------------------------------------
// Configuration
// ---------------------------------------------------------

export interface JetstreamClientOptions {
  // Jetstream configuration.
  wantedCollections?: string[];
  reconnectDelayMs?: number;
  profileCacheTtlMs?: number;

  // Evaluation configuration.
  evaluationConfig?: Partial<EvaluationConfig>;

  // Output configuration.
  debug?: boolean;
  includeRejected?: boolean;
  useColors?: boolean;
}

// ---------------------------------------------------------
// Event type guards
// ---------------------------------------------------------

/**
 * Narrow a generic JetstreamEvent to an AppBskyFeedPostCommitEvent.
 * Only accepts new post creations with valid text.
 */
function isPostCreateEvent(
  event: JetstreamEvent,
): event is AppBskyFeedPostCommitEvent {
  if (event.kind !== 'commit') return false;

  const commit = (event as AppBskyFeedPostCommitEvent).commit;

  return (
    !!commit &&
    commit.collection === 'app.bsky.feed.post' &&
    commit.operation === 'create' &&
    !!commit.record &&
    typeof commit.record.text === 'string'
  );
}

// ---------------------------------------------------------
// Main listener
// ---------------------------------------------------------

/**
 * Start a Jetstream subscription that filters and outputs newcomer posts.
 */
export async function startJetstreamPostListener(
  options: JetstreamClientOptions = {},
): Promise<void> {
  const {
    wantedCollections = ['app.bsky.feed.post'],
    reconnectDelayMs = 5000,
    profileCacheTtlMs = 5 * 60 * 1000,
    evaluationConfig: evalConfigOverrides = {},
    debug = false,
    includeRejected = false,
    useColors = true,
  } = options;

  // Merge evaluation config with defaults.
  const evaluationConfig: EvaluationConfig = {
    ...defaultEvaluationConfig,
    ...evalConfigOverrides,
  };

  // Output options.
  const outputOptions: OutputOptions = {
    debug,
    useColors,
  };

  // Create profile cache.
  const profileCache = new ProfileCache({
    ttlMs: profileCacheTtlMs,
  });

  // Print startup message.
  console.log(formatStartupMessage(
    evaluationConfig.targetDomain,
    evaluationConfig.maxAccountAgeDays,
    outputOptions,
  ));

  // Reconnection loop.
  while (true) {
    const jetstream = new Jetstream({
      wantedCollections,
    });

    // Create a promise that resolves when the connection closes.
    const connectionClosed = new Promise<void>((resolve) => {
      jetstream.on('close', () => {
        resolve();
      });
    });

    jetstream.on('open', () => {
      console.log(formatConnectedMessage(outputOptions));
    });

    jetstream.on('error', (error) => {
      console.error('Jetstream error:', error);
    });

    jetstream.on('commit', (rawEvent: unknown) => {
      const event = rawEvent as JetstreamEvent;

      if (!isPostCreateEvent(event)) return;

      void handlePostEvent(
        event,
        profileCache,
        evaluationConfig,
        outputOptions,
        includeRejected,
      );
    });

    try {
      // start() is synchronous - it initiates the connection but doesn't wait.
      jetstream.start();

      // Wait for the connection to close before reconnecting.
      await connectionClosed;
    } catch (error) {
      console.error('Jetstream error:', error);
    }

    console.log(formatReconnectMessage(reconnectDelayMs, outputOptions));
    await sleep(reconnectDelayMs);
  }
}

// ---------------------------------------------------------
// Event handler
// ---------------------------------------------------------

/**
 * Handle a single post event: fetch profile, evaluate, and output.
 */
async function handlePostEvent(
  event: AppBskyFeedPostCommitEvent,
  profileCache: ProfileCache,
  config: EvaluationConfig,
  outputOptions: OutputOptions,
  includeRejected: boolean,
): Promise<void> {
  const { did, time_us, commit } = event;
  const post = commit.record;

  try {
    // Fetch profile.
    const profile = await profileCache.getProfile(did);

    // Evaluate the post.
    const evaluation = evaluateCandidatePost(post, profile, config);

    // Output based on result.
    if (evaluation.accepted) {
      console.log(formatAcceptedPost(post, profile, evaluation, time_us, outputOptions));
    } else if (includeRejected) {
      console.log(formatRejectedPost(post, profile, evaluation, time_us, outputOptions));
    }
    // If rejected and not includeRejected, silently skip.

  } catch (error) {
    // Profile fetch failed - create rejection evaluation.
    if (outputOptions.debug) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Profile fetch failed for ${did}: ${errorMsg}`);
    }

    if (includeRejected) {
      const rejection = createRejectedEvaluation(`Profile fetch failed: ${did}`);
      const dummyProfile = { did, handle: 'unknown' };
      console.log(formatRejectedPost(post, dummyProfile, rejection, time_us, outputOptions));
    }
  }
}
