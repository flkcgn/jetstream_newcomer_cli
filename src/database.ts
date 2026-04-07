// SQLite database for persisting accepted feed posts.
// Uses better-sqlite3 for synchronous, fast access.

import Database from 'better-sqlite3';

export interface FeedPost {
  uri: string;
  did: string;
  indexedAt: number; // Unix timestamp in milliseconds
  score: number;
}

export class FeedDatabase {
  private readonly db: Database.Database;

  constructor(sqlitePath: string) {
    this.db = new Database(sqlitePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feed_post (
        uri        TEXT PRIMARY KEY,
        did        TEXT NOT NULL,
        indexed_at INTEGER NOT NULL,
        score      REAL NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_feed_post_indexed_at ON feed_post (indexed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_feed_post_did ON feed_post (did);
    `);
  }

  /** Insert or ignore a post into the feed index. */
  addPost(post: FeedPost): void {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO feed_post (uri, did, indexed_at, score)
       VALUES (?, ?, ?, ?)`,
    );
    stmt.run(post.uri, post.did, post.indexedAt, post.score);
  }

  /** Remove a post from the feed index (e.g. on delete events). */
  removePost(uri: string): void {
    this.db.prepare('DELETE FROM feed_post WHERE uri = ?').run(uri);
  }

  /**
   * Query posts for the feed skeleton, ordered by indexed_at descending.
   * Supports cursor-based pagination. The cursor is an indexed_at timestamp.
   */
  getFeedSkeleton(limit: number, cursor?: string): { posts: FeedPost[]; cursor: string | undefined } {
    let rows: FeedPost[];
    const effectiveLimit = Math.min(Math.max(limit, 1), 100);

    if (cursor) {
      const cursorTs = parseInt(cursor, 10);
      if (isNaN(cursorTs)) {
        return { posts: [], cursor: undefined };
      }
      rows = this.db
        .prepare(
          `SELECT uri, did, indexed_at AS indexedAt, score
           FROM feed_post
           WHERE indexed_at < ?
           ORDER BY indexed_at DESC
           LIMIT ?`,
        )
        .all(cursorTs, effectiveLimit) as FeedPost[];
    } else {
      rows = this.db
        .prepare(
          `SELECT uri, did, indexed_at AS indexedAt, score
           FROM feed_post
           ORDER BY indexed_at DESC
           LIMIT ?`,
        )
        .all(effectiveLimit) as FeedPost[];
    }

    const nextCursor =
      rows.length === effectiveLimit && rows.length > 0
        ? String(rows[rows.length - 1].indexedAt)
        : undefined;

    return { posts: rows, cursor: nextCursor };
  }

  /** Delete posts older than the given age in hours. Returns the count removed. */
  garbageCollect(maxAgeHours: number): number {
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const result = this.db.prepare('DELETE FROM feed_post WHERE indexed_at < ?').run(cutoff);
    return result.changes;
  }

  /** Count total posts in the index. */
  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS cnt FROM feed_post').get() as { cnt: number };
    return row.cnt;
  }

  close(): void {
    this.db.close();
  }
}
