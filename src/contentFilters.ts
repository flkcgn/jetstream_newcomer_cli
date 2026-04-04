// Content-based filters for spam and safety.
// All heuristics are best-effort and prefer false negatives over false positives.

import type {
  AppBskyFeedPostRecord,
  SpamResult,
  SafetyResult,
  EvaluationConfig,
  Facet,
} from './type.js';
import { defaultEvaluationConfig } from './filters.js';

// ---------------------------------------------------------
// Spam detection
// ---------------------------------------------------------

/**
 * Evaluate spam likelihood of a post.
 *
 * Checks for:
 * - Excessive links
 * - Excessive hashtags/mentions
 * - Known spam patterns (crypto, giveaways, promotional CTAs)
 */
export function evaluateSpamLikelihood(
  post: AppBskyFeedPostRecord,
  config: EvaluationConfig = defaultEvaluationConfig,
): SpamResult {
  const reasons: string[] = [];
  const matchedPatterns: string[] = [];
  let score = 0;

  // Extract counts from facets.
  const { linkCount, mentionCount, hashtagCount } = countFacetFeatures(post.facets);

  // Check link count.
  if (linkCount > config.maxLinksBeforeSpam) {
    score += 0.3;
    reasons.push(`Excessive links: ${linkCount} (threshold: ${config.maxLinksBeforeSpam})`);
  }

  // Check hashtag count.
  if (hashtagCount > config.maxHashtagsBeforeSpam) {
    score += 0.2;
    reasons.push(`Excessive hashtags: ${hashtagCount} (threshold: ${config.maxHashtagsBeforeSpam})`);
  }

  // Check mention count (spam often has many mentions).
  if (mentionCount > 10) {
    score += 0.3;
    reasons.push(`Excessive mentions: ${mentionCount}`);
  }

  // Check for spam patterns in text.
  const normalizedText = normalizeText(post.text);

  for (const pattern of config.spamPatterns) {
    const normalizedPattern = pattern.toLowerCase();
    if (normalizedText.includes(normalizedPattern)) {
      matchedPatterns.push(pattern);
      score += 0.15;
      reasons.push(`Spam pattern detected: "${pattern}"`);
    }
  }

  // Check for crypto/NFT spam signals.
  const cryptoPatterns = [
    /\$[a-z]{2,10}/i,           // $TOKEN style
    /0x[a-f0-9]{10,}/i,         // Ethereum addresses
    /\b(nft|mint|whitelist|wl)\b/i,
  ];

  for (const regex of cryptoPatterns) {
    if (regex.test(post.text)) {
      score += 0.2;
      matchedPatterns.push(regex.source);
      reasons.push(`Crypto/NFT pattern detected`);
      break; // Count crypto signals only once.
    }
  }

  // Check for ALL CAPS (often used in spam).
  const capsRatio = countUppercaseRatio(post.text);
  if (capsRatio > 0.5 && post.text.length > 50) {
    score += 0.1;
    reasons.push(`High uppercase ratio: ${(capsRatio * 100).toFixed(0)}%`);
  }

  // Clamp score to [0, 1].
  score = Math.min(1, score);

  const isSpamLikely = score >= 0.5;

  if (!isSpamLikely && reasons.length === 0) {
    reasons.push('No spam indicators found');
  }

  return {
    isSpamLikely,
    score,
    reasons,
    signals: {
      linkCount,
      mentionCount,
      hashtagCount,
      matchedPatterns,
    },
  };
}

// ---------------------------------------------------------
// Safety filter (hate speech, harassment, etc.)
// ---------------------------------------------------------

/**
 * Evaluate safety of a post.
 *
 * Checks for:
 * - Blocklisted words/patterns (hate speech, slurs, etc.)
 * - Post self-labels indicating sensitive content
 *
 * This is a basic rule-based implementation. For production use,
 * consider integrating with external moderation APIs or ML models.
 */
export function evaluateSafety(
  post: AppBskyFeedPostRecord,
  config: EvaluationConfig = defaultEvaluationConfig,
): SafetyResult {
  const reasons: string[] = [];
  const matchedRules: string[] = [];
  let score = 0;

  const normalizedText = normalizeText(post.text);

  // Check against safety blocklist.
  for (const pattern of config.safetyBlocklist) {
    const normalizedPattern = pattern.toLowerCase();
    if (normalizedText.includes(normalizedPattern)) {
      matchedRules.push(pattern);
      score += 0.5;
      reasons.push(`Blocked pattern detected: "${pattern}"`);
    }
  }

  // Check post self-labels for content warnings.
  // We don't block these, but they contribute to the score.
  if (post.labels?.values) {
    const sensitiveLabels = ['nsfw', 'gore', 'violence', 'hate'];
    for (const label of post.labels.values) {
      const value = label.val.toLowerCase();
      if (sensitiveLabels.includes(value)) {
        score += 0.3;
        matchedRules.push(`self-label:${label.val}`);
        reasons.push(`Post self-labeled as: ${label.val}`);
      }
    }
  }

  // Basic pattern checks for obvious violations.
  // These are intentionally minimal and conservative.
  const obviousViolationPatterns = [
    /\bk+i+l+l?\s+(yourself|urself|u)\b/i,
    /\b(die|death)\s+threat/i,
  ];

  for (const regex of obviousViolationPatterns) {
    if (regex.test(post.text)) {
      score += 0.6;
      matchedRules.push(regex.source);
      reasons.push('Potential harassment/threat detected');
      break;
    }
  }

  // Clamp score to [0, 1].
  score = Math.min(1, score);

  const isBlocked = score >= 0.5;

  if (!isBlocked && reasons.length === 0) {
    reasons.push('No safety concerns detected');
  }

  return {
    isBlocked,
    score,
    reasons,
    matchedRules,
  };
}

// ---------------------------------------------------------
// Reply and quote post detection
// ---------------------------------------------------------

/**
 * Check if a post is a reply.
 */
export function isReply(post: AppBskyFeedPostRecord): boolean {
  return post.reply !== undefined;
}

/**
 * Check if a post is a quote post (has an embedded record).
 */
export function isQuotePost(post: AppBskyFeedPostRecord): boolean {
  if (!post.embed) return false;

  const embed = post.embed as Record<string, unknown>;
  const embedType = embed.$type as string | undefined;

  // Quote posts have embed type app.bsky.embed.record or app.bsky.embed.recordWithMedia.
  return (
    embedType === 'app.bsky.embed.record' ||
    embedType === 'app.bsky.embed.recordWithMedia'
  );
}

// ---------------------------------------------------------
// Helper functions
// ---------------------------------------------------------

/**
 * Count different types of facet features in a post.
 */
function countFacetFeatures(facets?: Facet[]): {
  linkCount: number;
  mentionCount: number;
  hashtagCount: number;
} {
  let linkCount = 0;
  let mentionCount = 0;
  let hashtagCount = 0;

  if (!facets) {
    return { linkCount, mentionCount, hashtagCount };
  }

  for (const facet of facets) {
    for (const feature of facet.features) {
      if (feature.$type === 'app.bsky.richtext.facet#link') {
        linkCount++;
      } else if (feature.$type === 'app.bsky.richtext.facet#mention') {
        mentionCount++;
      } else if (feature.$type === 'app.bsky.richtext.facet#tag') {
        hashtagCount++;
      }
    }
  }

  return { linkCount, mentionCount, hashtagCount };
}

/**
 * Normalize text for pattern matching.
 * Converts to lowercase and normalizes whitespace.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate the ratio of uppercase letters to total letters.
 */
function countUppercaseRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return 0;

  const uppercase = letters.replace(/[^A-Z]/g, '');
  return uppercase.length / letters.length;
}
