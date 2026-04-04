import type { ProfileView } from './type.js';

// Base URL of the AppView HTTP API. Defaults to the public Bluesky AppView.
export interface ProfileCacheOptions {
    appviewBaseUrl?: string;
    ttlMs?: number;
}

interface CachedProfile {
    profile: ProfileView;
    fetchedAt: number;
}

// Simple in-memory cache for ProfileView objects, fetched via AppView.
export class ProfileCache {
    private readonly appviewBaseUrl: string;
    private readonly ttlMs: number;
    private readonly cacheByDid = new Map<string, CachedProfile>();

    constructor(options: ProfileCacheOptions = {}) {
        this.appviewBaseUrl = options.appviewBaseUrl ?? 'https://public.api.bsky.app';
        this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    }

// Resolve a profile by DID or handle using AppView and cache the result.
    async getProfile(actor: string): Promise<ProfileView> {
        const cached = this.getFromCache(actor);
        if (cached) {
            return cached;
        }

        const profile = await this.fetchProfileFromAppView(actor);
        this.storeInCache(profile);
        return profile;
    }

    clear(): void {
        this.cacheByDid.clear();
    }

// Get a profile from the cache if it is still fresh.
    private getFromCache(actor: string): ProfileView | undefined {
        // For now only cache by DID is done; might later map handles to DIDs.
        if (!actor.startsWith('did:')) {
            return undefined;
        }

        const entry = this.cacheByDid.get(actor);
        if (!entry) {
            return undefined;
        }

        const ageMs = Date.now() - entry.fetchedAt;
        if (ageMs > this.ttlMs) {
            this.cacheByDid.delete(actor);
            return undefined;
        }

        return entry.profile;
    }

// Store a profile in the cache keyed by DID.
    private storeInCache(profile: ProfileView): void {
        if (!profile.did) {
            return;
        }

        this.cacheByDid.set(profile.did, {
            profile,
            fetchedAt: Date.now(),
        });
    }

// Perform the actual HTTP request to AppView. Uses the documented getProfile endpoint: GET /xrpc/app.bsky.actor.getProfile?actor=<didOrHandle>
    private async fetchProfileFromAppView(actor: string): Promise<ProfileView> {
        const url = new URL('/xrpc/app.bsky.actor.getProfile', this.appviewBaseUrl);
        url.searchParams.set('actor', actor);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(
                `Failed to fetch profile for actor "${actor}": ${response.status} ${response.statusText} ${text}`,
            );
        }

        const data = (await response.json()) as ProfileView;
        return data;
    }
}