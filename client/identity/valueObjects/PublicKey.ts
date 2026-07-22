/**
 * Represents a public Ed25519 key.
 *
 * Internally stores raw bytes.
 * Serialization is handled by IdentityStorage.
 */
export class PublicKey {
    public readonly bytes: Uint8Array;

    constructor(bytes: Uint8Array) {

        if (!(bytes instanceof Uint8Array)) {
            throw new Error("Public key must be a Uint8Array.");
        }

        if (bytes.length !== 32) {
            throw new Error("Invalid Ed25519 public key.");
        }

        // Defensive copy
        this.bytes = new Uint8Array(bytes);

        Object.freeze(this);
    }

    public toBase64(): string {
        let binary = "";
        for (const byte of this.bytes) {
            binary += String.fromCharCode(byte);
        }
        return btoa(binary);
    }

}