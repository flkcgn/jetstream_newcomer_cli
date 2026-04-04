// Central domain types for the Jetstream newcomer CLI

// ---------------------------------------------------------
// Jetstream event types
// ---------------------------------------------------------

export type JetstreamEventKind = 'commit' | 'identity' | 'account';

export type CommitOperation = 'create' | 'update' | 'delete';

// Common fields shared by all Jetstream events.
export interface JetstreamBaseEvent {
    did: string;
    time_us: number;
    kind: JetstreamEventKind;
}

// Generic commit structure inside a Jetstream event.
export interface JetstreamCommit<TRecord = unknown> {
    rev: string;
    operation: CommitOperation;
    collection: string;
    rkey: string;
    cid?: string; // CID can be absent on delete operations.
    record?: TRecord;
}

// Rich text facet types (app.bsky.richtext.facet).
export interface FacetIndex {
    byteStart: number;
    byteEnd: number;
}

export interface FacetFeature {
    $type: string;
    uri?: string;      // for links
    did?: string;      // for mentions
    tag?: string;      // for hashtags
}

export interface Facet {
    index: FacetIndex;
    features: FacetFeature[];
}

// Simplified record type for app.bsky.feed.post based on the official app.bsky.feed.post lexicon.
export interface AppBskyFeedPostRecord {
    $type: 'app.bsky.feed.post';
    text: string;

    // Rich text annotations (mentions, URLs, hashtags, etc.).
    facets?: Facet[];

    // Reply information (root and parent posts).
    reply?: {
        root: { uri: string; cid: string };
        parent: { uri: string; cid: string };
    };

    // Embedded content (images, external links, videos, etc.).
    embed?: unknown;

    // Declared languages of the post text, e.g. ["en", "de"].
    langs?: string[];

    // Self-labels attached to this post (content warnings etc.).
    labels?: {
        $type?: 'com.atproto.label.defs#selfLabels';
        values: Array<{
            val: string;
        }>;
    };

    // Additional tags for the post (hashtags, etc.).
    tags?: string[];

    // ISO timestamp of when the post was created.
    createdAt: string;
}

// Commit event that specifically contains an app.bsky.feed.post record.
export interface AppBskyFeedPostCommitEvent extends JetstreamBaseEvent {
    kind: 'commit';
    commit: JetstreamCommit<AppBskyFeedPostRecord> & {
        collection: 'app.bsky.feed.post';
        record: AppBskyFeedPostRecord;
    };
}

// Identity event (e.g. handle changes). Based on examples from the Jetstream docs.
export interface IdentityEvent extends JetstreamBaseEvent {
    kind: 'identity';
    identity: {
        did: string;
        handle: string;
        seq: number;
        time: string;
    };
}

// Account status event (e.g. active/inactive).
export interface AccountEvent extends JetstreamBaseEvent {
    kind: 'account';
    account: {
        active: boolean;
        did: string;
        seq: number;
        time: string;
    };
}

/// Union over the interesting Jetstream events. Can be extended later.
export type JetstreamEvent =
    | AppBskyFeedPostCommitEvent
    | IdentityEvent
    | AccountEvent;

// ---------------------------------------------------------
// Profile view and labels (AppView: app.bsky.actor.getProfile)
// ---------------------------------------------------------

// Single moderation/content label (com.atproto.label.defs#label), simplified to the most relevant fields for this CLI.
export interface ProfileLabel {
    src: string;
    uri: string;
    val: string;
    cid?: string;
    neg?: boolean;
    cts: string;
    exp?: string;
}

// Simplified profile view based on app.bsky.actor.getProfile. Only includes fields that are useful for newcomer/human heuristics.
export interface ProfileView {
    did: string;
    handle: string;
    displayName?: string;
    description?: string;
    postsCount?: number;
    indexedAt?: string;
    createdAt?: string;
    labels?: ProfileLabel[];
}

// ---------------------------------------------------------
// Filter result types
// ---------------------------------------------------------

// Confidence level for heuristic decisions.
export type Confidence = 'high' | 'medium' | 'low';

// Result of checking if an account belongs to a specific PDS/community.
export interface MembershipResult {
    isMember: boolean;
    confidence: Confidence;
    reasons: string[];
    signals: {
        handle: string;
        matchedDomain: string | null;
    };
}

// Result of checking if an account is new on a specific PDS/community.
// IMPORTANT: ATProto does not expose PDS migration history. For accounts on
// eurosky.social, we use the global createdAt/indexedAt as a proxy. This means
// accounts that migrated from another PDS cannot be distinguished from native
// eurosky accounts. The heuristic is conservative and may miss recent migrants.
export interface NewcomerResult {
    isNew: boolean;
    joinedAt: string | null;
    accountAgeDays: number | null;
    confidence: Confidence;
    reasons: string[];
}

// Result of evaluating whether an account looks human-operated.
export interface HumanResult {
    isHumanLikely: boolean;
    score: number; // 0.0 = likely bot, 1.0 = likely human
    reasons: string[];
    signals: {
        botLabels: string[];
        botKeywords: string[];
        profileCompleteness: number; // 0.0 - 1.0
    };
}

// Result of evaluating spam likelihood in a post.
export interface SpamResult {
    isSpamLikely: boolean;
    score: number; // 0.0 = clean, 1.0 = definite spam
    reasons: string[];
    signals: {
        linkCount: number;
        mentionCount: number;
        hashtagCount: number;
        matchedPatterns: string[];
    };
}

// Result of safety evaluation (hate speech, harassment, etc.).
export interface SafetyResult {
    isBlocked: boolean;
    score: number; // 0.0 = safe, 1.0 = definitely unsafe
    reasons: string[];
    matchedRules: string[];
}

// Combined evaluation of a candidate post for the feed.
export interface CandidateEvaluation {
    accepted: boolean;
    confidence: Confidence;
    score: number; // 0.0 - 1.0, higher = better candidate
    reasonsAccepted: string[];
    reasonsRejected: string[];
    hardBlockers: string[];
    stageResults: {
        membership: MembershipResult;
        newcomer: NewcomerResult;
        human: HumanResult;
        spam: SpamResult;
        safety: SafetyResult;
    };
}

// Context about the post author, combining profile and event data.
export interface AuthorContext {
    did: string;
    profile: ProfileView;
    eventTimeUs: number;
}

// ---------------------------------------------------------
// Configuration types
// ---------------------------------------------------------

// Configuration for the evaluation pipeline.
export interface EvaluationConfig {
    // Target PDS domain to filter for (e.g., 'eurosky.social').
    targetDomain: string;

    // Maximum account age in days to be considered "new".
    maxAccountAgeDays: number;

    // Minimum confidence required for membership detection.
    minMembershipConfidence: Confidence;

    // Keywords that indicate bot accounts.
    botKeywords: string[];

    // Label values that indicate bot accounts.
    botLabelValues: string[];

    // Patterns that indicate spam content.
    spamPatterns: string[];

    // Maximum number of links before post is considered spammy.
    maxLinksBeforeSpam: number;

    // Maximum number of hashtags before post is considered spammy.
    maxHashtagsBeforeSpam: number;

    // Safety blocklist patterns.
    safetyBlocklist: string[];

    // Whether to include replies in the output.
    includeReplies: boolean;

    // Whether to include quote posts in the output.
    includeQuotePosts: boolean;
}

// ---------------------------------------------------------
// Deprecated: old account meta (kept for migration)
// ---------------------------------------------------------

// Derived meta-information that is computed from ProfileView + events.
// @deprecated Use CandidateEvaluation instead.
export interface AccountMeta {
    isNew: boolean;
    isHuman: boolean;
    lastSeenAt: string;
}