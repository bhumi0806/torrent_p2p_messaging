import sodium from "libsodium-wrappers";
import { PeerId } from "../identity/valueObjects/PeerID";
import { PublicKey } from "../identity/valueObjects/PublicKey";
import { EncryptionManager } from "../encryption/EncryptionManager";
import { ApplicationContext } from "../integration/ApplicationContext";
import { MessageSerializer } from "./MessageSerializer";
import {
    isRouteMessage,
    isRouteMessageResponse,
    routeMessageSigningText,
    routeHopSigningText,
    routeResponseSigningText,
    RouteMessage,
    RouteHopProof,
    RouteMessageResponse,
    RouteMessageStatus,
    ROUTE_MESSAGE_FUTURE_SKEW_MS,
    ROUTE_MESSAGE_MAX_AGE_MS,
    ROUTE_MESSAGE_MAX_HOPS,
    ROUTE_MESSAGE_MAX_VISITED,
    ROUTE_MESSAGE_VERSION
} from "./RouteMessageProtocol";

interface PendingDelivery {
    readonly messageId: string;
    readonly destinationPeerId: string;
    readonly firstHopPeerId: string;
    readonly resolve: (response: RouteMessageResponse) => void;
    timer: ReturnType<typeof setTimeout>;
    readonly onProgress?: (response: RouteMessageResponse) => void;
}

interface ReturnRoute {
    readonly previousPeerId: string;
    readonly nextPeerId: string;
    readonly expiresAt: number;
}

export interface RouteMessageHandlerOptions {
    readonly selectNextHop: (destinationPeerId: string, excludedPeerIds: ReadonlySet<string>) => string | undefined;
    readonly sendToPeer: (peerId: string, payload: RouteMessage | RouteMessageResponse) => void;
    readonly deliver: (originPeerId: string, transportPeerId: string, encryptedPayload: string) => Promise<void>;
}

const SEEN_TTL_MS = ROUTE_MESSAGE_MAX_AGE_MS;
const RESPONSE_TIMEOUT_MS = 20_000;
const MAX_TRACKED_MESSAGES = 2_000;

/** Signed, end-to-end opaque chat forwarding and signed reverse-path responses. */
export class RouteMessageHandler {
    private readonly pending = new Map<string, PendingDelivery>();
    private readonly seenMessages = new Map<string, number>();
    private readonly returnRoutes = new Map<string, ReturnRoute>();

    constructor(
        private readonly context: ApplicationContext,
        private readonly encryptionManager: EncryptionManager,
        private readonly options: RouteMessageHandlerOptions
    ) {}

    public async send(
        destinationPeerId: string,
        messageId: string,
        encryptedPayload: string,
        onProgress?: (response: RouteMessageResponse) => void,
        originHopLimit = ROUTE_MESSAGE_MAX_HOPS
    ): Promise<RouteMessageResponse> {
        const identity = this.context.getIdentity();
        if (!identity) throw new Error("Local identity is not initialized.");
        await sodium.ready;
        const localPeerId = identity.getPeerId().toString();
        const destination = PeerId.fromString(destinationPeerId).toString();
        const parsed = MessageSerializer.deserialize(encryptedPayload);
        const metadata = parsed.getMetadata();
        if (metadata.getMessageId() !== messageId || metadata.getSenderId().toString() !== localPeerId ||
            metadata.getReceiverId().toString() !== destination) {
            throw new Error("Encrypted chat message metadata does not match the route envelope.");
        }

        if (!Number.isInteger(originHopLimit) || originHopLimit < 1 || originHopLimit > ROUTE_MESSAGE_MAX_HOPS) {
            throw new Error("Invalid route hop limit.");
        }
        const originPublicKey = identity.getPublicIdentity().publicKey.toBase64();
        const createdAt = Date.now();
        const unsigned = {
            version: ROUTE_MESSAGE_VERSION,
            messageId,
            originPeerId: localPeerId,
            destinationPeerId: destination,
            createdAt,
            originHopLimit,
            encryptedPayload,
            originPublicKey
        };
        const originSignature = sodium.to_base64(sodium.crypto_sign_detached(
            sodium.from_string(routeMessageSigningText(unsigned)),
            identity.getKeyPair().privateKey.bytes
        ));
        const message: RouteMessage = Object.freeze({
            ...unsigned,
            type: "ROUTE_MESSAGE",
            hopLimit: originHopLimit,
            visitedPeerIds: Object.freeze([localPeerId]),
            hopProofs: Object.freeze([]),
            originSignature
        });

        const firstHop = this.options.selectNextHop(destination, new Set([localPeerId]));
        if (!firstHop) return this.createResponse(message, "unreachable", "no_live_next_hop");

        const key = this.messageKey(localPeerId, messageId);
        this.markSeen(key);
        return new Promise(resolve => {
            const timer = setTimeout(async () => {
                this.finishPending(key, await this.createResponse(message, "unreachable", "acknowledgement_timeout"));
            }, RESPONSE_TIMEOUT_MS);
            this.pending.set(key, {
                messageId,
                destinationPeerId: destination,
                firstHopPeerId: firstHop,
                resolve,
                timer,
                onProgress
            });
            try {
                this.options.sendToPeer(firstHop, message);
            } catch {
                void this.createResponse(message, "unreachable", "first_hop_unavailable")
                    .then(response => this.finishPending(key, response));
            }
        });
    }

    /** Process a message received over an already-open WebRTC data channel. */
    public async handleMessage(transportPeerId: string, raw: unknown): Promise<void> {
        if (!PeerId.isValid(transportPeerId) || !isRouteMessage(raw)) return;
        const message = raw;
        const identity = this.context.getIdentity();
        if (!identity) return;
        const localPeerId = identity.getPeerId().toString();

        try {
            if (message.visitedPeerIds[message.visitedPeerIds.length - 1] !== transportPeerId) return;
            if (!await this.verifyOrigin(message)) {
                await this.sendFailure(message, transportPeerId, "rejected", "invalid_origin_signature");
                return;
            }
            if (!await this.verifyHopChain(message, localPeerId, transportPeerId)) {
                await this.sendFailure(message, transportPeerId, "rejected", "invalid_hop_authentication");
                return;
            }
            const parsed = MessageSerializer.deserialize(message.encryptedPayload);
            const metadata = parsed.getMetadata();
            if (metadata.getMessageId() !== message.messageId ||
                metadata.getSenderId().toString() !== message.originPeerId ||
                metadata.getReceiverId().toString() !== message.destinationPeerId) {
                await this.sendFailure(message, transportPeerId, "rejected", "message_metadata_mismatch");
                return;
            }

            this.pruneState();
            const cacheKey = this.messageKey(message.originPeerId, message.messageId);
            if (this.seenMessages.has(cacheKey)) {
                await this.sendFailure(message, transportPeerId, "duplicate", "duplicate_suppressed");
                return;
            }
            if (message.createdAt > Date.now() + ROUTE_MESSAGE_FUTURE_SKEW_MS ||
                Date.now() - message.createdAt > ROUTE_MESSAGE_MAX_AGE_MS) {
                this.markSeen(cacheKey);
                await this.sendFailure(message, transportPeerId, "expired", "message_expired");
                return;
            }
            if (message.visitedPeerIds.includes(localPeerId)) {
                this.markSeen(cacheKey);
                await this.sendFailure(message, transportPeerId, "rejected", "routing_loop_detected");
                return;
            }
            if (message.hopLimit < 1) {
                this.markSeen(cacheKey);
                await this.sendFailure(message, transportPeerId, "hop_limit_exceeded", "hop_limit_exhausted");
                return;
            }
            this.markSeen(cacheKey);

            if (message.destinationPeerId === localPeerId) {
                await this.sendProgress(message, transportPeerId, "relay_received", "destination_received");
                try {
                    await this.deriveOriginSessionKey(message);
                    await this.options.deliver(message.originPeerId, transportPeerId, message.encryptedPayload);
                    await this.sendResponse(transportPeerId, await this.createResponse(message, "delivered", "destination_accepted"));
                } catch {
                    await this.sendResponse(transportPeerId, await this.createResponse(message, "rejected", "destination_rejected_message"));
                }
                return;
            }

            await this.sendProgress(message, transportPeerId, "relay_received", "relay_received_message");
            if (message.hopLimit <= 1 || message.visitedPeerIds.length >= ROUTE_MESSAGE_MAX_VISITED) {
                await this.sendFailure(message, transportPeerId, "hop_limit_exceeded", "forwarding_limit_reached");
                return;
            }
            const excluded = new Set([...message.visitedPeerIds, localPeerId, transportPeerId]);
            const nextHop = this.options.selectNextHop(message.destinationPeerId, excluded);
            if (!nextHop) {
                await this.sendFailure(message, transportPeerId, "unreachable", "no_live_next_hop");
                return;
            }

            const returnKey = this.messageKey(message.originPeerId, message.messageId);
            this.rememberReturnRoute(returnKey, transportPeerId, nextHop);
            const visitedPeerIds = Object.freeze([...message.visitedPeerIds, localPeerId]);
            const unsignedProof: Omit<RouteHopProof, "signature"> = {
                previousPeerId: transportPeerId,
                peerId: localPeerId,
                nextPeerId: nextHop,
                hopLimit: message.hopLimit - 1,
                visitedPeerIds,
                previousProofSignature: message.hopProofs[message.hopProofs.length - 1]?.signature ?? message.originSignature,
                publicKey: identity.getPublicIdentity().publicKey.toBase64()
            };
            const proof: RouteHopProof = Object.freeze({
                ...unsignedProof,
                signature: sodium.to_base64(sodium.crypto_sign_detached(
                    sodium.from_string(routeHopSigningText(message, unsignedProof)),
                    identity.getKeyPair().privateKey.bytes
                ))
            });
            const forwarded: RouteMessage = Object.freeze({
                ...message,
                hopLimit: proof.hopLimit,
                visitedPeerIds,
                hopProofs: Object.freeze([...message.hopProofs, proof])
            });
            try {
                this.options.sendToPeer(nextHop, forwarded);
                await this.sendProgress(message, transportPeerId, "relay_forwarded", "forwarded_to_next_hop");
            } catch {
                this.returnRoutes.delete(returnKey);
                await this.sendFailure(message, transportPeerId, "unreachable", "next_hop_unavailable");
            }
        } catch (error) {
            // Invalid or corrupted packets are isolated to this data-channel event.
            console.warn("Rejected routed chat packet:", error);
        }
    }

    /** Verify a signed receipt, then resolve the origin or relay it over reverse-path state. */
    public async handleResponse(transportPeerId: string, raw: unknown): Promise<boolean> {
        if (!PeerId.isValid(transportPeerId) || !isRouteMessageResponse(raw)) return false;
        const response = raw;
        if (!await this.verifyResponse(response)) return false;
        if (response.status === "delivered" && response.responderPeerId !== response.destinationPeerId) return false;
        if (response.timestamp > Date.now() + ROUTE_MESSAGE_FUTURE_SKEW_MS ||
            Date.now() - response.timestamp > ROUTE_MESSAGE_MAX_AGE_MS) return false;

        const key = this.messageKey(response.originPeerId, response.messageId);
        const pending = this.pending.get(key);
        if (response.originPeerId === this.context.getIdentity()?.getPeerId().toString()) {
            if (!pending || pending.destinationPeerId !== response.destinationPeerId ||
                pending.firstHopPeerId !== transportPeerId) return false;
            if (response.status === "relay_received" || response.status === "relay_forwarded" ||
                response.status === "duplicate") {
                pending.onProgress?.(response);
                return true;
            }
            this.finishPending(key, response);
            return true;
        }

        const route = this.returnRoutes.get(key);
        if (!route || route.nextPeerId !== transportPeerId || route.expiresAt <= Date.now()) return false;
        try {
            this.options.sendToPeer(route.previousPeerId, response);
            return true;
        } catch {
            return false;
        }
    }

    public dispose(): void {
        for (const [key, pending] of this.pending) {
            clearTimeout(pending.timer);
            const originPeerId = this.context.getIdentity()?.getPeerId().toString();
            if (originPeerId) {
                void this.createResponse({
                    messageId: pending.messageId,
                    originPeerId,
                    destinationPeerId: pending.destinationPeerId
                }, "unreachable", "router_disposed").then(pending.resolve);
            }
        }
        this.pending.clear();
        this.returnRoutes.clear();
        this.seenMessages.clear();
    }

    private async verifyOrigin(message: RouteMessage): Promise<boolean> {
        await sodium.ready;
        try {
            const publicKey = PublicKey.fromBase64(message.originPublicKey);
            if (publicKey.toBase64() !== message.originPublicKey) return false;
            const peerId = await PeerId.fromPublicKey(publicKey.bytes);
            if (peerId.toString() !== message.originPeerId) return false;
            return sodium.crypto_sign_verify_detached(
                sodium.from_base64(message.originSignature),
                sodium.from_string(routeMessageSigningText(message)),
                publicKey.bytes
            );
        } catch {
            return false;
        }
    }

    private async verifyHopChain(message: RouteMessage, localPeerId: string, transportPeerId: string): Promise<boolean> {
        await sodium.ready;
        if (message.hopProofs.length === 0) {
            return message.visitedPeerIds.length === 1 && transportPeerId === message.originPeerId;
        }
        if (message.visitedPeerIds[message.visitedPeerIds.length - 1] !== transportPeerId) return false;
        for (let index = 0; index < message.hopProofs.length; index++) {
            const proof = message.hopProofs[index];
            const expectedPath = message.visitedPeerIds.slice(0, index + 2);
            const expectedNext = index + 1 < message.hopProofs.length
                ? message.hopProofs[index + 1].peerId
                : localPeerId;
            if (proof.previousPeerId !== message.visitedPeerIds[index] ||
                proof.peerId !== message.visitedPeerIds[index + 1] ||
                proof.nextPeerId !== expectedNext || proof.hopLimit !== message.originHopLimit - index - 1 ||
                proof.visitedPeerIds.length !== expectedPath.length ||
                proof.visitedPeerIds.some((id, pathIndex) => id !== expectedPath[pathIndex]) ||
                proof.previousProofSignature !== (index === 0
                    ? message.originSignature
                    : message.hopProofs[index - 1].signature)) return false;
            try {
                const publicKey = PublicKey.fromBase64(proof.publicKey);
                if ((await PeerId.fromPublicKey(publicKey.bytes)).toString() !== proof.peerId) return false;
                const { signature, ...unsigned } = proof;
                if (!sodium.crypto_sign_verify_detached(
                    sodium.from_base64(signature),
                    sodium.from_string(routeHopSigningText(message, unsigned)),
                    publicKey.bytes
                )) return false;
            } catch {
                return false;
            }
        }
        return message.hopProofs[message.hopProofs.length - 1]?.nextPeerId === localPeerId;
    }

    private async deriveOriginSessionKey(message: RouteMessage): Promise<void> {
        const identity = this.context.getIdentity();
        if (!identity) throw new Error("Local identity is not initialized.");
        const originPeerId = PeerId.fromString(message.originPeerId);
        const originPublicKey = PublicKey.fromBase64(message.originPublicKey);
        if (!this.encryptionManager.hasSessionKey(originPeerId)) {
            await this.encryptionManager.deriveAndStoreSessionKey(
                identity.getPrivateIdentity(), originPeerId, originPublicKey
            );
        }
    }

    private async verifyResponse(response: RouteMessageResponse): Promise<boolean> {
        await sodium.ready;
        try {
            const publicKey = PublicKey.fromBase64(response.responderPublicKey);
            if (publicKey.toBase64() !== response.responderPublicKey) return false;
            const peerId = await PeerId.fromPublicKey(publicKey.bytes);
            if (peerId.toString() !== response.responderPeerId) return false;
            const { signature, ...unsigned } = response;
            return sodium.crypto_sign_verify_detached(
                sodium.from_base64(signature),
                sodium.from_string(routeResponseSigningText(unsigned)),
                publicKey.bytes
            );
        } catch {
            return false;
        }
    }

    private async sendProgress(
        message: RouteMessage,
        peerId: string,
        status: "relay_received" | "relay_forwarded",
        reason: string
    ): Promise<void> {
        await this.sendResponse(peerId, await this.createResponse(message, status, reason));
    }

    private async sendFailure(
        message: RouteMessage,
        peerId: string,
        status: Extract<RouteMessageStatus, "rejected" | "unreachable" | "expired" | "hop_limit_exceeded" | "duplicate">,
        reason: string
    ): Promise<void> {
        await this.sendResponse(peerId, await this.createResponse(message, status, reason));
    }

    private async sendResponse(peerId: string, response: RouteMessageResponse): Promise<void> {
        this.options.sendToPeer(peerId, response);
    }

    private async createResponse(
        message: Pick<RouteMessage, "messageId" | "originPeerId" | "destinationPeerId">,
        status: RouteMessageStatus,
        reason: string
    ): Promise<RouteMessageResponse> {
        const identity = this.context.getIdentity();
        if (!identity) throw new Error("Local identity is not initialized.");
        await sodium.ready;
        const responderPublicKey = identity.getPublicIdentity().publicKey.toBase64();
        const unsigned = {
            version: ROUTE_MESSAGE_VERSION,
            type: "ROUTE_MESSAGE_RESPONSE" as const,
            messageId: message.messageId,
            originPeerId: message.originPeerId,
            destinationPeerId: message.destinationPeerId,
            responderPeerId: identity.getPeerId().toString(),
            status,
            timestamp: Date.now(),
            reason: reason.slice(0, 128),
            responderPublicKey
        };
        const signature = sodium.to_base64(sodium.crypto_sign_detached(
            sodium.from_string(routeResponseSigningText(unsigned)),
            identity.getKeyPair().privateKey.bytes
        ));
        return Object.freeze({ ...unsigned, signature });
    }

    private async finishPending(key: string, response: RouteMessageResponse): Promise<void> {
        const pending = this.pending.get(key);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(key);
        pending.resolve(response);
    }

    private markSeen(key: string): void {
        this.seenMessages.set(key, Date.now() + SEEN_TTL_MS);
        while (this.seenMessages.size > MAX_TRACKED_MESSAGES) {
            const oldest = this.seenMessages.keys().next().value as string | undefined;
            if (!oldest) break;
            this.seenMessages.delete(oldest);
        }
    }

    private rememberReturnRoute(key: string, previousPeerId: string, nextPeerId: string): void {
        this.pruneState();
        if (!this.returnRoutes.has(key)) {
            this.returnRoutes.set(key, {
                previousPeerId,
                nextPeerId,
                expiresAt: Date.now() + ROUTE_MESSAGE_MAX_AGE_MS
            });
        }
        while (this.returnRoutes.size > MAX_TRACKED_MESSAGES) {
            const oldest = this.returnRoutes.keys().next().value as string | undefined;
            if (!oldest) break;
            this.returnRoutes.delete(oldest);
        }
    }

    private pruneState(): void {
        const now = Date.now();
        for (const [key, expiresAt] of this.seenMessages) if (expiresAt <= now) this.seenMessages.delete(key);
        for (const [key, route] of this.returnRoutes) if (route.expiresAt <= now) this.returnRoutes.delete(key);
    }

    private messageKey(originPeerId: string, messageId: string): string {
        return `${originPeerId}:${messageId}`;
    }
}
