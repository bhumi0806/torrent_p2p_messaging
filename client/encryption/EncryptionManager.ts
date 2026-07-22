import { PeerId } from "../identity/valueObjects/PeerID";

import { SessionKey } from "./models/SessionKey";
import { EncryptedMessage } from "./models/EncryptedMessage";

import { SessionKeyManager } from "./SessionKeyManager";
import { CryptoBox } from "./CryptoBox";

export class EncryptionManager {

    private readonly sessionKeyManager =
        new SessionKeyManager();

    /**
     * Generate a new session key.
     */
    public generateSessionKey(): SessionKey {

        return this.sessionKeyManager.generate();

    }

    /**
     * Store session key.
     */
    public storeSessionKey(
        peerId: PeerId,
        sessionKey: SessionKey
    ): void {

        this.sessionKeyManager.store(

            peerId,

            sessionKey

        );

    }

    /**
     * Encrypt a message.
     */
    public encrypt(
        peerId: PeerId,
        plaintext: string
    ): EncryptedMessage {

        const sessionKey =
            this.sessionKeyManager.get(peerId);

        if (!sessionKey) {

            throw new Error(
                "Session key not found."
            );

        }

        return CryptoBox.encrypt(

            plaintext,

            sessionKey

        );

    }

    /**
     * Decrypt a message.
     */
    public decrypt(
        peerId: PeerId,
        encryptedMessage: EncryptedMessage
    ): string {

        const sessionKey =
            this.sessionKeyManager.get(peerId);

        if (!sessionKey) {

            throw new Error(
                "Session key not found."
            );

        }

        return CryptoBox.decrypt(

            encryptedMessage,

            sessionKey

        );

    }

    /**
     * Encrypt raw bytes.
     */
    public encryptBytes(
        peerId: PeerId,
        bytes: Uint8Array
    ): EncryptedMessage {

        const sessionKey =
            this.sessionKeyManager.get(peerId);

        if (!sessionKey) {

            throw new Error(
                "Session key not found."
            );

        }

        return CryptoBox.encryptBytes(
            bytes,
            sessionKey
        );

    }

    /**
     * Decrypt raw bytes.
     */
    public decryptBytes(
        peerId: PeerId,
        encryptedMessage: EncryptedMessage
    ): Uint8Array {

        const sessionKey =
            this.sessionKeyManager.get(peerId);

        if (!sessionKey) {

            throw new Error(
                "Session key not found."
            );

        }

        return CryptoBox.decryptBytes(
            encryptedMessage,
            sessionKey
        );

    }

    /**
     * Remove session key.
     */
    public removeSessionKey(
        peerId: PeerId
    ): void {

        this.sessionKeyManager.remove(
            peerId
        );

    }

    /**
     * Check whether a session key exists.
     */
    public hasSessionKey(
        peerId: PeerId
    ): boolean {

        return this.sessionKeyManager.has(
            peerId
        );

    }

}