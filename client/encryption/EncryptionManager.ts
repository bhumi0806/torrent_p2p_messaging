import sodium from "libsodium-wrappers";

import { PeerId } from "../identity/valueObjects/PeerID";
import { PublicKey } from "../identity/valueObjects/PublicKey";
import { PrivateIdentity } from "../identity/models/PrivateIdentity";

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

    public async deriveAndStoreSessionKey(
        localIdentity: PrivateIdentity,
        remotePeerId: PeerId,
        remotePublicKey: PublicKey
    ): Promise<void> {

        await sodium.ready;

        const localPeerId =
            localIdentity.getPeerId();

        const localKeyPair =
            localIdentity.getKeyPair();

        const localCurveSecretKey =
            sodium.crypto_sign_ed25519_sk_to_curve25519(
                localKeyPair.privateKey.bytes
            );

        const remoteCurvePublicKey =
            sodium.crypto_sign_ed25519_pk_to_curve25519(
                remotePublicKey.bytes
            );

        const sharedSecret =
            sodium.crypto_scalarmult(
                localCurveSecretKey,
                remoteCurvePublicKey
            );

        const context =
            [
                localPeerId.toString(),
                remotePeerId.toString(),
                localKeyPair.publicKey.toBase64(),
                remotePublicKey.toBase64()
            ]
                .sort()
                .join(":");

        const material =
            this.concatBytes(
                sodium.from_string("bleep-e2ee-v1:"),
                sharedSecret,
                sodium.from_string(context)
            );

        const key =
            sodium.crypto_generichash(
                32,
                material,
                null,
                "uint8array"
            );

        this.storeSessionKey(
            remotePeerId,
            new SessionKey(key)
        );

    }

    private concatBytes(
        ...parts: Uint8Array[]
    ): Uint8Array {

        const totalLength =
            parts.reduce(
                (sum, part) => sum + part.length,
                0
            );

        const result =
            new Uint8Array(totalLength);

        let offset = 0;

        for (const part of parts) {
            result.set(part, offset);
            offset += part.length;
        }

        return result;

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
