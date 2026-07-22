import WebSocket from "ws";

import { Peer } from "../models/Peer";

/**
 * Manages every connected peer.
 *
 * This is the only class allowed to
 * modify the peer registry.
 */
export class PeerManager {

    /**
     * Active peer registry.
     */
    private readonly peers: Map<string, Peer>;
    private readonly socketIndex: Map<WebSocket, string>;

    constructor() {

        this.peers = new Map();
        this.socketIndex = new Map<WebSocket, string>();

    }

    /**
     * Registers a new peer.
     *
     * Returns false if the peer already exists.
     */
    public registerPeer(peer: Peer): boolean {

        if (this.peers.has(peer.peerId)) {
            return false;
        }

        this.peers.set(peer.peerId, peer);
        this.socketIndex.set(peer.getSocket(), peer.peerId);

        return true;

    }

    /**
     * Removes a peer.
     */
    public removePeer(peerId: string): boolean {

        const peer = this.peers.get(peerId);

        if (!peer) {
            return false;
        }

        this.socketIndex.delete(peer.getSocket());

        return this.peers.delete(peerId);

    }

    /**
     * Finds a peer.
     */
    public findPeer(peerId: string): Peer | undefined {

        return this.peers.get(peerId);

    }

    public findPeerBySocket(socket: WebSocket): Peer | undefined {

        const peerId = this.socketIndex.get(socket);

        if (!peerId) {
            return undefined;
        }

        return this.peers.get(peerId);

    }

    public removePeerBySocket(socket: WebSocket): Peer | undefined {

        const peerId = this.socketIndex.get(socket);

        if (!peerId) {
            return undefined;
        }

        const peer = this.peers.get(peerId);

        if (!peer) {
            this.socketIndex.delete(socket);
            return undefined;
        }

        this.socketIndex.delete(socket);
        this.peers.delete(peerId);

        return peer;

    }

    /**
     * Returns true if peer is online.
     */
    public isPeerOnline(peerId: string): boolean {

        return this.peers.has(peerId);

    }

    /**
     * Returns every connected peer.
     */
    public getAllPeers(): ReadonlyArray<Peer> {

        return Array.from(this.peers.values());

    }

    /**
     * Number of connected peers.
     */
    public peerCount(): number {

        return this.peers.size;

    }

    /**
     * Broadcasts a packet to every peer.
     *
     * Optionally excludes one peer.
     */
    public broadcast(
        message: string,
        excludePeerId?: string
    ): void {

        for (const peer of this.peers.values()) {

            if (peer.peerId === excludePeerId) {
                continue;
            }

            peer
                .getSocket()
                .send(message);

        }

    }

}