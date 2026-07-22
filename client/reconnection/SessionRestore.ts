import { PeerId } from "../identity/valueObjects/PeerID";

import { EncryptionManager } from "../encryption/EncryptionManager";
import { SessionKey } from "../encryption/models/SessionKey";

export class SessionRestorer {

    constructor(

        private readonly encryptionManager: EncryptionManager

    ) {}

    /**
     * Restore a secure session.
     */
    public async restore(
        peerId: PeerId
    ): Promise<void> {

        /*
         * Destroy the old session key to maintain
         * Perfect Forward Secrecy.
         */
        this.encryptionManager.removeSessionKey(
            peerId
        );

        /*
         * Generate a fresh session key.
         */
        const sessionKey: SessionKey =

            this.encryptionManager
                .generateSessionKey();

        /*
         * Store the new session key.
         * (In a production implementation this key
         * should be exchanged securely using an
         * authenticated ECDH/X25519 key exchange,
         * never sent directly.)
         */
        this.encryptionManager.storeSessionKey(

            peerId,

            sessionKey

        );

    }

}