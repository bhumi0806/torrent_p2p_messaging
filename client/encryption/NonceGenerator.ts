import sodium from "libsodium-wrappers";

export class NonceGenerator {

    /**
     * Generate a new nonce.
     */
    public static generate(): Uint8Array {

        return sodium.randombytes_buf(

            sodium.crypto_secretbox_NONCEBYTES

        );

    }

    /**
     * Generate nonce as Base64.
     */
    public static generateBase64(): string {

        return sodium.to_base64(

            NonceGenerator.generate()

        );

    }

}