import { IdentityManager } from "./IdentityManager";

import { PrivateIdentity } from "./models/PrivateIdentity";
import { PublicIdentity } from "./models/PublicIdentity";

import { PeerId } from "./valueObjects/PeerID";

export class Identity {

    private readonly manager: IdentityManager;

    constructor() {

        this.manager = new IdentityManager();

    }

    /**
     * Initialize identity.
     */
    public async initialize(
        userName: string
    ): Promise<PrivateIdentity> {

        return this.manager.initialize(
            userName
        );

    }

    /**
     * Get private identity.
     */
    public getPrivateIdentity(): PrivateIdentity {

        const identity =
            this.manager.getIdentity();

        if (!identity) {
            throw new Error("Identity is not initialized.");
        }

        return identity;

    }

    /**
     * Get public identity.
     */
    public getPublicIdentity(): PublicIdentity {

        return this.manager.getPublicIdentity();

    }

    /**
     * Get PeerId.
     */
    public getPeerId(): PeerId {

        return this.manager.getPeerId();

    }

}
