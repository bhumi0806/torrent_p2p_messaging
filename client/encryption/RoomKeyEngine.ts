import sodium from "libsodium-wrappers";

import { PrivateKey } from "../identity/valueObjects/PrivateKey";
import { PublicKey } from "../identity/valueObjects/PublicKey";
import { SessionKey } from "./models/SessionKey";

/** Key material and public routing information for one private room. */
export interface RoomKeyProfile {
    /** Share securely with room members. Anyone holding this key can decrypt. */
    readonly symmetricKey: SessionKey;
    /** Publish to members so they can verify signatures from this room key. */
    readonly publicKey: PublicKey;
    /** Keep secret; required to append signatures to room payloads. */
    readonly privateKey: PrivateKey;
    /** SHA-256(publicKey), encoded as lowercase hexadecimal. */
    readonly routingKey: string;
    /** routingKey interpreted as an unsigned integer and divided by 2^256-1. */
    readonly coordinate: string;
}

/**
 * Creates room key profiles and opaque, signed payloads. Payload format:
 * `RPK1 || nonce || secretbox(ciphertext) || Ed25519 detached signature`.
 * The public key is deliberately not embedded; receivers obtain it with the
 * room invitation/profile. All methods wait for libsodium initialization.
 */
export class RoomKeyEngine {
    private static readonly MAGIC = new Uint8Array([0x52, 0x50, 0x4b, 0x31]); // RPK1
    private static readonly COORDINATE_DIGITS = 40;

    public static async createRoomKeyProfile(): Promise<RoomKeyProfile> {
        await sodium.ready;
        const pair = sodium.crypto_sign_keypair();
        const publicKey = new PublicKey(new Uint8Array(pair.publicKey));
        const privateKey = new PrivateKey(new Uint8Array(pair.privateKey));
        // libsodium-wrappers does not expose crypto_hash_sha256 in every build;
        // Web Crypto provides the required SHA-256 primitive in browsers and Node.
        const publicKeyBuffer = publicKey.bytes.buffer.slice(
            publicKey.bytes.byteOffset,
            publicKey.bytes.byteOffset + publicKey.bytes.byteLength
        ) as ArrayBuffer;
        const routingBytes = new Uint8Array(
            await globalThis.crypto.subtle.digest("SHA-256", publicKeyBuffer)
        );
        return Object.freeze({
            symmetricKey: new SessionKey(new Uint8Array(sodium.crypto_secretbox_keygen())),
            publicKey,
            privateKey,
            routingKey: RoomKeyEngine.toHex(routingBytes),
            coordinate: RoomKeyEngine.toCoordinate(routingBytes)
        });
    }

    /** Encrypt and sign a string, byte block, Blob, or File. */
    public static async blind(
        data: string | Uint8Array | Blob,
        profile: RoomKeyProfile
    ): Promise<Uint8Array> {
        await sodium.ready;
        const plaintext = typeof data === "string"
            ? sodium.from_string(data)
            : data instanceof Uint8Array
                ? new Uint8Array(data)
                : new Uint8Array(await data.arrayBuffer());
        const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
        const ciphertext = sodium.crypto_secretbox_easy(
            plaintext,
            nonce,
            profile.symmetricKey.getBytes()
        );
        const signedBytes = RoomKeyEngine.concat(RoomKeyEngine.MAGIC, nonce, ciphertext);
        const signature = sodium.crypto_sign_detached(signedBytes, profile.privateKey.bytes);
        return RoomKeyEngine.concat(signedBytes, signature);
    }

    /** Verify origin/authenticity, then decrypt to original bytes. */
    public static async unblind(
        payload: Uint8Array,
        symmetricKey: SessionKey,
        publicKey: PublicKey
    ): Promise<Uint8Array> {
        await sodium.ready;
        const nonceLength = sodium.crypto_secretbox_NONCEBYTES;
        const signatureLength = sodium.crypto_sign_BYTES;
        const headerLength = RoomKeyEngine.MAGIC.length + nonceLength;
        if (payload.length < headerLength + sodium.crypto_secretbox_MACBYTES + signatureLength) {
            throw new Error("Invalid room payload: too short.");
        }
        for (let i = 0; i < RoomKeyEngine.MAGIC.length; i++) {
            if (payload[i] !== RoomKeyEngine.MAGIC[i]) {
                throw new Error("Invalid room payload: unsupported format.");
            }
        }
        const signedEnd = payload.length - signatureLength;
        const signedBytes = payload.subarray(0, signedEnd);
        const signature = payload.subarray(signedEnd);
        if (!sodium.crypto_sign_verify_detached(signature, signedBytes, publicKey.bytes)) {
            throw new Error("Room payload signature verification failed.");
        }
        return sodium.crypto_secretbox_open_easy(
            payload.subarray(headerLength, signedEnd),
            payload.subarray(RoomKeyEngine.MAGIC.length, headerLength),
            symmetricKey.getBytes()
        );
    }

    /** Decode verified plaintext as UTF-8. */
    public static async unblindString(
        payload: Uint8Array,
        symmetricKey: SessionKey,
        publicKey: PublicKey
    ): Promise<string> {
        const bytes = await RoomKeyEngine.unblind(payload, symmetricKey, publicKey);
        return sodium.to_string(bytes);
    }

    private static toHex(bytes: Uint8Array): string {
        return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    }

    private static toCoordinate(hash: Uint8Array): string {
        const value = BigInt(`0x${RoomKeyEngine.toHex(hash)}`);
        const denominator = (1n << BigInt(hash.length * 8)) - 1n;
        const scale = 10n ** BigInt(RoomKeyEngine.COORDINATE_DIGITS);
        const scaled = (value * scale) / denominator;
        const whole = scaled / scale;
        const fraction = (scaled % scale).toString().padStart(RoomKeyEngine.COORDINATE_DIGITS, "0");
        return `${whole}.${fraction}`;
    }

    private static concat(...parts: Uint8Array[]): Uint8Array {
        const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
        let offset = 0;
        for (const part of parts) {
            result.set(part, offset);
            offset += part.length;
        }
        return result;
    }
}

/**
 * Demonstration/self-test. Importing this module runs it once and writes the
 * result to the console, as requested. The host is given neither room secret.
 */
export async function runRoomKeyEngineSelfTest(): Promise<void> {
    const expected = "Test Private Message";
    const profile = await RoomKeyEngine.createRoomKeyProfile();
    const payload = await RoomKeyEngine.blind(expected, profile);

    // Hex output contains the envelope bytes (marker, nonce, ciphertext,
    // signature), not the plaintext.
    const encryptedOutput = Array.from(
        payload,
        byte => byte.toString(16).padStart(2, "0")
    ).join("");
    console.log("[RoomKeyEngine self-test] Encrypted payload (hex):", encryptedOutput);

    // An untrusted host does not have the room symmetric key. A wrong key
    // causes secretbox authentication to fail rather than returning plaintext.
    await sodium.ready;
    const hostKey = new SessionKey(new Uint8Array(sodium.crypto_secretbox_keygen()));
    try {
        await RoomKeyEngine.unblind(payload, hostKey, profile.publicKey);
        console.error("[RoomKeyEngine self-test] ERROR: Host unexpectedly decrypted payload.");
    } catch {
        console.log("[RoomKeyEngine self-test] Host Node: decryption rejected (no room key).");
    }

    // The receiver checks the detached signature over marker + nonce + cipher,
    // then unblinds with the shared room key.
    const signedEnd = payload.length - sodium.crypto_sign_BYTES;
    const signatureIsValid = sodium.crypto_sign_verify_detached(
        payload.subarray(signedEnd),
        payload.subarray(0, signedEnd),
        profile.publicKey.bytes
    );
    if (!signatureIsValid) {
        throw new Error("[RoomKeyEngine self-test] Receiver signature verification failed.");
    }
    const received = await RoomKeyEngine.unblindString(
        payload,
        profile.symmetricKey,
        profile.publicKey
    );
    if (received !== expected) {
        throw new Error("[RoomKeyEngine self-test] Receiver plaintext did not match.");
    }
    console.log("[RoomKeyEngine self-test] Receiver Node: signature valid; plaintext:", received);
}

void runRoomKeyEngineSelfTest().catch(error => {
    console.error("[RoomKeyEngine self-test] Failed:", error);
});
