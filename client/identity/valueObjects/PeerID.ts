import sodium from "libsodium-wrappers";
export class PeerId {

    private readonly value: string;

    private constructor(value: string) {
        this.value = value;
    }

    /**
     * Create a PeerId from a public key.
     */
    public static async fromPublicKey(
        publicKey: Uint8Array
    ): Promise<PeerId> {

        await sodium.ready;

        const hash = sodium.crypto_generichash(
            32,
            publicKey,
            null,
            "uint8array"
        );

        const peerId = sodium.to_hex(hash);

        return new PeerId(peerId);
    }

    /**
     * Create from existing stored value.
     */
    public static fromString(value: string): PeerId {

        if (!PeerId.isValid(value)) {
            throw new Error("Invalid PeerId.");
        }

        return new PeerId(value);
    }

    /**
     * Validate PeerId.
     */
    public static isValid(value: string): boolean {

        return /^[a-f0-9]{64}$/.test(value);

    }

    /**
     * String representation.
     */
    public toString(): string {
        return this.value;
    }

    /**
     * Equality check.
     */
    public equals(other: PeerId): boolean {
        return this.value === other.value;
    }

}