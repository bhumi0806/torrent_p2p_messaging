import { PeerManager } from "./PeerManager";
import { PeerRegistry } from "./PeerRegistry";
import { DiscoveryEventHandler } from "./DiscoveryEventHandler";

import { Peer } from "./models/Peer";
import { PeerId } from "../identity/valueObjects/PeerID";

export class PeerDiscovery {

    private readonly registry: PeerRegistry;

    private readonly manager: PeerManager;

    private readonly eventHandler: DiscoveryEventHandler;

    constructor() {

        this.registry = new PeerRegistry();

        this.manager =
            new PeerManager(
                this.registry
            );

        this.eventHandler =
            new DiscoveryEventHandler(
                this.registry
            );

    }

    /**
     * Get manager.
     */
    public getPeerManager(): PeerManager {

        return this.manager;

    }

    /**
     * Get event handler.
     */
    public getEventHandler():
        DiscoveryEventHandler {

        return this.eventHandler;

    }

    /**
     * Find peer.
     */
    public findPeer(
        peerId: PeerId
    ): Peer | undefined {

        return this.manager.findPeer(
            peerId
        );

    }

    /**
     * Get all peers.
     */
    public getPeers(): Peer[] {

        return this.manager.getPeers();

    }

}