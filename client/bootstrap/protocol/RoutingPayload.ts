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

export type AnonymousSignalKind = "OFFER" | "ANSWER" | "ICE_CANDIDATE";

export interface AnonymousSignalRequest {
    targetCoordinate?: number;
    returnToken?: string;
    signalType: AnonymousSignalKind;
    signal: unknown;
    requestId?: string;
}

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

export interface DataReturnPayload {
    key: string;
    found?: boolean;
    value?: string;
    expiresAt?: number;
}
