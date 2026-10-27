import sodium from "libsodium-wrappers";

import { PrivateKey } from "../identity/valueObjects/PrivateKey";
import { PublicKey } from "../identity/valueObjects/PublicKey";
import { PassiveChunkCache } from "./PassiveChunkCache";

export const CHAT_THREAD_GENESIS = "0".repeat(64);

export interface SignedChatPacket {
    readonly version: 1;
    readonly roomId: string;
    readonly messageId: string;
    readonly sequence: number;
    readonly previousHash: string;
    /** Base64 encoded encrypted chunk. Plaintext is never placed in the chain. */
    readonly payload: string;
    readonly senderId: string;
    readonly senderPublicKey: string;
    readonly timestamp: number;
    readonly signature: string;
    /** SHA-256 over the canonical packet fields and signature. */
    readonly hash: string;
}

export interface ChatThreadMember {
    readonly senderId: string;
    readonly publicKey: PublicKey;
}

type UnsignedPacket = Omit<SignedChatPacket, "signature" | "hash">;

/**
 * Linear room thread with signature validation and out-of-order buffering.
 * A shared ordering authority is required if concurrent authors create forks;
 * this engine detects and rejects competing children for the same predecessor.
 */
export class ChatThreadEngine {
    private readonly members = new Map<string, PublicKey>();
    private readonly messages: SignedChatPacket[] = [];
    private readonly hashes = new Set<string>();
    private readonly pendingByPrevious = new Map<string, SignedChatPacket>();
    private readonly pendingIds = new Set<string>();
    private rejectedCount = 0;
    private headHash = CHAT_THREAD_GENESIS;
    private readonly maxPendingMessages = 2_048;

    constructor(
        public readonly roomId: string,
        members: readonly ChatThreadMember[] = [],
        private readonly cache: PassiveChunkCache = PassiveChunkCache.shared
    ) {
        if (!roomId || roomId.length > 256) throw new Error("Invalid chat room ID.");
        for (const member of members) this.addMember(member.senderId, member.publicKey);
    }

    public addMember(senderId: string, publicKey: PublicKey): void {
        if (!senderId || senderId.length > 128) throw new Error("Invalid chat member ID.");
        this.members.set(senderId, publicKey);
    }

    /** Create, sign, hash, and append a packet to this sender's local thread. */
    public async createPacket(
        encryptedPayload: Uint8Array,
        senderId: string,
        publicKey: PublicKey,
        privateKey: PrivateKey
    ): Promise<SignedChatPacket> {
        await sodium.ready;
        const registeredKey = this.members.get(senderId);
        if (!registeredKey || !sodium.memcmp(registeredKey.bytes, publicKey.bytes)) {
            throw new Error("Sender is not a registered room member.");
        }
        if (encryptedPayload.byteLength === 0 || encryptedPayload.byteLength > 4 * 1024 * 1024) {
            throw new Error("Encrypted chat payload has an invalid size.");
        }

        const unsigned: UnsignedPacket = {
            version: 1,
            roomId: this.roomId,
            messageId: sodium.to_hex(sodium.randombytes_buf(16)),
            sequence: this.messages.length + 1,
            previousHash: this.headHash,
            payload: sodium.to_base64(encryptedPayload),
            senderId,
            senderPublicKey: publicKey.toBase64(),
            timestamp: Date.now()
        };
        const signature = sodium.to_base64(
            sodium.crypto_sign_detached(this.canonical(unsigned), privateKey.bytes)
        );
        const hash = await this.calculateHash(unsigned, signature);
        const packet: SignedChatPacket = Object.freeze({ ...unsigned, signature, hash });
        if (!await this.ingest(packet)) throw new Error("Locally created chat packet failed validation.");
        return packet;
    }

    /** Verify and either append the packet or hold it until its predecessor arrives. */
    public async ingest(rawPacket: unknown): Promise<boolean> {
        await sodium.ready;
        const packet = this.asPacket(rawPacket);
        if (!packet || packet.roomId !== this.roomId || this.hashes.has(packet.hash) || this.pendingIds.has(packet.messageId)) {
            return this.reject();
        }
        const trustedKey = this.members.get(packet.senderId);
        if (!trustedKey || packet.senderPublicKey !== trustedKey.toBase64()) return this.reject();

        let payloadBytes: Uint8Array;
        let signature: Uint8Array;
        try {
            payloadBytes = sodium.from_base64(packet.payload);
            signature = sodium.from_base64(packet.signature);
        } catch {
            return this.reject();
        }
        if (payloadBytes.byteLength === 0 || signature.byteLength !== sodium.crypto_sign_BYTES) return this.reject();

        const unsigned = this.unsigned(packet);
        const signedBytes = this.canonical(unsigned);
        if (!sodium.crypto_sign_verify_detached(signature, signedBytes, trustedKey.bytes)) return this.reject();
        const expectedHash = await this.calculateHash(unsigned, packet.signature);
        if (expectedHash !== packet.hash) return this.reject();

        if (this.pendingByPrevious.has(packet.previousHash)) return this.reject();
        if (packet.sequence === 1) {
            if (packet.previousHash !== CHAT_THREAD_GENESIS || this.messages.length > 0) return this.reject();
            await this.append(packet, payloadBytes);
            await this.drainPending();
            return true;
        }
        if (packet.previousHash === CHAT_THREAD_GENESIS || packet.sequence < 2) return this.reject();

        if (packet.previousHash === this.headHash) {
            if (packet.sequence !== this.messages.length + 1) return this.reject();
            await this.append(packet, payloadBytes);
            await this.drainPending();
            return true;
        }

        if (this.hashes.has(packet.previousHash)) return this.reject();

        if (this.pendingByPrevious.size >= this.maxPendingMessages) return this.reject();
        this.pendingByPrevious.set(packet.previousHash, packet);
        this.pendingIds.add(packet.messageId);
        await this.cachePayload(payloadBytes);
        return true;
    }

    public getMessages(): readonly SignedChatPacket[] {
        return this.messages.slice();
    }

    public getPendingCount(): number {
        return this.pendingByPrevious.size;
    }

    public getRejectedCount(): number {
        return this.rejectedCount;
    }

    public getHeadHash(): string {
        return this.headHash;
    }

    public clear(): void {
        this.messages.length = 0;
        this.hashes.clear();
        this.pendingByPrevious.clear();
        this.pendingIds.clear();
        this.rejectedCount = 0;
        this.headHash = CHAT_THREAD_GENESIS;
    }

    private async append(packet: SignedChatPacket, payloadBytes?: Uint8Array): Promise<void> {
        this.messages.push(packet);
        this.hashes.add(packet.hash);
        this.pendingIds.delete(packet.messageId);
        this.headHash = packet.hash;
        await this.cachePayload(payloadBytes ?? sodium.from_base64(packet.payload));
    }

    private async drainPending(): Promise<void> {
        while (true) {
            const next = this.pendingByPrevious.get(this.headHash);
            if (!next) return;
            this.pendingByPrevious.delete(this.headHash);
            if (next.sequence !== this.messages.length + 1) {
                this.pendingIds.delete(next.messageId);
                this.reject();
                continue;
            }
            this.pendingIds.delete(next.messageId);
            await this.append(next);
        }
    }

    private asPacket(value: unknown): SignedChatPacket | undefined {
        if (!value || typeof value !== "object") return undefined;
        const packet = value as Partial<SignedChatPacket>;
        if (packet.version !== 1 || typeof packet.roomId !== "string" ||
            typeof packet.messageId !== "string" || packet.messageId.length === 0 || packet.messageId.length > 128 ||
            !Number.isSafeInteger(packet.sequence) || packet.sequence! < 1 ||
            typeof packet.previousHash !== "string" || !/^[a-f0-9]{64}$/.test(packet.previousHash) ||
            typeof packet.payload !== "string" || packet.payload.length > 6 * 1024 * 1024 ||
            typeof packet.senderId !== "string" || packet.senderId.length === 0 || packet.senderId.length > 128 ||
            typeof packet.senderPublicKey !== "string" || typeof packet.signature !== "string" ||
            typeof packet.timestamp !== "number" || !Number.isFinite(packet.timestamp) ||
            typeof packet.hash !== "string" || !/^[a-f0-9]{64}$/.test(packet.hash)) return undefined;
        return packet as SignedChatPacket;
    }

    private unsigned(packet: SignedChatPacket): UnsignedPacket {
        return {
            version: packet.version,
            roomId: packet.roomId,
            messageId: packet.messageId,
            sequence: packet.sequence,
            previousHash: packet.previousHash,
            payload: packet.payload,
            senderId: packet.senderId,
            senderPublicKey: packet.senderPublicKey,
            timestamp: packet.timestamp
        };
    }

    private canonical(packet: UnsignedPacket): Uint8Array {
        return sodium.from_string(JSON.stringify(packet));
    }

    private async calculateHash(packet: UnsignedPacket, signature: string): Promise<string> {
        const bytes = sodium.from_string(JSON.stringify({ ...packet, signature }));
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", buffer));
        return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
    }

    private async cachePayload(payload: Uint8Array): Promise<void> {
        // Caching is opportunistic and must never change message acceptance.
        try {
            await this.cache.cacheChunk(payload);
        } catch {
            // Oversized or unavailable cache storage does not invalidate a message.
        }
    }

    private reject(): false {
        this.rejectedCount++;
        return false;
    }
}
