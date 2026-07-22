import sodium from "libsodium-wrappers";

export class SessionKey {

    constructor(
        private readonly key: Uint8Array
    ) {}

    /**
     * Get raw key bytes.
     */
    public getBytes(): Uint8Array {

        return this.key;

    }

    /**
     * Convert to Base64.
     */
    public toBase64(): string {

        return sodium.to_base64(this.key);

    }

    /**
     * Create from Base64.
     */
    public static fromBase64(
        value: string
    ): SessionKey {

        return new SessionKey(

            sodium.from_base64(value)

        );

    }

    /**
     * Compare two session keys.
     */
    public equals(
        other: SessionKey
    ): boolean {

        return sodium.memcmp(

            this.key,

            other.getBytes()

        );

    }

}