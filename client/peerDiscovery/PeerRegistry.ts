import { Peer } from "./models/Peer";
import { PeerId } from "../identity/valueObjects/PeerID";

export class PeerRegistry {

    private readonly peers =
        new Map<string, Peer>();

    /**
     * Add peer.
     */
    public add(
        peer: Peer
    ): boolean {

        const id =
            peer.getPeerId().toString();

        if (this.peers.has(id)) {

            return false;

        }

        this.peers.set(id, peer);

        return true;

    }

    /**
     * Remove peer.
     */
    public remove(
        peerId: PeerId
    ): boolean {

        return this.peers.delete(

            peerId.toString()

        );

    }

    /**
     * Find peer.
     */
    public find(
        peerId: PeerId
    ): Peer | undefined {

        return this.peers.get(

            peerId.toString()

        );

    }

    /**
     * Check if peer exists.
     */
    public contains(
        peerId: PeerId
    ): boolean {

        return this.peers.has(

            peerId.toString()

        );

    }

    /**
     * Get all peers.
     */
    public getAll(): Peer[] {

        return Array.from(

            this.peers.values()

        );

    }

    /**
     * Clear registry.
     */
    public clear(): void {

        this.peers.clear();

    }

}