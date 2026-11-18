import { PeerId } from "../identity/valueObjects/PeerID";
import { PublicKey } from "../identity/valueObjects/PublicKey";

export const XOR_PROTOCOL_VERSION = 1 as const;
export const XOR_MAX_K = 20;
export const XOR_MAX_HOP_LIMIT = 8;
export const XOR_MAX_VISITED_PEERS = 32;
export const XOR_MAX_RECORDS = 20;
export const XOR_MAX_REQUEST_ID_LENGTH = 128;
export const XOR_MAX_USERNAME_LENGTH = 64;

export interface XorPeerRecord {
    readonly peerId: string;
    readonly username: string;
    readonly publicKey: string;
}

export interface FindNodeRequest {
    readonly version: typeof XOR_PROTOCOL_VERSION;
    readonly type: "FIND_NODE";
    readonly requestId: string;
    readonly originPeerId: string;
    readonly targetPeerId: string;
    readonly k: number;
    readonly hopLimit: number;
    readonly visitedPeerIds: readonly string[];
}

export interface FindNodeResponse {
    readonly version: typeof XOR_PROTOCOL_VERSION;
    readonly type: "FIND_NODE_RESPONSE";
    readonly requestId: string;
    readonly responderPeerId: string;
    readonly targetPeerId: string;
    readonly status: "ok";
    readonly peers: readonly XorPeerRecord[];
}

export function isFindNodeRequest(value: unknown): value is FindNodeRequest {
    if (!isRecord(value) || value.version !== XOR_PROTOCOL_VERSION || value.type !== "FIND_NODE") return false;
    if (!isRequestId(value.requestId) || !isPeerId(value.originPeerId) || !isPeerId(value.targetPeerId)) return false;
    if (!Number.isInteger(value.k) || (value.k as number) < 1 || (value.k as number) > XOR_MAX_K) return false;
    if (!Number.isInteger(value.hopLimit) || (value.hopLimit as number) < 1 || (value.hopLimit as number) > XOR_MAX_HOP_LIMIT) return false;
    if (!Array.isArray(value.visitedPeerIds) || value.visitedPeerIds.length < 1 || value.visitedPeerIds.length > XOR_MAX_VISITED_PEERS) return false;
    if (!value.visitedPeerIds.every(isPeerId) || new Set(value.visitedPeerIds).size !== value.visitedPeerIds.length) return false;
    return value.visitedPeerIds[0] === value.originPeerId;
}

export function isFindNodeResponse(value: unknown): value is FindNodeResponse {
    if (!isRecord(value) || value.version !== XOR_PROTOCOL_VERSION || value.type !== "FIND_NODE_RESPONSE") return false;
    if (!isRequestId(value.requestId) || !isPeerId(value.responderPeerId) || !isPeerId(value.targetPeerId)) return false;
    if (value.status !== "ok" || !Array.isArray(value.peers) || value.peers.length > XOR_MAX_RECORDS) return false;
    if (!value.peers.every(isPeerRecordShape)) return false;
    return new Set(value.peers.map((peer: XorPeerRecord) => peer.peerId)).size === value.peers.length;
}

/** Check record shape and cryptographically bind the peer ID to the Ed25519 public key. */
export async function validateXorPeerRecord(value: unknown): Promise<XorPeerRecord | undefined> {
    if (!isPeerRecordShape(value)) return undefined;
    try {
        const publicKey = PublicKey.fromBase64(value.publicKey);
        if (publicKey.toBase64() !== value.publicKey) return undefined;
        const derivedPeerId = await PeerId.fromPublicKey(publicKey.bytes);
        if (derivedPeerId.toString() !== value.peerId) return undefined;
        return Object.freeze({
            peerId: value.peerId,
            username: value.username,
            publicKey: value.publicKey
        });
    } catch {
        return undefined;
    }
}

export function isPeerId(value: unknown): value is string {
    return typeof value === "string" && PeerId.isValid(value);
}

function isRequestId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 &&
        value.length <= XOR_MAX_REQUEST_ID_LENGTH && /^[A-Za-z0-9_-]+$/.test(value);
}

function isPeerRecordShape(value: unknown): value is XorPeerRecord {
    return isRecord(value) && isPeerId(value.peerId) &&
        typeof value.username === "string" && value.username.trim().length > 0 &&
        value.username.length <= XOR_MAX_USERNAME_LENGTH &&
        typeof value.publicKey === "string" && value.publicKey.length <= 128;
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
