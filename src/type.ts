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

// Simplified record type for app.bsky.feed.post based on the official app.bsky.feed.post lexicon.
export interface AppBskyFeedPostRecord {
    $type: 'app.bsky.feed.post';
    text: string;

    // Rich text annotations (mentions, URLs, hashtags, etc.). Left as unknown for now; can be refined later.
    facets?: unknown[];

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
// Derived account metadata
// ---------------------------------------------------------

// Derived meta-information that is computed from ProfileView + events.
export interface AccountMeta {
    isNew: boolean;
    isHuman: boolean;
    lastSeenAt: string;
}