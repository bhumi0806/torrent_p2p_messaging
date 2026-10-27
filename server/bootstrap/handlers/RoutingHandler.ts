import WebSocket from "ws";
import { randomBytes } from "node:crypto";

import { BootstrapPacket } from "../models/BootstrapPacket";
import { PeerManager } from "../managers/PeerManager";
import { PacketSender } from "../network/PacketSender";
import { MessageType } from "../types/MessageType";
import {
    AnonymousSignalKind,
    AnonymousSignalRequest,
    ConnectionProfile,
    DataReturnPayload,
    DataStorePayload,
    FindClosestNodesRequest
} from "../protocol/RoutingPayload";

interface StoredValue {
    value: string;
    expiresAt: number;
}

/** Handles coordinate routing and bounded, expiring in-memory store operations. */
export class RoutingHandler {
    private readonly store = new Map<string, StoredValue>();
    private readonly returnRoutes = new Map<string, { socket: WebSocket; expiresAt: number }>();
    private readonly maxStoreEntries = 512;
    private readonly maxValueLength = 48 * 1024;
    private readonly maxTtlMs = 60 * 60 * 1000;
    private readonly cleanupTimer: NodeJS.Timeout;

    constructor(
        private readonly peers: PeerManager,
        private readonly sender: PacketSender
    ) {
        this.cleanupTimer = setInterval(() => {
            this.pruneStore();
            this.pruneReturnRoutes();
        }, 30_000);
        this.cleanupTimer.unref();
    }

    public dispose(): void {
        clearInterval(this.cleanupTimer);
        this.store.clear();
        this.returnRoutes.clear();
    }

    public handleFindClosest(socket: WebSocket, raw: unknown): void {
        if (!this.peers.findPeerBySocket(socket)) return this.error(socket, "Register before routing.");
        const payload = raw as Partial<FindClosestNodesRequest> | null;
        if (!payload || !this.validCoordinate(payload.targetCoordinate)) return this.error(socket, "Invalid target coordinate.");
        const limit = Number.isInteger(payload.limit) ? Math.max(1, Math.min(payload.limit!, 20)) : 5;
        const nodes = this.closest(payload.targetCoordinate, limit);
        this.sender.send(socket, new BootstrapPacket(MessageType.FIND_CLOSEST_NODES, {
            requestId: this.requestId(payload.requestId),
            nodes
        }));
    }

    public handleAnonymousSignal(socket: WebSocket, raw: unknown): void {
        const source = this.peers.findPeerBySocket(socket);
        if (!source) return this.error(socket, "Register before signaling.");
        const payload = raw as Partial<AnonymousSignalRequest> | null;
        if (!payload || !this.isSignalKind(payload.signalType) || !this.isBoundedObject(payload.signal)) {
            return this.error(socket, "Invalid anonymous signal.");
        }
        let targetSocket: WebSocket | undefined;
        let returnToken = payload.returnToken;
        if (returnToken !== undefined) {
            if (!this.validReturnToken(returnToken)) return this.error(socket, "Invalid anonymous return token.");
            this.pruneReturnRoutes();
            const route = this.returnRoutes.get(returnToken);
            if (!route || route.expiresAt <= Date.now()) return this.error(socket, "Anonymous return route expired.");
            targetSocket = route.socket;
        } else {
            if (!this.validCoordinate(payload.targetCoordinate)) return this.error(socket, "Invalid target coordinate.");
            const target = this.closestPeer(payload.targetCoordinate, source.peerId);
            if (!target) return this.error(socket, "No live node is available near that coordinate.");
            targetSocket = target.getSocket();
            this.pruneReturnRoutes();
            returnToken = randomBytes(32).toString("base64url");
            this.returnRoutes.set(returnToken, { socket, expiresAt: Date.now() + 2 * 60 * 1000 });
        }

        // Forward only a short-lived bearer return token, never either peer ID.
        this.sender.send(targetSocket, new BootstrapPacket(MessageType.ANONYMOUS_SIGNAL, {
            returnToken,
            signalType: payload.signalType,
            signal: payload.signal,
            requestId: this.requestId(payload.requestId)
        }));
        this.sender.send(socket, new BootstrapPacket(MessageType.ANONYMOUS_SIGNAL, {
            delivered: true,
            requestId: this.requestId(payload.requestId)
        }));
    }

    public handleDataStore(socket: WebSocket, raw: unknown): void {
        if (!this.peers.findPeerBySocket(socket)) return this.error(socket, "Register before storing data.");
        const payload = raw as Partial<DataStorePayload> | null;
        if (!payload || !this.validKey(payload.key) || typeof payload.value !== "string" || Buffer.byteLength(payload.value, "utf8") > this.maxValueLength) {
            return this.error(socket, "Invalid data store payload.");
        }
        this.pruneStore();
        if (!this.store.has(payload.key) && this.store.size >= this.maxStoreEntries) {
            return this.error(socket, "Temporary data store is full.");
        }
        const ttlMs = Number.isFinite(payload.ttlMs)
            ? Math.max(1_000, Math.min(payload.ttlMs!, this.maxTtlMs))
            : 5 * 60 * 1000;
        const expiresAt = Date.now() + ttlMs;
        this.store.set(payload.key, { value: payload.value, expiresAt });
        this.sender.send(socket, new BootstrapPacket(MessageType.DATA_RETURN, {
            key: payload.key,
            found: true,
            expiresAt
        } satisfies DataReturnPayload));
    }

    public handleDataReturn(socket: WebSocket, raw: unknown): void {
        if (!this.peers.findPeerBySocket(socket)) return this.error(socket, "Register before retrieving data.");
        const payload = raw as Partial<DataReturnPayload> | null;
        if (!payload || !this.validKey(payload.key)) return this.error(socket, "Invalid data return payload.");
        this.pruneStore();
        const stored = this.store.get(payload.key);
        this.sender.send(socket, new BootstrapPacket(MessageType.DATA_RETURN, stored
            ? { key: payload.key, found: true, value: stored.value, expiresAt: stored.expiresAt }
            : { key: payload.key, found: false }));
    }

    private closest(target: number, limit: number): ConnectionProfile[] {
        return this.peers.getAllPeers()
            .filter(peer => typeof peer.coordinate === "number" && this.validCoordinate(peer.coordinate))
            .sort((a, b) => this.ringDistance(a.coordinate!, target) - this.ringDistance(b.coordinate!, target))
            .slice(0, limit)
            .map(peer => ({ peerId: peer.peerId, username: peer.username, publicKey: peer.publicKey, coordinate: peer.coordinate! }));
    }

    private closestPeer(target: number, excludePeerId: string) {
        return this.peers.getAllPeers()
            .filter(peer => peer.peerId !== excludePeerId && typeof peer.coordinate === "number" && this.validCoordinate(peer.coordinate))
            .sort((a, b) => this.ringDistance(a.coordinate!, target) - this.ringDistance(b.coordinate!, target))[0];
    }

    private ringDistance(a: number, b: number): number {
        const direct = Math.abs(a - b);
        return Math.min(direct, 1 - direct);
    }

    private validCoordinate(value: unknown): value is number {
        return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
    }

    private validKey(value: unknown): value is string {
        return typeof value === "string" && value.length > 0 && value.length <= 256;
    }

    private isSignalKind(value: unknown): value is AnonymousSignalKind {
        return value === MessageType.OFFER || value === MessageType.ANSWER || value === MessageType.ICE_CANDIDATE;
    }

    private isBoundedObject(value: unknown): boolean {
        if (!value || typeof value !== "object") return false;
        try {
            return Buffer.byteLength(JSON.stringify(value), "utf8") <= this.maxValueLength;
        } catch {
            return false;
        }
    }

    private requestId(value: unknown): string | undefined {
        return typeof value === "string" && value.length <= 128 ? value : undefined;
    }

    private validReturnToken(value: string): boolean {
        return value.length >= 32 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
    }

    private pruneReturnRoutes(): void {
        const now = Date.now();
        for (const [token, route] of this.returnRoutes) {
            if (route.expiresAt <= now || route.socket.readyState !== WebSocket.OPEN) this.returnRoutes.delete(token);
        }
        while (this.returnRoutes.size > 4_000) {
            const oldest = this.returnRoutes.keys().next().value as string | undefined;
            if (!oldest) break;
            this.returnRoutes.delete(oldest);
        }
    }

    private pruneStore(): void {
        const now = Date.now();
        for (const [key, value] of this.store) {
            if (value.expiresAt <= now) this.store.delete(key);
        }
    }

    private error(socket: WebSocket, message: string): void {
        this.sender.sendError(socket, message);
    }
}
