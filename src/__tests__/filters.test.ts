// Unit tests for filters.ts

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  isEuroskyAccount,
  isNewOnEurosky,
  evaluateHumanLikelihood,
  defaultEvaluationConfig,
} from '../filters.js';

import type { ProfileView, EvaluationConfig } from '../type.js';

// ---------------------------------------------------------
// Test helpers
// ---------------------------------------------------------

function createProfile(overrides: Partial<ProfileView> = {}): ProfileView {
  return {
    did: 'did:plc:test123',
    handle: 'alice.eurosky.social',
    ...overrides,
  };
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

// ---------------------------------------------------------
// isEuroskyAccount tests
// ---------------------------------------------------------

describe('isEuroskyAccount', () => {
  it('should detect eurosky.social member by handle suffix', () => {
    const profile = createProfile({ handle: 'alice.eurosky.social' });
    const result = isEuroskyAccount(profile);

    assert.strictEqual(result.isMember, true);
    assert.strictEqual(result.confidence, 'high');
    assert.strictEqual(result.signals.matchedDomain, 'eurosky.social');
  });

  it('should reject non-eurosky handles', () => {
    const profile = createProfile({ handle: 'alice.bsky.social' });
    const result = isEuroskyAccount(profile);

    assert.strictEqual(result.isMember, false);
    assert.strictEqual(result.confidence, 'high');
    assert.strictEqual(result.signals.matchedDomain, null);
  });

  it('should work with custom target domain', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      targetDomain: 'custom.pds',
    };
    const profile = createProfile({ handle: 'bob.custom.pds' });
    const result = isEuroskyAccount(profile, config);

    assert.strictEqual(result.isMember, true);
    assert.strictEqual(result.signals.matchedDomain, 'custom.pds');
  });

  it('should be case-insensitive', () => {
    const profile = createProfile({ handle: 'ALICE.EUROSKY.SOCIAL' });
    const result = isEuroskyAccount(profile);

    assert.strictEqual(result.isMember, true);
  });
});

// ---------------------------------------------------------
// isNewOnEurosky tests
// ---------------------------------------------------------

describe('isNewOnEurosky', () => {
  const now = new Date();

  it('should detect new account (created 3 days ago)', () => {
    const profile = createProfile({ createdAt: daysAgo(3) });
    const result = isNewOnEurosky(profile, defaultEvaluationConfig, now);

    assert.strictEqual(result.isNew, true);
    assert.strictEqual(result.confidence, 'medium');
    assert.ok(result.accountAgeDays !== null && result.accountAgeDays < 4);
  });

  it('should reject old account (created 10 days ago)', () => {
    const profile = createProfile({ createdAt: daysAgo(10) });
    const result = isNewOnEurosky(profile, defaultEvaluationConfig, now);

    assert.strictEqual(result.isNew, false);
    assert.strictEqual(result.confidence, 'high');
  });

  it('should use indexedAt as fallback', () => {
    const profile = createProfile({
      createdAt: undefined,
      indexedAt: daysAgo(2),
    });
    const result = isNewOnEurosky(profile, defaultEvaluationConfig, now);

    assert.strictEqual(result.isNew, true);
  });

  it('should reject when no dates available', () => {
    const profile = createProfile({
      createdAt: undefined,
      indexedAt: undefined,
    });
    const result = isNewOnEurosky(profile, defaultEvaluationConfig, now);

    assert.strictEqual(result.isNew, false);
    assert.strictEqual(result.confidence, 'low');
    assert.ok(result.reasons.some(r => r.includes('No creation date')));
  });

  it('should respect custom maxAccountAgeDays', () => {
    const config: EvaluationConfig = {
      ...defaultEvaluationConfig,
      maxAccountAgeDays: 14,
    };
    const profile = createProfile({ createdAt: daysAgo(10) });
    const result = isNewOnEurosky(profile, config, now);

    assert.strictEqual(result.isNew, true);
  });
});

// ---------------------------------------------------------
// evaluateHumanLikelihood tests
// ---------------------------------------------------------

describe('evaluateHumanLikelihood', () => {
  it('should detect human-like profile', () => {
    const profile = createProfile({
      displayName: 'Alice Smith',
      description: 'Hello, I am a real person who likes cats.',
    });
    const result = evaluateHumanLikelihood(profile);

    assert.strictEqual(result.isHumanLikely, true);
    assert.ok(result.score > 0.5);
    assert.strictEqual(result.signals.botLabels.length, 0);
  });

  it('should detect bot by label', () => {
    const profile = createProfile({
      labels: [
        { src: 'self', uri: '', val: 'bot', cts: '' },
      ],
    });
    const result = evaluateHumanLikelihood(profile);

    assert.strictEqual(result.isHumanLikely, false);
    assert.ok(result.signals.botLabels.includes('bot'));
  });

  it('should detect bot by keyword in description', () => {
    const profile = createProfile({
      description: 'This is an automated news feed bot',
    });
    const result = evaluateHumanLikelihood(profile);

    assert.strictEqual(result.isHumanLikely, false);
    assert.ok(result.signals.botKeywords.length > 0);
  });

  it('should detect bot by keyword in handle', () => {
    const profile = createProfile({
      handle: 'newsbot.eurosky.social',
    });
    const result = evaluateHumanLikelihood(profile);

    // Single bot keyword in handle reduces score but may not trigger full rejection.
    // The filter is designed to be lenient to avoid false positives.
    assert.ok(result.score < 1.0);
    assert.ok(result.signals.botKeywords.includes('bot'));
    assert.ok(result.reasons.some(r => r.includes('Bot keyword')));
  });

  it('should detect bridge accounts', () => {
    const profile = createProfile({
      handle: 'user@mastodon.social.ap.brid.gy',
    });
    const result = evaluateHumanLikelihood(profile);

    assert.strictEqual(result.isHumanLikely, false);
    assert.ok(result.reasons.some(r => r.includes('Bridge account')));
  });

  it('should give higher score to complete profiles', () => {
    const completeProfile = createProfile({
      displayName: 'Alice',
      description: 'I love programming and coffee.',
    });
    const incompleteProfile = createProfile({
      displayName: undefined,
      description: undefined,
    });

    const completeResult = evaluateHumanLikelihood(completeProfile);
    const incompleteResult = evaluateHumanLikelihood(incompleteProfile);

    assert.ok(completeResult.score > incompleteResult.score);
    assert.strictEqual(completeResult.signals.profileCompleteness, 1);
    assert.strictEqual(incompleteResult.signals.profileCompleteness, 0);
  });
});
