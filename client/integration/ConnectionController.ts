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
import { SelectedNeighbor } from "../peerDiscovery/SmallWorldTopology";
import { NodeCoordinate } from "../peerDiscovery/NodeCoordinate";
import { PassiveChunkCache } from "../messaging/PassiveChunkCache";

export class ConnectionController {
    private routingTable?: SmallWorldRoutingTable;
    private router?: SmallWorldRouter;
    private routingPeerId?: string;
    private routingCoordinate?: number;
    private readonly selectedRoutingNeighbors = new Map<string, SelectedNeighbor>();
    private readonly pendingIceCandidates =
        new Map<string, RTCIceCandidateInit[]>();

    private readonly ignoredIceUfrags =
        new Map<string, Set<string>>();

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
        peerId: PeerId | string,
        options: { force?: boolean } = {}

    ): Promise<void> {
        const remotePeerId = this.toPeerId(peerId);

        const existingConnection = this.context.getConnection(remotePeerId);
        if (existingConnection) {
            const channel = this.context.getDataChannel(remotePeerId);
            const connectionState = existingConnection.getConnection().connectionState;
            if (channel?.isOpen()) {
                this.eventBus.emit(
                    "PEER_CONNECTED",
                    remotePeerId
                );
                return;
            }

            const isDead = connectionState === "failed"
                || connectionState === "closed"
                || connectionState === "disconnected"
                || channel?.getChannel().readyState === "closed";

            if (!isDead && !options.force) {
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

            const dataChannel =
                this.webRTCManager.createDataChannel(
                    connection,
                    "chat"
                );

            this.registerDataChannel(
                remotePeerId,
                dataChannel
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
                const ignoredUfrag = this.getIceUfrag(offer.sdp);
                if (ignoredUfrag) {
                    const peerIdString = remotePeerId.toString();
                    const ignoredUfrags =
                        this.ignoredIceUfrags.get(peerIdString) ?? new Set<string>();
                    ignoredUfrags.add(ignoredUfrag);
                    this.ignoredIceUfrags.set(peerIdString, ignoredUfrags);
                }
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
        const candidateUfrag = candidate.usernameFragment;
        const ignoredUfrags =
            this.ignoredIceUfrags.get(remotePeerId.toString());

        if (candidateUfrag && ignoredUfrags?.has(candidateUfrag)) {
            return;
        }

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
        this.ignoredIceUfrags.delete(peerId.toString());
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
        this.pendingIceCandidates.delete(remotePeerId.toString());
        this.ignoredIceUfrags.delete(remotePeerId.toString());

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

        this.eventBus.on(
            "CONNECT_TO_PEER",
            async (request: PeerId | string | {
                peerId: PeerId | string;
                force?: boolean;
            }) => {
                if (
                    request &&
                    typeof request === "object" &&
                    "peerId" in request
                ) {
                    await this.connect(request.peerId, {
                        force: request.force === true
                    });
                    return;
                }

                await this.connect(request as PeerId | string);
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
