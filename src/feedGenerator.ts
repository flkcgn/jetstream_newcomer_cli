// HTTP server that serves the XRPC feed generator endpoints.
// Implements:
//   GET /.well-known/did.json           → DID document (did:web)
//   GET /xrpc/app.bsky.feed.describeFeedGenerator
//   GET /xrpc/app.bsky.feed.getFeedSkeleton

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { FeedDatabase } from './database.js';
import type { FeedGeneratorConfig } from './config.js';

export interface FeedGeneratorServerOptions {
  config: FeedGeneratorConfig;
  db: FeedDatabase;
}

export function createFeedGeneratorServer(options: FeedGeneratorServerOptions) {
  const { config, db } = options;
  const feedUri = `at://${config.publisherDid}/app.bsky.feed.generator/${config.feedRecordName}`;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;

    try {
      if (path === '/.well-known/did.json' && req.method === 'GET') {
        handleDidDocument(res, config);
      } else if (path === '/xrpc/app.bsky.feed.describeFeedGenerator' && req.method === 'GET') {
        handleDescribeFeedGenerator(res, feedUri);
      } else if (path === '/xrpc/app.bsky.feed.getFeedSkeleton' && req.method === 'GET') {
        handleGetFeedSkeleton(res, url, db, feedUri);
      } else if (path === '/' && req.method === 'GET') {
        handleHealthCheck(res, db, config);
      } else {
        jsonResponse(res, 404, {
          error: 'MethodNotImplemented',
          message: `${req.method} ${path} not found`,
        });
      }
    } catch (err) {
      console.error('Request handler error:', err);
      jsonResponse(res, 500, { error: 'InternalServerError', message: 'Internal server error' });
    }
  });

  return server;
}

// ─── DID Document ────────────────────────────────────────

function handleDidDocument(res: ServerResponse, config: FeedGeneratorConfig): void {
  const didDoc = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: config.serviceDid,
    service: [
      {
        id: '#bsky_fg',
        type: 'BskyFeedGenerator',
        serviceEndpoint: `https://${config.hostname}`,
      },
    ],
  };
  jsonResponse(res, 200, didDoc);
}

// ─── describeFeedGenerator ───────────────────────────────

function handleDescribeFeedGenerator(res: ServerResponse, feedUri: string): void {
  const body = {
    did: feedUri.split('/')[2],
    feeds: [{ uri: feedUri }],
  };
  jsonResponse(res, 200, body);
}

// ─── getFeedSkeleton ─────────────────────────────────────

function handleGetFeedSkeleton(
  res: ServerResponse,
  url: URL,
  db: FeedDatabase,
  expectedFeedUri: string,
): void {
  const feedParam = url.searchParams.get('feed');
  if (!feedParam) {
    jsonResponse(res, 400, { error: 'InvalidRequest', message: 'Missing "feed" parameter' });
    return;
  }

  if (feedParam !== expectedFeedUri) {
    jsonResponse(res, 400, {
      error: 'InvalidRequest',
      message: `Unknown feed: ${feedParam}`,
    });
    return;
  }

  const limitParam = url.searchParams.get('limit');
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  const result = db.getFeedSkeleton(isNaN(limit) ? 50 : limit, cursor);

  const body: Record<string, unknown> = {
    feed: result.posts.map((p) => ({ post: p.uri })),
  };
  if (result.cursor) {
    body.cursor = result.cursor;
  }

  jsonResponse(res, 200, body);
}

// ─── Health check ────────────────────────────────────────

function handleHealthCheck(
  res: ServerResponse,
  db: FeedDatabase,
  config: FeedGeneratorConfig,
): void {
  jsonResponse(res, 200, {
    name: 'eurosky-newcomer-feed',
    version: '1.0.0',
    feed: config.feedRecordName,
    indexedPosts: db.count(),
  });
}

// ─── Helpers ─────────────────────────────────────────────

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}
