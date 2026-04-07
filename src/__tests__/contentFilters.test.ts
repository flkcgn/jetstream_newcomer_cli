// Unit tests for contentFilters.ts

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  evaluateSpamLikelihood,
  evaluateSafety,
  evaluateLanguage,
  evaluateEngagement,
  isReply,
  isQuotePost,
} from '../contentFilters.js';

import { defaultEvaluationConfig } from '../filters.js';

import type { AppBskyFeedPostRecord, EvaluationConfig, Facet } from '../type.js';

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

// ---------------------------------------------------------
// evaluateLanguage tests
// ---------------------------------------------------------

describe('evaluateLanguage', () => {
  it('should allow matching languages with default config', () => {
    const post = createPost({ langs: ['de', 'en'] });
    const result = evaluateLanguage(post);

    assert.strictEqual(result.isAllowed, true);
    assert.ok(result.signals.matchedLanguages.length > 0);
  });

  it('should allow any language when no restrictions configured', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      allowedLanguages: [],
    };
    const post = createPost({ langs: ['zh', 'ja'] });
    const result = evaluateLanguage(post, config);

    assert.strictEqual(result.isAllowed, true);
    assert.ok(result.reasons.some(r => r.includes('No language restrictions')));
  });

  it('should allow matching languages', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      allowedLanguages: ['de', 'en'],
    };
    const post = createPost({ langs: ['de'] });
    const result = evaluateLanguage(post, config);

    assert.strictEqual(result.isAllowed, true);
    assert.deepStrictEqual(result.signals.matchedLanguages, ['de']);
  });

  it('should reject non-matching languages', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      allowedLanguages: ['de', 'en'],
    };
    const post = createPost({ langs: ['ja'] });
    const result = evaluateLanguage(post, config);

    assert.strictEqual(result.isAllowed, false);
    assert.ok(result.reasons.some(r => r.includes('do not match')));
  });

  it('should normalize language tags (de-DE -> de)', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      allowedLanguages: ['de'],
    };
    const post = createPost({ langs: ['de-DE'] });
    const result = evaluateLanguage(post, config);

    assert.strictEqual(result.isAllowed, true);
    assert.deepStrictEqual(result.signals.normalizedLanguages, ['de']);
  });

  it('should allow posts without language tags when not required', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      allowedLanguages: ['de'],
      requireLanguageTag: false,
    };
    const post = createPost();
    const result = evaluateLanguage(post, config);

    assert.strictEqual(result.isAllowed, true);
  });

  it('should reject posts without language tags when required', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      allowedLanguages: ['de'],
      requireLanguageTag: true,
    };
    const post = createPost();
    const result = evaluateLanguage(post, config);

    assert.strictEqual(result.isAllowed, false);
    assert.ok(result.reasons.some(r => r.includes('no language tags')));
  });

  it('should normalize bnl to nl (BNL/NL compatibility)', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      allowedLanguages: ['bnl'],
    };
    const post = createPost({ langs: ['nl'] });
    const result = evaluateLanguage(post, config);

    assert.strictEqual(result.isAllowed, true);
    assert.deepStrictEqual(result.signals.normalizedLanguages, ['nl']);
  });

  it('should match post tagged bnl against allowed nl', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      allowedLanguages: ['nl'],
    };
    const post = createPost({ langs: ['bnl'] });
    const result = evaluateLanguage(post, config);

    assert.strictEqual(result.isAllowed, true);
    assert.deepStrictEqual(result.signals.normalizedLanguages, ['nl']);
  });

  it('should use default allowed languages from config', () => {
    const post = createPost({ langs: ['de'] });
    const result = evaluateLanguage(post, defaultEvaluationConfig);

    assert.strictEqual(result.isAllowed, true);
    assert.ok(result.signals.matchedLanguages.includes('de'));
  });

  it('should reject disallowed language with default config', () => {
    const post = createPost({ langs: ['ja'] });
    const result = evaluateLanguage(post, defaultEvaluationConfig);

    assert.strictEqual(result.isAllowed, false);
  });
});

// ---------------------------------------------------------
// evaluateEngagement tests
// ---------------------------------------------------------

describe('evaluateEngagement', () => {
  it('should accept substantial post', () => {
    const post = createPost({
      text: 'Hello everyone! I just joined eurosky and I am very excited to be here.',
    });
    const result = evaluateEngagement(post);

    assert.strictEqual(result.isEngagementLikely, true);
    assert.ok(result.score >= 0.5);
  });

  it('should reject extremely short posts', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      minMeaningfulTextChars: 10,
    };
    const post = createPost({ text: 'hi' });
    const result = evaluateEngagement(post, config);

    assert.strictEqual(result.isEngagementLikely, false);
    assert.ok(result.reasons.some(r => r.includes('Too few meaningful characters')));
  });

  it('should detect low-effort patterns', () => {
    const post = createPost({ text: 'lol' });
    const result = evaluateEngagement(post);

    assert.ok(result.signals.lowEffortMatches.length > 0);
    assert.ok(result.score < 1.0);
  });

  it('should track quote post status', () => {
    const post = createPost({
      text: 'Interesting perspective',
      embed: {
        $type: 'app.bsky.embed.record',
        record: { uri: 'at://did:plc:123/post/abc', cid: 'cid123' },
      },
    });
    const result = evaluateEngagement(post);

    assert.strictEqual(result.signals.isQuotePost, true);
  });

  it('should reject quote post with too little commentary', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      minQuoteCommentaryChars: 20,
    };
    const post = createPost({
      text: 'wow',
      embed: {
        $type: 'app.bsky.embed.record',
        record: { uri: 'at://did:plc:123/post/abc', cid: 'cid123' },
      },
    });
    const result = evaluateEngagement(post, config);

    assert.ok(result.reasons.some(r => r.includes('Quote post has too little commentary')));
  });

  it('should count meaningful characters correctly', () => {
    const post = createPost({ text: 'Hello World! 123' });
    const result = evaluateEngagement(post);

    assert.ok(result.signals.meaningfulChars > 0);
    assert.ok(result.signals.wordCount >= 2);
  });
});
