import { MessageType } from "../types/MessageType";

export interface FindClosestNodesRequest {
    targetCoordinate: number;
    limit?: number;
    requestId?: string;
}

export interface ConnectionProfile {
    peerId: string;
    username: string;
    publicKey: string;
    coordinate: number;
}

export interface FindClosestNodesResponse {
    requestId?: string;
    nodes: ConnectionProfile[];
}

export type AnonymousSignalKind =
    | MessageType.OFFER
    | MessageType.ANSWER
    | MessageType.ICE_CANDIDATE;

/** Request form carries only a destination coordinate, not a peer identity. */
export interface AnonymousSignalRequest {
    targetCoordinate?: number;
    /** Opaque short-lived return path supplied by the receiving node. */
    returnToken?: string;
    signalType: AnonymousSignalKind;
    signal: unknown;
    requestId?: string;
}

/** Forwarded form deliberately omits sender and recipient peer IDs. */
export interface AnonymousSignalDelivery {
    returnToken: string;
    signalType: AnonymousSignalKind;
    signal: unknown;
    requestId?: string;
}

export interface DataStorePayload {
    key: string;
    value: string;
    ttlMs?: number;
}

/** DATA_RETURN with only `key` requests a read; response includes found/value. */
export interface DataReturnPayload {
    key: string;
    found?: boolean;
    value?: string;
    expiresAt?: number;
}

export interface RoutingPacket<T> {
    type:
        | MessageType.FIND_CLOSEST_NODES
        | MessageType.ANONYMOUS_SIGNAL
        | MessageType.DATA_STORE
        | MessageType.DATA_RETURN;
    payload: T;
}
