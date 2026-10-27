import WebSocket from "ws";

/**
 * Represents one currently connected peer.
 *
 * This model exists only inside the Bootstrap Server.
 *
 * It contains enough information to identify a peer
 * and forward WebRTC signaling messages.
 */
export class Peer {

    /**
     * Unique identifier of the peer.
     */
    public readonly peerId: string;

    /**
     * User's display name.
     */
    public readonly username: string;

    /**
     * Public key shared with other peers.
     */
    public readonly publicKey: string;

    public readonly coordinate?: number;

    /**
     * Active WebSocket connection.
     */
    private socket: WebSocket;

    /**
     * Time when the peer connected.
     */
    public readonly connectedAt: Date;

    /**
     * Updated whenever activity is received
     * from this peer.
     */
    private lastSeen: Date;

    constructor(
        peerId: string,
        username: string,
        publicKey: string,
        socket: WebSocket,
        coordinate?: number
    ) {

        this.peerId = peerId;
        this.username = username;
        this.publicKey = publicKey;
        this.coordinate = coordinate;

        this.socket = socket;

        this.connectedAt = new Date();
        this.lastSeen = new Date();

    }

    /**
     * Returns the active WebSocket connection.
     */
    public getSocket(): WebSocket {

        return this.socket;

    }

    /**
     * Replaces the current WebSocket.
     *
     * Used during reconnection.
     */
    public setSocket(socket: WebSocket): void {

        this.socket = socket;

    }

    /**
     * Updates the peer's last activity timestamp.
     */
    public refreshLastSeen(): void {

        this.lastSeen = new Date();

    }

    /**
     * Returns the last activity timestamp.
     */
    public getLastSeen(): Date {

        return this.lastSeen;

    }

}
