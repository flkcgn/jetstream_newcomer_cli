import type { ProfileView, AccountMeta } from './type.js';

// Configuration for newcomer / human / bridge heuristics.
export interface FilterConfig {
  maxPostsForNew: number;
  maxAccountAgeDaysForNew: number;
  botLabelValues: string[];
  botKeywordsInText: string[];
  bridgeHandleSuffixes: string[];
}

// Default configuration for filters.
// All heuristics are best-effort and imperfect by design.
export const defaultFilterConfig: FilterConfig = {
  // Accounts with more posts than this are not considered "new".
  maxPostsForNew: 50,

  // Accounts older than this (in days) are not considered "new".
  maxAccountAgeDaysForNew: 7,

  // Label values that indicate a bot account (self-label or labeler).
  botLabelValues: ['bot'],

  // Keywords that indicate a bot in profile text, displayName or handle.
  botKeywordsInText: [' bot', '[bot]', ' automation', ' automated '],

  // Obvious bridge domains in handles; best-effort only.
  bridgeHandleSuffixes: ['.ap.brid.gy'],
};

// Build AccountMeta from ProfileView and lastSeenAt timestamp.
export function buildAccountMeta(
  profile: ProfileView,
  lastSeenAt: string,
  config: FilterConfig = defaultFilterConfig,
  now: Date = new Date(),
): AccountMeta {
  const isNew = isNewAccount(profile, config, now);
  const isHuman = isHumanAccount(profile, config);

  return {
    isNew,
    isHuman,
    lastSeenAt,
  };
}

// Determine whether an account should be treated as "new".
// Best-effort: if we have no useful signals (no postsCount and no age),
// we return false rather than guessing.
export function isNewAccount(
  profile: ProfileView,
  config: FilterConfig = defaultFilterConfig,
  now: Date = new Date(),
): boolean {
  let hasSignal = false;

  if (typeof profile.postsCount === 'number') {
    hasSignal = true;
    if (profile.postsCount > config.maxPostsForNew) {
      return false;
    }
  }

  const ageDays = getAccountAgeDays(profile, now);
  if (typeof ageDays === 'number') {
    hasSignal = true;
    if (ageDays > config.maxAccountAgeDaysForNew) {
      return false;
    }
  }

  // Only treat as "new" when we saw at least one signal
  // and none of the signals disqualified the account.
  return hasSignal;
}

// Determine whether an account looks "human-like".
// Best-effort: checks labels and profile text for bot hints.
export function isHumanAccount(
  profile: ProfileView,
  config: FilterConfig = defaultFilterConfig,
): boolean {
  if (hasBotLabel(profile, config)) {
    return false;
  }

  const textParts: string[] = [];
  if (profile.displayName) {
    textParts.push(profile.displayName);
  }
  if (profile.description) {
    textParts.push(profile.description);
  }
  textParts.push(profile.handle);

  const combinedText = textParts.join(' ').toLowerCase();

  for (const keyword of config.botKeywordsInText) {
    if (combinedText.includes(keyword.toLowerCase())) {
      return false;
    }
  }

  return true;
}

// Detect obvious bridge / crosspost accounts by handle.
// Best-effort: focuses on known bridge domains like *.ap.brid.gy.
export function isBridgeAccount(
  profile: ProfileView,
  config: FilterConfig = defaultFilterConfig,
): boolean {
  const handle = profile.handle.toLowerCase();

  for (const suffix of config.bridgeHandleSuffixes) {
    if (handle.endsWith(suffix.toLowerCase())) {
      return true;
    }
  }

  return false;
}

// Check whether the profile has any labels that indicate a bot.
function hasBotLabel(profile: ProfileView, config: FilterConfig): boolean {
  if (!profile.labels || profile.labels.length === 0) {
    return false;
  }

  for (const label of profile.labels) {
    const value = label.val.toLowerCase();
    for (const botValue of config.botLabelValues) {
      if (value === botValue.toLowerCase()) {
        return true;
      }
    }
  }

  return false;
}

// Compute account age in days from createdAt or indexedAt.
function getAccountAgeDays(
  profile: ProfileView,
  now: Date,
): number | undefined {
  const created = parseIsoDate(profile.createdAt);
  const indexed = parseIsoDate(profile.indexedAt);

  const referenceDate = created ?? indexed;
  if (!referenceDate) {
    return undefined;
  }

  const diffMs = now.getTime() - referenceDate.getTime();
  if (diffMs < 0) {
    // Clamp negative differences to zero days.
    return 0;
  }

  const days = diffMs / (1000 * 60 * 60 * 24);
  return days;
}

// Parse an ISO date string to a Date, returning undefined on failure.
function parseIsoDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}