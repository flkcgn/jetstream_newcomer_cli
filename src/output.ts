// CLI output formatting for accepted and rejected posts.

import type {
  AppBskyFeedPostRecord,
  ProfileView,
  CandidateEvaluation,
} from './type.js';

// ---------------------------------------------------------
// ANSI color codes
// ---------------------------------------------------------

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// ---------------------------------------------------------
// Output options
// ---------------------------------------------------------

export interface OutputOptions {
  debug: boolean;
  useColors: boolean;
}

export const defaultOutputOptions: OutputOptions = {
  debug: false,
  useColors: true,
};

// ---------------------------------------------------------
// Timestamp formatting
// ---------------------------------------------------------

function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

// ---------------------------------------------------------
// Text truncation
// ---------------------------------------------------------

function truncateText(text: string, maxLength: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLength) {
    return oneLine;
  }
  return oneLine.slice(0, maxLength - 1) + '…';
}

// ---------------------------------------------------------
// Accepted post output
// ---------------------------------------------------------

/**
 * Format an accepted post for CLI output.
 */
export function formatAcceptedPost(
  post: AppBskyFeedPostRecord,
  profile: ProfileView,
  evaluation: CandidateEvaluation,
  eventTimeUs: number,
  options: OutputOptions = defaultOutputOptions,
): string {
  const c = options.useColors ? colors : emptyColors();
  const lines: string[] = [];

  // Header with timestamp and status.
  const timestamp = formatTimestamp();
  const scoreStr = (evaluation.score * 100).toFixed(0);
  const confStr = evaluation.confidence.toUpperCase();

  lines.push(`${c.gray}────────────────────────────────────────${c.reset}`);
  lines.push(
    `${c.gray}[${timestamp}]${c.reset} ${c.green}${c.bright}ACCEPTED${c.reset} ` +
    `${c.gray}(score: ${scoreStr}%, confidence: ${confStr})${c.reset}`
  );

  // Author info.
  lines.push(`  ${c.cyan}Handle:${c.reset} ${profile.handle}`);
  if (profile.displayName) {
    lines.push(`  ${c.cyan}Display:${c.reset} ${profile.displayName}`);
  }
  lines.push(`  ${c.cyan}DID:${c.reset} ${c.dim}${profile.did}${c.reset}`);

  // Post text.
  const text = truncateText(post.text, 200);
  lines.push(`  ${c.cyan}Text:${c.reset} ${text}`);

  // Key signals.
  const { newcomer, human, engagement, spam } = evaluation.stageResults;
  const ageDaysStr = newcomer.accountAgeDays !== null
    ? `${newcomer.accountAgeDays.toFixed(1)}d`
    : '?';

  lines.push(
    `  ${c.cyan}Signals:${c.reset} ` +
    `age=${ageDaysStr} ` +
    `human=${(human.score * 100).toFixed(0)}% ` +
    `engagement=${(engagement.score * 100).toFixed(0)}% ` +
    `spam=${(spam.score * 100).toFixed(0)}%`
  );

  // Debug output.
  if (options.debug) {
    lines.push(`  ${c.gray}Cursor: ${eventTimeUs}${c.reset}`);
    lines.push(`  ${c.gray}Reasons: ${evaluation.reasonsAccepted.join('; ')}${c.reset}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------
// Rejected post output (for debug mode)
// ---------------------------------------------------------

/**
 * Format a rejected post for CLI output (debug mode only).
 */
export function formatRejectedPost(
  post: AppBskyFeedPostRecord,
  profile: ProfileView,
  evaluation: CandidateEvaluation,
  eventTimeUs: number,
  options: OutputOptions = defaultOutputOptions,
): string {
  const c = options.useColors ? colors : emptyColors();
  const lines: string[] = [];

  // Header with timestamp and status.
  const timestamp = formatTimestamp();

  lines.push(`${c.gray}────────────────────────────────────────${c.reset}`);
  lines.push(
    `${c.gray}[${timestamp}]${c.reset} ${c.red}REJECTED${c.reset}`
  );

  // Author info (compact).
  lines.push(`  ${c.cyan}Handle:${c.reset} ${profile.handle}`);

  // Post text (short).
  const text = truncateText(post.text, 100);
  lines.push(`  ${c.cyan}Text:${c.reset} ${c.dim}${text}${c.reset}`);

  // Hard blockers.
  for (const blocker of evaluation.hardBlockers) {
    lines.push(`  ${c.red}✗${c.reset} ${blocker}`);
  }

  // Additional debug info.
  if (options.debug) {
    lines.push(`  ${c.gray}Cursor: ${eventTimeUs}${c.reset}`);

    // Show stage details.
    const { language, membership, newcomer, human, engagement: eng, spam, safety } = evaluation.stageResults;

    lines.push(`  ${c.gray}Language: ${language.isAllowed ? 'OK' : 'BLOCKED'} [${language.signals.normalizedLanguages.join(', ') || 'none'}]${c.reset}`);
    lines.push(`  ${c.gray}Membership: ${membership.isMember ? 'YES' : 'NO'} (${membership.confidence})${c.reset}`);
    lines.push(`  ${c.gray}Newcomer: ${newcomer.isNew ? 'YES' : 'NO'} (${newcomer.confidence})${c.reset}`);
    lines.push(`  ${c.gray}Human: ${human.isHumanLikely ? 'YES' : 'NO'} (score: ${(human.score * 100).toFixed(0)}%)${c.reset}`);
    lines.push(`  ${c.gray}Engagement: ${eng.isEngagementLikely ? 'YES' : 'NO'} (score: ${(eng.score * 100).toFixed(0)}%)${c.reset}`);
    lines.push(`  ${c.gray}Spam: ${spam.isSpamLikely ? 'YES' : 'NO'} (score: ${(spam.score * 100).toFixed(0)}%)${c.reset}`);
    lines.push(`  ${c.gray}Safety: ${safety.isBlocked ? 'BLOCKED' : 'OK'} (score: ${(safety.score * 100).toFixed(0)}%)${c.reset}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------
// Startup message
// ---------------------------------------------------------

/**
 * Format the startup message.
 */
export function formatStartupMessage(
  targetDomain: string,
  maxAgeDays: number,
  options: OutputOptions = defaultOutputOptions,
): string {
  const c = options.useColors ? colors : emptyColors();

  return (
    `${c.bright}Eurosky Newcomer CLI${c.reset}\n` +
    `${c.gray}─────────────────────────────────────────${c.reset}\n` +
    `Target domain: ${c.cyan}${targetDomain}${c.reset}\n` +
    `Max account age: ${c.cyan}${maxAgeDays} days${c.reset}\n` +
    `Filters: language, membership, newcomer, human, engagement, spam, safety\n` +
    `${c.gray}─────────────────────────────────────────${c.reset}\n` +
    `${c.dim}Connecting to Bluesky Jetstream...${c.reset}`
  );
}

/**
 * Format the connection success message.
 */
export function formatConnectedMessage(
  options: OutputOptions = defaultOutputOptions,
): string {
  const c = options.useColors ? colors : emptyColors();
  return `${c.green}Connected.${c.reset} Listening for newcomer posts...`;
}

/**
 * Format the reconnection message.
 */
export function formatReconnectMessage(
  delayMs: number,
  options: OutputOptions = defaultOutputOptions,
): string {
  const c = options.useColors ? colors : emptyColors();
  return `${c.yellow}Connection lost.${c.reset} Reconnecting in ${delayMs / 1000}s...`;
}

// ---------------------------------------------------------
// Helper: empty colors for non-color output
// ---------------------------------------------------------

function emptyColors(): typeof colors {
  return {
    reset: '',
    bright: '',
    dim: '',
    green: '',
    yellow: '',
    red: '',
    cyan: '',
    gray: '',
  };
}
