// Content-based filters for spam and safety.
// All heuristics are best-effort and prefer false negatives over false positives.

import type {
  AppBskyFeedPostRecord,
  SpamResult,
  SafetyResult,
  LanguageResult,
  EngagementResult,
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
// Language evaluation
// ---------------------------------------------------------

/**
 * Evaluate whether the post's declared languages are acceptable.
 *
 * If allowedLanguages is empty, all languages are accepted.
 * Normalizes language tags to their base form (e.g. "de-DE" -> "de")
 * so that regional variants are not penalized.
 */
export function evaluateLanguage(
  post: AppBskyFeedPostRecord,
  config: EvaluationConfig = defaultEvaluationConfig,
): LanguageResult {
  const reasons: string[] = [];
  const postLanguages = post.langs ?? [];
  const normalizedLanguages = postLanguages.map(normalizeLanguageTag);

  // If no language restrictions are configured, everything is allowed.
  if (config.allowedLanguages.length === 0) {
    return {
      isAllowed: true,
      reasons: ['No language restrictions configured'],
      signals: {
        postLanguages,
        normalizedLanguages,
        matchedLanguages: normalizedLanguages,
      },
    };
  }

  // If the post has no language tags, check whether they are required.
  if (postLanguages.length === 0) {
    if (config.requireLanguageTag) {
      return {
        isAllowed: false,
        reasons: ['Post has no language tags and language tags are required'],
        signals: {
          postLanguages: [],
          normalizedLanguages: [],
          matchedLanguages: [],
        },
      };
    }

    return {
      isAllowed: true,
      reasons: ['Post has no language tags; language tags not required'],
      signals: {
        postLanguages: [],
        normalizedLanguages: [],
        matchedLanguages: [],
      },
    };
  }

  const allowedSet = new Set(config.allowedLanguages.map(l => l.toLowerCase()));
  const matchedLanguages = normalizedLanguages.filter(l => allowedSet.has(l));

  const isAllowed = matchedLanguages.length > 0;

  if (isAllowed) {
    reasons.push(`Matched languages: ${matchedLanguages.join(', ')}`);
  } else {
    reasons.push(
      `Post languages [${normalizedLanguages.join(', ')}] do not match allowed [${config.allowedLanguages.join(', ')}]`,
    );
  }

  return {
    isAllowed,
    reasons,
    signals: {
      postLanguages,
      normalizedLanguages,
      matchedLanguages,
    },
  };
}

// ---------------------------------------------------------
// Engagement / post quality evaluation
// ---------------------------------------------------------

/**
 * Evaluate whether a post is substantial enough for the feed.
 *
 * Checks for:
 * - Minimum character length of meaningful text
 * - Minimum word count
 * - Low-effort patterns (single emoji, "lol", etc.)
 * - Quote posts with too little commentary
 */
export function evaluateEngagement(
  post: AppBskyFeedPostRecord,
  config: EvaluationConfig = defaultEvaluationConfig,
): EngagementResult {
  const reasons: string[] = [];
  const lowEffortMatches: string[] = [];
  let score = 1.0;

  const text = post.text.trim();
  const meaningfulChars = countMeaningfulChars(text);
  const wordCount = countWords(text);
  const quotePost = isQuotePost(post);

  // Check minimum meaningful character count.
  if (meaningfulChars < config.minMeaningfulTextChars) {
    const deficit = 1 - meaningfulChars / config.minMeaningfulTextChars;
    score -= 0.3 + 0.4 * deficit;
    reasons.push(
      `Too few meaningful characters: ${meaningfulChars} (min: ${config.minMeaningfulTextChars})`,
    );
  }

  // Check minimum word count.
  if (wordCount < config.minWordCount) {
    score -= 0.4;
    reasons.push(`Too few words: ${wordCount} (min: ${config.minWordCount})`);
  }

  // Check for low-effort patterns.
  const normalizedText = text.toLowerCase().trim();
  for (const pattern of config.lowEffortPatterns) {
    try {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(normalizedText)) {
        lowEffortMatches.push(pattern);
        score -= 0.3;
        reasons.push(`Low-effort pattern matched: ${pattern}`);
      }
    } catch {
      // Skip invalid regex patterns.
    }
  }

  // For quote posts, check minimum commentary.
  if (quotePost && config.minQuoteCommentaryChars > 0) {
    if (meaningfulChars < config.minQuoteCommentaryChars) {
      score -= 0.3;
      reasons.push(
        `Quote post has too little commentary: ${meaningfulChars} chars (min: ${config.minQuoteCommentaryChars})`,
      );
    }
  }

  score = Math.max(0, Math.min(1, score));

  const isEngagementLikely = score >= 0.5;

  if (isEngagementLikely && reasons.length === 0) {
    reasons.push('Post appears substantial');
  }

  return {
    isEngagementLikely,
    score,
    reasons,
    signals: {
      meaningfulChars,
      wordCount,
      lowEffortMatches,
      isQuotePost: quotePost,
    },
  };
}

// ---------------------------------------------------------
// Helper functions
// ---------------------------------------------------------

/**
 * Normalize a BCP 47 language tag to its base language code.
 * e.g. "de-DE" -> "de", "en-US" -> "en", "pt-BR" -> "pt"
 */
function normalizeLanguageTag(tag: string): string {
  return tag.split('-')[0].toLowerCase();
}

/**
 * Count "meaningful" characters — letters and digits, stripping
 * whitespace, punctuation, and common emoji sequences.
 */
function countMeaningfulChars(text: string): number {
  const stripped = text.replace(/[\s\p{P}\p{S}]/gu, '');
  return stripped.length;
}

/**
 * Count words in a text string.
 */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

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
