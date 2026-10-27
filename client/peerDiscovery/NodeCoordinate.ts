import { PublicKey } from "../identity/valueObjects/PublicKey";

/** Stable ring coordinate derived from a node's Ed25519 verification key. */
export class NodeCoordinate {
    public static async fromPublicKey(publicKey: PublicKey): Promise<number> {
        const bytes = publicKey.bytes;
        const buffer = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer;
        const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", buffer));
        let value = 0n;
        for (const byte of digest) value = (value << 8n) | BigInt(byte);
        return Number(value) / Number((1n << 256n) - 1n);
    }

    /** Shortest distance on a unit ring. */
    public static distance(a: number, b: number): number {
        const direct = Math.abs(a - b);
        return Math.min(direct, 1 - direct);
    }
}
