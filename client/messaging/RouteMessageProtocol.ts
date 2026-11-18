import { PeerId } from "../identity/valueObjects/PeerID";

export const ROUTE_MESSAGE_VERSION = 1 as const;
export const ROUTE_MESSAGE_MAX_HOPS = 8;
export const ROUTE_MESSAGE_MAX_VISITED = 9;
export const ROUTE_MESSAGE_MAX_PAYLOAD_BYTES = 256 * 1024;
export const ROUTE_MESSAGE_MAX_AGE_MS = 2 * 60 * 1000;
export const ROUTE_MESSAGE_FUTURE_SKEW_MS = 30_000;

export type RouteMessageStatus =
    | "relay_received"
    | "relay_forwarded"
    | "delivered"
    | "rejected"
    | "unreachable"
    | "expired"
    | "hop_limit_exceeded"
    | "duplicate";

export interface RouteMessage {
    readonly version: typeof ROUTE_MESSAGE_VERSION;
    readonly type: "ROUTE_MESSAGE";
    readonly messageId: string;
    readonly originPeerId: string;
    readonly destinationPeerId: string;
    readonly createdAt: number;
    /** Origin-authenticated initial hop budget. */
    readonly originHopLimit: number;
    /** Current remaining hops; bound by the signed per-hop chain. */
    readonly hopLimit: number;
    readonly visitedPeerIds: readonly string[];
    readonly hopProofs: readonly RouteHopProof[];
    /** Existing MessageSerializer output. Relays forward this exact string. */
    readonly encryptedPayload: string;
    readonly originPublicKey: string;
    /** Ed25519 signature over immutable origin, destination, ID, time and payload fields. */
    readonly originSignature: string;
}

/** Each relay signs the path state and the identity of the next transport peer. */
export interface RouteHopProof {
    readonly previousPeerId: string;
    readonly peerId: string;
    readonly nextPeerId: string;
    readonly hopLimit: number;
    readonly visitedPeerIds: readonly string[];
    readonly previousProofSignature: string;
    readonly publicKey: string;
    readonly signature: string;
}

export interface RouteMessageResponse {
    readonly version: typeof ROUTE_MESSAGE_VERSION;
    readonly type: "ROUTE_MESSAGE_RESPONSE";
    readonly messageId: string;
    readonly originPeerId: string;
    readonly destinationPeerId: string;
    readonly responderPeerId: string;
    readonly status: RouteMessageStatus;
    readonly timestamp: number;
    readonly reason: string;
    readonly responderPublicKey: string;
    readonly signature: string;
}

const MESSAGE_KEYS = [
    "version", "type", "messageId", "originPeerId", "destinationPeerId",
    "createdAt", "originHopLimit", "hopLimit", "visitedPeerIds", "hopProofs", "encryptedPayload",
    "originPublicKey", "originSignature"
].sort();
const RESPONSE_KEYS = [
    "version", "type", "messageId", "originPeerId", "destinationPeerId",
    "responderPeerId", "status", "timestamp", "reason", "responderPublicKey", "signature"
].sort();
const MESSAGE_ID = /^[A-Za-z0-9_-]{16,128}$/;
// libsodium's default encoder uses URL-safe base64 without padding.
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

export function isRouteMessage(value: unknown): value is RouteMessage {
    if (!hasExactKeys(value, MESSAGE_KEYS) || !isRecord(value)) return false;
    if (value.version !== ROUTE_MESSAGE_VERSION || value.type !== "ROUTE_MESSAGE") return false;
    if (!isMessageId(value.messageId) || !isPeerId(value.originPeerId) || !isPeerId(value.destinationPeerId)) return false;
    if (value.originPeerId === value.destinationPeerId) return false;
    if (!isTimestamp(value.createdAt) || !Number.isInteger(value.originHopLimit) ||
        (value.originHopLimit as number) < 1 || (value.originHopLimit as number) > ROUTE_MESSAGE_MAX_HOPS ||
        !Number.isInteger(value.hopLimit) || (value.hopLimit as number) < 1 ||
        (value.hopLimit as number) > (value.originHopLimit as number)) return false;
    if (!Array.isArray(value.visitedPeerIds) || value.visitedPeerIds.length < 1 ||
        value.visitedPeerIds.length > ROUTE_MESSAGE_MAX_VISITED) return false;
    if (!value.visitedPeerIds.every(isPeerId) || new Set(value.visitedPeerIds).size !== value.visitedPeerIds.length ||
        value.visitedPeerIds[0] !== value.originPeerId) return false;
    if (!Array.isArray(value.hopProofs) || value.hopProofs.length !== value.visitedPeerIds.length - 1 ||
        value.hopProofs.length !== (value.originHopLimit as number) - (value.hopLimit as number) ||
        !value.hopProofs.every(isRouteHopProof)) return false;
    if (typeof value.encryptedPayload !== "string" || value.encryptedPayload.length === 0 ||
        byteLength(value.encryptedPayload) > ROUTE_MESSAGE_MAX_PAYLOAD_BYTES) return false;
    if (!isBoundedBase64(value.originPublicKey, 128) || !isBoundedBase64(value.originSignature, 128)) return false;
    return true;
}

export function isRouteMessageResponse(value: unknown): value is RouteMessageResponse {
    if (!hasExactKeys(value, RESPONSE_KEYS) || !isRecord(value)) return false;
    if (value.version !== ROUTE_MESSAGE_VERSION || value.type !== "ROUTE_MESSAGE_RESPONSE") return false;
    if (!isMessageId(value.messageId) || !isPeerId(value.originPeerId) ||
        !isPeerId(value.destinationPeerId) || !isPeerId(value.responderPeerId)) return false;
    if (![
        "relay_received", "relay_forwarded", "delivered", "rejected", "unreachable",
        "expired", "hop_limit_exceeded", "duplicate"
    ].includes(value.status)) return false;
    if (!isTimestamp(value.timestamp) || typeof value.reason !== "string" || value.reason.length > 128) return false;
    return isBoundedBase64(value.responderPublicKey, 128) && isBoundedBase64(value.signature, 128);
}

export function isPeerId(value: unknown): value is string {
    return typeof value === "string" && PeerId.isValid(value);
}

/** Canonical signed fields; hop count and visited path are mutable relay metadata. */
export function routeMessageSigningText(message: Pick<RouteMessage,
    "version" | "messageId" | "originPeerId" | "destinationPeerId" | "createdAt" | "originHopLimit" | "encryptedPayload" | "originPublicKey">): string {
    return JSON.stringify([
        message.version,
        message.messageId,
        message.originPeerId,
        message.destinationPeerId,
        message.createdAt,
        message.originHopLimit,
        message.encryptedPayload,
        message.originPublicKey
    ]);
}

export function routeHopSigningText(message: Pick<RouteMessage,
    "messageId" | "originPeerId" | "destinationPeerId" | "createdAt" | "encryptedPayload" | "originSignature">,
proof: Omit<RouteHopProof, "signature">): string {
    return JSON.stringify([
        message.messageId, message.originPeerId, message.destinationPeerId, message.createdAt,
        message.originSignature, message.encryptedPayload, proof.previousPeerId, proof.peerId,
        proof.nextPeerId, proof.hopLimit, proof.visitedPeerIds, proof.previousProofSignature,
        proof.publicKey
    ]);
}

/** Canonical signed fields for final delivery receipts and relay progress/failures. */
export function routeResponseSigningText(response: Omit<RouteMessageResponse, "signature">): string {
    return JSON.stringify([
        response.version,
        response.type,
        response.messageId,
        response.originPeerId,
        response.destinationPeerId,
        response.responderPeerId,
        response.status,
        response.timestamp,
        response.reason,
        response.responderPublicKey
    ]);
}

function isMessageId(value: unknown): value is string {
    return typeof value === "string" && MESSAGE_ID.test(value);
}

function isTimestamp(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isBoundedBase64(value: unknown, maxLength: number): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= maxLength && BASE64.test(value);
}

function isRouteHopProof(value: unknown): value is RouteHopProof {
    if (!isRecord(value) || Object.keys(value).sort().join(",") !== [
        "previousPeerId", "peerId", "nextPeerId", "hopLimit", "visitedPeerIds",
        "previousProofSignature", "publicKey", "signature"
    ].sort().join(",")) return false;
    return isPeerId(value.previousPeerId) && isPeerId(value.peerId) && isPeerId(value.nextPeerId) &&
        Number.isInteger(value.hopLimit) && (value.hopLimit as number) >= 1 &&
        Array.isArray(value.visitedPeerIds) && value.visitedPeerIds.length <= ROUTE_MESSAGE_MAX_VISITED &&
        value.visitedPeerIds.every(isPeerId) && isBoundedBase64(value.previousProofSignature, 128) &&
        isBoundedBase64(value.publicKey, 128) && isBoundedBase64(value.signature, 128);
}

function byteLength(value: string): number {
    return new TextEncoder().encode(value).byteLength;
}

function hasExactKeys(value: unknown, expected: string[]): boolean {
    if (!isRecord(value)) return false;
    const actual = Object.keys(value).sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
