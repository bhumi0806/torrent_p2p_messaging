import { NodeCoordinate } from "../peerDiscovery/NodeCoordinate";

export interface RoutedPacket<T = unknown> {
    readonly id: string;
    readonly targetCoordinate: number;
    readonly payload: T;
    readonly trace: readonly string[];
}

/** A direct peer link that can carry routing envelopes. */
export interface SmallWorldNeighbor {
    readonly peerId: string;
    readonly coordinate: number;
    readonly range: "close" | "long";
    send(packet: RoutedPacket): void;
}

/** Holds direct close-range and long-range WebRTC neighbor references. */
export class SmallWorldRoutingTable {
    private readonly closeNeighbors = new Map<string, SmallWorldNeighbor>();
    private readonly longNeighbors = new Map<string, SmallWorldNeighbor>();

    constructor(private readonly localPeerId: string) {}

    public addNeighbor(neighbor: SmallWorldNeighbor): void {
        if (!neighbor.peerId || neighbor.peerId === this.localPeerId) {
            throw new Error("A routing neighbor must be a different peer.");
        }
        if (!Number.isFinite(neighbor.coordinate) || neighbor.coordinate < 0 || neighbor.coordinate > 1) {
            throw new Error("Neighbor coordinate must be between 0 and 1.");
        }
        this.removeNeighbor(neighbor.peerId);
        const bucket = neighbor.range === "close" ? this.closeNeighbors : this.longNeighbors;
        bucket.set(neighbor.peerId, neighbor);
    }

    public removeNeighbor(peerId: string): boolean {
        const removedClose = this.closeNeighbors.delete(peerId);
        const removedLong = this.longNeighbors.delete(peerId);
        return removedClose || removedLong;
    }

    public getNeighbors(): SmallWorldNeighbor[] {
        return [...this.closeNeighbors.values(), ...this.longNeighbors.values()];
    }

    public clear(): void {
        this.closeNeighbors.clear();
        this.longNeighbors.clear();
    }

    /** Pick the unvisited direct neighbor closest to the target coordinate. */
    public findClosestNeighbor(targetCoordinate: number, excludedPeerIds: ReadonlySet<string> = new Set()): SmallWorldNeighbor | undefined {
        return this.getNeighbors()
            .filter(peer => !excludedPeerIds.has(peer.peerId))
            .sort((a, b) =>
                NodeCoordinate.distance(a.coordinate, targetCoordinate) -
                NodeCoordinate.distance(b.coordinate, targetCoordinate)
            )[0];
    }
}
