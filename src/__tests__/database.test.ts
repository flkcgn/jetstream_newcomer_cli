// Unit tests for database.ts

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { FeedDatabase } from '../database.js';

const TEST_DB_PATH = ':memory:';

let db: FeedDatabase;

beforeEach(() => {
  db = new FeedDatabase(TEST_DB_PATH);
});

afterEach(() => {
  db.close();
});

describe('FeedDatabase', () => {
  it('should start with zero posts', () => {
    assert.strictEqual(db.count(), 0);
  });

  it('should add and retrieve posts', () => {
    db.addPost({
      uri: 'at://did:plc:abc/app.bsky.feed.post/1',
      did: 'did:plc:abc',
      indexedAt: 1000,
      score: 0.8,
    });

    assert.strictEqual(db.count(), 1);

    const result = db.getFeedSkeleton(10);
    assert.strictEqual(result.posts.length, 1);
    assert.strictEqual(result.posts[0].uri, 'at://did:plc:abc/app.bsky.feed.post/1');
  });

  it('should ignore duplicate URIs', () => {
    const post = {
      uri: 'at://did:plc:abc/app.bsky.feed.post/1',
      did: 'did:plc:abc',
      indexedAt: 1000,
      score: 0.8,
    };
    db.addPost(post);
    db.addPost(post);

    assert.strictEqual(db.count(), 1);
  });

  it('should remove posts', () => {
    db.addPost({
      uri: 'at://did:plc:abc/app.bsky.feed.post/1',
      did: 'did:plc:abc',
      indexedAt: 1000,
      score: 0.8,
    });

    db.removePost('at://did:plc:abc/app.bsky.feed.post/1');
    assert.strictEqual(db.count(), 0);
  });

  it('should return posts ordered by indexedAt descending', () => {
    db.addPost({ uri: 'at://did:plc:abc/app.bsky.feed.post/1', did: 'did:plc:abc', indexedAt: 100, score: 0.5 });
    db.addPost({ uri: 'at://did:plc:abc/app.bsky.feed.post/2', did: 'did:plc:abc', indexedAt: 300, score: 0.7 });
    db.addPost({ uri: 'at://did:plc:abc/app.bsky.feed.post/3', did: 'did:plc:abc', indexedAt: 200, score: 0.6 });

    const result = db.getFeedSkeleton(10);
    assert.strictEqual(result.posts.length, 3);
    assert.strictEqual(result.posts[0].indexedAt, 300);
    assert.strictEqual(result.posts[1].indexedAt, 200);
    assert.strictEqual(result.posts[2].indexedAt, 100);
  });

  it('should paginate with cursor', () => {
    for (let i = 1; i <= 5; i++) {
      db.addPost({
        uri: `at://did:plc:abc/app.bsky.feed.post/${i}`,
        did: 'did:plc:abc',
        indexedAt: i * 100,
        score: 0.5,
      });
    }

    const page1 = db.getFeedSkeleton(2);
    assert.strictEqual(page1.posts.length, 2);
    assert.strictEqual(page1.posts[0].indexedAt, 500);
    assert.strictEqual(page1.posts[1].indexedAt, 400);
    assert.ok(page1.cursor);

    const page2 = db.getFeedSkeleton(2, page1.cursor);
    assert.strictEqual(page2.posts.length, 2);
    assert.strictEqual(page2.posts[0].indexedAt, 300);
    assert.strictEqual(page2.posts[1].indexedAt, 200);
    assert.ok(page2.cursor);

    const page3 = db.getFeedSkeleton(2, page2.cursor);
    assert.strictEqual(page3.posts.length, 1);
    assert.strictEqual(page3.posts[0].indexedAt, 100);
    assert.strictEqual(page3.cursor, undefined);
  });

  it('should garbage collect old posts', () => {
    const now = Date.now();
    db.addPost({ uri: 'at://d/p/old', did: 'd', indexedAt: now - 49 * 60 * 60 * 1000, score: 0.5 });
    db.addPost({ uri: 'at://d/p/new', did: 'd', indexedAt: now, score: 0.5 });

    const removed = db.garbageCollect(48);
    assert.strictEqual(removed, 1);
    assert.strictEqual(db.count(), 1);
  });

  it('should limit results to 100 max', () => {
    for (let i = 0; i < 150; i++) {
      db.addPost({
        uri: `at://d/p/${i}`,
        did: 'd',
        indexedAt: i,
        score: 0.5,
      });
    }

    const result = db.getFeedSkeleton(200);
    assert.strictEqual(result.posts.length, 100);
  });

  it('should handle invalid cursor gracefully', () => {
    db.addPost({ uri: 'at://d/p/1', did: 'd', indexedAt: 1000, score: 0.5 });

    const result = db.getFeedSkeleton(10, 'invalid');
    assert.strictEqual(result.posts.length, 0);
  });
});
