import { NodeCoordinate } from "../NodeCoordinate";
import { RoutedPacket, SmallWorldNeighbor, SmallWorldRoutingTable } from "../../webrtc/SmallWorldRoutingTable";
import { SmallWorldRouter } from "../../webrtc/SmallWorldRouter";

interface SimNode {
    id: string;
    coordinate: number;
    table: SmallWorldRoutingTable;
    router: SmallWorldRouter;
}

/** In-memory 50-node ring simulation. Run with the local `tsx` executable. */
export function runSmallWorldSimulation(): void {
    const count = 50;
    const closeLinksEachSide = 2;
    const randomLongLinks = 3;
    const random = seededRandom(0x5eed);
    const coordinates = Array.from({ length: count }, () => random());
    const links = Array.from({ length: count }, () => new Set<number>());

    // Small-world local lattice: connect each node to its two neighbors in
    // each direction in coordinate order, with wrap-around at ring boundary.
    const order = Array.from({ length: count }, (_, i) => i)
        .sort((a, b) => coordinates[a] - coordinates[b]);
    for (let position = 0; position < count; position++) {
        for (let offset = 1; offset <= closeLinksEachSide; offset++) {
            connect(order[position], order[(position + offset) % count]);
            connect(order[position], order[(position - offset + count) % count]);
        }
    }

    // Add a few reproducible random long-range links per node.
    for (let node = 0; node < count; node++) {
        let added = 0;
        while (added < randomLongLinks) {
            const candidate = Math.floor(random() * count);
            if (candidate === node || links[node].has(candidate)) continue;
            connect(node, candidate);
            added++;
        }
    }

    let delivered: RoutedPacket | undefined;
    const nodes: SimNode[] = Array.from({ length: count }, (_, index) => {
        const id = `Node ${index + 1}`;
        const table = new SmallWorldRoutingTable(id);
        const router = new SmallWorldRouter(id, coordinates[index], table, packet => {
            if (!delivered) delivered = packet;
        });
        return { id, coordinate: coordinates[index], table, router };
    });

    for (let index = 0; index < count; index++) {
        for (const neighborIndex of links[index]) {
            const peer = nodes[neighborIndex];
            const close = isCloseLink(index, neighborIndex, order, closeLinksEachSide);
            const neighbor: SmallWorldNeighbor = {
                peerId: peer.id,
                coordinate: peer.coordinate,
                range: close ? "close" : "long",
                send: packet => peer.router.receivePacket(packet)
            };
            nodes[index].table.addNeighbor(neighbor);
        }
    }

    const source = nodes[0]; // Node #1
    const target = nodes[44]; // target coordinate associated with Node #45
    source.router.routePacket(target.coordinate, { type: "lookup", key: "mock-target-key" }, "simulation-lookup");

    if (!delivered) throw new Error("Simulation lookup was not delivered.");
    const path = delivered.trace.join(" -> ");
    const hops = Math.max(0, delivered.trace.length - 1);
    const reachedTarget = delivered.trace[delivered.trace.length - 1] === target.id;
    console.log(`${path}: ${reachedTarget ? "Success!" : `Closest reachable node (target ${target.id})`}`);
    console.log(`Total hops: ${hops}`);
    if (!reachedTarget || hops >= 10) {
        throw new Error(`Small-world simulation failed: reached=${reachedTarget}, hops=${hops}.`);
    }

    function connect(a: number, b: number): void {
        links[a].add(b);
        links[b].add(a);
    }
}

function isCloseLink(a: number, b: number, order: number[], radius: number): boolean {
    const position = new Map(order.map((node, index) => [node, index]));
    const delta = Math.abs(position.get(a)! - position.get(b)!);
    const ringDistance = Math.min(delta, order.length - delta);
    return ringDistance <= radius;
}

function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

runSmallWorldSimulation();
