import { BootstrapConnection } from "./bootstrapConnection";
import { BootstrapEventHandler } from "./bootstrapEventHandler";
import { BootstrapState } from "./bootstrapState";

import { PrivateIdentity } from "../identity/models/PrivateIdentity";

import { BootstrapPacket } from "./protocol/bootstrapPacket";

import { MessageType } from "./types/MessageType";
import { ConnectionState } from "./types/ConnectionState";
import {
    AnonymousSignalKind,
    DataReturnPayload,
    DataStorePayload,
    FindClosestNodesRequest
} from "./protocol/RoutingPayload";

export class BootstrapClient {

    private readonly state: BootstrapState;

    private readonly connection: BootstrapConnection;

    private readonly eventHandler: BootstrapEventHandler;
    private identity?: PrivateIdentity;
    private coordinate?: number;
    private connectionAttempt?: Promise<void>;
    constructor(
        eventHandler: BootstrapEventHandler
    ) {

        this.state = new BootstrapState();

        this.connection =
            new BootstrapConnection(
                this.state
            );

        this.eventHandler = eventHandler;

    }

    /**
     * Connect to Bootstrap Server.
     */
    public async connect(
        url: string
    ): Promise<void> {

        if (this.state.isConnected()) {
            return;
        }

        if (this.connectionAttempt) {
            return this.connectionAttempt;
        }

        if (this.state.getState() === ConnectionState.CONNECTING) {
            throw new Error("Bootstrap connection is already in progress.");
        }

        const attempt = this.connection.connect(

            url,

            (message) =>
                this.eventHandler.handle(message),

            () =>
                this.registerIdentity(),

            () =>
                console.log("Disconnected."),

            (error) =>
                console.error(error)

        );

        this.connectionAttempt = attempt;

        try {
            await attempt;
        } finally {
            if (this.connectionAttempt === attempt) {
                this.connectionAttempt = undefined;
            }
        }

    }
    public setIdentity(
    identity: PrivateIdentity
): void {

    this.identity = identity;

}

    public setCoordinate(coordinate: number): void {
        if (!Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1) {
            throw new Error("Bootstrap coordinate must be between 0 and 1.");
        }
        this.coordinate = coordinate;
    }

    /**
     * Get the bootstrap state.
     */
    public getState(): BootstrapState {

        return this.state;

    }

    /**
     * Disconnect.
     */
    public disconnect(): void {

        this.connection.disconnect();

    }

    /**
     * Unregister local identity.
     */
    public unregister(_peerId: unknown): void {

        this.disconnect();

    }

    /**
     * Get online peers.
     */
    public async getOnlinePeers(): Promise<unknown[]> {

        return this.state.getPeerList();

    }

    public findClosestNodes(request: FindClosestNodesRequest): void {
        this.connection.send(new BootstrapPacket(MessageType.FIND_CLOSEST_NODES, request));
    }

    public sendAnonymousSignal(
        targetCoordinate: number,
        signalType: AnonymousSignalKind,
        signal: unknown,
        requestId?: string
    ): void {
        this.connection.send(new BootstrapPacket(MessageType.ANONYMOUS_SIGNAL, {
            targetCoordinate, signalType, signal, requestId
        }));
    }

    public sendAnonymousSignalReply(
        returnToken: string,
        signalType: AnonymousSignalKind,
        signal: unknown,
        requestId?: string
    ): void {
        this.connection.send(new BootstrapPacket(MessageType.ANONYMOUS_SIGNAL, {
            returnToken, signalType, signal, requestId
        }));
    }

    public storeData(payload: DataStorePayload): void {
        this.connection.send(new BootstrapPacket(MessageType.DATA_STORE, payload));
    }

    public requestData(key: string): void {
        const payload: DataReturnPayload = { key };
        this.connection.send(new BootstrapPacket(MessageType.DATA_RETURN, payload));
    }

    /**
     * Register local identity.
     */
    private registerIdentity(): void {
        if (!this.identity) {
    throw new Error("Identity not initialized.");
}

        const identity =
            this.identity
                .getPublicIdentity();

        // Ensure publicKey is serialized to a string (compat with different implementations)
        let publicKeyString: string;
        try {
            if (typeof identity.publicKey.toBase64 === "function") {
                publicKeyString = identity.publicKey.toBase64();
            } else if (identity.publicKey.bytes instanceof Uint8Array) {
                // Fallback conversion
                let binary = "";
                for (const b of identity.publicKey.bytes) {
                    binary += String.fromCharCode(b);
                }
                publicKeyString = btoa(binary);
            } else {
                publicKeyString = String(identity.publicKey);
            }

        } catch (e) {
            console.error("Failed to serialize publicKey for REGISTER:", e);
            publicKeyString = "";
        }

        const packet = new BootstrapPacket(
            MessageType.REGISTER,
            {
                peerId: identity.peerId.toString(),
                username: identity.username.toString(),
                publicKey: publicKeyString,
                coordinate: this.coordinate
            }
        );

        this.connection.send(packet);

    }

    /**
     * Send OFFER.
     */
    public sendOffer(
        peerId: unknown,
        payload: unknown
    ): void {
        if (!this.identity) {
            throw new Error("Identity not set for sending OFFER.");
        }

        const sender = this.identity.getPublicIdentity().peerId.toString();
        const targetPeerId = String(peerId);

        this.connection.send(
            new BootstrapPacket(
                MessageType.OFFER,
                {
                    senderPeerId: sender,
                    targetPeerId,
                    payload
                }
            )
        );
    }

    /**
     * Send ANSWER.
     */
    public sendAnswer(
        peerId: unknown,
        payload: unknown
    ): void {
        if (!this.identity) {
            throw new Error("Identity not set for sending ANSWER.");
        }

        const sender = this.identity.getPublicIdentity().peerId.toString();
        const targetPeerId = String(peerId);

        this.connection.send(
            new BootstrapPacket(
                MessageType.ANSWER,
                {
                    senderPeerId: sender,
                    targetPeerId,
                    payload
                }
            )
        );
    }

    /**
     * Send ICE Candidate.
     */
    public sendIceCandidate(
        peerId: unknown,
        payload: unknown
    ): void {
        if (!this.identity) {
            throw new Error("Identity not set for sending ICE_CANDIDATE.");
        }

        const sender = this.identity.getPublicIdentity().peerId.toString();
        const targetPeerId = String(peerId);

        this.connection.send(
            new BootstrapPacket(
                MessageType.ICE_CANDIDATE,
                {
                    senderPeerId: sender,
                    targetPeerId,
                    payload
                }
            )
        );
    }

}
