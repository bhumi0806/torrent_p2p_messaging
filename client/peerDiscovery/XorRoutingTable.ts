import { PeerId } from "../identity/valueObjects/PeerID";
import { FreenetEngine } from "../utils/FreenetEngine";
import { validateXorPeerRecord, XorPeerRecord } from "./XorRoutingProtocol";

export interface XorRoutingEntry {
    readonly peer: XorPeerRecord;
    readonly bucketIndex: number;
    /** Snapshot maintained from live WebRTC data-channel open/close events. */
    readonly liveNeighbor: boolean;
}

interface MutableEntry {
    peer: XorPeerRecord;
    bucketIndex: number;
    liveNeighbor: boolean;
}

/** Kademlia-style 256-bucket table of known peers and their direct-link status. */
export class XorRoutingTable {
    private readonly buckets = new Map<number, Map<string, MutableEntry>>();

    constructor(
        public readonly localPeerId: string,
        public readonly bucketSize = 20
    ) {
        if (!PeerId.isValid(localPeerId)) throw new Error("Invalid local peer ID.");
        if (!Number.isInteger(bucketSize) || bucketSize < 1 || bucketSize > 256) {
            throw new Error("Bucket size must be an integer between 1 and 256.");
        }
    }

    /** Add a verified record or update an existing one; return false when rejected/full. */
    public async addPeer(record: unknown, liveNeighbor = false): Promise<boolean> {
        const peer = await validateXorPeerRecord(record);
        if (!peer || peer.peerId === this.localPeerId) return false;
        const bucketIndex = this.getBucketIndex(peer.peerId);
        const bucket = this.getBucket(bucketIndex);
        const existing = bucket.get(peer.peerId);
        if (existing) {
            existing.peer = peer;
            existing.liveNeighbor = liveNeighbor || existing.liveNeighbor;
            return true;
        }
        if (bucket.size >= this.bucketSize) return false;
        bucket.set(peer.peerId, { peer, bucketIndex, liveNeighbor });
        return true;
    }

    /** Mark a known peer as a currently usable direct WebRTC neighbor. */
    public setLiveNeighbor(peerId: string, live: boolean): boolean {
        if (!PeerId.isValid(peerId) || peerId === this.localPeerId) return false;
        const entry = this.findMutable(peerId);
        if (!entry) return false;
        entry.liveNeighbor = live;
        return true;
    }

    public removePeer(peerId: string): boolean {
        if (!PeerId.isValid(peerId) || peerId === this.localPeerId) return false;
        const index = this.getBucketIndex(peerId);
        const bucket = this.buckets.get(index);
        if (!bucket) return false;
        const removed = bucket.delete(peerId);
        if (bucket.size === 0) this.buckets.delete(index);
        return removed;
    }

    public getPeer(peerId: string): XorRoutingEntry | undefined {
        if (!PeerId.isValid(peerId) || peerId === this.localPeerId) return undefined;
        const entry = this.findMutable(peerId);
        return entry ? this.snapshot(entry) : undefined;
    }

    /** Return known peer records nearest to target by 256-bit XOR distance. */
    public getClosestPeers(targetPeerId: string, count: number): XorRoutingEntry[] {
        this.validateTargetAndCount(targetPeerId, count);
        return this.allEntries()
            .sort((a, b) => compareXorDistance(targetPeerId, a.peer.peerId, b.peer.peerId))
            .slice(0, count)
            .map(entry => this.snapshot(entry));
    }

    /** Return only peers marked live and still confirmed by the caller's channel check. */
    public getClosestLiveNeighbors(
        targetPeerId: string,
        count: number,
        isUsable: (peerId: string) => boolean
    ): XorRoutingEntry[] {
        this.validateTargetAndCount(targetPeerId, count);
        return this.allEntries()
            .filter(entry => entry.liveNeighbor && isUsable(entry.peer.peerId))
            .sort((a, b) => compareXorDistance(targetPeerId, a.peer.peerId, b.peer.peerId))
            .slice(0, count)
            .map(entry => this.snapshot(entry));
    }

    public getSize(): number {
        return this.allEntries().length;
    }

    public getBucketIndex(peerId: string): number {
        if (!PeerId.isValid(peerId) || peerId === this.localPeerId) {
            throw new Error("A bucket index requires a valid peer ID different from the local peer.");
        }
        return FreenetEngine.calculateXorDistance(this.localPeerId, peerId).toString(2).length - 1;
    }

    private validateTargetAndCount(targetPeerId: string, count: number): void {
        if (!PeerId.isValid(targetPeerId)) throw new Error("Invalid target peer ID.");
        if (!Number.isInteger(count) || count < 1 || count > 256) {
            throw new Error("Result count must be an integer between 1 and 256.");
        }
    }

    private getBucket(index: number): Map<string, MutableEntry> {
        let bucket = this.buckets.get(index);
        if (!bucket) {
            bucket = new Map();
            this.buckets.set(index, bucket);
        }
        return bucket;
    }

    private findMutable(peerId: string): MutableEntry | undefined {
        return this.buckets.get(this.getBucketIndex(peerId))?.get(peerId);
    }

    private allEntries(): MutableEntry[] {
        return [...this.buckets.values()].flatMap(bucket => [...bucket.values()]);
    }

    private snapshot(entry: MutableEntry): XorRoutingEntry {
        return Object.freeze({ ...entry });
    }
}

export function xorDistance(peerIdA: string, peerIdB: string): bigint {
    return FreenetEngine.calculateXorDistance(peerIdA, peerIdB);
}

export function compareXorDistance(target: string, peerA: string, peerB: string): number {
    const distanceA = xorDistance(target, peerA);
    const distanceB = xorDistance(target, peerB);
    if (distanceA < distanceB) return -1;
    if (distanceA > distanceB) return 1;
    return peerA.localeCompare(peerB);
}
