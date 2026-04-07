// Filters for eurosky.social newcomer detection.
// All heuristics are best-effort and prefer false negatives over false positives.

import type {
  ProfileView,
  MembershipResult,
  NewcomerResult,
  HumanResult,
  Confidence,
  EvaluationConfig,
} from './type.js';

// ---------------------------------------------------------
// Default configuration
// ---------------------------------------------------------

export const defaultEvaluationConfig: EvaluationConfig = {
  targetDomain: 'eurosky.social',
  maxAccountAgeDays: 7,
  minMembershipConfidence: 'high',

  botKeywords: [
    'bot',
    '[bot]',
    'automated',
    'automation',
    'mirror',
    'feed',
    'aggregator',
    'news aggregator',
    'rss',
    'crosspost',
  ],

  botLabelValues: ['bot', 'automation'],

  spamPatterns: [
    'giveaway',
    'airdrop',
    'free crypto',
    'click here',
    'buy now',
    'limited offer',
    'act now',
    'dm me',
    'check bio',
    'link in bio',
    'follow for follow',
    'f4f',
    'promo code',
    'discount code',
    'earn money',
    'make money online',
    'work from home',
    'passive income',
  ],

  maxLinksBeforeSpam: 3,
  maxHashtagsBeforeSpam: 5,

  safetyBlocklist: [],

  allowDids: [],
  allowHandles: [],
  blockDids: [],
  blockHandles: [],

  allowedLanguages: [],
  requireLanguageTag: false,

  minMeaningfulTextChars: 3,
  minWordCount: 1,
  minQuoteCommentaryChars: 0,
  lowEffortPatterns: [
    '^\\.$',
    '^\\.{2,}$',
    '^\\?+$',
    '^!+$',
    '^lol$',
    '^lmao$',
    '^same$',
    '^this$',
    '^mood$',
    '^fr$',
    '^real$',
    '^facts$',
    '^💀$',
    '^😂$',
  ],

  includeReplies: false,
  includeQuotePosts: true,
};

// ---------------------------------------------------------
// Eurosky membership detection
// ---------------------------------------------------------

/**
 * Check if an account belongs to the target domain (e.g., eurosky.social).
 *
 * Uses the handle suffix as the primary signal. This is reliable for current
 * membership but cannot detect past or future membership changes.
 */
export function isEuroskyAccount(
  profile: ProfileView,
  config: EvaluationConfig = defaultEvaluationConfig,
): MembershipResult {
  const handle = profile.handle.toLowerCase();
  const targetSuffix = `.${config.targetDomain.toLowerCase()}`;

  const isMember = handle.endsWith(targetSuffix);

  // Handle could also be exactly the domain (e.g., admin account).
  const isExactMatch = handle === config.targetDomain.toLowerCase();

  const matchedDomain = isMember || isExactMatch ? config.targetDomain : null;

  const reasons: string[] = [];
  let confidence: Confidence;

  if (isMember || isExactMatch) {
    confidence = 'high';
    reasons.push(`Handle ends with .${config.targetDomain}`);
  } else {
    confidence = 'high'; // High confidence they are NOT a member.
    reasons.push(`Handle does not match ${config.targetDomain}`);
  }

  return {
    isMember: isMember || isExactMatch,
    confidence,
    reasons,
    signals: {
      handle: profile.handle,
      matchedDomain,
    },
  };
}

// ---------------------------------------------------------
// Newcomer detection (new on eurosky.social)
// ---------------------------------------------------------

/**
 * Check if an account is new on the target domain.
 *
 * IMPORTANT LIMITATION: ATProto does not expose PDS migration history.
 * We use the global createdAt/indexedAt as a proxy. This means:
 * - Accounts created directly on eurosky.social are detected correctly.
 * - Accounts that migrated from another PDS appear with their original creation date,
 *   so recent migrants may be incorrectly classified as "not new".
 *
 * The heuristic is conservative: we prefer missing some newcomers over
 * incorrectly labeling established accounts as new.
 */
export function isNewOnEurosky(
  profile: ProfileView,
  config: EvaluationConfig = defaultEvaluationConfig,
  now: Date = new Date(),
): NewcomerResult {
  const reasons: string[] = [];
  const ageDays = getAccountAgeDays(profile, now);
  const joinedAt = profile.createdAt ?? profile.indexedAt ?? null;

  // No age signal available - be conservative.
  if (ageDays === undefined) {
    return {
      isNew: false,
      joinedAt,
      accountAgeDays: null,
      confidence: 'low',
      reasons: ['No creation date available; cannot determine account age'],
    };
  }

  const isNew = ageDays <= config.maxAccountAgeDays;

  if (isNew) {
    reasons.push(`Account is ${ageDays.toFixed(1)} days old (threshold: ${config.maxAccountAgeDays})`);
  } else {
    reasons.push(`Account is ${ageDays.toFixed(1)} days old, exceeds ${config.maxAccountAgeDays} day threshold`);
  }

  // Confidence is medium because we can't distinguish native accounts from migrants.
  // Only accounts created directly on eurosky.social have accurate creation dates.
  const confidence: Confidence = isNew ? 'medium' : 'high';

  if (isNew) {
    reasons.push('Note: Migration history not available; date reflects global account creation');
  }

  return {
    isNew,
    joinedAt,
    accountAgeDays: ageDays,
    confidence,
    reasons,
  };
}

// ---------------------------------------------------------
// Human likelihood evaluation
// ---------------------------------------------------------

/**
 * Evaluate whether an account appears to be human-operated.
 *
 * Checks for:
 * - Bot labels (self-declared or from labelers)
 * - Bot-indicating keywords in profile text
 * - Bridge/crosspost account patterns
 * - Profile completeness as a soft signal
 */
export function evaluateHumanLikelihood(
  profile: ProfileView,
  config: EvaluationConfig = defaultEvaluationConfig,
): HumanResult {
  const reasons: string[] = [];
  const botLabels: string[] = [];
  const botKeywords: string[] = [];
  let score = 1.0;

  // Check for bot labels.
  if (profile.labels && profile.labels.length > 0) {
    for (const label of profile.labels) {
      const value = label.val.toLowerCase();
      for (const botValue of config.botLabelValues) {
        if (value === botValue.toLowerCase()) {
          botLabels.push(label.val);
          score -= 0.5;
          reasons.push(`Bot label detected: ${label.val}`);
        }
      }
    }
  }

  // Check for bot keywords in profile text.
  const textParts: string[] = [];
  if (profile.displayName) textParts.push(profile.displayName);
  if (profile.description) textParts.push(profile.description);
  textParts.push(profile.handle);

  const combinedText = textParts.join(' ').toLowerCase();

  for (const keyword of config.botKeywords) {
    const normalizedKeyword = keyword.toLowerCase();
    if (combinedText.includes(normalizedKeyword)) {
      botKeywords.push(keyword);
      score -= 0.3;
      reasons.push(`Bot keyword in profile: "${keyword}"`);
    }
  }

  // Check for bridge account patterns.
  const bridgeSuffixes = ['.ap.brid.gy', '.bsky.brid.gy', '.brid.gy'];
  const handle = profile.handle.toLowerCase();
  for (const suffix of bridgeSuffixes) {
    if (handle.endsWith(suffix)) {
      score -= 0.4;
      reasons.push(`Bridge account detected: ${suffix}`);
    }
  }

  // Profile completeness as a soft positive signal.
  let completeness = 0;
  if (profile.displayName && profile.displayName.trim().length > 0) completeness += 0.5;
  if (profile.description && profile.description.trim().length > 10) completeness += 0.5;

  if (completeness === 1.0) {
    score += 0.1;
    reasons.push('Profile is complete (has display name and description)');
  } else if (completeness === 0) {
    score -= 0.1;
    reasons.push('Profile is incomplete (missing display name and description)');
  }

  // Clamp score to [0, 1].
  score = Math.max(0, Math.min(1, score));

  const isHumanLikely = score >= 0.5 && botLabels.length === 0;

  if (isHumanLikely && reasons.length === 0) {
    reasons.push('No bot indicators found');
  }

  return {
    isHumanLikely,
    score,
    reasons,
    signals: {
      botLabels,
      botKeywords,
      profileCompleteness: completeness,
    },
  };
}

// ---------------------------------------------------------
// Helper functions
// ---------------------------------------------------------

/**
 * Compute account age in days from createdAt or indexedAt.
 * Returns undefined if no date is available.
 */
export function getAccountAgeDays(
  profile: ProfileView,
  now: Date = new Date(),
): number | undefined {
  const created = parseIsoDate(profile.createdAt);
  const indexed = parseIsoDate(profile.indexedAt);

  // Prefer createdAt over indexedAt.
  const referenceDate = created ?? indexed;
  if (!referenceDate) {
    return undefined;
  }

  const diffMs = now.getTime() - referenceDate.getTime();
  if (diffMs < 0) {
    // Future date (clock skew?) - treat as 0 days old.
    return 0;
  }

  return diffMs / (1000 * 60 * 60 * 24);
}

/**
 * Parse an ISO date string to a Date, returning undefined on failure.
 */
export function parseIsoDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}
