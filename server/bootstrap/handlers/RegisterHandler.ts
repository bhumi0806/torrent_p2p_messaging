import WebSocket from "ws";
import { createHash } from "node:crypto";

import { Peer } from "../models/Peer";
import { BootstrapPacket } from "../models/BootstrapPacket";

import { PeerManager } from "../managers/PeerManager";

import { MessageType } from "../types/MessageType";
import { ServerConfig } from "../config/ServerConfig";
import { PacketSender } from "../network/PacketSender";
import { RegisterPayload } from "../protocol/RegisterPayload";

export class RegisterHandler {
    private readonly peerManager: PeerManager;
    private readonly packetSender: PacketSender;

    constructor(
        peerManager: PeerManager,
        packetSender: PacketSender = new PacketSender()
    ) {

        this.peerManager = peerManager;
        this.packetSender = packetSender;

    }

    /**
     * Handle REGISTER packet.
     */
    public handle(
        socket: WebSocket,
        packet: BootstrapPacket<RegisterPayload>
    ): void {

        if (!this.isValidPayload(packet)) {

            this.sendError(
                socket,
                "Invalid registration payload."
            );

            return;

        }

        const {

            peerId,
            username,
            publicKey,
            coordinate

        } = packet.payload;

        const peer = new Peer(

            peerId,

            username,

            publicKey,

            socket,
            coordinate

        );

        const success =
            this.peerManager.registerPeer(peer);

        if (!success) {

            this.sendError(

                socket,

                "Peer already exists."

            );

            return;

        }

        this.sendPeerList(socket, peerId);

        this.broadcastPeerJoined(peer);

    }

    /**
     * Validate REGISTER payload.
     */
    private isValidPayload(
        packet: BootstrapPacket<unknown>
    ): packet is BootstrapPacket<RegisterPayload> {

        if (!packet || typeof packet !== "object") {

            return false;

        }

        const payload = packet.payload as unknown;

        if (!payload || typeof payload !== "object") {

            return false;

        }

        const candidate = payload as Partial<RegisterPayload>;

        if (typeof candidate.peerId !== "string") {

            return false;

        }

        if (typeof candidate.username !== "string") {

            return false;

        }

        if (typeof candidate.publicKey !== "string") {

            return false;

        }

        if (candidate.coordinate !== undefined &&
            (typeof candidate.coordinate !== "number" || !Number.isFinite(candidate.coordinate) || candidate.coordinate < 0 || candidate.coordinate > 1)) {
            return false;
        }

        if (candidate.coordinate !== undefined) {
            try {
                const publicKeyBytes = Buffer.from(candidate.publicKey, "base64");
                if (publicKeyBytes.length !== 32 || publicKeyBytes.toString("base64") !== candidate.publicKey) return false;
                const digest = createHash("sha256").update(publicKeyBytes).digest();
                const value = BigInt(`0x${digest.toString("hex")}`);
                const denominator = (1n << 256n) - 1n;
                const expectedCoordinate = Number(value) / Number(denominator);
                if (Math.abs(expectedCoordinate - candidate.coordinate) > Number.EPSILON * 2) return false;
            } catch {
                return false;
            }
        }

        if (candidate.peerId.length === 0) {

            return false;

        }

        if (candidate.publicKey.length === 0) {

            return false;

        }

        if (

            candidate.username.length === 0 ||

            candidate.username.length >

            ServerConfig.MAX_USERNAME_LENGTH

        ) {

            return false;

        }

        return true;

    }

    /**
     * Send currently connected peers.
     */
    private sendPeerList(
        socket: WebSocket,
        registeringPeerId: string
    ): void {

        const peers =

            this.peerManager

                .getAllPeers()
                .filter(peer => peer.peerId !== registeringPeerId)
                .map(peer => ({

                    peerId: peer.peerId,

                    username: peer.username,

                    publicKey: peer.publicKey,

                    coordinate: peer.coordinate

                }));

        const packet =

            new BootstrapPacket(

                MessageType.PEER_LIST,

                peers

            );

        this.packetSender.send(
            socket,
            packet
        );

    }

    /**
     * Notify everyone except the
     * newly connected peer.
     */
    private broadcastPeerJoined(
        peer: Peer
    ): void {

        const packet =

            new BootstrapPacket(

                MessageType.PEER_JOINED,

                {

                    peerId: peer.peerId,

                    username: peer.username,

                    publicKey: peer.publicKey,
                    coordinate: peer.coordinate

                }

            );

        this.peerManager.broadcast(

            JSON.stringify(packet),

            peer.peerId

        );

    }

    /**
     * Send ERROR packet.
     */
    private sendError(
        socket: WebSocket,
        message: string
    ): void {

        this.packetSender.sendError(
            socket,
            message
        );

    }

}
