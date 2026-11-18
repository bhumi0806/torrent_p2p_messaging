import assert from "node:assert/strict";
import sodium from "libsodium-wrappers";
import { PeerId } from "../../identity/valueObjects/PeerID";
import { PublicKey } from "../../identity/valueObjects/PublicKey";
import { compareXorDistance, XorRoutingTable, xorDistance } from "../XorRoutingTable";
import {
    FindNodeRequest,
    isFindNodeRequest,
    isFindNodeResponse,
    validateXorPeerRecord,
    XOR_MAX_HOP_LIMIT,
    XOR_PROTOCOL_VERSION,
    XorPeerRecord
} from "../XorRoutingProtocol";
import { XorRouter } from "../XorRouter";

let passed = 0;

async function test(name: string, run: () => void | Promise<void>): Promise<void> {
    await run();
    passed++;
    console.log(`PASS ${passed}: ${name}`);
}

async function makeRecord(username: string): Promise<XorPeerRecord> {
    const keyPair = sodium.crypto_sign_keypair();
    const publicKey = new PublicKey(new Uint8Array(keyPair.publicKey));
    const peerId = await PeerId.fromPublicKey(publicKey.bytes);
    return { peerId: peerId.toString(), username, publicKey: publicKey.toBase64() };
}

function id(hex: string): string {
    return hex.padStart(64, "0");
}

async function main(): Promise<void> {
    await sodium.ready;

    await test("calculates exact known XOR distances", () => {
        assert.equal(xorDistance(id("00"), id("01")), 1n);
        assert.equal(xorDistance(id("10"), id("30")), 0x20n);
        assert.equal(xorDistance(id("ff"), id("0f")), 0xf0n);
    });

    await test("orders peers by full XOR distance to target", async () => {
        const records = await Promise.all([
            makeRecord("one"), makeRecord("eight"), makeRecord("sixteen")
        ]);
        const local = id("00");
        const target = id("00");
        const table = new XorRoutingTable(local, 256);
        for (const record of records) await table.addPeer(record);
        const expected = records.map(record => record.peerId).sort((a, b) => compareXorDistance(target, a, b));
        assert.deepEqual(table.getClosestPeers(target, 3).map(entry => entry.peer.peerId), expected);
    });

    await test("rejects malformed peer IDs and invalid peer records", async () => {
        assert.throws(() => new XorRoutingTable("short"));
        assert.throws(() => xorDistance("bad", id("00")));
        const record = await makeRecord("valid");
        assert.equal(await validateXorPeerRecord({ ...record, peerId: id("1234") }), undefined);
        const table = new XorRoutingTable(id("00"));
        assert.equal(await table.addPeer({ ...record, peerId: "not-a-peer" }), false);
    });

    await test("updates a duplicate peer without creating another entry", async () => {
        const record = await makeRecord("duplicate");
        const table = new XorRoutingTable(id("00"));
        assert.equal(await table.addPeer(record), true);
        assert.equal(await table.addPeer({ ...record, username: "updated" }), true);
        assert.equal(table.getSize(), 1);
        assert.equal(table.getPeer(record.peerId)?.peer.username, "updated");
    });

    await test("excludes the local peer from its own routing table", async () => {
        const record = await makeRecord("local");
        const table = new XorRoutingTable(record.peerId);
        assert.equal(await table.addPeer(record, true), false);
        assert.equal(table.getSize(), 0);
    });

    await test("enforces configurable per-bucket capacity", async () => {
        const table = new XorRoutingTable(id("00"), 2);
        const fixtures: XorPeerRecord[] = [];
        let attempts = 0;
        while (fixtures.length < 3 && attempts++ < 1_000) {
            const record = await makeRecord(`bucket-${fixtures.length}`);
            if (table.getBucketIndex(record.peerId) === 255) fixtures.push(record);
        }
        assert.equal(fixtures.length, 3, "Could not generate enough peers in the fixture bucket.");
        assert.equal(await table.addPeer(fixtures[0]), true);
        assert.equal(await table.addPeer(fixtures[1]), true);
        assert.equal(await table.addPeer(fixtures[2]), false);
        assert.equal(table.getClosestPeers(id("ff"), 256).length, 2);
    });

    await test("adds and removes live-neighbor state independently of peer knowledge", async () => {
        const record = await makeRecord("live");
        const table = new XorRoutingTable(id("00"));
        assert.equal(await table.addPeer(record), true);
        assert.equal(table.getPeer(record.peerId)?.liveNeighbor, false);
        assert.equal(table.setLiveNeighbor(record.peerId, true), true);
        assert.equal(table.getPeer(record.peerId)?.liveNeighbor, true);
        assert.equal(table.setLiveNeighbor(record.peerId, false), true);
        assert.equal(table.getPeer(record.peerId)?.liveNeighbor, false);
        assert.equal(table.removePeer(record.peerId), true);
        assert.equal(table.getSize(), 0);
    });

    await test("does not select a disconnected entry as an immediate next hop", async () => {
        const record = await makeRecord("offline");
        const table = new XorRoutingTable(id("00"));
        await table.addPeer(record, true);
        assert.equal(table.getClosestLiveNeighbors(record.peerId, 1, () => false).length, 0);
    });

    await test("reports known but disconnected candidates without querying them", async () => {
        const [local, remote] = await Promise.all([makeRecord("unavailable-local"), makeRecord("unavailable-remote")]);
        let sends = 0;
        const router = new XorRouter(local.peerId, {
            isLiveNeighbor: () => false,
            send: () => { sends++; }
        });
        await router.addKnownPeer(remote);
        router.markNeighbor(remote.peerId, true); // Stale open-state snapshot; dynamic check must win.
        const result = await router.findNode(remote.peerId, { k: 1, timeoutMs: 100 });
        assert.equal(sends, 0);
        assert.equal(result.timedOut, false);
        assert.deepEqual(result.candidates.map(candidate => candidate.directlyReachable), [false]);
        router.dispose();
    });

    await test("validates FIND_NODE requests and responses", async () => {
        const origin = id("01");
        const target = id("02");
        const request: FindNodeRequest = {
            version: XOR_PROTOCOL_VERSION,
            type: "FIND_NODE",
            requestId: "request-1",
            originPeerId: origin,
            targetPeerId: target,
            k: 8,
            hopLimit: XOR_MAX_HOP_LIMIT,
            visitedPeerIds: [origin]
        };
        const peer = await makeRecord("response-peer");
        assert.equal(isFindNodeRequest(request), true);
        const validResponse = {
            version: XOR_PROTOCOL_VERSION,
            type: "FIND_NODE_RESPONSE",
            requestId: "request-1",
            responderPeerId: id("03"),
            targetPeerId: target,
            status: "ok",
            peers: [peer]
        };
        assert.equal(isFindNodeResponse(validResponse), true);
        assert.equal(isFindNodeResponse({ ...validResponse, peers: [peer, peer] }), false);
    });

    await test("rejects invalid FIND_NODE fields without throwing", () => {
        const base = {
            version: XOR_PROTOCOL_VERSION,
            type: "FIND_NODE",
            requestId: "request-1",
            originPeerId: id("01"),
            targetPeerId: id("02"),
            k: 8,
            hopLimit: 1,
            visitedPeerIds: [id("01")]
        };
        assert.equal(isFindNodeRequest({ ...base, targetPeerId: "bad" }), false);
        assert.equal(isFindNodeRequest({ ...base, k: 0 }), false);
        assert.equal(isFindNodeRequest({ ...base, hopLimit: XOR_MAX_HOP_LIMIT + 1 }), false);
        assert.equal(isFindNodeRequest({ ...base, visitedPeerIds: [id("01"), id("01")] }), false);
        assert.equal(isFindNodeRequest({ ...base, requestId: "x".repeat(129) }), false);
        const tooManyVisited = [id("01"), ...Array.from({ length: 32 }, (_, index) => id((index + 2).toString(16)))];
        assert.equal(isFindNodeRequest({ ...base, visitedPeerIds: tooManyVisited }), false);
    });

    await test("handles valid requests, returns bounded candidates, and caches duplicates", async () => {
        const [origin, local, candidate] = await Promise.all([
            makeRecord("origin"), makeRecord("local"), makeRecord("candidate")
        ]);
        const router = new XorRouter(local.peerId, {
            isLiveNeighbor: () => false,
            send: () => undefined
        });
        await router.addKnownPeer(origin);
        await router.addKnownPeer(candidate);
        const request: FindNodeRequest = {
            version: XOR_PROTOCOL_VERSION,
            type: "FIND_NODE",
            requestId: "repeat-me",
            originPeerId: origin.peerId,
            targetPeerId: candidate.peerId,
            k: 20,
            hopLimit: 4,
            visitedPeerIds: [origin.peerId]
        };
        const first = await router.handleFindNodeRequest(origin.peerId, request);
        const duplicate = await router.handleFindNodeRequest(origin.peerId, request);
        assert.ok(first);
        assert.deepEqual(duplicate, first);
        assert.equal(first.peers.some(peer => peer.peerId === local.peerId), false);
        assert.equal(first.peers.some(peer => peer.peerId === origin.peerId), false);
        assert.equal(await router.handleFindNodeRequest(origin.peerId, { ...request, targetPeerId: local.peerId }), undefined);
        router.dispose();
    });

    await test("performs iterative lookup over a simulated five-peer network", async () => {
        const records = await Promise.all(Array.from({ length: 5 }, (_, i) => makeRecord(`node-${i}`)));
        const adjacency = new Map<string, Set<string>>();
        for (const record of records) adjacency.set(record.peerId, new Set());
        connect(records[0], records[1]);
        connect(records[0], records[2]);
        connect(records[1], records[3]);
        connect(records[2], records[4]);

        const routers = new Map<string, XorRouter>();
        for (const record of records) {
            const router = new XorRouter(record.peerId, {
                alpha: 2,
                requestTimeoutMs: 200,
                isLiveNeighbor: peerId => adjacency.get(record.peerId)!.has(peerId),
                send: (peerId, message) => {
                    if (!adjacency.get(record.peerId)!.has(peerId)) throw new Error("not a direct neighbor");
                    const remote = routers.get(peerId);
                    if (!remote) throw new Error("remote is not online");
                    if (message.type === "FIND_NODE") {
                        void remote.handleFindNodeRequest(record.peerId, message)
                            .then(response => response && router.handleFindNodeResponse(peerId, response));
                    }
                }
            });
            routers.set(record.peerId, router);
        }

        for (const record of records) {
            const router = routers.get(record.peerId)!;
            const directIds = adjacency.get(record.peerId)!;
            for (const directId of directIds) {
                const directRecord = records.find(candidate => candidate.peerId === directId)!;
                await router.addKnownPeer(directRecord);
                router.markNeighbor(directId, true);
            }
        }

        const result = await routers.get(records[0].peerId)!.findNode(records[4].peerId, {
            k: 5,
            alpha: 2,
            timeoutMs: 1_000
        });
        assert.equal(result.timedOut, false);
        assert.equal(result.queriedPeerIds.length, 2);
        assert.equal(result.candidates.length, 4);
        assert.ok(result.candidates.some(candidate => candidate.peer.peerId === records[3].peerId && !candidate.directlyReachable));
        assert.ok(result.candidates.some(candidate => candidate.peer.peerId === records[4].peerId && !candidate.directlyReachable));
        assert.ok(result.candidates.some(candidate => candidate.directlyReachable));
        for (const router of routers.values()) router.dispose();

        function connect(a: XorPeerRecord, b: XorPeerRecord): void {
            adjacency.get(a.peerId)!.add(b.peerId);
            adjacency.get(b.peerId)!.add(a.peerId);
        }
    });

    await test("reports a silent live peer as a lookup timeout", async () => {
        const [local, remote] = await Promise.all([makeRecord("timeout-local"), makeRecord("timeout-remote")]);
        const router = new XorRouter(local.peerId, {
            requestTimeoutMs: 60,
            isLiveNeighbor: peerId => peerId === remote.peerId,
            send: () => undefined
        });
        await router.addKnownPeer(remote);
        router.markNeighbor(remote.peerId, true);
        const result = await router.findNode(remote.peerId, { k: 1, timeoutMs: 300 });
        assert.equal(result.timedOut, true);
        assert.deepEqual(result.failedPeerIds, [remote.peerId]);
        router.dispose();
    });

    await test("returns empty results for an empty routing table", async () => {
        const local = await makeRecord("empty");
        const router = new XorRouter(local.peerId, {
            isLiveNeighbor: () => false,
            send: () => undefined
        });
        const result = await router.findNode(id("01"), { k: 5, timeoutMs: 100 });
        assert.deepEqual(result.candidates, []);
        assert.deepEqual(result.queriedPeerIds, []);
        assert.equal(result.timedOut, false);
        router.dispose();
    });

    await test("drops responses not associated with an outstanding lookup", async () => {
        const [local, remote] = await Promise.all([makeRecord("response-local"), makeRecord("response-remote")]);
        const router = new XorRouter(local.peerId, {
            isLiveNeighbor: () => true,
            send: () => undefined
        });
        const response = {
            version: XOR_PROTOCOL_VERSION,
            type: "FIND_NODE_RESPONSE",
            requestId: "unsolicited",
            responderPeerId: remote.peerId,
            targetPeerId: local.peerId,
            status: "ok",
            peers: []
        };
        assert.equal(await router.handleFindNodeResponse(remote.peerId, response), false);
        router.dispose();
    });

    console.log(`XOR routing tests: ${passed} passed, 0 failed.`);

}

main().catch(error => {
    console.error("XOR routing tests failed:", error);
    process.exitCode = 1;
});
