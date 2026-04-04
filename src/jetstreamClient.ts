import { Jetstream } from '@skyware/jetstream';
import { setTimeout as sleep } from 'node:timers/promises';

import type {
  JetstreamEvent,
  AppBskyFeedPostCommitEvent,
} from './type.js';

// Options for configuring the Jetstream client. Intentionally minimal.
export interface JetstreamClientOptions {
  wantedCollections?: string[];
  reconnectDelayMs?: number;
}

/**
 * Narrow a generic JetstreamEvent to an AppBskyFeedPostCommitEvent
 * (commit event for app.bsky.feed.post with a text record).
 */
function isAppBskyFeedPostCommitEvent(
    event: JetstreamEvent,
): event is AppBskyFeedPostCommitEvent {
    if (event.kind !== 'commit') return false;

    const commit = (event as AppBskyFeedPostCommitEvent).commit;

    return (
    !!commit &&
    commit.collection === 'app.bsky.feed.post' &&
    !!commit.record &&
    typeof commit.record.text === 'string'
    );
}

// Pretty-print a single post to the terminal.
function logPostToConsole(event: AppBskyFeedPostCommitEvent): void {
    const { did, time_us, commit } = event;
    const fullText = commit.record.text;
    const oneLine = fullText.replace(/\s+/g, ' ').trim();
    const truncated = oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;

    console.log('========================================');
    console.log('New post received:');
    console.log(` DID: ${did}`);
    console.log(` Text: ${truncated}`);
    console.log(` Cursor (time_us): ${time_us}`);
}

/**
 * Start a Jetstream subscription that logs new posts (app.bsky.feed.post)
 * to the terminal.
 *
 * Simple reconnect strategy:
 * - Create a Jetstream client inside a loop.
 * - If start() throws or the connection ends, wait a bit and reconnect.
 */
export async function startJetstreamPostListener(
    options: JetstreamClientOptions = {},
): Promise<void> {
    const {
    wantedCollections = ['app.bsky.feed.post'],
    reconnectDelayMs = 5000,
    } = options;

  // Simple reconnect loop. The process can be stopped with Ctrl+C.
  // eslint-disable-next-line no-constant-condition
    while (true) {
    const jetstream = new Jetstream({
        wantedCollections,
    });

    jetstream.on('error', (error) => {
        console.error('Jetstream error:', error);
    });

    // Listen to all commit events and filter by collection + record type.
    jetstream.on('commit', (rawEvent: unknown) => {
        const event = rawEvent as JetstreamEvent;

        if (!isAppBskyFeedPostCommitEvent(event)) return;

        logPostToConsole(event);
    });

    console.log('Connecting to Bluesky Jetstream (app.bsky.feed.post)...');

    try {
        await jetstream.start();
        console.warn(
        `Jetstream connection ended, reconnecting in ${reconnectDelayMs} ms...`,
        );
    } catch (error) {
        console.error(
        `Failed to start Jetstream client, reconnecting in ${reconnectDelayMs} ms...`, error,
        );
    }

    await sleep(reconnectDelayMs);
    }
}