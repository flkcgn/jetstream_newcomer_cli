#!/usr/bin/env node

/**
 * jetstream-newcomer-cli
 *
 * A command-line tool that listens to the Bluesky Jetstream
 * and highlights new, likely human user accounts.
 */

import { Jetstream } from "@skyware/jetstream";

// Subscribe to profile events (for now only profiles, possible expansion to posts, likes, etc.)
const jetstream = new Jetstream({
    wantedCollections: ["app.bsky.actor.profile"]
});

// Listen to newly creeated profiles
jetstream.onCreate("app.bsky.actor.profile", (event) => {
    const record = event.commit.record as {
    displayName: string;
    description: string;
    };


    const displayName = record.displayName ?? "(no display name)";
    const description = record.description ?? "(no description)";


    console.log("========================================");
    console.log("New profile created:");
    console.log(`  DID:        ${event.did}`);
    console.log(`  DisplayName: ${displayName}`);
    console.log(`  Description: ${description}`);
    console.log(`  Cursor:     ${event.time_us}`);
});

//Basic error handling / startup
async function main() {
    console.log("Connecting to Bluesky Jetstream...")
    try {
        await jetstream.start();
    }   catch (error) {
        console.error("Failed to start Jetstream client:", error);
        process.exitCode = 1;
    }
}


main().catch((error) => {
    console.error("Unexpected error in main():", error);
    process.exitCode = 1;
});