import { PeerConnection } from "./models/PeerConnection";
import { WebRTCFactory } from "./WebRTCFactory";

import { PeerId } from "../identity/valueObjects/PeerID";

export class PeerConnectionManager {

    private readonly connections =
        new Map<string, PeerConnection>();

    /**
     * Create a new PeerConnection.
     */
    public create(
        
        peerId: PeerId
    ): PeerConnection {
         if (this.contains(peerId)) {
        return this.find(peerId)!;
    }
        const connection =
            WebRTCFactory.createPeerConnection(
                peerId
            );

        this.connections.set(
            peerId.toString(),
            connection
        );

        return connection;

    }

    /**
     * Find PeerConnection.
     */
    public find(
        peerId: PeerId
    ): PeerConnection | undefined {

        return this.connections.get(
            peerId.toString()
        );

    }

    /**
     * Check if PeerConnection exists.
     */
    public contains(
        peerId: PeerId
    ): boolean {

        return this.connections.has(
            peerId.toString()
        );

    }

    /**
     * Remove PeerConnection.
     */
    public remove(
        peerId: PeerId
    ): void {

        const connection =
            this.find(peerId);

        if (!connection) {

            return;

        }

        connection.close();

        this.connections.delete(
            peerId.toString()
        );

    }

    /**
     * Create WebRTC offer.
     */
    public async createOffer(
        connection: PeerConnection
    ): Promise<RTCSessionDescriptionInit> {
        const rtcConnection = connection.getConnection();

        const offer = await rtcConnection.createOffer();
        await rtcConnection.setLocalDescription(offer);

        return offer;

    }

    /**
     * Create WebRTC answer.
     */
    public async createAnswer(
        connection: PeerConnection
    ): Promise<RTCSessionDescriptionInit> {

        const rtcConnection = connection.getConnection();

        const answer = await rtcConnection.createAnswer();
        await rtcConnection.setLocalDescription(answer);

        return answer;

    }

    /**
     * Set remote description.
     */
    public async setRemoteDescription(
        connection: PeerConnection,
        description: RTCSessionDescriptionInit
    ): Promise<void> {
        if (!description.type || !description.sdp) {
            throw new Error("Invalid session description.");
        }

        await connection.getConnection().setRemoteDescription(
            new RTCSessionDescription(description)
        );

    }

    /**
     * Get all PeerConnections.
     */
    public getAll():
        PeerConnection[] {

        return Array.from(
            this.connections.values()
        );

    }

}