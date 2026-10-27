import WebSocket from "ws";
import { spawn, ChildProcess } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { MessageType } from "./bootstrap/types/MessageType";
import { BootstrapPacket } from "./bootstrap/models/BootstrapPacket";
import { ConnectionProfile } from "./bootstrap/protocol/RoutingPayload";

type WirePacket = BootstrapPacket<any>;

class LocalClient {
    private readonly packets: WirePacket[] = [];
    private readonly waiters: Array<{
        match: (packet: WirePacket) => boolean;
        resolve: (packet: WirePacket) => void;
        reject: (error: Error) => void;
        timer: NodeJS.Timeout;
    }> = [];

    constructor(public readonly name: string, public readonly socket: WebSocket) {
        socket.on("message", raw => {
            let packet: WirePacket;
            try {
                packet = JSON.parse(raw.toString()) as WirePacket;
            } catch {
                return;
            }
            const index = this.waiters.findIndex(waiter => waiter.match(packet));
            if (index >= 0) {
                const [waiter] = this.waiters.splice(index, 1);
                clearTimeout(waiter.timer);
                waiter.resolve(packet);
            } else {
                this.packets.push(packet);
            }
        });
    }

    public send<T>(type: MessageType, payload: T): void {
        this.socket.send(JSON.stringify(new BootstrapPacket(type, payload)));
    }

    public waitFor(type: MessageType, predicate: (payload: any) => boolean = () => true, timeoutMs = 5_000): Promise<WirePacket> {
        const queuedIndex = this.packets.findIndex(packet => packet.type === type && predicate(packet.payload));
        if (queuedIndex >= 0) return Promise.resolve(this.packets.splice(queuedIndex, 1)[0]);
        return new Promise((resolve, reject) => {
            const waiter = {
                match: (packet: WirePacket) => packet.type === type && predicate(packet.payload),
                resolve,
                reject,
                timer: setTimeout(() => {
                    const index = this.waiters.indexOf(waiter);
                    if (index >= 0) this.waiters.splice(index, 1);
                    reject(new Error(`${this.name}: timed out waiting for ${type}`));
                }, timeoutMs)
            };
            this.waiters.push(waiter);
        });
    }
}

async function openClient(name: string): Promise<LocalClient> {
    const socket = new WebSocket("ws://127.0.0.1:8080");
    await once(socket, "open");
    return new LocalClient(name, socket);
}

async function main(): Promise<void> {
    const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
    const tsxCli = path.join(serverDirectory, "node_modules", "tsx", "dist", "cli.mjs");
    const serverEntry = path.join(serverDirectory, "main.ts");
    const serverProcess: ChildProcess = spawn(process.execPath, [tsxCli, serverEntry], {
        cwd: serverDirectory,
        env: { ...process.env, BOOTSTRAP_HOST: "127.0.0.1", BOOTSTRAP_PORT: "8080" },
        stdio: ["ignore", "pipe", "pipe"]
    });

    const clients: LocalClient[] = [];
    try {
        await new Promise<void>((resolve, reject) => {
            let output = "";
            const timeout = setTimeout(() => reject(new Error("Server did not start on port 8080.")), 8_000);
            serverProcess.stdout?.on("data", chunk => {
                output += chunk.toString();
                if (output.includes("[Server] Started")) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            serverProcess.stderr?.on("data", chunk => {
                const message = chunk.toString();
                if (message.includes("EADDRINUSE")) {
                    clearTimeout(timeout);
                    reject(new Error("Port 8080 is already in use."));
                }
            });
            serverProcess.once("exit", code => {
                clearTimeout(timeout);
                reject(new Error(`Signaling server exited before startup (code ${code}).`));
            });
        });
        console.log("[Server] Started");

        const clientA = await openClient("Client A");
        clients.push(clientA);
        const publicKeyA = Buffer.alloc(32, 0x41);
        const coordinateA = coordinateFor(publicKeyA);
        clientA.send(MessageType.REGISTER, {
            peerId: "mock-peer-A-0001",
            username: "anonymous-A",
            publicKey: publicKeyA.toString("base64"),
            coordinate: coordinateA
        });
        await clientA.waitFor(MessageType.PEER_LIST);
        console.log("[Client A] Registered");

        const clientB = await openClient("Client B");
        clients.push(clientB);
        const publicKeyB = Buffer.alloc(32, 0x42);
        const coordinateB = coordinateFor(publicKeyB);
        clientB.send(MessageType.REGISTER, {
            peerId: "mock-peer-B-0002",
            username: "anonymous-B",
            publicKey: publicKeyB.toString("base64"),
            coordinate: coordinateB
        });
        await clientB.waitFor(MessageType.PEER_LIST);

        clientB.send(MessageType.FIND_CLOSEST_NODES, {
            targetCoordinate: coordinateA,
            limit: 3,
            requestId: "lookup-A"
        });
        const lookup = await clientB.waitFor(
            MessageType.FIND_CLOSEST_NODES,
            payload => payload?.requestId === "lookup-A"
        );
        const nodes = lookup.payload.nodes as ConnectionProfile[];
        if (!nodes?.length || nodes[0].peerId !== "mock-peer-A-0001") {
            throw new Error("Closest-node lookup did not return Client A.");
        }
        console.log("[Client B] Found A via Signal");

        const offerReceived = clientA.waitFor(
            MessageType.ANONYMOUS_SIGNAL,
            payload => payload?.signalType === MessageType.OFFER
        );
        const offerAck = clientB.waitFor(
            MessageType.ANONYMOUS_SIGNAL,
            payload => payload?.requestId === "offer-1" && payload?.delivered === true
        );
        clientB.send(MessageType.ANONYMOUS_SIGNAL, {
            targetCoordinate: coordinateA,
            signalType: MessageType.OFFER,
            signal: { type: "offer", sdp: "mock-webrtc-offer" },
            requestId: "offer-1"
        });
        const [offerDelivery] = await Promise.all([offerReceived, offerAck]);
        const returnToken = offerDelivery.payload.returnToken as string;
        if (!returnToken) throw new Error("Anonymous offer did not include a return token.");

        const answerReceived = clientB.waitFor(
            MessageType.ANONYMOUS_SIGNAL,
            payload => payload?.signalType === MessageType.ANSWER
        );
        clientA.send(MessageType.ANONYMOUS_SIGNAL, {
            returnToken,
            signalType: MessageType.ANSWER,
            signal: { type: "answer", sdp: "mock-webrtc-answer" },
            requestId: "answer-1"
        });
        const answerDelivery = await answerReceived;
        if (answerDelivery.payload.signal?.type !== "answer") {
            throw new Error("Mock SDP answer was not relayed.");
        }
        console.log("[Transport] WebRTC Handshake Wrapped Successfully");

        const ports = clients.map(client => (client.socket as WebSocket & { _socket?: { localPort?: number } })._socket?.localPort);
        if (!ports[0] || !ports[1] || ports[0] === ports[1]) {
            throw new Error("Clients unexpectedly share a local source port.");
        }
    } finally {
        for (const client of clients) client.socket.close();
        if (serverProcess.exitCode === null) {
            serverProcess.kill("SIGTERM");
            await Promise.race([once(serverProcess, "exit"), new Promise(resolve => setTimeout(resolve, 2_000))]);
        }
    }
}

function coordinateFor(publicKey: Uint8Array): number {
    const digest = createHash("sha256").update(publicKey).digest();
    return Number(BigInt(`0x${digest.toString("hex")}`)) / Number((1n << 256n) - 1n);
}

main().catch(error => {
    console.error("Transport mesh integration test failed:", error);
    process.exitCode = 1;
});
