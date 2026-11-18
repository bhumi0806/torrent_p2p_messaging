import { BootstrapClient } from "../bootstrap/bootstrapClient";
import { BootstrapEventHandler } from "../bootstrap/bootstrapEventHandler";
import { EncryptionManager } from "../encryption/EncryptionManager";
import { IdentityManager } from "../identity/IdentityManager";
import { PeerId } from "../identity/valueObjects/PeerID";
import { ChatController } from "../integration/ChatController";
import { ApplicationContext } from "../integration/ApplicationContext";
import { ConnectionController } from "../integration/ConnectionController";
import { EventBus } from "../integration/EventBus";
import { MessagingManager } from "../messaging/MessagingManager";
import { NodeCoordinate } from "../peerDiscovery/NodeCoordinate";
import { WebRTCManager } from "../webrtc/WebRTCManager";

interface HarnessApi {
    readonly peerId: string;
    connect(peerId: string): Promise<void>;
    disconnect(peerId: string): void;
    send(peerId: string, text: string, hopLimit?: number): Promise<{ messageId: string; status: string; reason?: string }>;
    legacyDirectSend(peerId: string, text: string): Promise<void>;
    beginSend(peerId: string, text: string, hopLimit?: number): void;
    awaitPendingSend(): Promise<{ messageId: string; status: string; reason?: string }>;
    status(): { peerId: string; peers: Array<{ peerId: string; open: boolean; connectionState?: string; iceState?: string; signalingState?: string; channelState?: string }>; received: any[]; statuses: any[]; routePackets: any[] };
    diagnostics(): ReturnType<ConnectionController["getWebRTCDiagnostics"]>;
    installDisconnectOnRoute(peerId: string, nextPeerId: string): void;
    replayRoute(peerId: string, packet: unknown): void;
    shutdown(): void;
}

declare global { interface Window { __p2pHarness?: HarnessApi; __p2pHarnessReady?: boolean; } }

async function boot(): Promise<void> {
    const params = new URLSearchParams(location.search);
    const username = params.get("name") ?? `browser-${crypto.randomUUID()}`;
    const bootstrapUrl = params.get("server") ?? "ws://127.0.0.1:8080";
    const identityManager = new IdentityManager();
    const identity = await identityManager.initialize(username);
    const context = new ApplicationContext();
    context.setIdentity(identity);
    const coordinate = await NodeCoordinate.fromPublicKey(identity.getKeyPair().publicKey);
    context.setLocalCoordinate(coordinate);

    const eventBus = new EventBus();
    const encryption = new EncryptionManager();
    const webRTC = new WebRTCManager();
    const messaging = new MessagingManager(encryption, webRTC, context);
    let connection!: ConnectionController;
    let chat!: ChatController;

    const received: any[] = [];
    const statuses: any[] = [];
    const routePackets: any[] = [];
    const disconnectOnRoute = new Map<string, string>();
    eventBus.on("MESSAGE_RECEIVED", payload => {
        received.push({
            senderId: payload.senderId.toString(),
            transportPeerId: payload.transportPeerId.toString(),
            plaintext: payload.plaintext,
            messageId: payload.message.getMetadata().getMessageId()
        });
        render();
    });
    eventBus.on("MESSAGE_DELIVERY_STATUS", payload => { statuses.push(payload); render(); });
    eventBus.on("MESSAGE_DELIVERY_PROGRESS", payload => { statuses.push(payload); render(); });
    eventBus.on("PEER_CONNECTED", peerId => {
        const channel = context.getDataChannel(peerId);
        if (!channel) return;
        channel.getChannel().addEventListener("message", event => {
            if (typeof event.data !== "string") return;
            try {
                const envelope = JSON.parse(event.data);
                if (envelope.kind === "route-message") {
                    routePackets.push({ peerId: peerId.toString(), direction: "received", packet: envelope.payload });
                    const next = disconnectOnRoute.get(peerId.toString());
                    if (next) {
                        disconnectOnRoute.delete(peerId.toString());
                        connection.disconnect(next);
                    }
                }
            } catch { /* Non-JSON messages belong to other application protocols. */ }
        });
        const wrappedSend = channel.send.bind(channel);
        Object.defineProperty(channel, "send", {
            configurable: true,
            value: (data: string | ArrayBuffer | Blob) => {
                if (typeof data === "string") {
                    try {
                        const envelope = JSON.parse(data);
                        if (envelope.kind === "route-message") {
                            routePackets.push({ peerId: peerId.toString(), direction: "sent", packet: envelope.payload });
                        }
                    } catch { /* Other application protocol. */ }
                }
                wrappedSend(data);
            }
        });
    });

    let bootstrap!: BootstrapClient;
    const bootstrapEvents = new BootstrapEventHandler(
        packet => {
            const peers = Array.isArray(packet.payload) ? packet.payload : [];
            bootstrap.getState().setPeerList(peers);
            context.setOnlinePeers(peers.filter((peer: any) => peer.peerId !== identity.getPeerId().toString()));
            void eventBus.emit("PEER_LIST_UPDATED", context.getOnlinePeers());
        },
        packet => {
            bootstrap.getState().addPeer(packet.payload as any);
            context.addPeer(packet.payload);
            void eventBus.emit("PEER_LIST_UPDATED", context.getOnlinePeers());
        },
        packet => {
            const peer = packet.payload as any;
            bootstrap.getState().removePeer(peer?.peerId);
            context.removePeer(peer?.peerId);
            void eventBus.emit("PEER_LIST_UPDATED", context.getOnlinePeers());
        },
        packet => { const p: any = packet.payload; void eventBus.emit("WEBRTC_OFFER", { senderId: p.senderPeerId, offer: p.payload }); },
        packet => { const p: any = packet.payload; void eventBus.emit("WEBRTC_ANSWER", { senderId: p.senderPeerId, answer: p.payload }); },
        packet => { const p: any = packet.payload; void eventBus.emit("WEBRTC_ICE", { senderId: p.senderPeerId, candidate: p.payload }); },
        packet => { throw new Error(`Bootstrap error: ${JSON.stringify(packet.payload)}`); }
    );
    bootstrap = new BootstrapClient(bootstrapEvents);
    bootstrap.setIdentity(identity);
    bootstrap.setCoordinate(coordinate);
    connection = new ConnectionController(webRTC, bootstrap, encryption, eventBus, context);
    chat = new ChatController(messaging, eventBus, context, connection.sendChatMessage.bind(connection));
    connection.register();
    chat.register();
    await bootstrap.connect(bootstrapUrl);

    const api: HarnessApi = {
        peerId: identity.getPeerId().toString(),
        async connect(peerId) {
            const firstAttempt = connection.connect(peerId);
            const initialConnection = context.getConnection(peerId);
            if (!initialConnection) throw new Error("Connection attempt did not register a peer connection");
            await connection.connect(peerId);
            if (context.getConnection(peerId) !== initialConnection) {
                throw new Error("Repeated Connect replaced an in-flight peer connection");
            }
            await firstAttempt;
            await waitFor(() => context.getDataChannel(peerId)?.isOpen() === true, 8_000,
                `WebRTC channel to ${peerId} did not open; ${JSON.stringify(api.status())}`);
        },
        disconnect(peerId) { connection.disconnect(peerId); },
        async send(peerId, text, hopLimit) {
            const before = statuses.length;
            try { await chat.sendMessage(peerId, text, hopLimit); } catch { /* Failure is recorded by ChatController. */ }
            const completion = statuses.slice(before).reverse().find(item => item.messageId && !item.status.startsWith("relay_"));
            return { messageId: completion?.messageId ?? "", status: completion?.status ?? "delivered", reason: completion?.reason };
        },
        async legacyDirectSend(peerId, text) {
            const id = PeerId.fromString(peerId);
            const directConnection = context.getConnection(id);
            if (!directConnection) throw new Error("No direct connection for legacy chat");
            await messaging.send(directConnection, id, text);
        },
        beginSend(peerId, text, hopLimit) {
            (window as any).__pendingP2PSend = api.send(peerId, text, hopLimit);
        },
        async awaitPendingSend() {
            const pending = (window as any).__pendingP2PSend as Promise<{ messageId: string; status: string; reason?: string }> | undefined;
            if (!pending) throw new Error("No pending send");
            return pending;
        },
        status() {
            const ids = [...new Set([...context.getConnectedPeerIds(), ...context.getOnlinePeers().map((peer: any) => peer.peerId)])];
            const peers = ids.map(peerId => ({
                peerId,
                open: context.getDataChannel(peerId)?.isOpen() === true,
                connectionState: context.getConnection(peerId)?.getConnection().connectionState,
                iceState: context.getConnection(peerId)?.getConnection().iceConnectionState,
                signalingState: context.getConnection(peerId)?.getConnection().signalingState,
                channelState: context.getDataChannel(peerId)?.getChannel().readyState
            }));
            return { peerId: identity.getPeerId().toString(), peers, received: [...received], statuses: [...statuses], routePackets: [...routePackets] };
        },
        diagnostics() { return connection.getWebRTCDiagnostics(); },
        installDisconnectOnRoute(peerId, nextPeerId) { disconnectOnRoute.set(peerId, nextPeerId); },
        replayRoute(peerId, packet) {
            const channel = context.getDataChannel(PeerId.fromString(peerId));
            if (!channel?.isOpen()) throw new Error("Replay peer has no open data channel");
            channel.send(JSON.stringify({ kind: "route-message", payload: packet }));
        },
        shutdown() {
            const peerIds = new Set([
                ...context.getConnectedPeerIds(),
                ...context.getOnlinePeers().map((peer: any) => peer.peerId)
            ]);
            for (const peerId of peerIds) connection.disconnect(peerId);
            connection.dispose();
            bootstrap.disconnect();
        }
    };
    window.__p2pHarness = api;
    document.getElementById("peerName")!.textContent = username;
    document.getElementById("peerId")!.textContent = api.peerId;
    render();
    window.__p2pHarnessReady = true;

    function render(): void {
        const state = {
            peerId: identity.getPeerId().toString(),
            connected: context.getOpenConnectedPeerIds(),
            received,
            statuses
        };
        document.getElementById("events")!.textContent = JSON.stringify(state, null, 2);
    }
}

async function waitFor(predicate: () => boolean, timeout: number, message: string): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(message);
}

void boot().catch(error => {
    console.error("WebRTC harness initialization failed", error);
    document.body.dataset.error = String(error);
    window.__p2pHarnessReady = false;
});
