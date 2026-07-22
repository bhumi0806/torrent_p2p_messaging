import sodium from "libsodium-wrappers";

import { PeerId } from "../identity/valueObjects/PeerID";
import { SessionKey } from "./models/SessionKey";

export class SessionKeyManager {

    private readonly sessionKeys =
        new Map<string, SessionKey>();

    /**
     * Generate a new session key.
     */
    public generate(): SessionKey {

        const key =
            sodium.crypto_secretbox_keygen();

        return new SessionKey(key);

    }

    /**
     * Store a session key.
     */
    public store(
        peerId: PeerId,
        sessionKey: SessionKey
    ): void {

        this.sessionKeys.set(

            peerId.toString(),

            sessionKey

        );

    }

    /**
     * Retrieve a session key.
     */
    public get(
        peerId: PeerId
    ): SessionKey | undefined {

        return this.sessionKeys.get(

            peerId.toString()

        );

    }

    /**
     * Check if a session key exists.
     */
    public has(
        peerId: PeerId
    ): boolean {

        return this.sessionKeys.has(

            peerId.toString()

        );

    }

    /**
     * Remove a session key.
     */
    public remove(
        peerId: PeerId
    ): void {

        this.sessionKeys.delete(

            peerId.toString()

        );

    }

    /**
     * Clear all session keys.
     */
    public clear(): void {

        this.sessionKeys.clear();

    }

}