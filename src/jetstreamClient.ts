import { Jetstream } from '@skyware/jetstream';
import { setTimeout as sleep } from 'node:timers/promises';

import { ProfileCache } from './profileCache.js';

import type {
JetstreamEvent,
AppBskyFeedPostCommitEvent,
ProfileView,
} from './type.js';

// Options for configuring the Jetstream client. Intentionally minimal.
export interface JetstreamClientOptions {
wantedCollections?: string[];
reconnectDelayMs?: number;
profileCacheTtlMs?: number;
}

/**
* Narrow a generic JetstreamEvent to an AppBskyFeedPostCommitEvent.
*
* Checks that the event is a commit for app.bsky.feed.post
* and that the record contains a text field.
*/
function isPostCommitEvent(
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

/**
* Pretty-print a single post event plus profile data to stdout.
*/
function logPostWithProfile(
event: AppBskyFeedPostCommitEvent,
profile: ProfileView,
): void {
const { did, time_us, commit } = event;
const oneLine = commit.record.text.replace(/\s+/g, ' ').trim();
const text = oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;

console.log('========================================');
console.log('New post received:');
console.log(` DID: ${did}`);
console.log(` Handle: ${profile.handle}`);
console.log(` DisplayName: ${profile.displayName ?? '(no display name)'}`);
console.log(` PostsCount: ${profile.postsCount ?? 'unknown'}`);
console.log(` Text: ${text}`);
console.log(` Cursor: ${time_us}`);
}

/**
* Pretty-print a single post event without profile data.
*/
function logPostWithoutProfile(event: AppBskyFeedPostCommitEvent): void {
const { did, time_us, commit } = event;
const oneLine = commit.record.text.replace(/\s+/g, ' ').trim();
const text = oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;

console.log('========================================');
console.log('New post received:');
console.log(` DID: ${did}`);
console.log(' Handle: (unavailable)');
console.log(' DisplayName: (unavailable)');
console.log(' PostsCount: unknown');
console.log(` Text: ${text}`);
console.log(` Cursor: ${time_us}`);
}

/**
* Start a Jetstream subscription that logs new posts to the terminal
* and enriches them with profile data from AppView.
*/
export async function startJetstreamPostListener(
options: JetstreamClientOptions = {},
): Promise<void> {
const {
wantedCollections = ['app.bsky.feed.post'],
reconnectDelayMs = 5000,
profileCacheTtlMs = 5 * 60 * 1000,
} = options;

const profileCache = new ProfileCache({
ttlMs: profileCacheTtlMs,
});

// eslint-disable-next-line no-constant-condition
while (true) {
const jetstream = new Jetstream({
wantedCollections,
});

jetstream.on('error', (error) => {
console.error('Jetstream error:', error);
});

jetstream.on('commit', (rawEvent: unknown) => {
const event = rawEvent as JetstreamEvent;

if (!isPostCommitEvent(event)) return;

void handlePostEvent(event, profileCache);
});

console.log('Connecting to Bluesky Jetstream (app.bsky.feed.post)...');

try {
await jetstream.start();
console.warn(
`Jetstream connection ended. Reconnecting in ${reconnectDelayMs} ms...`,
);
} catch (error) {
console.error(
`Failed to start Jetstream client. Reconnecting in ${reconnectDelayMs} ms...`,
error,
);
}

await sleep(reconnectDelayMs);
}
}

/**
* Handle a single post event and enrich it with profile data.
*/
async function handlePostEvent(
event: AppBskyFeedPostCommitEvent,
profileCache: ProfileCache,
): Promise<void> {
try {
const profile = await profileCache.getProfile(event.did);
logPostWithProfile(event, profile);
} catch (error) {
console.error(`Failed to load profile for DID "${event.did}":`, error);
logPostWithoutProfile(event);
}
}