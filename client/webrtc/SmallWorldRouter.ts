import { NodeCoordinate } from "../peerDiscovery/NodeCoordinate";
import { RoutedPacket, SmallWorldRoutingTable } from "./SmallWorldRoutingTable";

/** Greedy, loop-resistant forwarding over direct WebRTC neighbor links. */
export class SmallWorldRouter {
    constructor(
        private readonly peerId: string,
        private readonly coordinate: number,
        private readonly routingTable: SmallWorldRoutingTable,
        private readonly onDelivery: (packet: RoutedPacket) => void
    ) {
        if (!Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1) {
            throw new Error("Local coordinate must be between 0 and 1.");
        }
    }

    /** Start a lookup/request and forward it to the closest improving neighbor. */
    public routePacket<T>(targetCoordinate: number, packet: T, id = `${this.peerId}-${Date.now()}-${Math.random().toString(36).slice(2)}`): void {
        this.validateCoordinate(targetCoordinate);
        this.forward({ id, targetCoordinate, payload: packet, trace: [] });
    }

    /** Pass a decoded routing envelope received from a data channel. */
    public receivePacket(packet: RoutedPacket): void {
        this.validateCoordinate(packet.targetCoordinate);
        if (!packet || typeof packet.id !== "string" || !Array.isArray(packet.trace)) {
            throw new Error("Malformed routed packet.");
        }
        if (packet.trace.includes(this.peerId)) return;
        this.forward(packet);
    }

    private forward(packet: RoutedPacket): void {
        const distanceHere = NodeCoordinate.distance(this.coordinate, packet.targetCoordinate);
        const visited = new Set(packet.trace);
        const next = this.routingTable.findClosestNeighbor(packet.targetCoordinate, visited);
        const nextDistance = next
            ? NodeCoordinate.distance(next.coordinate, packet.targetCoordinate)
            : Number.POSITIVE_INFINITY;
        const withTrace: RoutedPacket = {
            ...packet,
            trace: [...packet.trace, this.peerId]
        };

        // A local minimum is the closest reachable node for this topology.
        // Forward only when the neighbor strictly improves the ring distance.
        if (next && nextDistance + Number.EPSILON < distanceHere) {
            next.send(withTrace);
        } else {
            this.onDelivery(withTrace);
        }
    }

    private validateCoordinate(value: number): void {
        if (!Number.isFinite(value) || value < 0 || value > 1) {
            throw new Error("Target coordinate must be between 0 and 1.");
        }
    }
}
