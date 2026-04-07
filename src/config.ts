// Feed generator configuration loaded from environment variables.
// Provides defaults suitable for local development.

export interface FeedGeneratorConfig {
  // Network / hosting
  hostname: string;
  port: number;
  listenHost: string;

  // Identity
  serviceDid: string;
  publisherDid: string;

  // Feed metadata
  feedRecordName: string;
  feedDisplayName: string;
  feedDescription: string;

  // Database
  sqlitePath: string;

  // Garbage collection: max age of indexed posts in hours.
  maxPostAgeHours: number;
  gcIntervalMinutes: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): FeedGeneratorConfig {
  const hostname = env.FEEDGEN_HOSTNAME ?? 'localhost';
  const port = parseInt(env.FEEDGEN_PORT ?? '3000', 10);
  const listenHost = env.FEEDGEN_LISTEN_HOST ?? '0.0.0.0';

  const serviceDid = env.FEEDGEN_SERVICE_DID ?? `did:web:${hostname}`;
  const publisherDid = env.FEEDGEN_PUBLISHER_DID ?? '';

  const feedRecordName = env.FEEDGEN_FEED_RECORD_NAME ?? 'eurosky-newcomers';
  const feedDisplayName = env.FEEDGEN_FEED_DISPLAY_NAME ?? 'Welcome Newcomers (eurosky.social)';
  const feedDescription =
    env.FEEDGEN_FEED_DESCRIPTION ??
    'Posts from newcomers on eurosky.social — new accounts, real humans, no spam.';

  const sqlitePath = env.FEEDGEN_SQLITE_PATH ?? 'feed.db';

  const maxPostAgeHours = parseInt(env.FEEDGEN_MAX_POST_AGE_HOURS ?? '48', 10);
  const gcIntervalMinutes = parseInt(env.FEEDGEN_GC_INTERVAL_MINUTES ?? '30', 10);

  return {
    hostname,
    port,
    listenHost,
    serviceDid,
    publisherDid,
    feedRecordName,
    feedDisplayName,
    feedDescription,
    sqlitePath,
    maxPostAgeHours: isNaN(maxPostAgeHours) ? 48 : maxPostAgeHours,
    gcIntervalMinutes: isNaN(gcIntervalMinutes) ? 30 : gcIntervalMinutes,
  };
}
