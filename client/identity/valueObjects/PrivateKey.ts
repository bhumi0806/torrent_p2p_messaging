/**
 * Represents a private Ed25519 key.
 *
 * Never transmit this object.
 */
export class PrivateKey {

    public readonly bytes: Uint8Array;

    constructor(bytes: Uint8Array) {

        if (!(bytes instanceof Uint8Array)) {
            throw new Error("Private key must be a Uint8Array.");
        }

        /*
         * libsodium.crypto_sign_keypair()
         * returns a 64-byte secret key.
         */
        if (bytes.length !== 64) {
            throw new Error("Invalid Ed25519 private key.");
        }

        this.bytes = new Uint8Array(bytes);

        Object.freeze(this);
    }

}