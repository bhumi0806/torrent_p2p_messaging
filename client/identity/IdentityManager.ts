import { IdentityStorage } from "./IdentityStorage";
import { IdentityValidator } from "./IdentityValidator";

import { KeyGenerator } from "./KeyGenerator";

import { PrivateIdentity } from "./models/PrivateIdentity";
import { PublicIdentity } from "./models/PublicIdentity";

import { PeerId } from "./valueObjects/PeerID";

export class IdentityManager {

    private identity?: PrivateIdentity;

    public loadStoredIdentity(): PrivateIdentity | null {

        const storedIdentity =
            IdentityStorage.load();

        if (
            !storedIdentity ||
            !IdentityValidator.validate(
                storedIdentity
            )
        ) {
            return null;
        }

        this.identity = storedIdentity;

        return this.identity;

    }

    /**
     * Initialize identity.
     */
    public async initialize(
        userName: string
    ): Promise<PrivateIdentity> {

        const storedIdentity =
            IdentityStorage.load();

        const trimmedUserName = userName.trim();

        if (
            storedIdentity &&
            IdentityValidator.validate(
                storedIdentity
            )
        ) {

            const storedUserName =
                storedIdentity
                    .getPublicIdentity()
                    .username
                    .toString()
                    .trim();

            if (storedUserName === trimmedUserName) {
                this.identity = storedIdentity;
                return this.identity;
            }

            console.log(
                `IdentityManager: stored identity username ` +
                `(${storedUserName}) does not match requested ` +
                `username (${trimmedUserName}). Clearing stored identity.`
            );

            IdentityStorage.clear();

        }

        const keyPair =
            await KeyGenerator.generate();

        const peerId =
            await PeerId.fromPublicKey(

                keyPair.publicKey.bytes

            );

        const publicIdentity =
            new PublicIdentity(

                peerId,

                { toString: () => userName } as any,

                keyPair.publicKey

            );

        this.identity =
            new PrivateIdentity(

                keyPair,

                publicIdentity

            );

        IdentityStorage.save(
            this.identity
        );

        return this.identity;

    }


    /**
     * Get complete identity.
     */
    public getIdentity(): PrivateIdentity | undefined {

        return this.identity;

    }

    /**
     * Get public identity.
     */
    public getPublicIdentity(): PublicIdentity {

        if (!this.identity) {
            throw new Error("Identity is not initialized.");
        }

        return this.identity.getPublicIdentity();

    }

    /**
     * Get PeerId.
     */
    public getPeerId(): PeerId {

        if (!this.identity) {
            throw new Error("Identity is not initialized.");
        }

        return this.identity.getPeerId();

    }

    /**
     * Check whether a peer is known.
     */
    public isKnownPeer(peerId: PeerId): boolean {

        if (!this.identity) {
            return false;
        }

        return this.identity.getPeerId().equals(peerId);

    }

}
