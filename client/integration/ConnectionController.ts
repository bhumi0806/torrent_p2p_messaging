import { PeerId } from "../identity/valueObjects/PeerID";

import { BootstrapClient } from "../bootstrap/bootstrapClient";

import { WebRTCManager } from "../webrtc/WebRTCManager";
import { PeerConnection } from "../webrtc/models/PeerConnection";

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
    
        peerId: PeerId

    ): Promise<void> {
        if (this.context.getConnection(peerId)) {
    return;
}

        const connection =

            this.webRTCManager.createConnection(
                peerId
            );

        this.context.addConnection(

            peerId,

            connection

        );

        this.registerIceCandidateRelay(
            connection,
            peerId
        );

        const offer =

            await this.webRTCManager.createOffer(
                connection
            );

        await this.bootstrapClient.sendOffer(

            peerId,

            offer

        );

    }

    /**
     * Handle received offer.
     */
    public async handleOffer(

        senderId: PeerId,

        offer: RTCSessionDescriptionInit

    ): Promise<void> {
        if (this.context.getConnection(senderId)) {
    return;
}

        const connection =

            this.webRTCManager.createConnection(
                senderId
            );

        this.context.addConnection(

            senderId,

            connection

        );

        this.registerIceCandidateRelay(
            connection,
            senderId
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

            senderId,

            answer

        );

    }

    /**
     * Handle received answer.
     */
    public async handleAnswer(

        senderId: PeerId,

        answer: RTCSessionDescriptionInit

    ): Promise<void> {

        const connection =

            this.context.getConnection(
                senderId
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

    const sessionKey = this.encryptionManager.generateSessionKey();
    this.encryptionManager.storeSessionKey(
    senderId,
    sessionKey
);

        this.eventBus.emit(

            "PEER_CONNECTED",

            senderId

        );

    }

    /**
     * Handle ICE candidate.
     */
    public async handleIceCandidate(

        senderId: PeerId,

        candidate: RTCIceCandidateInit

    ): Promise<void> {

        const connection =

            this.context.getConnection(
                senderId
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

    public disconnect(
        peerId: PeerId
    ): void {

        const connection =

            this.context.getConnection(
                peerId
            );

        if (!connection) {

            return;

        }

        connection.close();

        this.webRTCManager.removeConnection(
            peerId
        );

        this.context.removeConnection(
            peerId
        );

        this.encryptionManager.removeSessionKey(
            peerId
        );

        this.eventBus.emit(

            "PEER_DISCONNECTED",

            peerId

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