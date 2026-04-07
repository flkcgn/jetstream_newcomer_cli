// Unit tests for feedGenerator.ts

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';

import { FeedDatabase } from '../database.js';
import { createFeedGeneratorServer } from '../feedGenerator.js';
import type { FeedGeneratorConfig } from '../config.js';

const TEST_CONFIG: FeedGeneratorConfig = {
  hostname: 'feed.example.com',
  port: 0,
  listenHost: '127.0.0.1',
  serviceDid: 'did:web:feed.example.com',
  publisherDid: 'did:plc:publisher123',
  feedRecordName: 'eurosky-newcomers',
  feedDisplayName: 'Welcome Newcomers',
  feedDescription: 'Test feed',
  sqlitePath: ':memory:',
  maxPostAgeHours: 48,
  gcIntervalMinutes: 30,
};

const FEED_URI = `at://${TEST_CONFIG.publisherDid}/app.bsky.feed.generator/${TEST_CONFIG.feedRecordName}`;

let db: FeedDatabase;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  db = new FeedDatabase(':memory:');
  server = createFeedGeneratorServer({ config: TEST_CONFIG, db });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  db.close();
});

async function fetchJson(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`);
  const body = await res.json();
  return { status: res.status, body };
}

describe('Feed Generator HTTP Server', () => {
  describe('GET /', () => {
    it('should return health check', async () => {
      const { status, body } = await fetchJson('/');
      assert.strictEqual(status, 200);
      assert.strictEqual((body as Record<string, unknown>).name, 'eurosky-newcomer-feed');
      assert.strictEqual((body as Record<string, unknown>).indexedPosts, 0);
    });
  });

  describe('GET /.well-known/did.json', () => {
    it('should return DID document', async () => {
      const { status, body } = await fetchJson('/.well-known/did.json');
      assert.strictEqual(status, 200);
      const doc = body as Record<string, unknown>;
      assert.strictEqual(doc.id, 'did:web:feed.example.com');
      const services = doc.service as Array<Record<string, unknown>>;
      assert.strictEqual(services[0].id, '#bsky_fg');
      assert.strictEqual(services[0].type, 'BskyFeedGenerator');
      assert.strictEqual(services[0].serviceEndpoint, 'https://feed.example.com');
    });
  });

  describe('GET /xrpc/app.bsky.feed.describeFeedGenerator', () => {
    it('should describe the feed', async () => {
      const { status, body } = await fetchJson('/xrpc/app.bsky.feed.describeFeedGenerator');
      assert.strictEqual(status, 200);
      const desc = body as Record<string, unknown>;
      const feeds = desc.feeds as Array<Record<string, unknown>>;
      assert.strictEqual(feeds.length, 1);
      assert.strictEqual(feeds[0].uri, FEED_URI);
    });
  });

  describe('GET /xrpc/app.bsky.feed.getFeedSkeleton', () => {
    it('should return 400 if feed param is missing', async () => {
      const { status } = await fetchJson('/xrpc/app.bsky.feed.getFeedSkeleton');
      assert.strictEqual(status, 400);
    });

    it('should return 400 for unknown feed', async () => {
      const { status } = await fetchJson(
        '/xrpc/app.bsky.feed.getFeedSkeleton?feed=at://did:plc:unknown/app.bsky.feed.generator/nope',
      );
      assert.strictEqual(status, 400);
    });

    it('should return empty feed when no posts', async () => {
      const { status, body } = await fetchJson(
        `/xrpc/app.bsky.feed.getFeedSkeleton?feed=${encodeURIComponent(FEED_URI)}`,
      );
      assert.strictEqual(status, 200);
      const skel = body as Record<string, unknown>;
      assert.deepStrictEqual(skel.feed, []);
    });

    it('should return posts as skeleton', async () => {
      db.addPost({ uri: 'at://did:plc:a/app.bsky.feed.post/1', did: 'did:plc:a', indexedAt: 2000, score: 0.8 });
      db.addPost({ uri: 'at://did:plc:a/app.bsky.feed.post/2', did: 'did:plc:a', indexedAt: 3000, score: 0.9 });

      const { status, body } = await fetchJson(
        `/xrpc/app.bsky.feed.getFeedSkeleton?feed=${encodeURIComponent(FEED_URI)}`,
      );
      assert.strictEqual(status, 200);
      const skel = body as { feed: Array<{ post: string }>; cursor?: string };
      assert.strictEqual(skel.feed.length, 2);
      assert.strictEqual(skel.feed[0].post, 'at://did:plc:a/app.bsky.feed.post/2');
      assert.strictEqual(skel.feed[1].post, 'at://did:plc:a/app.bsky.feed.post/1');
    });

    it('should support cursor-based pagination', async () => {
      for (let i = 1; i <= 5; i++) {
        db.addPost({
          uri: `at://did:plc:a/app.bsky.feed.post/${i}`,
          did: 'did:plc:a',
          indexedAt: i * 1000,
          score: 0.5,
        });
      }

      const page1 = await fetchJson(
        `/xrpc/app.bsky.feed.getFeedSkeleton?feed=${encodeURIComponent(FEED_URI)}&limit=2`,
      );
      assert.strictEqual(page1.status, 200);
      const skel1 = page1.body as { feed: Array<{ post: string }>; cursor?: string };
      assert.strictEqual(skel1.feed.length, 2);
      assert.ok(skel1.cursor);

      const page2 = await fetchJson(
        `/xrpc/app.bsky.feed.getFeedSkeleton?feed=${encodeURIComponent(FEED_URI)}&limit=2&cursor=${skel1.cursor}`,
      );
      const skel2 = page2.body as { feed: Array<{ post: string }>; cursor?: string };
      assert.strictEqual(skel2.feed.length, 2);
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const { status } = await fetchJson('/xrpc/some.unknown.method');
      assert.strictEqual(status, 404);
    });
  });
});
