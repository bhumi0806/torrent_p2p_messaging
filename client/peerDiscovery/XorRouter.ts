import { PeerId } from "../identity/valueObjects/PeerID";
import { createRandomId } from "../utils/createRandomId";
import { XorRoutingEntry, XorRoutingTable } from "./XorRoutingTable";
import {
    FindNodeRequest,
    FindNodeResponse,
    isFindNodeRequest,
    isFindNodeResponse,
    validateXorPeerRecord,
    XOR_MAX_HOP_LIMIT,
    XOR_MAX_K,
    XOR_PROTOCOL_VERSION,
    XorPeerRecord
} from "./XorRoutingProtocol";

export interface XorLookupCandidate {
    readonly peer: XorPeerRecord;
    /** True only if this client currently has a usable direct WebRTC data channel. */
    readonly directlyReachable: boolean;
}

export interface XorLookupResult {
    readonly targetPeerId: string;
    readonly candidates: readonly XorLookupCandidate[];
    readonly queriedPeerIds: readonly string[];
    readonly failedPeerIds: readonly string[];
    readonly timedOut: boolean;
}

export interface XorRouterOptions {
    readonly bucketSize?: number;
    readonly alpha?: number;
    readonly requestTimeoutMs?: number;
    readonly isLiveNeighbor: (peerId: string) => boolean;
    readonly send: (peerId: string, message: FindNodeRequest | FindNodeResponse) => void;
}

interface PendingRequest {
    readonly peerId: string;
    readonly targetPeerId: string;
    readonly resolve: (result: QueryResult) => void;
    timer: ReturnType<typeof setTimeout>;
}

interface QueryResult {
    readonly response?: FindNodeResponse;
    readonly timedOut: boolean;
}

interface CachedRequest {
    readonly fingerprint: string;
    readonly response: FindNodeResponse;
    readonly expiresAt: number;
}

const DEFAULT_ALPHA = 3;
const MAX_ALPHA = 5;
const DEFAULT_REQUEST_TIMEOUT_MS = 2_500;
const MIN_LOOKUP_TIMEOUT_MS = 100;
const MAX_LOOKUP_TIMEOUT_MS = 30_000;
const REQUEST_CACHE_TTL_MS = 60_000;
const MAX_REQUEST_CACHE_ENTRIES = 1_000;

/** XOR peer lookup over the already-open direct WebRTC neighbors. */
export class XorRouter {
    public readonly routingTable: XorRoutingTable;

    private readonly pending = new Map<string, PendingRequest>();
    private readonly requestCache = new Map<string, CachedRequest>();
    private readonly alpha: number;
    private readonly requestTimeoutMs: number;

    constructor(
        public readonly localPeerId: string,
        private readonly options: XorRouterOptions
    ) {
        if (!PeerId.isValid(localPeerId)) throw new Error("Invalid local peer ID.");
        this.alpha = options.alpha ?? DEFAULT_ALPHA;
        this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        if (!Number.isInteger(this.alpha) || this.alpha < 1 || this.alpha > MAX_ALPHA) {
            throw new Error(`Lookup concurrency must be between 1 and ${MAX_ALPHA}.`);
        }
        if (!Number.isInteger(this.requestTimeoutMs) || this.requestTimeoutMs < 50 || this.requestTimeoutMs > MAX_LOOKUP_TIMEOUT_MS) {
            throw new Error("Request timeout must be between 50 and 30000 ms.");
        }
        this.routingTable = new XorRoutingTable(localPeerId, options.bucketSize ?? 20);
    }

    public async addKnownPeer(record: unknown): Promise<boolean> {
        return this.routingTable.addPeer(record, false);
    }

    public async addKnownPeers(records: readonly unknown[]): Promise<number> {
        let added = 0;
        for (const record of records) {
            if (await this.addKnownPeer(record)) added++;
        }
        return added;
    }

    public markNeighbor(peerId: string, live: boolean): boolean {
        return this.routingTable.setLiveNeighbor(peerId, live);
    }

    public removePeer(peerId: string): boolean {
        return this.routingTable.removePeer(peerId);
    }

    public getClosestCandidates(targetPeerId: string, count = XOR_MAX_K): XorLookupCandidate[] {
        return this.routingTable.getClosestPeers(targetPeerId, count).map(entry => ({
            peer: entry.peer,
            directlyReachable: entry.liveNeighbor && this.options.isLiveNeighbor(entry.peer.peerId)
        }));
    }

    /** Select the closest currently usable direct neighbor, excluding prior hops. */
    public selectNextHop(targetPeerId: string, excludedPeerIds: ReadonlySet<string> = new Set()): string | undefined {
        if (!PeerId.isValid(targetPeerId) || this.routingTable.getSize() === 0) return undefined;
        return this.routingTable
            .getClosestLiveNeighbors(targetPeerId, Math.min(256, this.routingTable.getSize()), this.options.isLiveNeighbor)
            .find(entry => !excludedPeerIds.has(entry.peer.peerId))
            ?.peer.peerId;
    }

    /** Respond locally to a direct neighbor's FIND_NODE request; never asserts reachability. */
    public async handleFindNodeRequest(
        senderPeerId: string,
        rawRequest: unknown
    ): Promise<FindNodeResponse | undefined> {
        if (!PeerId.isValid(senderPeerId) || !isFindNodeRequest(rawRequest)) return undefined;
        const request = rawRequest;
        // This phase only accepts direct queries. It does not forward FIND_NODE packets.
        if (request.originPeerId !== senderPeerId || request.visitedPeerIds.length !== 1 ||
            request.visitedPeerIds[0] !== senderPeerId) return undefined;

        this.pruneRequestCache();
        const cacheKey = `${senderPeerId}:${request.requestId}`;
        const fingerprint = `${request.targetPeerId}:${request.k}:${request.hopLimit}`;
        const cached = this.requestCache.get(cacheKey);
        if (cached) return cached.fingerprint === fingerprint ? cached.response : undefined;

        const response: FindNodeResponse = Object.freeze({
            version: XOR_PROTOCOL_VERSION,
            type: "FIND_NODE_RESPONSE",
            requestId: request.requestId,
            responderPeerId: this.localPeerId,
            targetPeerId: request.targetPeerId,
            status: "ok",
            peers: this.routingTable.getClosestPeers(request.targetPeerId, request.k)
                .map(entry => entry.peer)
                .filter(peer => peer.peerId !== request.originPeerId)
        });
        this.requestCache.set(cacheKey, {
            fingerprint,
            response,
            expiresAt: Date.now() + REQUEST_CACHE_TTL_MS
        });
        while (this.requestCache.size > MAX_REQUEST_CACHE_ENTRIES) {
            const oldestKey = this.requestCache.keys().next().value as string | undefined;
            if (!oldestKey) break;
            this.requestCache.delete(oldestKey);
        }
        return response;
    }

    /** Resolve only a response matching an outstanding request and its direct responder. */
    public async handleFindNodeResponse(senderPeerId: string, rawResponse: unknown): Promise<boolean> {
        if (!PeerId.isValid(senderPeerId) || !isFindNodeResponse(rawResponse)) return false;
        const response = rawResponse;
        const pending = this.pending.get(response.requestId);
        if (!pending || pending.peerId !== senderPeerId ||
            pending.targetPeerId !== response.targetPeerId || response.responderPeerId !== senderPeerId) {
            return false;
        }

        const validated: XorPeerRecord[] = [];
        for (const rawPeer of response.peers) {
            const peer = await validateXorPeerRecord(rawPeer);
            if (!peer || peer.peerId === this.localPeerId || peer.peerId === senderPeerId) return false;
            validated.push(peer);
        }
        for (const peer of validated) {
            await this.routingTable.addPeer(peer);
            this.routingTable.setLiveNeighbor(peer.peerId, this.options.isLiveNeighbor(peer.peerId));
        }
        this.finishRequest(response.requestId, response);
        return true;
    }

    /** Iteratively query the nearest currently-live direct neighbors with bounded alpha and time. */
    public async findNode(
        targetPeerId: string,
        options: { k?: number; alpha?: number; timeoutMs?: number; hopLimit?: number } = {}
    ): Promise<XorLookupResult> {
        if (!PeerId.isValid(targetPeerId)) throw new Error("Invalid target peer ID.");
        const k = options.k ?? 8;
        const alpha = options.alpha ?? this.alpha;
        const timeoutMs = options.timeoutMs ?? 8_000;
        const hopLimit = options.hopLimit ?? XOR_MAX_HOP_LIMIT;
        if (!Number.isInteger(k) || k < 1 || k > XOR_MAX_K) throw new Error(`K must be between 1 and ${XOR_MAX_K}.`);
        if (!Number.isInteger(alpha) || alpha < 1 || alpha > MAX_ALPHA) throw new Error(`Alpha must be between 1 and ${MAX_ALPHA}.`);
        if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_LOOKUP_TIMEOUT_MS || timeoutMs > MAX_LOOKUP_TIMEOUT_MS) {
            throw new Error(`Lookup timeout must be between ${MIN_LOOKUP_TIMEOUT_MS} and ${MAX_LOOKUP_TIMEOUT_MS} ms.`);
        }
        if (!Number.isInteger(hopLimit) || hopLimit < 1 || hopLimit > XOR_MAX_HOP_LIMIT) {
            throw new Error(`Hop limit must be between 1 and ${XOR_MAX_HOP_LIMIT}.`);
        }

        const deadline = Date.now() + timeoutMs;
        const queried = new Set<string>();
        const failed = new Set<string>();
        let timedOut = false;

        while (Date.now() < deadline) {
            // Query only the closest K *live* entries. Records for other peers remain discovery hints.
            if (this.routingTable.getSize() === 0) break;
            const batch = this.routingTable
                .getClosestLiveNeighbors(targetPeerId, Math.min(k, this.routingTable.getSize()), this.options.isLiveNeighbor)
                .filter(entry => !queried.has(entry.peer.peerId))
                .slice(0, alpha);
            if (batch.length === 0) break;

            for (const entry of batch) queried.add(entry.peer.peerId);
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
                timedOut = true;
                break;
            }
            const responses = await Promise.all(batch.map(entry =>
                this.queryPeer(entry.peer.peerId, targetPeerId, k, hopLimit, Math.min(remaining, this.requestTimeoutMs))
            ));
            responses.forEach((result, index) => {
                if (!result.response) {
                    failed.add(batch[index].peer.peerId);
                    timedOut ||= result.timedOut;
                }
            });
        }
        if (Date.now() >= deadline && [...this.pending.values()].some(item => item.targetPeerId === targetPeerId)) {
            timedOut = true;
            for (const [requestId, item] of this.pending) {
                if (item.targetPeerId === targetPeerId) this.finishRequest(requestId, undefined);
            }
        }

        return Object.freeze({
            targetPeerId,
            candidates: Object.freeze(this.getClosestCandidates(targetPeerId, k)),
            queriedPeerIds: Object.freeze([...queried]),
            failedPeerIds: Object.freeze([...failed]),
            timedOut
        });
    }

    public dispose(): void {
        for (const requestId of this.pending.keys()) this.finishRequest(requestId, undefined);
        this.requestCache.clear();
    }

    private queryPeer(
        peerId: string,
        targetPeerId: string,
        k: number,
        hopLimit: number,
        timeoutMs: number
    ): Promise<QueryResult> {
        const requestId = createRandomId();
        const request: FindNodeRequest = Object.freeze({
            version: XOR_PROTOCOL_VERSION,
            type: "FIND_NODE",
            requestId,
            originPeerId: this.localPeerId,
            targetPeerId,
            k,
            hopLimit,
            visitedPeerIds: Object.freeze([this.localPeerId])
        });
        return new Promise(resolve => {
            const timer = setTimeout(() => this.finishRequest(requestId, undefined, true), timeoutMs);
            this.pending.set(requestId, { peerId, targetPeerId, resolve, timer });
            try {
                if (!this.options.isLiveNeighbor(peerId)) {
                    this.finishRequest(requestId, undefined);
                    return;
                }
                this.options.send(peerId, request);
            } catch {
                this.finishRequest(requestId, undefined);
            }
        });
    }

    private finishRequest(requestId: string, response: FindNodeResponse | undefined, timedOut = false): void {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        pending.resolve({ response, timedOut });
    }

    private pruneRequestCache(): void {
        const now = Date.now();
        for (const [key, cached] of this.requestCache) {
            if (cached.expiresAt <= now) this.requestCache.delete(key);
        }
    }
}
