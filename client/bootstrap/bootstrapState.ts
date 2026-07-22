import { ConnectionState } from "./types/ConnectionState";

export class BootstrapState {

    private socket: WebSocket | null = null;

    private state: ConnectionState =
        ConnectionState.DISCONNECTED;

    private peers: Map<string, any> = new Map();

    public setSocket(
        socket: WebSocket
    ): void {

        this.socket = socket;

    }

    public getSocket():
        WebSocket | null {

        return this.socket;

    }

    public setState(
        state: ConnectionState
    ): void {

        this.state = state;

    }

    public getState():
        ConnectionState {

        return this.state;

    }

    public isConnected(): boolean {

        return this.state ===
            ConnectionState.CONNECTED;

    }

    /**
     * Store the peer list from the bootstrap server.
     */
    public setPeerList(peers: any[]): void {

        this.peers.clear();
        peers.forEach(peer => {
            this.peers.set(peer.peerId, peer);
        });

    }

    /**
     * Get all stored peers.
     */
    public getPeerList(): any[] {

        return Array.from(this.peers.values());

    }

    /**
     * Add a single peer.
     */
    public addPeer(peer: any): void {

        this.peers.set(peer.peerId, peer);

    }

    /**
     * Remove a peer by ID.
     */
    public removePeer(peerId: string): void {

        this.peers.delete(peerId);

    }

}