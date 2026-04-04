import { Jetstream } from '@skyware/jetstream';

// Options for configuring the Jetstream client. Intentionally minimal
export interface JetstreamClientOptions {
    wantedCollections: string[];
}

//Start a Jetstream subscription that logs newly created profiles.
export async function startJetstreamProfileListener(
    options: JetstreamClientOptions,
): Promise<void> {
    const jetstream = new Jetstream({
        wantedCollections: options.wantedCollections,
    });

    // Listen to newly created profiles.
    jetstream.onCreate('app.bsky.actor.profile', (event) => {
        const record = event.commit.record as {
            displayName?: string;
            description?: string;
        };

        const displayName = record.displayName ?? '(no display name)';
        const description = record.description ?? '(no description)';

        console.log('========================================');
        console.log('New profile created:');
        console.log(` DID: ${event.did}`);
        console.log(` DisplayName: ${displayName}`);
        console.log(` Description: ${description}`);
        console.log(` Cursor (time_us): ${event.time_us}`);
    });

    console.log('Connecting to Bluesky Jetstream...');

    try {
        await jetstream.start();
    } catch (error) {
        console.error('Failed to start Jetstream client:', error);
        throw error;
    }
}