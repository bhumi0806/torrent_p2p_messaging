import WebSocket, { WebSocketServer } from "ws";

import { ServerConfig } from "./config/ServerConfig";

import { PacketDispatcher } from "./handlers/PacketDispatcher";
import { RegisterHandler } from "./handlers/RegisterHandler";
import { SignalHandler } from "./handlers/SignalHandler";

import { PeerManager } from "./managers/PeerManager";
import { SignalingManager } from "./managers/SignalingManager";

import { PacketSender } from "./network/PacketSender";

import { BootstrapPacket } from "./models/BootstrapPacket";

import { MessageType } from "./types/MessageType";

import { PeerLeftPayload } from "./protocol/PeerLeftPayload";
import { RateLimiter } from "./rateLimit/RateLimiter";

export class BootstrapServer {

    private readonly server: WebSocketServer;

    private readonly peerManager: PeerManager;

    private readonly packetSender: PacketSender;

    private readonly dispatcher: PacketDispatcher;

    private readonly rateLimiter: RateLimiter;

    constructor() {

        this.peerManager = new PeerManager();

        this.packetSender = new PacketSender();

        const signalingManager =
            new SignalingManager(
                this.peerManager,
                this.packetSender
            );

        const registerHandler =
            new RegisterHandler(
                this.peerManager,
                this.packetSender
            );

        const signalHandler =
            new SignalHandler(
                signalingManager,
                this.packetSender
            );

        this.dispatcher =
            new PacketDispatcher(
                registerHandler,
                signalHandler
            );

        this.rateLimiter = new RateLimiter();

        this.server = new WebSocketServer({

            host: ServerConfig.HOST,
            port: ServerConfig.PORT

        });

    }

    /**
     * Start Bootstrap Server.
     */
    public start(): void {

        console.log(
            `Bootstrap Server listening on ${ServerConfig.HOST}:${ServerConfig.PORT}`
        );

        this.server.on(
            "connection",
            this.handleConnection.bind(this)
        );

    }

    /**
     * Stop server.
     */
    public stop(): void {

        this.server.close();

    }

    /**
     * Handle a newly connected socket.
     */
    private handleConnection(
        socket: WebSocket
    ): void {

        socket.on(
            "message",
            (raw) => this.handleMessage(socket, raw)
        );

        socket.on(
            "close",
            () => this.handleDisconnect(socket)
        );

        socket.on(
            "error",
            () => this.handleDisconnect(socket)
        );

    }

    /**
     * Handle incoming packet.
     */
    private handleMessage(
        socket: WebSocket,
        raw: WebSocket.RawData
    ): void {

        try {

            const parsed = JSON.parse(raw.toString());

            if (!this.isValidEnvelope(parsed)) {
                this.packetSender.sendError(
                    socket,
                    "Invalid packet envelope."
                );
                return;
            }

            const packet = parsed as BootstrapPacket<unknown>;

            const scope = this.getScope(packet.type);
            const remoteAddress = this.getRemoteAddress(socket);
            const accountId = this.getAccountId(packet);

            if (!this.rateLimiter.allow({
                scope,
                remoteAddress,
                accountId
            })) {
                this.packetSender.sendError(
                    socket,
                    "Too many requests. Please retry shortly."
                );
                return;
            }

            this.dispatcher.dispatch(
                socket,
                packet
            );

        }

        catch {

            this.packetSender.sendError(

                socket,

                "Invalid packet."

            );

        }

    }

    private isValidEnvelope(value: unknown): value is BootstrapPacket<unknown> {
        if (!value || typeof value !== "object") {
            return false;
        }

        const candidate = value as Record<string, unknown>;

        if (typeof candidate.type !== "string") {
            return false;
        }

        if (!Object.values(MessageType).includes(candidate.type as MessageType)) {
            return false;
        }

        if (!Object.prototype.hasOwnProperty.call(candidate, "payload")) {
            return false;
        }

        return true;
    }

    private getScope(packetType: string): "auth" | "public" | "authenticated" {
        if (packetType === MessageType.REGISTER) {
            return "public";
        }

        return "public";
    }

    private getRemoteAddress(socket: WebSocket): string | undefined {
        const remoteAddress = (socket as WebSocket & { _socket?: { remoteAddress?: string } })._socket?.remoteAddress;
        return remoteAddress;
    }

    private getAccountId(packet: BootstrapPacket<unknown>): string | undefined {
        if (!packet || typeof packet !== "object") {
            return undefined;
        }

        const payload = packet.payload as Record<string, unknown> | undefined;
        if (!payload || typeof payload !== "object") {
            return undefined;
        }

        const candidate = payload.username ?? payload.account ?? payload.user ?? payload.email;
        return typeof candidate === "string" ? candidate : undefined;
    }

    /**
     * Handle peer disconnect.
     */
    private handleDisconnect(
        socket: WebSocket
    ): void {

        const peer =
            this.peerManager.removePeerBySocket(
                socket
            );

        if (!peer) {

            return;

        }

        const packet =
            new BootstrapPacket<PeerLeftPayload>(

                MessageType.PEER_LEFT,

                {

                    peerId: peer.peerId

                }

            );

        this.peerManager.broadcast(
            JSON.stringify(packet),
            peer.peerId
        );

    }

}
