import sodium from "libsodium-wrappers";

import { ChatThreadEngine, SignedChatPacket } from "../ChatThreadEngine";
import { PassiveChunkCache } from "../PassiveChunkCache";
import { PrivateKey } from "../../identity/valueObjects/PrivateKey";
import { PublicKey } from "../../identity/valueObjects/PublicKey";

async function runChatThreadResilienceTest(): Promise<void> {
    await sodium.ready;
    const roomId = "mock-private-room";
    const senderId = "member-A";
    const keyPair = sodium.crypto_sign_keypair();
    const publicKey = new PublicKey(new Uint8Array(keyPair.publicKey));
    const privateKey = new PrivateKey(new Uint8Array(keyPair.privateKey));
    const roomKey = sodium.crypto_secretbox_keygen();

    const senderCache = new PassiveChunkCache();
    const sender = new ChatThreadEngine(roomId, [{ senderId, publicKey }], senderCache);
    const original: SignedChatPacket[] = [];
    for (let sequence = 1; sequence <= 5; sequence++) {
        const plaintext = `Message ${sequence}`;
        const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
        const ciphertext = sodium.crypto_secretbox_easy(
            sodium.from_string(plaintext),
            nonce,
            roomKey
        );
        const encryptedChunk = concat(nonce, ciphertext);
        original.push(await sender.createPacket(encryptedChunk, senderId, publicKey, privateKey));
    }

    const receiverCache = new PassiveChunkCache({ maxEntries: 16, ttlMs: 60_000 });
    const receiver = new ChatThreadEngine(roomId, [{ senderId, publicKey }], receiverCache);

    const unsigned: SignedChatPacket = {
        ...original[2],
        messageId: "unsigned-fake",
        signature: ""
    };
    const tampered: SignedChatPacket = {
        ...original[3],
        payload: sodium.to_base64(sodium.from_string("forged ciphertext"))
    };

    // Deliberately chaotic order: 5, 2, forged 4, 4, 1, unsigned, 3.
    const delivery: unknown[] = [
        original[4],
        original[1],
        tampered,
        original[3],
        original[0],
        unsigned,
        original[2]
    ];
    for (const packet of delivery) await receiver.ingest(packet);

    const reconstructed = receiver.getMessages();
    const texts = reconstructed.map(packet => decryptPayload(packet.payload, roomKey));
    const expected = ["Message 1", "Message 2", "Message 3", "Message 4", "Message 5"];
    assert(texts.length === 5, `Expected five accepted messages; received ${texts.length}.`);
    assert(texts.every((text, index) => text === expected[index]), "Messages were not reconstructed chronologically.");
    assert(receiver.getPendingCount() === 0, "Valid messages remain pending after reconciliation.");
    assert(receiver.getRejectedCount() === 2, `Expected two rejected packets, got ${receiver.getRejectedCount()}.`);
    assert(receiverCache.size === 5, `Expected five encrypted chunks in passive cache, got ${receiverCache.size}.`);

    for (let index = 0; index < reconstructed.length; index++) {
        const expectedPrevious = index === 0 ? "0".repeat(64) : reconstructed[index - 1].hash;
        assert(reconstructed[index].sequence === index + 1, "Sequence number mismatch.");
        assert(reconstructed[index].previousHash === expectedPrevious, `Broken hash link at sequence ${index + 1}.`);
    }

    console.log("[Chat Thread] Arrival order: 5 -> 2 -> tampered 4 -> 4 -> 1 -> unsigned -> 3");
    console.log(`[Chat Thread] Reconstructed: ${texts.join(" -> ")}`);
    console.log(`[Chat Thread] Verified hash links: ${reconstructed.length}; rejected fake/unsigned: ${receiver.getRejectedCount()}; cached ciphertext chunks: ${receiverCache.size}`);
    senderCache.dispose();
    receiverCache.dispose();
}

function decryptPayload(payload: string, roomKey: Uint8Array): string {
    const encrypted = sodium.from_base64(payload);
    const nonceLength = sodium.crypto_secretbox_NONCEBYTES;
    return sodium.to_string(sodium.crypto_secretbox_open_easy(
        encrypted.subarray(nonceLength),
        encrypted.subarray(0, nonceLength),
        roomKey
    ));
}

function concat(...parts: Uint8Array[]): Uint8Array {
    const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
    }
    return bytes;
}

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

runChatThreadResilienceTest().catch(error => {
    console.error("[Chat Thread] Resilience test failed:", error);
    process.exitCode = 1;
});
