import { PeerId } from "../identity/valueObjects/PeerID";

import { PrivateIdentity } from "../identity/models/PrivateIdentity";

import { PeerConnection } from "../webrtc/models/PeerConnection";
import { DataChannel } from "../webrtc/models/DataChannel";

import { Message } from "../messaging/models/Message";

export class ApplicationContext {

    private identity?: PrivateIdentity;

    private localCoordinate?: number;

    private readonly onlinePeers =
        new Map<string, any>();

    private readonly peerConnections =
        new Map<string, PeerConnection>();

    private readonly dataChannels =
        new Map<string, DataChannel>();

    private readonly conversations =
        new Map<string, Message[]>();

    /**
     * Store local identity.
     */
    public setIdentity(
        identity: PrivateIdentity
    ): void {

        this.identity = identity;

    }

    /**
     * Get local identity.
     */
    public getIdentity():
        PrivateIdentity | undefined {

        return this.identity;

    }

    public setLocalCoordinate(coordinate: number): void {
        if (!Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1) {
            throw new Error("Local coordinate must be between 0 and 1.");
        }
        this.localCoordinate = coordinate;
    }

    public getLocalCoordinate(): number | undefined {
        return this.localCoordinate;
    }

    /**
     * Remove identity.
     */
    public clearIdentity(): void {

        this.identity = undefined;

        this.localCoordinate = undefined;

    }

    /**
     * Store online peers.
     */
    public setOnlinePeers(
        peers: any[]
    ): void {

        this.onlinePeers.clear();

        for (

            const peer of peers

        ) {

            if (!peer || typeof peer.peerId !== "string") {
                continue;
            }

            this.onlinePeers.set(

                peer.peerId,

                peer

            );

        }

    }

    /**
     * Get online peers.
     */
    public getOnlinePeers():
        any[] {

        return Array.from(

            this.onlinePeers.values()

        );

    }

    /**
     * Add online peer.
     */
    public addPeer(
        peer: any
    ): void {

        if (!peer || typeof peer.peerId !== "string") {
            return;
        }

        this.onlinePeers.set(

            peer.peerId,

            peer

        );

    }

    /**
     * Remove peer.
     */
    public removePeer(
        peerId: PeerId | string
    ): void {

        const id =
            typeof peerId === "string"
                ? peerId
                : peerId.toString();

        this.onlinePeers.delete(

            id

        );

    }

    /**
     * Add connection.
     */
    public addConnection(
        peerId: PeerId | string,
        connection: PeerConnection

    ): void {
    const existing = this.peerConnections.get(peerId.toString());

    if (existing) {
        existing.close();
    }

        this.peerConnections.set(
            peerId.toString(),
            connection
        );

    }

    /**
     * Get connection.
     */
    public getConnection(

        peerId: PeerId | string

    ): PeerConnection | undefined {

        return this.peerConnections.get(

            peerId.toString()

        );

    }

    /**
     * Remove connection.
     */
    public removeConnection(

        peerId: PeerId | string

    ): void {

        this.peerConnections.delete(

            peerId.toString()

        );

    }

    public setDataChannel(
        peerId: PeerId | string,
        channel: DataChannel
    ): void {

        this.dataChannels.set(
            peerId.toString(),
            channel
        );

    }

    public getDataChannel(
        peerId: PeerId | string
    ): DataChannel | undefined {

        return this.dataChannels.get(
            peerId.toString()
        );

    }

    public removeDataChannel(
        peerId: PeerId | string
    ): void {

        this.dataChannels.delete(
            peerId.toString()
        );

    }

    public getConnectedPeerIds(): string[] {

        return Array.from(
            this.dataChannels.keys()
        );

    }

    public getOpenConnectedPeerIds(): string[] {

        return Array.from(
            this.dataChannels.entries()
        )
            .filter(([, channel]) => channel.isOpen())
            .map(([peerId]) => peerId);

    }

    /**
     * Store message.
     */
    public addMessage(

        peerId: PeerId,

        message: Message

    ): void {

        const key =

            peerId.toString();

        if (

            !this.conversations.has(key)

        ) {

            this.conversations.set(

                key,

                []

            );

        }

        this.conversations.get(key)!.push(

            message

        );

    }

    /**
     * Get conversation.
     */
    public getMessages(

        peerId: PeerId

    ): Message[] {

        return (

            this.conversations.get(

                peerId.toString()

            )

            ??

            []

        );

    }

    /**
     * Clear conversation.
     */
    public clearMessages(

        peerId: PeerId

    ): void {

        this.conversations.delete(

            peerId.toString()

        );

    }

    /**
     * Clear application state.
     */
    public clear(): void {

        this.identity = undefined;

        this.localCoordinate = undefined;

        this.onlinePeers.clear();

        this.peerConnections.clear();

        this.dataChannels.clear();

        this.conversations.clear();

    }

}
