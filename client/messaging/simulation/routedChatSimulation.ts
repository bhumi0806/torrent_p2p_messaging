import sodium from "libsodium-wrappers";
import { ApplicationContext } from "../../integration/ApplicationContext";
import { EncryptionManager } from "../../encryption/EncryptionManager";
import { KeyPair } from "../../identity/KeyPair";
import { PrivateIdentity } from "../../identity/models/PrivateIdentity";
import { PublicIdentity } from "../../identity/models/PublicIdentity";
import { PeerId } from "../../identity/valueObjects/PeerID";
import { PrivateKey } from "../../identity/valueObjects/PrivateKey";
import { PublicKey } from "../../identity/valueObjects/PublicKey";
import { Username } from "../../identity/valueObjects/UserName";
import { MessageSerializer } from "../MessageSerializer";
import { MessageSender } from "../MessageSender";
import { RouteMessageHandler } from "../RouteMessageHandler";
import { RouteMessage, RouteMessageResponse, isRouteMessage, isRouteMessageResponse, routeMessageSigningText, routeResponseSigningText } from "../RouteMessageProtocol";
import { XorRouter } from "../../peerDiscovery/XorRouter";
import { XorPeerRecord } from "../../peerDiscovery/XorRoutingProtocol";
import { createRandomId } from "../../utils/createRandomId";
import { WebRTCManager } from "../../webrtc/WebRTCManager";

interface Node {
    id: string;
    identity: PrivateIdentity;
    context: ApplicationContext;
    encryption: EncryptionManager;
    xor: XorRouter;
    route: RouteMessageHandler;
    live: Set<string>;
    delivered: Array<{ origin: string; transport: string; text: string }>;
    sent: Array<{ peer: string; packet: RouteMessage | RouteMessageResponse }>;
}

let checks = 0;

async function main(): Promise<void> {
    await sodium.ready;
    await testLinearAndFourPeerNetworks();
    await testNoRouteLoopAndOfflinePeer();
    await testHopLimitAndDuplicateSuppression();
    await testTamperingAndMalformedPackets();
    await testMutableHopFieldsAndIdentityBinding();
    console.log(`[Routed Chat Simulation] ${checks} assertions passed across 11 scenarios. In-memory transport only; this is not a real WebRTC/network test.`);
}

async function createNode(name: string): Promise<Node> {
    const pair = sodium.crypto_sign_keypair();
    const publicKey = new PublicKey(new Uint8Array(pair.publicKey));
    const peerId = await PeerId.fromPublicKey(publicKey.bytes);
    const identity = new PrivateIdentity(
        new KeyPair(publicKey, new PrivateKey(new Uint8Array(pair.privateKey))),
        new PublicIdentity(peerId, new Username(name), publicKey)
    );
    const context = new ApplicationContext();
    context.setIdentity(identity);
    return {
        id: peerId.toString(), identity, context, encryption: new EncryptionManager(),
        xor: undefined as unknown as XorRouter, route: undefined as unknown as RouteMessageHandler,
        live: new Set(), delivered: [], sent: []
    };
}

async function createNetwork(
    edges: Array<[number, number]>,
    size: number,
    mutatePacket?: (from: Node, to: Node, packet: RouteMessage | RouteMessageResponse) => RouteMessage | RouteMessageResponse
): Promise<Node[]> {
    const nodes = await Promise.all(Array.from({ length: size }, (_, i) => createNode(`peer-${i}`)));
    for (const [a, b] of edges) {
        nodes[a].live.add(nodes[b].id);
        nodes[b].live.add(nodes[a].id);
    }
    const records: XorPeerRecord[] = nodes.map(node => ({
        peerId: node.id, username: node.identity.getPublicIdentity().username.toString(),
        publicKey: node.identity.getPublicIdentity().publicKey.toBase64()
    }));
    for (const node of nodes) {
        node.xor = new XorRouter(node.id, {
            isLiveNeighbor: peerId => node.live.has(peerId),
            send: () => { throw new Error("FIND_NODE not used in this routing simulation"); }
        });
        await node.xor.addKnownPeers(records.filter(record => record.peerId !== node.id));
        for (const livePeerId of node.live) node.xor.markNeighbor(livePeerId, true);
    }
    for (const node of nodes) {
        node.route = new RouteMessageHandler(node.context, node.encryption, {
            selectNextHop: (target, excluded) => node.xor.selectNextHop(target, excluded),
            sendToPeer: (peerId, packet) => {
                node.sent.push({ peer: peerId, packet });
                if (!node.live.has(peerId)) throw new Error("Peer is offline");
                const target = nodes.find(candidate => candidate.id === peerId);
                if (!target) throw new Error("Unknown peer");
                const deliveredPacket = mutatePacket ? mutatePacket(node, target, packet) : packet;
                queueMicrotask(() => {
                    if (deliveredPacket.type === "ROUTE_MESSAGE") {
                        void target.route.handleMessage(node.id, deliveredPacket);
                    } else void target.route.handleResponse(node.id, deliveredPacket);
                });
            },
            deliver: async (origin, transport, encryptedPayload) => {
                const received = node.encryption.decrypt(PeerId.fromString(origin),
                    MessageSerializer.deserialize(encryptedPayload).getPayload());
                node.delivered.push({ origin, transport, text: received });
            }
        });
    }
    return nodes;
}

async function send(nodes: Node[], from: number, to: number, text: string, originHopLimit?: number) {
    const origin = nodes[from];
    const destination = nodes[to];
    await origin.encryption.deriveAndStoreSessionKey(origin.identity, PeerId.fromString(destination.id), destination.identity.getPublicIdentity().publicKey);
    const sender = new MessageSender(origin.encryption, {} as WebRTCManager, origin.context);
    const serialized = MessageSerializer.serialize(sender.createMessage(PeerId.fromString(destination.id), text));
    const message = MessageSerializer.deserialize(serialized);
    const response = await origin.route.send(destination.id, message.getMetadata().getMessageId(), serialized, undefined, originHopLimit);
    return { response, serialized };
}

async function testLinearAndFourPeerNetworks(): Promise<void> {
    const three = await createNetwork([[0, 1], [1, 2]], 3);
    const { response, serialized } = await send(three, 0, 2, "secret over two hops");
    assert(response.status === "delivered", "A-B-C delivery failed");
    assert(three[2].delivered.length === 1 && three[2].delivered[0].text === "secret over two hops", "Destination did not decrypt the chat");
    assert(three[2].delivered[0].origin === three[0].id && three[2].delivered[0].transport === three[1].id, "Origin/transport identity was conflated");
    const forwarded = three[1].sent.find(item => item.peer === three[2].id && item.packet.type === "ROUTE_MESSAGE")?.packet as RouteMessage;
    assert(forwarded.encryptedPayload === serialized, "Relay changed the encrypted serialized payload");
    assert(forwarded.hopProofs.length === 1 && forwarded.hopProofs[0].nextPeerId === three[2].id, "Relay hop proof did not bind the next peer");
    assert(!three[1].encryption.hasSessionKey(PeerId.fromString(three[0].id)), "Relay unexpectedly has the A-C session key");
    let relayCouldDecrypt = true;
    try { three[1].encryption.decrypt(PeerId.fromString(three[0].id), MessageSerializer.deserialize(serialized).getPayload()); }
    catch { relayCouldDecrypt = false; }
    assert(!relayCouldDecrypt, "Relay decrypted end-to-end ciphertext");
    three.forEach(node => node.route.dispose());

    const four = await createNetwork([[0, 1], [1, 2], [2, 3]], 4);
    const fourResult = await send(four, 0, 3, "four peer path");
    assert(fourResult.response.status === "delivered" && four[3].delivered[0]?.text === "four peer path", "A-B-C-D delivery failed");
    four.forEach(node => node.route.dispose());

    const direct = await createNetwork([[0, 1]], 2);
    const directResult = await send(direct, 0, 1, "direct regression");
    assert(directResult.response.status === "delivered" && direct[1].delivered[0]?.origin === direct[0].id, "Single-hop chat regression");
    direct.forEach(node => node.route.dispose());
}

async function testNoRouteLoopAndOfflinePeer(): Promise<void> {
    const none = await createNetwork([], 2);
    assert((await send(none, 0, 1, "no route")).response.status === "unreachable", "No-route failure not reported");
    none.forEach(node => node.route.dispose());

    const offline = await createNetwork([[0, 1], [1, 2]], 3);
    offline[1].live.delete(offline[2].id);
    offline[2].live.delete(offline[1].id);
    const offlineResult = await send(offline, 0, 2, "peer went offline");
    assert(offlineResult.response.status === "unreachable" && offline[2].delivered.length === 0, "Offline destination link was treated as reachable");
    offline.forEach(node => node.route.dispose());

    const loop = await createNetwork([[0, 1], [1, 2], [2, 0]], 4);
    const loopResult = await send(loop, 0, 3, "loop guard");
    assert(loopResult.response.status !== "delivered" && loop.reduce((n, node) => n + node.delivered.length, 0) === 0, "Looping topology reported delivery");
    loop.forEach(node => node.route.dispose());
}

async function testHopLimitAndDuplicateSuppression(): Promise<void> {
    const capped = await createNetwork([[0, 1], [1, 2], [2, 3]], 4);
    const { response } = await send(capped, 0, 3, "hop bound", 2);
    assert(response.status === "hop_limit_exceeded", "Hop limit did not stop forwarding");
    capped.forEach(node => node.route.dispose());

    const duplicate = await createNetwork([[0, 1], [1, 2], [0, 3], [3, 2]], 4);
    const dest = duplicate[2];
    const result = await send(duplicate, 0, 2, "deduplicated across paths");
    const original = duplicate[0].sent.find(item => item.packet.type === "ROUTE_MESSAGE")?.packet as RouteMessage;
    const selectedRelay = duplicate[0].sent.find(item => item.packet.type === "ROUTE_MESSAGE")?.peer;
    const alternateRelay = selectedRelay === duplicate[1].id ? duplicate[3] : duplicate[1];
    assert(!!original && !!selectedRelay, "Origin did not emit a route envelope");
    await alternateRelay.route.handleMessage(duplicate[0].id, original);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert(result.response.status === "delivered" && dest.delivered.length === 1, "Duplicate via alternate path was processed twice");
    duplicate.forEach(node => node.route.dispose());
}

async function testTamperingAndMalformedPackets(): Promise<void> {
    const nodes = await createNetwork([[0, 1]], 2);
    const { serialized } = await send(nodes, 0, 1, "tamper target");
    const deliveryCountBeforeTamper = nodes[1].delivered.length;
    const keyPair = nodes[0].identity.getKeyPair();
    const originPublicKey = keyPair.publicKey.toBase64();
    const unsigned: Omit<RouteMessage, "type" | "originSignature"> = {
        version: 1, messageId: createRandomId(), originPeerId: nodes[0].id,
        destinationPeerId: nodes[1].id, createdAt: Date.now(), originHopLimit: 8, hopLimit: 8,
        visitedPeerIds: [nodes[0].id], hopProofs: [], encryptedPayload: serialized, originPublicKey
    };
    const valid: RouteMessage = {
        ...unsigned, type: "ROUTE_MESSAGE",
        originSignature: sodium.to_base64(sodium.crypto_sign_detached(
            sodium.from_string(routeMessageSigningText(unsigned)),
            keyPair.privateKey.bytes
        ))
    };
    assert(isRouteMessage(valid), "Valid envelope rejected");
    assert(!isRouteMessage("{malformed json"), "Malformed JSON text accepted as an envelope");
    assert(!isRouteMessage({ ...valid, originPeerId: "z".repeat(64) }), "Invalid peer ID accepted");
    assert(!isRouteMessage({ ...valid, extra: true }), "Extra malformed field accepted");
    assert(!isRouteMessage({ ...valid, hopLimit: 0 }), "Invalid hop limit accepted");
    assert(!isRouteMessage({ ...valid, createdAt: 0 }), "Invalid timestamp accepted");
    assert(!isRouteMessage({ ...valid, createdAt: Number.MAX_SAFE_INTEGER + 1 }), "Unsafe timestamp accepted");
    assert(!isRouteMessage({ ...valid, visitedPeerIds: [nodes[0].id, nodes[0].id] }), "Repeated visited peer accepted");
    assert(!isRouteMessage({ ...valid, destinationPeerId: nodes[0].id }), "Self-routed envelope accepted");
    assert(!isRouteMessage({ ...valid, encryptedPayload: "x".repeat(256 * 1024 + 1) }), "Oversized payload accepted");
    const tampered = { ...valid, originPeerId: nodes[1].id };
    await nodes[1].route.handleMessage(nodes[0].id, tampered);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert(nodes[1].delivered.length === deliveryCountBeforeTamper, "Tampered origin was delivered");
    const originalForward = nodes[0].sent.find(item => item.packet.type === "ROUTE_MESSAGE")?.packet as RouteMessage;
    await nodes[1].route.handleMessage(nodes[0].id, {
        ...originalForward,
        encryptedPayload: `${originalForward.encryptedPayload} `
    });
    assert(nodes[1].delivered.length === deliveryCountBeforeTamper, "Ciphertext alteration passed the origin signature");

    const forged: RouteMessageResponse = {
        version: 1, type: "ROUTE_MESSAGE_RESPONSE", messageId: valid.messageId,
        originPeerId: nodes[0].id, destinationPeerId: nodes[1].id,
        responderPeerId: nodes[1].id, status: "delivered", timestamp: Date.now(), reason: "forged",
        responderPublicKey: nodes[0].identity.getPublicIdentity().publicKey.toBase64(), signature: "AQ=="
    };
    assert(isRouteMessageResponse(forged), "Forged response fixture malformed");
    assert(!await nodes[0].route.handleResponse(nodes[1].id, forged), "Forged acknowledgement accepted");

    const wrongMessageUnsigned = {
        ...forged,
        messageId: createRandomId(),
        responderPeerId: nodes[1].id,
        responderPublicKey: nodes[1].identity.getPublicIdentity().publicKey.toBase64(),
        status: "delivered" as const,
        reason: "signed but unbound"
    };
    const wrongMessageAck: RouteMessageResponse = {
        ...wrongMessageUnsigned,
        signature: sodium.to_base64(sodium.crypto_sign_detached(
            sodium.from_string(routeResponseSigningText(wrongMessageUnsigned)),
            nodes[1].identity.getKeyPair().privateKey.bytes
        ))
    };
    assert(await nodes[0].route.handleResponse(nodes[1].id, wrongMessageAck) === false,
        "Authenticated acknowledgement without a matching pending message ID was accepted");
    nodes.forEach(node => node.route.dispose());
}

async function testMutableHopFieldsAndIdentityBinding(): Promise<void> {
    const chain = await createNetwork([[0, 1], [1, 2]], 3);
    await send(chain, 0, 2, "signed hop proof");
    const validForward = chain[1].sent.find(item => item.packet.type === "ROUTE_MESSAGE")?.packet as RouteMessage;
    assert(!!validForward && chain[2].delivered.length === 1, "Valid relay hop proof did not reach destination");
    const before = chain[2].delivered.length;
    const proof = validForward.hopProofs[0];
    await chain[2].route.handleMessage(chain[1].id, {
        ...validForward,
        hopProofs: [{ ...proof, hopLimit: proof.hopLimit - 1 }]
    });
    assert(chain[2].delivered.length === before, "Mutated signed hop limit was accepted");
    await chain[2].route.handleMessage(chain[1].id, {
        ...validForward,
        hopProofs: [{ ...proof, visitedPeerIds: [chain[0].id, chain[2].id] }]
    });
    assert(chain[2].delivered.length === before, "Mutated signed visited path was accepted");
    chain.forEach(node => node.route.dispose());

    const identity = await createNetwork([[0, 1]], 2);
    const { serialized } = await send(identity, 0, 1, "identity binding");
    const origin = identity[0];
    const otherKey = identity[1].identity.getPublicIdentity().publicKey.toBase64();
    const unsigned = {
        version: 1 as const,
        messageId: createRandomId(),
        originPeerId: origin.id,
        destinationPeerId: identity[1].id,
        createdAt: Date.now(),
        originHopLimit: 8,
        encryptedPayload: serialized,
        originPublicKey: otherKey
    };
    const wrongIdentity: RouteMessage = {
        ...unsigned,
        type: "ROUTE_MESSAGE",
        hopLimit: 8,
        visitedPeerIds: [origin.id],
        hopProofs: [],
        originSignature: sodium.to_base64(sodium.crypto_sign_detached(
            sodium.from_string(routeMessageSigningText(unsigned)),
            origin.identity.getKeyPair().privateKey.bytes
        ))
    };
    const deliveredBefore = identity[1].delivered.length;
    await identity[1].route.handleMessage(origin.id, wrongIdentity);
    assert(identity[1].delivered.length === deliveredBefore,
        "A public key that hashes to a different peer ID was accepted");
    let captureRoute!: (packet: RouteMessage | RouteMessageResponse) => void;
    const capturedRoute = new Promise<RouteMessage | RouteMessageResponse>(resolve => { captureRoute = resolve; });
    const pendingHandler = new RouteMessageHandler(identity[0].context, identity[0].encryption, {
        selectNextHop: () => identity[1].id,
        sendToPeer: (_peerId, packet) => captureRoute(packet),
        deliver: async () => undefined
    });
    const sender = new MessageSender(identity[0].encryption, {} as WebRTCManager, identity[0].context);
    const encrypted = MessageSerializer.serialize(sender.createMessage(PeerId.fromString(identity[1].id), "ack binding"));
    const pendingSend = pendingHandler.send(
        identity[1].id,
        MessageSerializer.deserialize(encrypted).getMetadata().getMessageId(),
        encrypted
    );
    const captured = await capturedRoute as RouteMessage;
    const ackFor = (messageId: string): RouteMessageResponse => {
        const unsignedAck = {
            version: 1 as const,
            type: "ROUTE_MESSAGE_RESPONSE" as const,
            messageId,
            originPeerId: identity[0].id,
            destinationPeerId: identity[1].id,
            responderPeerId: identity[1].id,
            status: "delivered" as const,
            timestamp: Date.now(),
            reason: "destination_accepted",
            responderPublicKey: identity[1].identity.getPublicIdentity().publicKey.toBase64()
        };
        return {
            ...unsignedAck,
            signature: sodium.to_base64(sodium.crypto_sign_detached(
                sodium.from_string(routeResponseSigningText(unsignedAck)),
                identity[1].identity.getKeyPair().privateKey.bytes
            ))
        };
    };
    assert(!await pendingHandler.handleResponse(identity[1].id, ackFor(createRandomId())),
        "Validly signed ACK for another message resolved a pending delivery");
    assert(await pendingHandler.handleResponse(identity[1].id, ackFor(captured.messageId)),
        "Valid destination ACK for the pending message was rejected");
    assert((await pendingSend).status === "delivered", "Bound destination ACK did not resolve the sender");
    pendingHandler.dispose();
    identity.forEach(node => node.route.dispose());
}

function assert(condition: boolean, message: string): asserts condition {
    checks++;
    if (!condition) throw new Error(message);
}

void main().catch(error => { console.error(error); throw error; });
