import { PeerId } from "../identity/valueObjects/PeerID";

import { PeerConnection } from "./models/PeerConnection";
import { DataChannel } from "./models/DataChannel";

import { PeerConnectionManager } from "./PeerConnectionManager";
import { DataChannelManager } from "./DataChannelManager";
import { IceCandidateManager } from "./ICECandidateManager";

export class WebRTCManager {

    private readonly peerConnectionManager =
        new PeerConnectionManager();

    private readonly dataChannelManager =
        new DataChannelManager();

    private readonly iceCandidateManager =
        new IceCandidateManager();

    /**
     * Create connection.
     */
    public createConnection(
        peerId: PeerId
    ): PeerConnection {

        return this.peerConnectionManager.create(
            peerId
        );

    }

    /**
     * Replace any existing peer connection with a clean RTCPeerConnection.
     * The caller should immediately bind its ICE and data-channel handlers;
     * ConnectionController does this before creating the offer.
     */
    public initiateConnection(peerId: PeerId): PeerConnection {
        this.peerConnectionManager.remove(peerId);
        return this.peerConnectionManager.create(peerId);
    }

    /**
     * Create DataChannel.
     */
    public createDataChannel(
        connection: PeerConnection,
        label?: string
    ): DataChannel {

        return this.dataChannelManager
            .createDataChannel(
                connection,
                label
            );

    }

    public registerIncomingChannelHandler(
        connection: PeerConnection,
        callback: (channel: DataChannel) => void
    ): void {

        this.dataChannelManager
            .registerIncomingChannelHandler(
                connection,
                callback
            );

    }

    public registerDataChannelOpenHandler(
        channel: DataChannel,
        callback: () => void
    ): void {

        this.dataChannelManager
            .registerOpenHandler(
                channel,
                callback
            );

    }

    public registerDataChannelMessageHandler(
        channel: DataChannel,
        callback: (message: MessageEvent) => void
    ): void {

        this.dataChannelManager
            .registerMessageHandler(
                channel,
                callback
            );

    }

    public registerDataChannelCloseHandler(
        channel: DataChannel,
        callback: () => void
    ): void {

        this.dataChannelManager
            .registerCloseHandler(
                channel,
                callback
            );

    }

    /**
     * Create Offer.
     */
    public async createOffer(
        connection: PeerConnection
    ): Promise<RTCSessionDescriptionInit> {

        return this.peerConnectionManager
            .createOffer(connection);

    }

    /**
     * Create Answer.
     */
    public async createAnswer(
        connection: PeerConnection
    ): Promise<RTCSessionDescriptionInit> {

        return this.peerConnectionManager
            .createAnswer(connection);

    }

    /**
     * Set Remote Description.
     */
    public async setRemoteDescription(
        connection: PeerConnection,
        description: RTCSessionDescriptionInit
    ): Promise<void> {

        await this.peerConnectionManager
            .setRemoteDescription(
                connection,
                description
            );

    }

    /**
     * Register ICE callback.
     */
    public registerIceCandidateHandler(
        connection: PeerConnection,
        callback: (candidate: RTCIceCandidate) => void
    ): void {

        this.iceCandidateManager
            .registerLocalCandidateHandler(
                connection,
                callback
            );

    }

    /**
     * Add remote ICE candidate.
     */
    public async addIceCandidate(
        connection: PeerConnection,
        candidate: RTCIceCandidateInit
    ): Promise<void> {

        await this.iceCandidateManager
            .addRemoteCandidate(
                connection,
                candidate
            );

    }

    /**
     * Remove connection.
     */
    public removeConnection(
        peerId: PeerId
    ): void {

        this.peerConnectionManager.remove(
            peerId
        );

    }

}
