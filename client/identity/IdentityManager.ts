import { IdentityStorage } from "./IdentityStorage";
import { IdentityValidator } from "./IdentityValidator";

import { KeyGenerator } from "./KeyGenerator";

import { PrivateIdentity } from "./models/PrivateIdentity";
import { PublicIdentity } from "./models/PublicIdentity";

import { PeerId } from "./valueObjects/PeerID";

export class IdentityManager {

    private identity!: PrivateIdentity;

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
    public getIdentity(): PrivateIdentity {

        return this.identity;

    }

    /**
     * Get public identity.
     */
    public getPublicIdentity(): PublicIdentity {

        return this.identity.getPublicIdentity();

    }

    /**
     * Get PeerId.
     */
    public getPeerId(): PeerId {

        return this.identity.getPeerId();

    }

    /**
     * Check whether a peer is known.
     */
    public isKnownPeer(peerId: PeerId): boolean {

        return this.identity.getPeerId().equals(peerId);

    }

}