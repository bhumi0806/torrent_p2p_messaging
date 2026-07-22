import sodium from "libsodium-wrappers";

import { EncryptionAlgorithm } from "../types/EncryptionAlgorithm";

export class EncryptedMessage {

    constructor(

        private readonly cipherText: Uint8Array,

        private readonly nonce: Uint8Array,

        private readonly algorithm: EncryptionAlgorithm

    ) {}

    /**
     * Get ciphertext.
     */
    public getCipherText(): Uint8Array {

        return this.cipherText;

    }

    /**
     * Get nonce.
     */
    public getNonce(): Uint8Array {

        return this.nonce;

    }

    /**
     * Get encryption algorithm.
     */
    public getAlgorithm(): EncryptionAlgorithm {

        return this.algorithm;

    }

    /**
     * Serialize.
     */
    public toJSON() {

        return {

            cipherText:
                sodium.to_base64(
                    this.cipherText
                ),

            nonce:
                sodium.to_base64(
                    this.nonce
                ),

            algorithm:
                this.algorithm

        };

    }

    /**
     * Deserialize.
     */
    public static fromJSON(
        data: any
    ): EncryptedMessage {

        return new EncryptedMessage(

            sodium.from_base64(
                data.cipherText
            ),

            sodium.from_base64(
                data.nonce
            ),

            data.algorithm as EncryptionAlgorithm

        );

    }

}