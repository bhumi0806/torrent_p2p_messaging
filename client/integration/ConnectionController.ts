import { PeerId } from "../identity/valueObjects/PeerID";
import { PublicKey } from "../identity/valueObjects/PublicKey";

import { BootstrapClient } from "../bootstrap/bootstrapClient";

import { WebRTCManager } from "../webrtc/WebRTCManager";
import { PeerConnection } from "../webrtc/models/PeerConnection";
import { DataChannel } from "../webrtc/models/DataChannel";

import { EncryptionManager } from "../encryption/EncryptionManager";

import { ApplicationContext } from "./ApplicationContext";
import { EventBus } from "./EventBus";
import { RoutedPacket, SmallWorldNeighbor, SmallWorldRoutingTable } from "../webrtc/SmallWorldRoutingTable";
import { SmallWorldRouter } from "../webrtc/SmallWorldRouter";
import { SelectedNeighbor, SmallWorldTopology } from "../peerDiscovery/SmallWorldTopology";
import { NodeCoordinate } from "../peerDiscovery/NodeCoordinate";
import { PassiveChunkCache } from "../messaging/PassiveChunkCache";
import { XorRouter } from "../peerDiscovery/XorRouter";
import { FindNodeRequest, FindNodeResponse } from "../peerDiscovery/XorRoutingProtocol";
import { RouteMessageHandler } from "../messaging/RouteMessageHandler";
import { RouteMessage, RouteMessageResponse } from "../messaging/RouteMessageProtocol";
import { WebRTCDiagnostics, WebRTCDiagnosticSnapshot } from "../webrtc/WebRTCDiagnostics";
import { createRandomId } from "../utils/createRandomId";

interface ConnectionAttempt {
    readonly attemptId: string;
    readonly initiatorPeerId: string;
    readonly targetPeerId: string;
}

interface PendingOutgoingSetup {
    readonly connection: PeerConnection;
    cancelled: boolean;
    promise: Promise<void>;
}

export class ConnectionController {
    private routingTable?: SmallWorldRoutingTable;
    private router?: SmallWorldRouter;
    private routingPeerId?: string;
    private routingCoordinate?: number;
    private readonly selectedRoutingNeighbors = new Map<string, SelectedNeighbor>();
    private readonly pendingIceCandidates =
        new Map<string, RTCIceCandidateInit[]>();

    private xorRouter?: XorRouter;
    private xorRoutingPeerId?: string;
    private readonly routeMessageHandler: RouteMessageHandler;
    private readonly webRTCDiagnostics = new WebRTCDiagnostics();
    private readonly connectionAttempts = new WeakMap<RTCPeerConnection, ConnectionAttempt>();
    private readonly pendingOutgoingSetups = new Map<string, PendingOutgoingSetup>();

    constructor(

        private readonly webRTCManager: WebRTCManager,

        private readonly bootstrapClient: BootstrapClient,

        private readonly encryptionManager: EncryptionManager,

        private readonly eventBus: EventBus,

        private readonly context: ApplicationContext

    ) {
        this.routeMessageHandler = new RouteMessageHandler(
            this.context,
            this.encryptionManager,
            {
                selectNextHop: (destinationPeerId, excludedPeerIds) =>
                    this.ensureXorRouter()?.selectNextHop(destinationPeerId, excludedPeerIds),
                sendToPeer: (peerId, payload) => this.sendRouteMessagePacket(peerId, payload),
                deliver: async (originPeerId, transportPeerId, encryptedPayload) => {
                    await this.eventBus.emit("RECEIVE_MESSAGE", {
                        senderId: PeerId.fromString(originPeerId),
                        transportPeerId: PeerId.fromString(transportPeerId),
                        encryptedMessage: encryptedPayload
                    });
                }
            }
        );
    }

    /**
     * Connect to a peer.
     */
    public async connect(
        peerId: PeerId | string

    ): Promise<void> {
        const remotePeerId = this.toPeerId(peerId);

        const existingConnection = this.context.getConnection(remotePeerId);
        if (existingConnection) {
            const channel = this.context.getDataChannel(remotePeerId);
            const connectionState = existingConnection.getConnection().connectionState;
            const channelState = channel?.getChannel().readyState;
            const terminalConnection = connectionState === "failed" || connectionState === "closed";
            if (channel?.isOpen() && !terminalConnection) {
                this.eventBus.emit(
                    "PEER_CONNECTED",
                    remotePeerId
                );
                return;
            }

            const isDead = terminalConnection
                || channelState === "closed"
                || (connectionState === "disconnected" && channelState !== "open" && channelState !== "connecting");

            // A repeated Connect request must not replace an in-flight offer.
            // ICE's disconnected state can recover without creating a new peer connection.
            if (!isDead) {
                return;
            }

            this.discardConnection(remotePeerId, existingConnection);
        }

        const connection =

            this.webRTCManager.initiateConnection(
                remotePeerId
            );

        this.context.addConnection(

            remotePeerId,

            connection

        );
        const attempt = this.startConnectionAttempt(connection, remotePeerId, "outgoing");
        this.logSignalingStage(attempt, "OFFER", "created");
        const setup: PendingOutgoingSetup = {
            connection,
            cancelled: false,
            promise: Promise.resolve()
        };
        const key = remotePeerId.toString();
        this.pendingOutgoingSetups.set(key, setup);
        const runSetup = this.createOutgoingOffer(remotePeerId, connection, attempt, setup);
        setup.promise = runSetup;
        try {
            await runSetup;
        } catch (error) {
            this.logSignalingStage(attempt, "OFFER", "failed", { errorName: getErrorName(error) });
            this.discardConnection(remotePeerId, connection);
            throw error;
        } finally {
            if (this.pendingOutgoingSetups.get(key) === setup) this.pendingOutgoingSetups.delete(key);
        }

    }

    private async createOutgoingOffer(
        peerId: PeerId,
        connection: PeerConnection,
        attempt: ConnectionAttempt,
        setup: PendingOutgoingSetup
    ): Promise<void> {
        this.registerConnectionFailureHandler(connection, peerId);
        await this.prepareSessionKey(peerId);
        this.logSignalingStage(attempt, "IDENTITY", "peer-public-key-verified");
        if (setup.cancelled || this.context.getConnection(peerId) !== connection) {
            this.logSignalingStage(attempt, "OFFER", "cancelled-for-incoming-offer");
            return;
        }

        this.registerIceCandidateRelay(connection, peerId);
        const dataChannel = this.webRTCManager.createDataChannel(connection, "chat");
        this.registerDataChannel(peerId, dataChannel);
        const offer = await this.webRTCManager.createOffer(connection);
        this.logSignalingStage(attempt, "OFFER", "local-description-set");
        if (setup.cancelled || this.context.getConnection(peerId) !== connection) {
            this.logSignalingStage(attempt, "OFFER", "cancelled-for-incoming-offer");
            return;
        }

        await this.bootstrapClient.sendOffer(peerId, offer);
        // This means the open bootstrap socket accepted the write; the server
        // does not currently acknowledge delivery to the target peer.
        this.logSignalingStage(attempt, "OFFER", "written-to-bootstrap-socket");
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
        const attempt = isNewConnection
            ? this.startConnectionAttempt(connection, remotePeerId, "incoming")
            : this.connectionAttempts.get(connection.getConnection());
        if (attempt) this.logSignalingStage(attempt, "OFFER", "received");

        if (existingConnection) {
            const rtcConnection = existingConnection.getConnection();
            const localPeerId = this.context.getIdentity()?.getPeerId();
            const setup = this.pendingOutgoingSetups.get(remotePeerId.toString());
            if (!localPeerId) {
                if (attempt) this.logSignalingStage(attempt, "OFFER", "ignored", {
                    reason: "local-identity-unavailable"
                });
                return;
            }

            if (localPeerId.toString() < remotePeerId.toString()) {
                // Deterministic glare winner: keep the local outgoing offer. This
                // also covers an offer arriving before createOffer sets the local
                // description, when the signaling state is still stable.
                if (attempt) this.logSignalingStage(attempt, "OFFER", "ignored-glare-loser");
                return;
            }

            if (rtcConnection.signalingState !== "have-local-offer" && !setup) {
                if (attempt) this.logSignalingStage(attempt, "OFFER", "ignored", {
                    reason: "peer-connection-not-awaiting-an-offer"
                });
                return;
            }

            // The remote endpoint wins. Stop the in-flight local offer setup and
            // wait for it to settle before changing SDP on the same RTCPeerConnection.
            if (setup) {
                setup.cancelled = true;
                if (attempt) this.logSignalingStage(attempt, "OFFER", "cancelled-local-glare-loser");
                try {
                    await setup.promise;
                } catch (error) {
                    if (attempt) this.logSignalingStage(attempt, "OFFER", "cancelled-setup-settled-with-error", {
                        errorName: getErrorName(error)
                    });
                }
            }

            if (this.context.getConnection(remotePeerId) !== existingConnection) return;
        }

        try {
            if (isNewConnection) {
                this.context.addConnection(remotePeerId, connection);
                this.registerConnectionFailureHandler(
                    connection,
                    remotePeerId
                );

                await this.prepareSessionKey(remotePeerId);
                if (attempt) this.logSignalingStage(attempt, "IDENTITY", "peer-public-key-verified");
                this.registerIceCandidateRelay(
                    connection,
                    remotePeerId
                );
            } else {
                const rtcConnection = connection.getConnection();
                if (rtcConnection.signalingState === "have-local-offer") {
                    if (attempt) this.logSignalingStage(attempt, "OFFER", "glare-rollback");
                    await rtcConnection.setLocalDescription({ type: "rollback" });
                    this.context.getDataChannel(remotePeerId)?.close();
                    this.context.removeDataChannel(remotePeerId);
                }
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
            if (attempt) this.logSignalingStage(attempt, "OFFER", "remote-description-applied");

            await this.flushPendingIceCandidates(
                remotePeerId,
                connection
            );

            const answer =
                await this.webRTCManager.createAnswer(

                    connection

                );
            if (attempt) this.logSignalingStage(attempt, "ANSWER", "local-description-set");

            await this.bootstrapClient.sendAnswer(

                remotePeerId,

                answer

            );
            if (attempt) this.logSignalingStage(attempt, "ANSWER", "written-to-bootstrap-socket");
        } catch (error) {
            if (attempt) this.logSignalingStage(attempt, "OFFER", "processing-failed", { errorName: getErrorName(error) });
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
        const attempt = this.connectionAttempts.get(connection.getConnection());
        if (attempt) this.logSignalingStage(attempt, "ANSWER", "received");

        try {
            await this.webRTCManager.setRemoteDescription(connection, answer);
            if (attempt) this.logSignalingStage(attempt, "ANSWER", "remote-description-applied");
            await this.flushPendingIceCandidates(remotePeerId, connection);
            await this.prepareSessionKey(remotePeerId);
        } catch (error) {
            if (attempt) this.logSignalingStage(attempt, "ANSWER", "processing-failed", { errorName: getErrorName(error) });
            throw error;
        }

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
            console.info("[WebRTC signaling]", {
                messageType: "ICE_CANDIDATE",
                stage: "queued-before-peer-connection",
                peerId: shortPeerId(remotePeerId.toString()),
                queueLength: queuedCandidates.length
            });
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
            const attempt = this.connectionAttempts.get(connection.getConnection());
            if (attempt) this.logSignalingStage(attempt, "ICE_CANDIDATE", "queued-before-remote-description", {
                queueLength: queuedCandidates.length,
                candidateType: safeCandidateType(candidate)
            });
            return;
        }

        await this.webRTCManager.addIceCandidate(

            connection,

            candidate

        );
        const attempt = this.connectionAttempts.get(connection.getConnection());
        if (attempt) this.logSignalingStage(attempt, "ICE_CANDIDATE", "remote-candidate-applied", {
            candidateType: safeCandidateType(candidate)
        });

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
                const attempt = this.connectionAttempts.get(connection.getConnection());
                if (attempt) this.logSignalingStage(attempt, "ICE_CANDIDATE", "written-to-bootstrap-socket", {
                    candidateType: candidate.type,
                    protocol: candidate.protocol
                });
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
        const attempt = this.connectionAttempts.get(connection.getConnection());
        connection.getConnection().addEventListener(
            "connectionstatechange",
            () => {
                if (connection.getConnection().connectionState === "failed") {
                    if (attempt) this.logSignalingStage(attempt, "WEBRTC", "connection-failed");
                    this.disconnect(peerId);
                }
            }
        );
    }

    private startConnectionAttempt(
        connection: PeerConnection,
        remotePeerId: PeerId,
        direction: "incoming" | "outgoing"
    ): ConnectionAttempt {
        const localPeerId = this.context.getIdentity()?.getPeerId().toString() ?? "unknown";
        const attempt = Object.freeze({
            attemptId: createRandomId(),
            initiatorPeerId: direction === "outgoing" ? localPeerId : remotePeerId.toString(),
            targetPeerId: direction === "outgoing" ? remotePeerId.toString() : localPeerId
        });
        const rtcConnection = connection.getConnection();
        this.connectionAttempts.set(rtcConnection, attempt);
        this.webRTCDiagnostics.trackPeerConnection(remotePeerId, rtcConnection, attempt);
        this.logSignalingStage(attempt, "WEBRTC", "connection-attempt-created");
        return attempt;
    }

    private logSignalingStage(
        attempt: ConnectionAttempt,
        messageType: string,
        stage: string,
        extra: Record<string, unknown> = {}
    ): void {
        console.info("[WebRTC signaling]", {
            attemptId: attempt.attemptId,
            initiatorPeerId: shortPeerId(attempt.initiatorPeerId),
            targetPeerId: shortPeerId(attempt.targetPeerId),
            messageType,
            stage,
            ...extra
        });
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

        const remoteUfrag = this.getIceUfrag(
            connection.getConnection().remoteDescription?.sdp
        );

        for (const candidate of candidates) {
            if (
                candidate.usernameFragment &&
                remoteUfrag &&
                candidate.usernameFragment !== remoteUfrag
            ) {
                continue;
            }

            await this.webRTCManager.addIceCandidate(
                connection,
                candidate
            );
        }
    }

    private getIceUfrag(sdp?: string): string | undefined {
        return sdp?.match(/^a=ice-ufrag:(.+)$/m)?.[1];
    }

    private registerDataChannel(
        peerId: PeerId,
        channel: DataChannel
    ): void {

        this.context.setDataChannel(
            peerId,
            channel
        );
        const peerConnection = this.context.getConnection(peerId)?.getConnection();
        if (peerConnection) {
            this.webRTCDiagnostics.trackDataChannel(peerId, peerConnection, channel.getChannel());
        }
        void this.refreshRoutingNeighbor(peerId);

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
                void this.refreshRoutingNeighbor(peerId);
                void this.markXorNeighbor(peerId, true);
                this.sendPeerExchange(peerId);
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
                    this.routingTable?.removeNeighbor(peerId.toString());
                    this.xorRouter?.markNeighbor(peerId.toString(), false);
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
            this.cacheEncryptedChunk(envelope.payload);
            this.eventBus.emit(
                "RECEIVE_MESSAGE",
                {
                    senderId,
                    encryptedMessage: envelope.payload
                }
            );
            return;
        }

        if (envelope.kind === "route") {
            try {
                this.cacheEncryptedChunk(envelope.payload?.payload);
                this.ensureRouter()?.receivePacket(envelope.payload as RoutedPacket);
            } catch (error) {
                console.warn("Dropping invalid routed packet:", error);
            }
            return;
        }

        if (envelope.kind === "peer-exchange") {
            void this.handlePeerExchange(senderId, envelope.payload);
            return;
        }

        if (envelope.kind === "xor-routing") {
            void this.handleXorRoutingPacket(senderId, envelope.payload);
            return;
        }

        if (envelope.kind === "route-message") {
            void this.routeMessageHandler.handleMessage(senderId.toString(), envelope.payload);
            return;
        }

        if (envelope.kind === "route-message-response") {
            void this.routeMessageHandler.handleResponse(senderId.toString(), envelope.payload);
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

    private sendPeerExchange(peerId: PeerId): void {
        const channel = this.context.getDataChannel(peerId);
        const identity = this.context.getIdentity();
        if (!channel?.isOpen() || !identity) return;
        const local = identity.getPublicIdentity();
        const records = [
            ...this.context.getOnlinePeers(),
            {
                peerId: local.peerId.toString(),
                username: local.username.toString(),
                publicKey: local.publicKey.toBase64()
            }
        ];
        const unique = [...new Map(records
            .filter(record => record?.peerId !== identity.getPeerId().toString())
            .map(record => [record.peerId, record])).values()].slice(0, 64);
        channel.send(JSON.stringify({ kind: "peer-exchange", payload: { version: 1, peers: unique } }));
    }

    private async handlePeerExchange(senderId: PeerId, payload: any): Promise<void> {
        if (payload?.version !== 1 || !Array.isArray(payload.peers)) return;
        const localPeerId = this.context.getIdentity()?.getPeerId().toString();
        const verified: any[] = [];
        for (const candidate of payload.peers.slice(0, 64)) {
            if (candidate?.peerId === localPeerId || candidate?.peerId === senderId.toString() ||
                typeof candidate?.peerId !== "string" || typeof candidate?.publicKey !== "string" ||
                typeof candidate?.username !== "string") continue;
            try {
                const publicKey = PublicKey.fromBase64(candidate.publicKey);
                const derivedPeerId = await PeerId.fromPublicKey(publicKey.bytes);
                if (derivedPeerId.toString() !== candidate.peerId) continue;
                verified.push({
                    peerId: candidate.peerId,
                    username: candidate.username.slice(0, 64),
                    publicKey: candidate.publicKey
                });
            } catch {
                // Ignore malformed peer records and continue processing the exchange.
            }
        }
        this.context.mergePeers(verified);
        await this.ensureXorRouter()?.addKnownPeers(verified);
        if (!verified.length) return;
        const peers = this.context.getOnlinePeers();
        await this.eventBus.emit("PEER_LIST_UPDATED", peers);

        const localCoordinate = this.context.getLocalCoordinate();
        const identity = this.context.getIdentity();
        if (localCoordinate === undefined || !identity) return;
        const neighbors = await Promise.all(verified.map(async peer => ({
            peerId: peer.peerId,
            coordinate: await NodeCoordinate.fromPublicKey(PublicKey.fromBase64(peer.publicKey))
        })));
        const selected = SmallWorldTopology.selectNeighbors(
            identity.getPeerId().toString(), localCoordinate, neighbors
        );
        this.eventBus.emit("SMALL_WORLD_NEIGHBORS_SELECTED", selected);
        // Peer exchange enriches routing knowledge but does not establish new
        // WebRTC links. Only an explicit connect action creates a direct link.
    }

    private async handleXorRoutingPacket(senderId: PeerId, payload: unknown): Promise<void> {
        try {
            const router = this.ensureXorRouter();
            if (!router || !payload || typeof payload !== "object") return;
            const packet = payload as { type?: unknown };
            if (packet.type === "FIND_NODE") {
                const response = await router.handleFindNodeRequest(senderId.toString(), payload as FindNodeRequest);
                if (response) this.sendXorRoutingPacket(senderId, response);
                return;
            }
            if (packet.type === "FIND_NODE_RESPONSE") {
                await router.handleFindNodeResponse(senderId.toString(), payload as FindNodeResponse);
            }
        } catch (error) {
            console.warn("Dropping invalid XOR routing packet:", error);
        }
    }

    private sendXorRoutingPacket(
        peerId: PeerId,
        packet: FindNodeRequest | FindNodeResponse
    ): void {
        const channel = this.context.getDataChannel(peerId);
        if (!channel?.isOpen()) throw new Error("FIND_NODE peer is no longer reachable.");
        channel.send(JSON.stringify({ kind: "xor-routing", payload: packet }));
    }

    private async markXorNeighbor(peerId: PeerId, live: boolean): Promise<void> {
        const router = this.ensureXorRouter();
        if (!router) return;
        if (live) {
            const record = this.context.getOnlinePeers().find((peer: any) => peer?.peerId === peerId.toString());
            if (record) await router.addKnownPeer(record);
        }
        router.markNeighbor(peerId.toString(), live);
    }

    /** Run bounded XOR lookup and return discovery separately from direct reachability. */
    public async findNode(
        targetPeerId: PeerId | string,
        options: { k?: number; alpha?: number; timeoutMs?: number; hopLimit?: number } = {}
    ) {
        const router = this.ensureXorRouter();
        if (!router) throw new Error("Local identity is unavailable for XOR lookup.");
        const target = typeof targetPeerId === "string" ? targetPeerId : targetPeerId.toString();
        return router.findNode(target, options);
    }

    public sendChatMessage(
        destinationPeerId: string,
        messageId: string,
        encryptedPayload: string,
        onProgress?: (response: RouteMessageResponse) => void,
        originHopLimit?: number
    ): Promise<RouteMessageResponse> {
        return this.routeMessageHandler.send(destinationPeerId, messageId, encryptedPayload, onProgress, originHopLimit);
    }

    public dispose(): void {
        this.routeMessageHandler.dispose();
        this.xorRouter?.dispose();
    }

    public async getWebRTCDiagnostics(): Promise<WebRTCDiagnosticSnapshot[]> {
        return Promise.all(this.context.getConnectedPeerIds().flatMap(peerId => {
            const id = PeerId.fromString(peerId);
            const connection = this.context.getConnection(id)?.getConnection();
            if (!connection) return [];
            return [this.webRTCDiagnostics.snapshot(
                id,
                connection,
                this.context.getDataChannel(id)?.getChannel()
            )];
        }));
    }

    private sendRouteMessagePacket(peerId: string, payload: RouteMessage | RouteMessageResponse): void {
        const channel = this.context.getDataChannel(PeerId.fromString(peerId));
        if (!channel?.isOpen()) throw new Error("Route peer is no longer reachable.");
        const kind = payload.type === "ROUTE_MESSAGE" ? "route-message" : "route-message-response";
        channel.send(JSON.stringify({ kind, payload }));
    }

    private cacheEncryptedChunk(candidate: unknown): void {
        let parsed = candidate;
        if (typeof candidate === "string") {
            try {
                parsed = JSON.parse(candidate);
            } catch {
                return;
            }
        }
        if (!parsed || typeof parsed !== "object") return;
        const record = parsed as any;
        const encrypted = record.payload?.cipherText && record.payload?.nonce
            ? record.payload
            : record.cipherText && record.nonce
                ? record
                : undefined;
        if (!encrypted) return;
        void PassiveChunkCache.shared.cacheChunk(JSON.stringify(encrypted)).catch(() => undefined);
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
        this.routingTable?.removeNeighbor(remotePeerId.toString());
        this.xorRouter?.markNeighbor(remotePeerId.toString(), false);
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

        this.eventBus.on("SMALL_WORLD_NEIGHBORS_SELECTED", (neighbors: SelectedNeighbor[]) => {
            this.selectedRoutingNeighbors.clear();
            for (const neighbor of neighbors) this.selectedRoutingNeighbors.set(neighbor.peerId, neighbor);
            const router = this.ensureRouter();
            if (!router) return;
            this.routingTable?.clear();
            for (const peerId of this.context.getOpenConnectedPeerIds()) {
                void this.refreshRoutingNeighbor(PeerId.fromString(peerId));
            }
        });

        this.eventBus.on("ROUTE_PACKET", (request: { targetCoordinate: number; packet: unknown; id?: string }) => {
            const router = this.ensureRouter();
            if (!router) throw new Error("Local identity coordinate is unavailable.");
            router.routePacket(request.targetCoordinate, request.packet, request.id);
        });

        this.eventBus.on("PEER_LIST_UPDATED", async (peers: any[]) => {
            const router = this.ensureXorRouter();
            if (!router || !Array.isArray(peers)) return;
            await router.addKnownPeers(peers);
            for (const id of this.context.getOpenConnectedPeerIds()) {
                await this.markXorNeighbor(PeerId.fromString(id), true);
            }
        });

        this.eventBus.on("FIND_NODE_LOOKUP", async (request: {
            targetPeerId: PeerId | string;
            k?: number;
            alpha?: number;
            timeoutMs?: number;
            hopLimit?: number;
        }) => {
            const result = await this.findNode(request.targetPeerId, request);
            await this.eventBus.emit("FIND_NODE_LOOKUP_RESULT", result);
        });

        this.eventBus.on(
            "CONNECT_TO_PEER",
            async (request: PeerId | string | { peerId: PeerId | string }) => {
                await this.connect(
                    request && typeof request === "object" && "peerId" in request
                        ? request.peerId
                        : request as PeerId | string
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

    private ensureRouter(): SmallWorldRouter | undefined {
        const identity = this.context.getIdentity();
        const coordinate = this.context.getLocalCoordinate();
        if (!identity || coordinate === undefined) return undefined;
        const localPeerId = identity.getPeerId().toString();
        if (this.routingPeerId !== localPeerId || this.routingCoordinate !== coordinate) {
            this.routingTable = new SmallWorldRoutingTable(localPeerId);
            this.router = new SmallWorldRouter(
                localPeerId,
                coordinate,
                this.routingTable,
                packet => this.eventBus.emit("ROUTED_PACKET_RECEIVED", packet)
            );
            this.routingPeerId = localPeerId;
            this.routingCoordinate = coordinate;
        }
        return this.router;
    }

    private ensureXorRouter(): XorRouter | undefined {
        const peerId = this.context.getIdentity()?.getPeerId().toString();
        if (!peerId) return undefined;
        if (this.xorRoutingPeerId !== peerId) {
            this.xorRouter?.dispose();
            this.xorRouter = new XorRouter(peerId, {
                isLiveNeighbor: id => {
                    try {
                        return this.context.getDataChannel(PeerId.fromString(id))?.isOpen() === true;
                    } catch {
                        return false;
                    }
                },
                send: (id, packet) => this.sendXorRoutingPacket(PeerId.fromString(id), packet)
            });
            this.xorRoutingPeerId = peerId;
        }
        return this.xorRouter;
    }

    private async refreshRoutingNeighbor(peerId: PeerId): Promise<void> {
        let selection = this.selectedRoutingNeighbors.get(peerId.toString());
        const channel = this.context.getDataChannel(peerId);
        if (!channel?.isOpen()) {
            this.routingTable?.removeNeighbor(peerId.toString());
            return;
        }
        // A WebRTC link is bidirectional even when only one endpoint selected
        // it as a neighbor. Keep the incoming endpoint as a long-range fallback
        // so greedy routes can return through that direct link.
        if (!selection) {
            const peer = this.context.getOnlinePeers().find((candidate: any) => candidate?.peerId === peerId.toString());
            if (typeof peer?.publicKey !== "string") return;
            try {
                const publicKey = PublicKey.fromBase64(peer.publicKey);
                const verifiedId = await PeerId.fromPublicKey(publicKey.bytes);
                if (!verifiedId.equals(peerId)) return;
                selection = {
                    peerId: peerId.toString(),
                    coordinate: await NodeCoordinate.fromPublicKey(publicKey),
                    range: "long"
                };
            } catch {
                return;
            }
        }
        const neighbor: SmallWorldNeighbor = {
            ...selection,
            send: (packet: RoutedPacket) => channel.send(JSON.stringify({ kind: "route", payload: packet }))
        };
        this.ensureRouter();
        this.routingTable?.addNeighbor(neighbor);
    }

}

function shortPeerId(peerId: string): string {
    return `${peerId.slice(0, 12)}…`;
}

function safeCandidateType(candidate: RTCIceCandidateInit): string {
    const type = candidate.candidate?.match(/\btyp\s+(host|srflx|prflx|relay)\b/i)?.[1];
    return type?.toLowerCase() ?? "unknown";
}

function getErrorName(error: unknown): string {
    return error instanceof Error ? error.name : "UnknownError";
}
