import { BootstrapConnection } from "./bootstrapConnection";
import { BootstrapEventHandler } from "./bootstrapEventHandler";
import { BootstrapState } from "./bootstrapState";

import { Identity } from "../identity/Identity";

import { BootstrapPacket } from "./protocol/bootstrapPacket";

import { MessageType } from "./types/MessageType";

export class BootstrapClient {

    private readonly state: BootstrapState;

    private readonly connection: BootstrapConnection;

    private readonly eventHandler: BootstrapEventHandler;
    private identity?: Identity;
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

        await this.connection.connect(

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

    }
    public setIdentity(
    identity: Identity
): void {

    this.identity = identity;

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
                publicKey: publicKeyString
            }
        );

        // Debug: log outgoing REGISTER packet
        try {
            console.log("BootstrapClient: sending REGISTER", JSON.stringify(packet));
        } catch (e) {
            console.log("BootstrapClient: sending REGISTER (unable to stringify packet)", packet);
        }

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

        this.connection.send(
            new BootstrapPacket(
                MessageType.OFFER,
                {
                    senderPeerId: sender,
                    targetPeerId: peerId,
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

        this.connection.send(
            new BootstrapPacket(
                MessageType.ANSWER,
                {
                    senderPeerId: sender,
                    targetPeerId: peerId,
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

        this.connection.send(
            new BootstrapPacket(
                MessageType.ICE_CANDIDATE,
                {
                    senderPeerId: sender,
                    targetPeerId: peerId,
                    payload
                }
            )
        );
    }

}