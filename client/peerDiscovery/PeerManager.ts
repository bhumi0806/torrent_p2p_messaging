import { PeerRegistry } from "./PeerRegistry";
import { Peer } from "./models/Peer";

import { PeerId } from "../identity/valueObjects/PeerID";

export class PeerManager {

    constructor(
        private readonly registry: PeerRegistry
    ) {}

    /**
     * Add a peer.
     */
    public addPeer(
        peer: Peer
    ): boolean {

        return this.registry.add(peer);

    }

    /**
     * Remove a peer.
     */
    public removePeer(
        peerId: PeerId
    ): boolean {

        return this.registry.remove(peerId);

    }

    /**
     * Find a peer.
     */
    public findPeer(
        peerId: PeerId
    ): Peer | undefined {

        return this.registry.find(peerId);

    }

    /**
     * Check whether a peer exists.
     */
    public hasPeer(
        peerId: PeerId
    ): boolean {

        return this.registry.contains(peerId);

    }

    /**
     * Get all discovered peers.
     */
    public getPeers(): Peer[] {

        return this.registry.getAll();

    }

    /**
     * Number of connected peers.
     */
    public getPeerCount(): number {

        return this.registry
            .getAll()
            .length;

    }

    /**
     * Remove every peer.
     */
    public clear(): void {

        this.registry.clear();

    }

}