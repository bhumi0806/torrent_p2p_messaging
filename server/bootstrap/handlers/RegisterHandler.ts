import WebSocket from "ws";

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
            publicKey

        } = packet.payload;

        console.log(`RegisterHandler: received REGISTER from ${username} (${peerId})`);
        const peer = new Peer(

            peerId,

            username,

            publicKey,

            socket

        );

        const success =
            this.peerManager.registerPeer(peer);

        console.log(`RegisterHandler: registerPeer returned ${success} (peerCount=${this.peerManager.peerCount()})`);
        if (!success) {

            this.sendError(

                socket,

                "Peer already exists."

            );

            return;

        }

        this.sendPeerList(socket);

        console.log(`RegisterHandler: sent PEER_LIST to ${username} (${peerId})`);
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
        socket: WebSocket
    ): void {

        const peers =

            this.peerManager

                .getAllPeers()

                .map(peer => ({

                    peerId: peer.peerId,

                    username: peer.username,

                    publicKey: peer.publicKey

                }));

        console.log(`RegisterHandler: preparing PEER_LIST (${peers.length} peers)`);
        console.log(peers);
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

        console.log(`RegisterHandler: broadcasting PEER_JOINED for ${peer.username} (${peer.peerId})`);
        const packet =

            new BootstrapPacket(

                MessageType.PEER_JOINED,

                {

                    peerId: peer.peerId,

                    username: peer.username,

                    publicKey: peer.publicKey

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