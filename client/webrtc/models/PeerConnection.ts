import { PeerId } from "../../identity/valueObjects/PeerID";
import { ConnectionStatus } from "../types/ConnectionStatus";

export class PeerConnection {

    private status: ConnectionStatus =
        ConnectionStatus.NEW;

    constructor(

        private readonly peerId: PeerId,

        private readonly connection: RTCPeerConnection

    ) {}

    /**
     * Get peer id.
     */
    public getPeerId(): PeerId {

        return this.peerId;

    }

    /**
     * Get RTCPeerConnection.
     */
    public getConnection(): RTCPeerConnection {

        return this.connection;

    }

    /**
     * Get status.
     */
    public getStatus(): ConnectionStatus {

        return this.status;

    }

    /**
     * Update status.
     */
    public setStatus(
        status: ConnectionStatus
    ): void {

        this.status = status;

    }

    /**
     * Close connection.
     */
    public close(): void {

        this.connection.close();

        this.status = ConnectionStatus.CLOSED;

    }

}