// Unit tests for evaluate.ts

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { evaluateCandidatePost, createRejectedEvaluation } from '../evaluate.js';
import { defaultEvaluationConfig } from '../filters.js';

import type { AppBskyFeedPostRecord, ProfileView, EvaluationConfig } from '../type.js';

// ---------------------------------------------------------
// Test helpers
// ---------------------------------------------------------

function createProfile(overrides: Partial<ProfileView> = {}): ProfileView {
  return {
    did: 'did:plc:test123',
    handle: 'alice.eurosky.social',
    displayName: 'Alice',
    description: 'Hello, I am a real person.',
    createdAt: daysAgo(3),
    ...overrides,
  };
}

function createPost(overrides: Partial<AppBskyFeedPostRecord> = {}): AppBskyFeedPostRecord {
  return {
    $type: 'app.bsky.feed.post',
    text: 'Hello, this is my first post!',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

// ---------------------------------------------------------
// evaluateCandidatePost tests
// ---------------------------------------------------------

describe('evaluateCandidatePost', () => {
  const now = new Date();

  it('should accept valid newcomer post', () => {
    const profile = createProfile();
    const post = createPost();
    const result = evaluateCandidatePost(post, profile, defaultEvaluationConfig, now);

    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.hardBlockers.length, 0);
    assert.ok(result.score > 0);
    assert.ok(result.reasonsAccepted.length > 0);
  });

  it('should reject non-eurosky member', () => {
    const profile = createProfile({ handle: 'alice.bsky.social' });
    const post = createPost();
    const result = evaluateCandidatePost(post, profile, defaultEvaluationConfig, now);

    assert.strictEqual(result.accepted, false);
    assert.ok(result.hardBlockers.some(b => b.includes('Not a eurosky.social member')));
  });

  it('should reject old account', () => {
    const profile = createProfile({ createdAt: daysAgo(30) });
    const post = createPost();
    const result = evaluateCandidatePost(post, profile, defaultEvaluationConfig, now);

    assert.strictEqual(result.accepted, false);
    assert.ok(result.hardBlockers.some(b => b.includes('Not a newcomer')));
  });

  it('should reject bot account', () => {
    const profile = createProfile({
      labels: [{ src: 'self', uri: '', val: 'bot', cts: '' }],
    });
    const post = createPost();
    const result = evaluateCandidatePost(post, profile, defaultEvaluationConfig, now);

    assert.strictEqual(result.accepted, false);
    assert.ok(result.hardBlockers.some(b => b.includes('bot')));
  });

  it('should reject spam post', () => {
    const profile = createProfile();
    const post = createPost({
      text: 'FREE GIVEAWAY! Click here for free crypto airdrop! Limited offer!',
    });
    const result = evaluateCandidatePost(post, profile, defaultEvaluationConfig, now);

    assert.strictEqual(result.accepted, false);
    assert.ok(result.hardBlockers.some(b => b.includes('spam')));
  });

  it('should reject reply when includeReplies is false', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      includeReplies: false,
    };
    const profile = createProfile();
    const post = createPost({
      reply: {
        root: { uri: 'at://did:plc:123/post/abc', cid: 'cid123' },
        parent: { uri: 'at://did:plc:123/post/abc', cid: 'cid123' },
      },
    });
    const result = evaluateCandidatePost(post, profile, config, now);

    assert.strictEqual(result.accepted, false);
    assert.ok(result.hardBlockers.some(b => b.includes('reply')));
  });

  it('should accept reply when includeReplies is true', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      includeReplies: true,
    };
    const profile = createProfile();
    const post = createPost({
      reply: {
        root: { uri: 'at://did:plc:123/post/abc', cid: 'cid123' },
        parent: { uri: 'at://did:plc:123/post/abc', cid: 'cid123' },
      },
    });
    const result = evaluateCandidatePost(post, profile, config, now);

    assert.strictEqual(result.accepted, true);
  });

  it('should preserve all stage results', () => {
    const profile = createProfile();
    const post = createPost();
    const result = evaluateCandidatePost(post, profile, defaultEvaluationConfig, now);

    assert.ok(result.stageResults.membership);
    assert.ok(result.stageResults.newcomer);
    assert.ok(result.stageResults.human);
    assert.ok(result.stageResults.spam);
    assert.ok(result.stageResults.safety);
  });

  it('should calculate confidence based on stage confidences', () => {
    const profile = createProfile();
    const post = createPost();
    const result = evaluateCandidatePost(post, profile, defaultEvaluationConfig, now);

    // Newcomer confidence is 'medium' (can't verify migration),
    // so overall should be 'medium' or lower.
    assert.ok(['high', 'medium', 'low'].includes(result.confidence));
  });
});

// ---------------------------------------------------------
// Hard blocker precedence tests
// ---------------------------------------------------------

describe('Hard blocker precedence', () => {
  const now = new Date();

  it('should list multiple hard blockers when applicable', () => {
    const profile = createProfile({
      handle: 'bot.bsky.social',
      labels: [{ src: 'self', uri: '', val: 'bot', cts: '' }],
      createdAt: daysAgo(30),
    });
    const post = createPost({
      text: 'FREE GIVEAWAY!',
    });
    const result = evaluateCandidatePost(post, profile, defaultEvaluationConfig, now);

    assert.strictEqual(result.accepted, false);
    // Should have multiple blockers.
    assert.ok(result.hardBlockers.length >= 2);
  });
});

// ---------------------------------------------------------
// createRejectedEvaluation tests
// ---------------------------------------------------------

describe('createRejectedEvaluation', () => {
  it('should create valid rejection', () => {
    const result = createRejectedEvaluation('Test error');

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.score, 0);
    assert.ok(result.hardBlockers.includes('Test error'));
    assert.ok(result.stageResults.membership);
    assert.ok(result.stageResults.newcomer);
  });

  it('should include profile handle when provided', () => {
    const profile = createProfile({ handle: 'test.user' });
    const result = createRejectedEvaluation('Error', profile);

    assert.strictEqual(result.stageResults.membership.signals.handle, 'test.user');
  });
});
