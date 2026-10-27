import { NodeCoordinate } from "./NodeCoordinate";

export interface TopologyPeer {
    readonly peerId: string;
    readonly coordinate: number;
}

export interface SelectedNeighbor extends TopologyPeer {
    readonly range: "close" | "long";
}

/** Select close ring neighbors plus a small random set of long-range links. */
export class SmallWorldTopology {
    public static selectNeighbors(
        localPeerId: string,
        localCoordinate: number,
        candidates: readonly TopologyPeer[],
        closeCount = 4,
        longCount = 2,
        random: () => number = Math.random
    ): SelectedNeighbor[] {
        const unique = [...new Map(candidates
            .filter(peer => peer.peerId !== localPeerId && Number.isFinite(peer.coordinate) && peer.coordinate >= 0 && peer.coordinate <= 1)
            .map(peer => [peer.peerId, peer])).values()];
        const ordered = unique.sort((a, b) =>
            NodeCoordinate.distance(a.coordinate, localCoordinate) -
            NodeCoordinate.distance(b.coordinate, localCoordinate)
        );
        const selected: SelectedNeighbor[] = ordered
            .slice(0, Math.max(0, closeCount))
            .map(peer => ({ ...peer, range: "close" }));
        const remaining = ordered.filter(peer => !selected.some(chosen => chosen.peerId === peer.peerId));

        // Partial Fisher-Yates shuffle so long links are sampled without replacement.
        for (let index = 0; index < Math.min(longCount, remaining.length); index++) {
            const swapIndex = index + Math.floor(random() * (remaining.length - index));
            [remaining[index], remaining[swapIndex]] = [remaining[swapIndex], remaining[index]];
            selected.push({ ...remaining[index], range: "long" });
        }
        return selected;
    }
}
