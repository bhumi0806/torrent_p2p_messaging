import { PeerId } from "../identity/valueObjects/PeerID";
import { PublicKey } from "../identity/valueObjects/PublicKey";

import { BootstrapClient } from "../bootstrap/bootstrapClient";

import { WebRTCManager } from "../webrtc/WebRTCManager";
import { PeerConnection } from "../webrtc/models/PeerConnection";
import { DataChannel } from "../webrtc/models/DataChannel";

import { EncryptionManager } from "../encryption/EncryptionManager";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";

export class ConnectionController {
    private readonly pendingIceCandidates =
        new Map<string, RTCIceCandidateInit[]>();

    constructor(

        private readonly webRTCManager: WebRTCManager,

        private readonly bootstrapClient: BootstrapClient,

        private readonly encryptionManager: EncryptionManager,

        private readonly eventBus: EventBus,

        private readonly context: ApplicationContext

    ) {}

    /**
     * Connect to a peer.
     */
    public async connect(
    
        peerId: PeerId | string

    ): Promise<void> {
        const remotePeerId = this.toPeerId(peerId);

        if (this.context.getConnection(remotePeerId)) {
            const channel = this.context.getDataChannel(remotePeerId);
            if (channel?.isOpen()) {
                this.eventBus.emit(
                    "PEER_CONNECTED",
                    remotePeerId
                );
            }
            return;
        }

        const connection =

            this.webRTCManager.createConnection(
                remotePeerId
            );

        this.context.addConnection(

            remotePeerId,

            connection

        );

        try {
            this.registerConnectionFailureHandler(
                connection,
                remotePeerId
            );

            await this.prepareSessionKey(remotePeerId);

            this.registerIceCandidateRelay(
                connection,
                remotePeerId
            );

            const channel =
                this.webRTCManager.createDataChannel(
                    connection,
                    "chat"
                );

            this.registerDataChannel(
                remotePeerId,
                channel
            );

            const offer =
                await this.webRTCManager.createOffer(
                    connection
                );

            await this.bootstrapClient.sendOffer(

                remotePeerId,

                offer

            );
        } catch (error) {
            this.discardConnection(remotePeerId, connection);
            throw error;
        }

    }

    /**
     * Handle received offer.
     */
    public async handleOffer(

        senderId: PeerId | string,

        offer: RTCSessionDescriptionInit

    ): Promise<void> {
        const remotePeerId = this.toPeerId(senderId);
        const existingConnection = this.context.getConnection(remotePeerId);
        const isNewConnection = !existingConnection;
        const connection =
            existingConnection
            ?? this.webRTCManager.createConnection(remotePeerId);

        if (existingConnection) {
            const rtcConnection = existingConnection.getConnection();
            const localPeerId = this.context.getIdentity()?.getPeerId();

            if (
                rtcConnection.signalingState !== "have-local-offer" ||
                !localPeerId
            ) {
                return;
            }

            if (localPeerId.toString() < remotePeerId.toString()) {
                return;
            }
        }

        try {
            if (isNewConnection) {
                this.context.addConnection(remotePeerId, connection);
                this.registerConnectionFailureHandler(
                    connection,
                    remotePeerId
                );

                await this.prepareSessionKey(remotePeerId);
                this.registerIceCandidateRelay(
                    connection,
                    remotePeerId
                );
            } else {
                await connection.getConnection().setLocalDescription({
                    type: "rollback"
                });

                this.context.getDataChannel(remotePeerId)?.close();
                this.context.removeDataChannel(remotePeerId);
            }

            this.webRTCManager.registerIncomingChannelHandler(
                connection,
                (channel) => this.registerDataChannel(
                    remotePeerId,
                    channel
                )
            );

            await this.webRTCManager.setRemoteDescription(

                connection,

                offer

            );

            await this.flushPendingIceCandidates(
                remotePeerId,
                connection
            );

            const answer =
                await this.webRTCManager.createAnswer(

                    connection

                );

            await this.bootstrapClient.sendAnswer(

                remotePeerId,

                answer

            );
        } catch (error) {
            this.discardConnection(remotePeerId, connection);
            throw error;
        }

    }

    /**
     * Handle received answer.
     */
    public async handleAnswer(

        senderId: PeerId | string,

        answer: RTCSessionDescriptionInit

    ): Promise<void> {
        const remotePeerId = this.toPeerId(senderId);

        const connection =

            this.context.getConnection(
                remotePeerId
            );

        if (!connection) {

            throw new Error(
                "Peer connection not found."
            );

        }

        await this.webRTCManager.setRemoteDescription(

            connection,

            answer

        );

        await this.flushPendingIceCandidates(
            remotePeerId,
            connection
        );

        await this.prepareSessionKey(remotePeerId);

    }

    /**
     * Handle ICE candidate.
     */
    public async handleIceCandidate(

        senderId: PeerId | string,

        candidate: RTCIceCandidateInit

    ): Promise<void> {
        const remotePeerId = this.toPeerId(senderId);

        const connection =

            this.context.getConnection(
                remotePeerId
            );

        if (!connection) {
            const queuedCandidates =
                this.pendingIceCandidates.get(remotePeerId.toString()) ?? [];
            queuedCandidates.push(candidate);
            this.pendingIceCandidates.set(
                remotePeerId.toString(),
                queuedCandidates
            );
            return;

        }

        if (!connection.getConnection().remoteDescription) {
            const queuedCandidates =
                this.pendingIceCandidates.get(remotePeerId.toString()) ?? [];
            queuedCandidates.push(candidate);
            this.pendingIceCandidates.set(
                remotePeerId.toString(),
                queuedCandidates
            );
            return;
        }

        await this.webRTCManager.addIceCandidate(

            connection,

            candidate

        );

    }

    /**
     * Disconnect peer.
     */
    private registerIceCandidateRelay(
        connection: PeerConnection,
        peerId: PeerId
    ): void {
        this.webRTCManager.registerIceCandidateHandler(
            connection,
            (candidate) => {
                void this.bootstrapClient.sendIceCandidate(
                    peerId,
                    candidate.toJSON()
                );
            }
        );
    }

    private registerConnectionFailureHandler(
        connection: PeerConnection,
        peerId: PeerId
    ): void {
        connection.getConnection().addEventListener(
            "connectionstatechange",
            () => {
                if (connection.getConnection().connectionState === "failed") {
                    this.disconnect(peerId);
                }
            }
        );
    }

    private discardConnection(
        peerId: PeerId,
        connection: PeerConnection
    ): void {
        if (this.context.getConnection(peerId) !== connection) {
            return;
        }

        this.webRTCManager.removeConnection(peerId);
        this.context.removeConnection(peerId);
        this.context.removeDataChannel(peerId);
        this.encryptionManager.removeSessionKey(peerId);
        this.pendingIceCandidates.delete(peerId.toString());
    }

    private async flushPendingIceCandidates(
        peerId: PeerId,
        connection: PeerConnection
    ): Promise<void> {
        const peerIdString = peerId.toString();
        const candidates =
            this.pendingIceCandidates.get(peerIdString) ?? [];

        this.pendingIceCandidates.delete(peerIdString);

        for (const candidate of candidates) {
            await this.webRTCManager.addIceCandidate(
                connection,
                candidate
            );
        }
    }

    private registerDataChannel(
        peerId: PeerId,
        channel: DataChannel
    ): void {

        this.context.setDataChannel(
            peerId,
            channel
        );

        this.webRTCManager.registerDataChannelOpenHandler(
            channel,
            () => {
                console.log(
                    `DataChannel open with ${peerId.toString()}`
                );
                this.eventBus.emit(
                    "PEER_CONNECTED",
                    peerId
                );
            }
        );

        this.webRTCManager.registerDataChannelMessageHandler(
            channel,
            (event) => {
                if (typeof event.data !== "string") {
                    return;
                }

                this.handleDataChannelMessage(
                    peerId,
                    event.data
                );
            }
        );

        this.webRTCManager.registerDataChannelCloseHandler(
            channel,
            () => {
                if (this.context.getDataChannel(peerId) === channel) {
                    this.context.removeDataChannel(peerId);
                    this.eventBus.emit(
                        "PEER_DISCONNECTED",
                        peerId
                    );
                }
            }
        );

    }

    private async prepareSessionKey(
        peerId: PeerId
    ): Promise<void> {

        if (this.encryptionManager.hasSessionKey(peerId)) {
            return;
        }

        const identity =
            this.context.getIdentity();

        if (!identity) {
            throw new Error("Local identity is not initialized.");
        }

        const remotePeer =
            this.context
                .getOnlinePeers()
                .find(
                    (peer: any) =>
                        peer?.peerId === peerId.toString()
                );

        if (
            !remotePeer ||
            typeof remotePeer.publicKey !== "string"
        ) {
            throw new Error(
                "Remote peer public key is not available."
            );
        }

        const remotePublicKey =
            PublicKey.fromBase64(remotePeer.publicKey);

        const verifiedPeerId =
            await PeerId.fromPublicKey(
                remotePublicKey.bytes
            );

        if (!verifiedPeerId.equals(peerId)) {
            throw new Error(
                "Remote peer public key does not match peer ID."
            );
        }

        await this.encryptionManager.deriveAndStoreSessionKey(
            identity.getPrivateIdentity(),
            peerId,
            remotePublicKey
        );

    }

    private handleDataChannelMessage(
        senderId: PeerId,
        rawData: string
    ): void {

        let envelope: any;

        try {
            envelope = JSON.parse(rawData);
        } catch {
            envelope = {
                kind: "chat",
                payload: rawData
            };
        }

        if (envelope.kind === "chat") {
            this.eventBus.emit(
                "RECEIVE_MESSAGE",
                {
                    senderId,
                    encryptedMessage: envelope.payload
                }
            );
            return;
        }

        if (envelope.kind === "file-metadata") {
            this.eventBus.emit(
                "FILE_METADATA",
                envelope.payload
            );
            return;
        }

        if (envelope.kind === "file-chunk") {
            this.eventBus.emit(
                "FILE_CHUNK",
                {
                    senderId,
                    chunk: envelope.payload
                }
            );
        }

    }

    private toPeerId(peerId: PeerId | string): PeerId {

        return typeof peerId === "string"
            ? PeerId.fromString(peerId)
            : peerId;

    }

    public disconnect(
        peerId: PeerId | string
    ): void {
        const remotePeerId = this.toPeerId(peerId);

        const connection =

            this.context.getConnection(
                remotePeerId
            );

        if (!connection) {

            return;

        }

        connection.close();

        this.webRTCManager.removeConnection(
            remotePeerId
        );

        this.context.removeConnection(
            remotePeerId
        );

        this.context.removeDataChannel(
            remotePeerId
        );
        this.pendingIceCandidates.delete(remotePeerId.toString());

        this.encryptionManager.removeSessionKey(
            remotePeerId
        );

        this.eventBus.emit(

            "PEER_DISCONNECTED",

            remotePeerId

        );

    }

    /**
     * Register events.
     */
    public register(): void {

        this.eventBus.on(

            "CONNECT_TO_PEER",

            async (peerId: PeerId) => {

                await this.connect(
                    peerId
                );

            }

        );

        this.eventBus.on(

            "WEBRTC_OFFER",

            async (payload: any) => {

                await this.handleOffer(

                    payload.senderId,

                    payload.offer

                );

            }

        );

        this.eventBus.on(

            "WEBRTC_ANSWER",

            async (payload: any) => {

                await this.handleAnswer(

                    payload.senderId,

                    payload.answer

                );

            }

        );

        this.eventBus.on(

            "WEBRTC_ICE",

            async (payload: any) => {

                await this.handleIceCandidate(

                    payload.senderId,

                    payload.candidate

                );

            }

        );

        this.eventBus.on(

            "DISCONNECT_PEER",

            (peerId: PeerId) => {

                this.disconnect(
                    peerId
                );

            }

        );

    }

}
