// Unit tests for contentFilters.ts

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  evaluateSpamLikelihood,
  evaluateSafety,
  isReply,
  isQuotePost,
} from '../contentFilters.js';

import type { AppBskyFeedPostRecord, Facet } from '../type.js';

// ---------------------------------------------------------
// Test helpers
// ---------------------------------------------------------

function createPost(overrides: Partial<AppBskyFeedPostRecord> = {}): AppBskyFeedPostRecord {
  return {
    $type: 'app.bsky.feed.post',
    text: 'Hello, this is a normal post!',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createFacets(links: number, mentions: number, hashtags: number): Facet[] {
  const facets: Facet[] = [];

  for (let i = 0; i < links; i++) {
    facets.push({
      index: { byteStart: 0, byteEnd: 10 },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: `https://example${i}.com` }],
    });
  }

  for (let i = 0; i < mentions; i++) {
    facets.push({
      index: { byteStart: 0, byteEnd: 10 },
      features: [{ $type: 'app.bsky.richtext.facet#mention', did: `did:plc:test${i}` }],
    });
  }

  for (let i = 0; i < hashtags; i++) {
    facets.push({
      index: { byteStart: 0, byteEnd: 10 },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: `tag${i}` }],
    });
  }

  return facets;
}

// ---------------------------------------------------------
// evaluateSpamLikelihood tests
// ---------------------------------------------------------

describe('evaluateSpamLikelihood', () => {
  it('should accept normal post', () => {
    const post = createPost({
      text: 'Just had a great coffee this morning!',
    });
    const result = evaluateSpamLikelihood(post);

    assert.strictEqual(result.isSpamLikely, false);
    assert.ok(result.score < 0.5);
  });

  it('should detect excessive links', () => {
    const post = createPost({
      text: 'Check out all these links!',
      facets: createFacets(5, 0, 0),
    });
    const result = evaluateSpamLikelihood(post);

    // 5 links exceeds threshold (3), increases spam score.
    assert.strictEqual(result.signals.linkCount, 5);
    assert.ok(result.score > 0);
    assert.ok(result.reasons.some(r => r.includes('Excessive links')));
  });

  it('should detect excessive hashtags', () => {
    const post = createPost({
      text: '#tag1 #tag2 #tag3 #tag4 #tag5 #tag6 #tag7',
      facets: createFacets(0, 0, 7),
    });
    const result = evaluateSpamLikelihood(post);

    assert.ok(result.score > 0);
    assert.strictEqual(result.signals.hashtagCount, 7);
  });

  it('should detect spam patterns', () => {
    const post = createPost({
      text: 'FREE GIVEAWAY! Click here to win crypto airdrop! DM me for promo code!',
    });
    const result = evaluateSpamLikelihood(post);

    // Multiple spam patterns should increase score significantly.
    assert.ok(result.score > 0);
    assert.ok(result.signals.matchedPatterns.length > 0);
    assert.ok(result.reasons.some(r => r.includes('Spam pattern')));
  });

  it('should detect crypto patterns', () => {
    const post = createPost({
      text: 'Buy $MOON token now! 0x1234567890abcdef1234567890',
    });
    const result = evaluateSpamLikelihood(post);

    assert.ok(result.score > 0);
    assert.ok(result.reasons.some(r => r.includes('Crypto')));
  });

  it('should detect ALL CAPS spam', () => {
    const post = createPost({
      text: 'THIS IS AN AMAZING OPPORTUNITY YOU CANNOT MISS OUT ON THIS INCREDIBLE DEAL RIGHT NOW',
    });
    const result = evaluateSpamLikelihood(post);

    assert.ok(result.score > 0);
    assert.ok(result.reasons.some(r => r.includes('uppercase')));
  });
});

// ---------------------------------------------------------
// evaluateSafety tests
// ---------------------------------------------------------

describe('evaluateSafety', () => {
  it('should accept safe post', () => {
    const post = createPost({
      text: 'I love spending time with my family on weekends.',
    });
    const result = evaluateSafety(post);

    assert.strictEqual(result.isBlocked, false);
    assert.strictEqual(result.score, 0);
  });

  it('should detect potential threats', () => {
    const post = createPost({
      text: 'I hope you kkkiiilll yourself',
    });
    const result = evaluateSafety(post);

    assert.strictEqual(result.isBlocked, true);
    assert.ok(result.reasons.some(r => r.includes('harassment') || r.includes('threat')));
  });

  it('should note self-labels', () => {
    const post = createPost({
      text: 'Some sensitive content here',
      labels: {
        values: [{ val: 'nsfw' }],
      },
    });
    const result = evaluateSafety(post);

    assert.ok(result.score > 0);
    assert.ok(result.matchedRules.includes('self-label:nsfw'));
  });
});

// ---------------------------------------------------------
// isReply and isQuotePost tests
// ---------------------------------------------------------

describe('isReply', () => {
  it('should detect reply', () => {
    const post = createPost({
      reply: {
        root: { uri: 'at://did:plc:123/post/abc', cid: 'cid123' },
        parent: { uri: 'at://did:plc:123/post/abc', cid: 'cid123' },
      },
    });

    assert.strictEqual(isReply(post), true);
  });

  it('should detect non-reply', () => {
    const post = createPost();
    assert.strictEqual(isReply(post), false);
  });
});

describe('isQuotePost', () => {
  it('should detect quote post', () => {
    const post = createPost({
      embed: {
        $type: 'app.bsky.embed.record',
        record: { uri: 'at://did:plc:123/post/abc', cid: 'cid123' },
      },
    });

    assert.strictEqual(isQuotePost(post), true);
  });

  it('should detect non-quote post', () => {
    const post = createPost();
    assert.strictEqual(isQuotePost(post), false);
  });

  it('should detect image embed as non-quote', () => {
    const post = createPost({
      embed: {
        $type: 'app.bsky.embed.images',
        images: [],
      },
    });

    assert.strictEqual(isQuotePost(post), false);
  });
});
