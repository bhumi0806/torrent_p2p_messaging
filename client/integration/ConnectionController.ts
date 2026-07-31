import { PeerId } from "../identity/valueObjects/PeerID";

import { BootstrapClient } from "../bootstrap/bootstrapClient";

import { WebRTCManager } from "../webrtc/WebRTCManager";
import { PeerConnection } from "../webrtc/models/PeerConnection";
import { DataChannel } from "../webrtc/models/DataChannel";

import { EncryptionManager } from "../encryption/EncryptionManager";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";

export class ConnectionController {

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

    }

    /**
     * Handle received offer.
     */
    public async handleOffer(

        senderId: PeerId | string,

        offer: RTCSessionDescriptionInit

    ): Promise<void> {
        const remotePeerId = this.toPeerId(senderId);

        if (this.context.getConnection(remotePeerId)) {
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

        await this.prepareSessionKey(remotePeerId);

        this.registerIceCandidateRelay(
            connection,
            remotePeerId
        );

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

        const answer =

            await this.webRTCManager.createAnswer(

                connection

            );

        await this.bootstrapClient.sendAnswer(

            remotePeerId,

            answer

        );

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
                this.context.removeDataChannel(
                    peerId
                );
                this.eventBus.emit(
                    "PEER_DISCONNECTED",
                    peerId
                );
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

        await this.encryptionManager.deriveAndStoreSessionKey(
            identity.getPeerId(),
            peerId
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
