// Central evaluation function for candidate posts.
// Combines all filter stages and produces a final decision with scoring.

import type {
  AppBskyFeedPostRecord,
  ProfileView,
  CandidateEvaluation,
  EvaluationConfig,
  Confidence,
} from './type.js';

import {
  isEuroskyAccount,
  isNewOnEurosky,
  evaluateHumanLikelihood,
  defaultEvaluationConfig,
} from './filters.js';

import {
  evaluateSpamLikelihood,
  evaluateSafety,
  evaluateLanguage,
  evaluateEngagement,
  isReply,
  isQuotePost,
} from './contentFilters.js';

/**
 * Evaluate a candidate post for inclusion in the newcomer feed.
 *
 * Applies all filter stages in order:
 * 1. Event-level: Check if post type is acceptable (not a reply, etc.)
 * 2. Language: Check if post languages match allowed languages
 * 3. Membership: Check if author is on target domain (eurosky.social)
 * 4. Newcomer: Check if author is new on target domain
 * 5. Human: Check if author appears human-operated
 * 6. Engagement: Check if post is substantial enough
 * 7. Spam: Check post content for spam patterns
 * 8. Safety: Check post content for safety violations
 *
 * Hard blockers cause immediate rejection. Soft signals contribute to scoring.
 */
export function evaluateCandidatePost(
  post: AppBskyFeedPostRecord,
  profile: ProfileView,
  config: EvaluationConfig = defaultEvaluationConfig,
  now: Date = new Date(),
): CandidateEvaluation {
  const hardBlockers: string[] = [];
  const reasonsAccepted: string[] = [];
  const reasonsRejected: string[] = [];

  // ---------------------------------------------------------
  // Stage 0: Event-level filtering (replies, quote posts)
  // ---------------------------------------------------------

  if (isReply(post) && !config.includeReplies) {
    hardBlockers.push('Post is a reply (replies excluded by config)');
  }

  if (isQuotePost(post) && !config.includeQuotePosts) {
    hardBlockers.push('Post is a quote post (quote posts excluded by config)');
  }

  // ---------------------------------------------------------
  // Stage 1: Language check
  // ---------------------------------------------------------

  const language = evaluateLanguage(post, config);

  if (!language.isAllowed) {
    hardBlockers.push('Post language not allowed');
    reasonsRejected.push(...language.reasons);
  } else {
    reasonsAccepted.push(...language.reasons);
  }

  // ---------------------------------------------------------
  // Stage 2: Membership check
  // ---------------------------------------------------------

  const membership = isEuroskyAccount(profile, config);

  if (!membership.isMember) {
    hardBlockers.push(`Not a ${config.targetDomain} member`);
    reasonsRejected.push(...membership.reasons);
  } else {
    reasonsAccepted.push(...membership.reasons);
  }

  // ---------------------------------------------------------
  // Stage 3: Newcomer check
  // ---------------------------------------------------------

  const newcomer = isNewOnEurosky(profile, config, now);

  if (!newcomer.isNew) {
    hardBlockers.push(`Not a newcomer on ${config.targetDomain}`);
    reasonsRejected.push(...newcomer.reasons);
  } else {
    reasonsAccepted.push(...newcomer.reasons);
  }

  // ---------------------------------------------------------
  // Stage 4: Human check
  // ---------------------------------------------------------

  const human = evaluateHumanLikelihood(profile, config);

  if (!human.isHumanLikely) {
    hardBlockers.push('Account appears to be a bot');
    reasonsRejected.push(...human.reasons);
  } else {
    reasonsAccepted.push(...human.reasons);
  }

  // ---------------------------------------------------------
  // Stage 5: Engagement check
  // ---------------------------------------------------------

  const engagement = evaluateEngagement(post, config);

  if (!engagement.isEngagementLikely) {
    hardBlockers.push('Post appears low-effort');
    reasonsRejected.push(...engagement.reasons);
  } else {
    reasonsAccepted.push(...engagement.reasons);
  }

  // ---------------------------------------------------------
  // Stage 6: Spam check
  // ---------------------------------------------------------

  const spam = evaluateSpamLikelihood(post, config);

  if (spam.isSpamLikely) {
    hardBlockers.push('Post appears to be spam');
    reasonsRejected.push(...spam.reasons);
  } else {
    reasonsAccepted.push(...spam.reasons);
  }

  // ---------------------------------------------------------
  // Stage 7: Safety check
  // ---------------------------------------------------------

  const safety = evaluateSafety(post, config);

  if (safety.isBlocked) {
    hardBlockers.push('Post blocked by safety filter');
    reasonsRejected.push(...safety.reasons);
  } else {
    reasonsAccepted.push(...safety.reasons);
  }

  // ---------------------------------------------------------
  // Final decision
  // ---------------------------------------------------------

  const accepted = hardBlockers.length === 0;

  // Calculate overall confidence.
  const confidence = calculateOverallConfidence(
    membership.confidence,
    newcomer.confidence,
    accepted,
  );

  // Calculate score for ranking (only meaningful if accepted).
  const score = accepted
    ? calculateScore(human.score, spam.score, safety.score, engagement.score, human.signals.profileCompleteness)
    : 0;

  return {
    accepted,
    confidence,
    score,
    reasonsAccepted,
    reasonsRejected,
    hardBlockers,
    stageResults: {
      language,
      membership,
      newcomer,
      human,
      engagement,
      spam,
      safety,
    },
  };
}

/**
 * Calculate overall confidence from stage confidences.
 */
function calculateOverallConfidence(
  membershipConfidence: Confidence,
  newcomerConfidence: Confidence,
  accepted: boolean,
): Confidence {
  if (!accepted) {
    // Rejected posts have high confidence in rejection.
    return 'high';
  }

  // For accepted posts, overall confidence is the minimum of key stages.
  const confidenceOrder: Record<Confidence, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  const minLevel = Math.min(
    confidenceOrder[membershipConfidence],
    confidenceOrder[newcomerConfidence],
  );

  const reverseOrder: Record<number, Confidence> = {
    3: 'high',
    2: 'medium',
    1: 'low',
  };

  return reverseOrder[minLevel];
}

/**
 * Calculate ranking score for accepted posts.
 * Higher is better (more likely to be a good newcomer post).
 */
function calculateScore(
  humanScore: number,
  spamScore: number,
  safetyScore: number,
  engagementScore: number,
  profileCompleteness: number,
): number {
  const weights = {
    human: 0.3,
    antiSpam: 0.2,
    safety: 0.15,
    engagement: 0.25,
    profile: 0.1,
  };

  const antiSpamScore = 1 - spamScore;
  const safetyGoodScore = 1 - safetyScore;

  const score =
    weights.human * humanScore +
    weights.antiSpam * antiSpamScore +
    weights.safety * safetyGoodScore +
    weights.engagement * engagementScore +
    weights.profile * profileCompleteness;

  return Math.max(0, Math.min(1, score));
}

/**
 * Create a rejected evaluation for error cases.
 */
export function createRejectedEvaluation(
  reason: string,
  profile?: ProfileView,
): CandidateEvaluation {
  const emptyLanguage = {
    isAllowed: true,
    reasons: [reason],
    signals: { postLanguages: [] as string[], normalizedLanguages: [] as string[], matchedLanguages: [] as string[] },
  };

  const emptyMembership = {
    isMember: false,
    confidence: 'low' as Confidence,
    reasons: [reason],
    signals: { handle: profile?.handle ?? 'unknown', matchedDomain: null },
  };

  const emptyNewcomer = {
    isNew: false,
    joinedAt: null,
    accountAgeDays: null,
    confidence: 'low' as Confidence,
    reasons: [reason],
  };

  const emptyHuman = {
    isHumanLikely: false,
    score: 0,
    reasons: [reason],
    signals: { botLabels: [], botKeywords: [], profileCompleteness: 0 },
  };

  const emptyEngagement = {
    isEngagementLikely: true,
    score: 0,
    reasons: [reason],
    signals: { meaningfulChars: 0, wordCount: 0, lowEffortMatches: [] as string[], isQuotePost: false },
  };

  const emptySpam = {
    isSpamLikely: false,
    score: 0,
    reasons: [reason],
    signals: { linkCount: 0, mentionCount: 0, hashtagCount: 0, matchedPatterns: [] },
  };

  const emptySafety = {
    isBlocked: false,
    score: 0,
    reasons: [reason],
    matchedRules: [],
  };

  return {
    accepted: false,
    confidence: 'high',
    score: 0,
    reasonsAccepted: [],
    reasonsRejected: [reason],
    hardBlockers: [reason],
    stageResults: {
      language: emptyLanguage,
      membership: emptyMembership,
      newcomer: emptyNewcomer,
      human: emptyHuman,
      engagement: emptyEngagement,
      spam: emptySpam,
      safety: emptySafety,
    },
  };
}
